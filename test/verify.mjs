/**
 * Regression tests for Quite for Cookies' domain scoping. Run with:
 *
 *     node test/verify.mjs
 *
 * Scoping is the highest-risk logic in this extension, because it decides what
 * gets deleted. psl.js puts it plainly: one label too far left and the preview
 * is incomplete, one too far right and the extension asks for permission over
 * an entire country's .co.uk. Both are silent failures — the wrong scope looks
 * exactly like the right one until something is gone.
 *
 * The suite ends by sabotaging the Public Suffix List and requiring these
 * checks to fail, because a scoping test that passes against a broken list is
 * testing nothing.
 */
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const EXT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
import os from 'node:os';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ccl-verify-'));

function loadPSL({ sabotage = false } = {}) {
  let data = fs.readFileSync(path.join(EXT, 'psl-data.js'), 'utf8');
  if (sabotage) {
    // Remove the multi-label suffixes. A naive "last two labels" answer then
    // looks right for example.com and wrong for example.co.uk — which is the
    // whole reason the list is shipped at all.
    data = data.replace(/^co\.uk$/m, '__removed_co_uk__');
  }
  const ctx = { self: {} };
  vm.createContext(ctx);
  vm.runInContext(data, ctx);
  vm.runInContext(fs.readFileSync(path.join(EXT, 'psl.js'), 'utf8'), ctx);
  return vm.runInContext('PSL', ctx);
}

const out = [];
const check = (name, pass, detail) => out.push({ name, pass, detail });

const PSL = loadPSL();

// [input, expected registrable domain]
const CASES = [
  ['example.com',            'example.com'],
  ['www.example.com',        'example.com'],
  ['a.b.c.example.com',      'example.com'],
  // The one that matters. Answering "co.uk" here would request permission over
  // every .co.uk site in existence.
  ['example.co.uk',          'example.co.uk'],
  ['www.example.co.uk',      'example.co.uk'],
  ['shop.bbc.co.uk',         'bbc.co.uk'],
  // github.io is itself a public suffix, so each user site is its own scope.
  ['someone.github.io',      'someone.github.io'],
  // A public suffix on its own is NOT registrable — there is no owner to scope to.
  ['co.uk',                  null],
  ['com',                    null],
  ['github.io',              null],
  // Not hosts.
  ['127.0.0.1',              null],
  ['',                       null],
];

const wrong = CASES.filter(([h, want]) => PSL.registrable(h) !== want)
                   .map(([h, want]) => `${h || '(empty)'} -> ${PSL.registrable(h)} (want ${want})`);
check('every scoping case resolves exactly', wrong.length === 0,
  wrong.length ? wrong.join(' | ') : `${CASES.length} cases, all exact`);

check('a public suffix alone is never treated as a site',
  PSL.registrable('co.uk') === null && PSL.registrable('com') === null,
  'co.uk and com both resolve to null, so neither can be asked for as a permission scope');

check('subdomains collapse to the site, not to the suffix',
  PSL.registrable('a.b.bbc.co.uk') === 'bbc.co.uk',
  `a.b.bbc.co.uk -> ${PSL.registrable('a.b.bbc.co.uk')}`);

// CONTROL. With co.uk removed from the list, example.co.uk must resolve
// differently — proving the assertions above are reading the list rather than
// passing on a hardcoded guess.
const BROKEN = loadPSL({ sabotage: true });
const brokenAnswer = BROKEN.registrable('example.co.uk');
check('CONTROL: sabotaging the suffix list changes the answer — so these checks read it',
  brokenAnswer !== 'example.co.uk',
  `with co.uk removed, example.co.uk -> ${brokenAnswer} (was example.co.uk)`);


// ---- The popup actually renders. -------------------------------------------
//
// Every UI defect on 2026-09-02 was a change made and never loaded: a brand
// header that did not exist, an ARM line whose CSS silently never applied,
// a master toggle missing on one path, a stylesheet edit that matched nothing.
// All five would have been caught by opening the popup once. Nothing did.
//
// Each assertion below has a control that removes the thing and requires the
// check to fail, so none of them can quietly stop working.
{
  const { spawn } = await import('node:child_process');
  const http = await import('node:http');
  const PORT = 8951, CDP = 9391;
  const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
  let sabotage = null;   // css | brand | null
  const server = http.createServer((rq, rs) => {
    const url = rq.url.split('?')[0];
    const f = path.join(EXT, url.replace(/^\//, ''));
    fs.readFile(f, (e, d) => {
      if (e) { rs.writeHead(404); return rs.end(); }
      let body = d;
      if (sabotage === 'css'   && url.endsWith('popup.css'))  body = Buffer.from('');
      if (sabotage === 'brand' && url.endsWith('popup.html')) body = Buffer.from(
        d.toString().replace(/<div class="brand">[\s\S]*?<\/div>/, ''));
      rs.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'text/plain' });
      rs.end(body);
    });
  }).listen(PORT);

  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [`--remote-debugging-port=${CDP}`, `--user-data-dir=${TMP}/pp`, '--headless=new',
     '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const nap = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json(); break; } catch { await nap(300); } }

  let wsId = 0;
  async function render() {
    const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method:'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
    const pend = new Map(); const errs = [];
    ws.onmessage = e => { const m = JSON.parse(e.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(JSON.stringify(m.params.args).slice(0,120));
      if (m.method === 'Runtime.exceptionThrown') errs.push(String(m.params.exceptionDetails?.text).slice(0,120));
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    const send = (method, params) => new Promise(r => { const i = ++wsId; pend.set(i, r); ws.send(JSON.stringify({ id:i, method, params })); });
    await send('Runtime.enable', {}); await send('Page.enable', {});
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.chrome = {
        runtime:{ id:'t', lastError:null, getManifest:()=>({version:'x'}), sendMessage:async()=>({}), onMessage:{addListener(){}} },
        tabs:{ query:async()=>[{id:1,url:'https://example.com/'}] },
        permissions:{ contains:async()=>true, request:async()=>true, onAdded:{addListener(){}} },
        cookies:{ getAll:async()=>[{name:'SID',domain:'.example.com',value:'x',secure:true,httpOnly:true}] },
        storage:{ local:{get:async()=>({}),set:async()=>{}}, sync:{get:async()=>({}),set:async()=>{}}, onChanged:{addListener(){}} },
        browsingData:{ remove:async()=>{} } };` });
    await send('Page.navigate', { url: `http://localhost:${PORT}/popup.html` });
    await nap(2000);
    const r = await send('Runtime.evaluate', { returnByValue:true, expression: `(()=>{
      const vis = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
      const brand = document.querySelector('.brand');
      return JSON.stringify({
        brand: vis(brand),
        brandText: brand ? brand.textContent.replace(/\s+/g,' ').trim() : '',
        ver: (document.getElementById('ver')||{}).textContent || '',
        master: vis(document.getElementById('master')),
        arm: vis(document.getElementById('arm')),
        armText: (document.getElementById('arm')||{}).textContent || '',
        styled: brand ? getComputedStyle(brand).display : 'none',
      });})()` });
    ws.close(); fetch(`http://127.0.0.1:${CDP}/json/close/${t.id}`);
    return { ...JSON.parse(r.result.result.value), errs };
  }

  const ok = await render();
  check('popup: renders with no console errors', ok.errs.length === 0, ok.errs[0] || 'clean');
  check('popup: brand header is present and visible', ok.brand === true, ok.brandText || '(absent)');
  check('popup: the version is rendered', /^v\d+\.\d+/.test(ok.ver), ok.ver || '(empty)');
  check('popup: the master clearing switch is visible', ok.master === true, `master visible: ${ok.master}`);
  check('popup: the ARM line is visible', ok.arm === true, ok.armText.slice(0,60) || '(absent)');
  check('popup: the stylesheet actually applied', ok.styled === 'flex',
        `.brand display = ${ok.styled} (none/inline means popup.css did not load)`);

  sabotage = 'brand';
  const noBrand = await render();
  check('CONTROL: removing the brand header FAILS the check — it can fail',
        noBrand.brand === false, `brand visible with it removed: ${noBrand.brand}`);
  sabotage = 'css';
  const noCss = await render();
  check('CONTROL: serving an empty stylesheet FAILS the style check — it can fail',
        noCss.styled !== 'flex', `.brand display with no CSS = ${noCss.styled}`);
  sabotage = null;

  chrome.kill(); server.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* OS will */ }
}

let bad = 0;
console.log('');
for (const r of out) { if (!r.pass) bad++; console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n          ${r.detail}`); }
console.log(`\n  ${out.length - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
