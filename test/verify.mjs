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
// ---- consent answers survive a clear (consent.js) ------------------------
// Clearing a site's cookies deletes the cookie that held your answer to its
// consent pop-up, so the pop-up comes back. consent.js names the cookies that
// hold that answer, precisely, so they can be spared beside sign-ins.
function loadConsent({ sabotage = false } = {}) {
  let src = fs.readFileSync(path.join(EXT, 'consent.js'), 'utf8');
  if (sabotage) src = src.replace('self.looksLikeConsent = (c) => self.CONSENT_RE.test(c.name);',
                                  'self.looksLikeConsent = () => false;');
  const ctx = { self: {} }; vm.createContext(ctx); vm.runInContext(src, ctx);
  return ctx.self;
}
const consent = loadConsent();
// Observed on real sites 2026-09-03, plus the well-known consent platforms.
const CONSENT_NAMES = ['ckns_policy', 'ckns_explicit', 'OptanonConsent', 'OptanonAlertBoxClosed',
  'gdpr', '_sp_su', 'consentUUID', 'usprivacy', 'euconsent-v2', 'addtl_consent',
  'didomi_token', 'CookieConsent', 'cookieconsent_status', 'cmapi_cookie_privacy',
  // twenty UK newspaper sites, 2026-09-10
  'FTConsent', 'FTCookieConsentGDPR', 'didomi_dcs', '_sp_legitimate_interests', 'prev-tcf-v2',
  '_sp_enable_dfp_personalized_ads'];
// Names a clear MUST still remove: analytics ids, ad ids, sessions, csrf.
const NOT_CONSENT = ['_ga', '_gid', '_gat', '_fbp', 'IDE', 'id5id', 'permutive-id', 'sessionid',
  'csrftoken', '_pk_id.1.abcd', 'ajs_anonymous_id', 'mp_123_mixpanel', 'test_cookie', '__cf_bm',
  // seen on the newspaper sites: Snowplow analytics ids that share the _sp_ prefix, and an
  // integration flag. A prefix match would spare tracking under the label "consent".
  '_sp_ses.5e5e', '_sp_id.5e5e', '_nuk_sp_ses.9caf', '_nuk_sp_id.9caf', '_sp_facebook'];
const missed = CONSENT_NAMES.filter((n) => !consent.looksLikeConsent({ name: n }));
const overMatched = NOT_CONSENT.filter((n) => consent.looksLikeConsent({ name: n }));
check('consent: every observed consent cookie name is recognised', missed.length === 0,
      missed.length ? `missed: ${missed.join(', ')}` : `${CONSENT_NAMES.length} names`);
check('consent: no tracking, session or csrf name is mistaken for consent', overMatched.length === 0,
      overMatched.length ? `over-matched: ${overMatched.join(', ')}` : `${NOT_CONSENT.length} names refused`);
// The exemption must be in BOTH callers, and in both popup predicates — the
// preview and the sweep must agree, or the preview promises one thing and the
// sweep does another.
const popupSrc = fs.readFileSync(path.join(EXT, 'popup.js'), 'utf8');
const bgSrc = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
check('consent: the popup preview and its delete list both spare consent answers',
      (popupSrc.match(/!\(prefs\.keepConsent && looksLikeConsent\(c\)\)/g) || []).length === 2,
      'targetsFor() and doomed() must carry the identical predicate');
check('consent: the tab-close sweep spares them too, and re-counts what it spared',
      /prefs\.autoKeepConsent && self\.looksLikeConsent\(c\)/.test(bgSrc) &&
      /keptConsent: keptConsentNow, lostConsent/.test(bgSrc) &&
      /lastAuto\.lostConsent/.test(popupSrc),
      '"kept" is a claim; it is checked after the removal AND shown — a re-count nobody can see is no check');
check('consent: loaded by both callers from one file',
      /importScripts\([^)]*"consent\.js"/.test(bgSrc) &&
      /<script src="consent\.js">/.test(fs.readFileSync(path.join(EXT, 'popup.html'), 'utf8')),
      'two copies would drift');
// CONTROL. Sabotage the predicate and require the recognition check to fail.
const broken = loadConsent({ sabotage: true });
check('CONTROL: a predicate that recognises nothing FAILS the recognition check — it can fail',
      CONSENT_NAMES.filter((n) => !broken.looksLikeConsent({ name: n })).length > 0,
      'so the check reads consent.js, not its own list');

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
    ws.close();
    // Awaited, and its rejection swallowed: this used to be fire-and-forget,
    // and once anything after the harness yielded to the event loop, the
    // close racing chrome.kill() surfaced as an unhandled ECONNREFUSED that
    // crashed the suite with no summary line. Found 2026-09-10.
    await fetch(`http://127.0.0.1:${CDP}/json/close/${t.id}`).catch(() => {});
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

// ---- pop-ups on news sites (0.23.0) ----------------------------------------
// The rules are data; these checks hold the data, the generated stylesheet,
// the content script's instrument and the popup's option to each other.
{
  const rulesSrc = fs.readFileSync(path.join(EXT, 'popups-rules.js'), 'utf8');
  const loadRules = (src) => { const ctx = { self: {} }; vm.createContext(ctx); vm.runInContext(src, ctx); return ctx.self.QFC_RULES; };
  const R = loadRules(rulesSrc);
  const all = [...R.platforms, ...Object.values(R.sites).flat()];
  const balanced = (sel) => { let d = 0; for (const ch of sel) { if (ch === '[' || ch === '(') d++; if (ch === ']' || ch === ')') d--; if (d < 0) return false; } return d === 0 && (sel.match(/"/g) || []).length % 2 === 0; };
  check('popups: every rule has a name, selectors that parse, and a measurement beside it',
        all.length > 0 && all.every((r) => r.name && Array.isArray(r.hide) && r.hide.length && r.hide.every((h) => h.trim() && balanced(h)) && typeof r.measured === 'string' && /20\d\d-\d\d-\d\d/.test(r.measured)),
        `${all.length} rules, ${all.flatMap((r) => r.hide).length} selectors`);
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  check('popups: the manifest names NO site — nothing runs anywhere until the user ticks it',
        !manifest.content_scripts && !(manifest.host_permissions || []).length && (manifest.optional_host_permissions || []).includes('*://*/*'),
        'no content_scripts, no host_permissions, *://*/* optional');
  const papers = R.papers || [];
  check('popups: twenty papers are offered, each with a name and a site', papers.length === 20 && papers.every((p) => p.name && /^[a-z0-9.-]+\.[a-z]+$/.test(p.site)), `${papers.length} papers`);
  check('popups: every site with its own rules is one of the papers', Object.keys(R.sites).every((k) => papers.some((p) => p.site === k)), Object.keys(R.sites).join(', '));
  const pjsRaw = fs.readFileSync(path.join(EXT, 'popup.js'), 'utf8');
  const bgRaw = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  check('popups: the worker registers the script per ticked site, at document_start, only where access is held',
        /registerContentScripts\(/.test(bgRaw) && /unregisterContentScripts\(/.test(bgRaw) && /permissions\.contains\(\{ origins: popupPatternsFor\(site\) \}\)/.test(bgRaw) && /runAt: "document_start"/.test(bgRaw) && bgRaw.includes('js: POPUP_FILES.js, css: POPUP_FILES.css') && bgRaw.includes('js: ["popups-rules.js", "popups.js"], css: ["popups.css"]'),
        'chrome.scripting.registerContentScripts from globalPrefs.popupSites');
  check('popups: the worker re-syncs on install, startup, access changes and list changes',
        ['onInstalled', 'onStartup', 'permissions.onAdded', 'permissions.onRemoved'].every((h) => new RegExp(h.replace('.', '\\.') + '\\.addListener\\(\\(\\) => syncPopupScripts').test(bgRaw)) && /if \(before !== after\) syncPopupScripts\("sites changed"\)/.test(bgRaw), 'four triggers plus the list');
  check('popups: a tick asks for access to that site alone, and a declined prompt unticks the box',
        /chrome\.permissions\.request\(\{ origins \}\)/.test(pjsRaw) && pjsRaw.includes('if (!ok) { if (box) box.checked = false; return; }') && pjsRaw.includes('data-popup-site='),
        'togglePopupSite');
  const { buildPopupsCss } = await import('./build-popups-css.mjs');
  const css = fs.readFileSync(path.join(EXT, 'popups.css'), 'utf8');
  check('popups: popups.css is generated from the rules and matches them', css === buildPopupsCss(rulesSrc), 'node test/build-popups-css.mjs regenerates it');
  check('popups: the pre-stamp hiding never uses display, so the site\'s value stays readable',
        !/html\[data-qfc-on\] [^{]*\{[^}]*display/.test(css.split('[data-qfc-hidden]')[0]), 'visibility/opacity/pointer-events only');
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const js = strip(fs.readFileSync(path.join(EXT, 'popups.js'), 'utf8'));
  const reads = (js.match(/qfcoff=1/g) || []).length;
  check('popups: the bypass switch is read exactly once, into a const', reads === 1 && /const BYPASSED = location\.search\.indexOf\("qfcoff=1"\)/.test(js), `${reads} read(s)`);
  check('popups: the stamps are remembered and re-asserted when the page strips them',
        js.includes('const reassert = () =>') && js.includes('new MutationObserver(reassert).observe(html, { attributes: true })') && js.indexOf('reassert();') > js.indexOf('const sweep = () => {'),
        'Next.js hydration on mirror.co.uk removed every early stamp');
  check('popups: the version is a literal equal to the manifest', js.includes(`const VERSION = "${manifest.version}";`), manifest.version);
  check('popups: the counter is stamped 0 before anything can increment it', js.includes('set("popups", 0)') && js.indexOf('set("popups", 0)') < js.indexOf('count += 1'), 'data-qfc-popups starts at "0"');
  check('popups: a reading carries the tab visibility and the bypass', /visibilityState/.test(js) && js.includes('"tabhidden"') && js.includes('"bypassed"'), 'data-qfc-tabhidden, data-qfc-bypassed');
  check('popups: an element is counted only if the site rendered it', /rendered\(el\)/.test(js) && /r\.width > 0 && r\.height > 0/.test(js), 'zero-size boxes are not pop-ups');
  const pjs = strip(pjsRaw);
  check('popups: the popup saves the ticked sites under the one key the worker reads',
        pjs.includes('popupSites: []') && pjs.includes('saveGlobalPrefs({ popupSites:') && bgRaw.includes('globalPrefs.popupSites'), 'globalPrefs.popupSites');
  check('popups: the popup loads the same rules file the script and the worker load',
        fs.readFileSync(path.join(EXT, 'popup.html'), 'utf8').includes('<script src="popups-rules.js"></script>') && bgRaw.includes('"popups-rules.js"'), 'popups-rules.js in three places, one file');
  check('popups: the popup shows the count and the last one hidden', pjs.includes('Pop-ups hidden') && pjs.includes('popupStats.last'), 'stats tile + Last line');

  // CONTROLS. Each asserts its copy changed — a control whose target text was
  // not there to replace passed on an unchanged file twice in the YouTube suite.
  // Renaming the key empties every rule's selectors without parsing the arrays
  // (a bracket-matching regex stopped at the ']' inside an attribute selector).
  const noSel = rulesSrc.replace(/\bhide:/g, 'hide: [], hide_off:');
  if (noSel === rulesSrc) throw new Error('control: the rules copy did not change');
  const R2 = loadRules(noSel); const all2 = [...R2.platforms, ...Object.values(R2.sites).flat()];
  check('CONTROL: rules stripped of their selectors FAIL the rule check — it can fail', !all2.every((r) => r.hide.length), `${all2.filter((r) => !r.hide.length).length} rules empty`);
  check('CONTROL: a rules file that differs no longer matches popups.css — it can fail', buildPopupsCss(noSel) !== css, 'generated css differs');
  const twoReads = js.replace('if (BYPASSED) return;', 'if (BYPASSED || location.search.indexOf("qfcoff=1") !== -1) return;');
  if (twoReads === js) throw new Error('control: the script copy did not change');
  check('CONTROL: a second read of the bypass switch FAILS the once-only check — it can fail', (twoReads.match(/qfcoff=1/g) || []).length !== 1, 'two reads');
}

let bad = 0;
console.log('');
for (const r of out) { if (!r.pass) bad++; console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n          ${r.detail}`); }
console.log(`\n  ${out.length - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
