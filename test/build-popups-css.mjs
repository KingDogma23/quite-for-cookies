/**
 * popups.css is generated from popups-rules.js. One source for every
 * selector: the hand-copied popup preview in the YouTube extension drifted
 * from the popup it copied, and a stylesheet hand-copied from a rules file
 * would drift the same way. Run:
 *
 *     node test/build-popups-css.mjs          # writes popups.css
 *     node test/build-popups-css.mjs --check  # exits 1 if popups.css differs
 */
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const EXT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function buildPopupsCss(rulesSrc) {
  const ctx = { self: {} }; vm.createContext(ctx); vm.runInContext(rulesSrc, ctx);
  const R = ctx.self.QFC_RULES;
  const all = [...R.platforms, ...Object.values(R.sites).flat()].flatMap((r) => r.hide);
  const gated = all.map((s) => `html[data-qfc-on] ${s}`).join(',\n');
  return `/* GENERATED from popups-rules.js by test/build-popups-css.mjs — do not edit by hand. */

/* Invisible by selector first, so a pop-up never flashes before popups.js
   sees it. Visibility and opacity, NOT display: the site's own display value
   must stay readable, because an element is counted only if the site was
   rendering it. */
${gated} {
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

/* Stamped by popups.js once it has counted the element. Gated on the option,
   so switching it off puts the page back. */
html[data-qfc-on] [data-qfc-hidden] {
  display: none !important;
}

/* The scroll lock a dialog leaves behind — Sourcepoint sets an inline
   overflow:hidden on body, Didomi a class that does the same. !important in
   a stylesheet beats an inline declaration that is not. Held only while a
   pop-up this extension hid is still in the document. */
html[data-qfc-on][data-qfc-unlock],
html[data-qfc-on][data-qfc-unlock] body {
  overflow: visible !important;
}
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const css = buildPopupsCss(fs.readFileSync(path.join(EXT, 'popups-rules.js'), 'utf8'));
  const target = path.join(EXT, 'popups.css');
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (cur !== css) { console.error('popups.css is out of date — run node test/build-popups-css.mjs'); process.exit(1); }
    console.log('popups.css matches popups-rules.js');
  } else {
    fs.writeFileSync(target, css);
    console.log('wrote popups.css');
  }
}
