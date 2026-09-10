/**
 * Hide pop-ups on the news sites this script runs on, and unlock the page
 * they were holding. The rules are in popups-rules.js; the hiding itself is
 * popups.css, generated from those rules. This file is the bookkeeping.
 *
 * Nothing here answers a dialog or unlocks a paid article. A hidden consent
 * dialog is an unanswered one — the site runs as if nobody had said yes,
 * which is what "I still don't care about cookies" has done for years. A
 * paid article stays paid.
 *
 * Instrument first. Every fact this feature could be wrong about is stamped
 * on <html>, so a reading taken from the page carries its own validity:
 *
 *   data-qfc-version    the literal below — not the manifest's, which would
 *                       report the LOADED build, not the running one
 *   data-qfc-bypassed   1 when the URL carried ?qfcoff=1, decided once
 *   data-qfc-on         present unless bypassed — this script only runs on a
 *                       site the user ticked, so running IS the option
 *   data-qfc-tabhidden  document.visibilityState, kept current; a hidden
 *                       tab's reading is void
 *   data-qfc-site       whose site rules apply, or "none"
 *   data-qfc-rules      how many rules are active on this page
 *   data-qfc-popups     pop-ups hidden on this page, stamped "0" at start so
 *                       "none" and "did not run" read differently
 *   data-qfc-last       the rule that fired most recently
 *   data-qfc-unlock     present while a hidden pop-up's scroll lock is undone
 *   data-qfc-badrule    a selector the browser refused, if any
 *
 * What counts. popups.css first makes a matched element invisible by
 * selector — visibility, opacity and pointer-events, never display — so there
 * is no flash and the site's own display value stays readable. An element is
 * then stamped data-qfc-hidden, which is what sets display:none, and it is
 * counted ONLY if the site was rendering it: a box with a size. A container
 * the site keeps at display:none, like Reach's spare consent notice, is never
 * counted, because a count of pop-ups nobody was going to see is the kind of
 * counter that reported eleven versions of a feature doing nothing.
 *
 * The stamps are RE-ASSERTED. Measured 2026-09-10 on mirror.co.uk: the page
 * is a Next.js app, and hydration replaced every attribute on <html> that
 * had been set at document_start — version, on, bypassed, all gone — while
 * the ones set later survived. The page then read "popups 1" with the
 * dialog still visible, because the CSS gate had gone with the stamps. So
 * every value this script sets is remembered, and put back the moment an
 * attribute mutation on <html> takes it away.
 */
(() => {
  "use strict";
  // Idempotent by construction. This file reaches a page two ways — the
  // worker's registered content script AND a direct injection the worker
  // does on tab updates (background.js) — because a script REGISTERED against
  // a host granted at runtime through the popup's tick does not reliably
  // inject, while a direct injection into the tab does. Whichever arrives
  // first wins; the second no-ops here rather than starting a second observer
  // and double-counting.
  if (window.__qfcRan) return;
  window.__qfcRan = true;
  const VERSION = "0.23.2";
  const html = document.documentElement;
  const stamps = {};
  const set = (k, v) => { stamps[k] = String(v); html.setAttribute("data-qfc-" + k, stamps[k]); };
  const unset = (k) => { delete stamps[k]; html.removeAttribute("data-qfc-" + k); };
  const reassert = () => {
    for (const k in stamps) if (html.getAttribute("data-qfc-" + k) !== stamps[k]) html.setAttribute("data-qfc-" + k, stamps[k]);
  };
  new MutationObserver(reassert).observe(html, { attributes: true });

  // Decided ONCE, at document_start. A switch re-read on every tick came back
  // on after the first soft navigation in the YouTube extension while the
  // page still reported itself bypassed; the control was measuring itself.
  const BYPASSED = location.search.indexOf("qfcoff=1") !== -1;

  set("version", VERSION);
  set("bypassed", BYPASSED ? 1 : 0);
  set("popups", 0);
  const tabHidden = () => set("tabhidden", document.visibilityState === "hidden" ? 1 : 0);
  tabHidden();
  document.addEventListener("visibilitychange", tabHidden);

  const RULES = self.QFC_RULES || { platforms: [], sites: {} };
  const host = location.hostname;
  const siteKey = Object.keys(RULES.sites).find((k) => host === k || host.endsWith("." + k)) || null;
  const active = [...RULES.platforms, ...(siteKey ? RULES.sites[siteKey] : [])];
  set("site", siteKey || "none");
  set("rules", active.length);
  if (BYPASSED) return;
  set("on", 1);

  let count = 0;
  const stamped = new Set();

  // Serialised, like the worker's note(): two pop-ups hidden in the same tick
  // must not race each other's get-modify-set.
  let chain = Promise.resolve();
  const record = (rule) => {
    chain = chain
      .then(async () => {
        const { popupStats } = await chrome.storage.local.get("popupStats");
        const s = { hidden: 0, bySite: {}, ...(popupStats || {}) };
        const key = siteKey || host;
        s.hidden += 1;
        s.bySite[key] = (s.bySite[key] || 0) + 1;
        s.last = { site: key, rule: rule.name, at: Date.now(), version: VERSION };
        await chrome.storage.local.set({ popupStats: s });
      })
      .catch(() => {});
  };

  const rendered = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const sweep = () => {
    reassert();
    for (const rule of active) {
      for (const sel of rule.hide) {
        let els;
        try {
          els = document.querySelectorAll(sel);
        } catch {
          set("badrule", sel);
          continue;
        }
        for (const el of els) {
          if (stamped.has(el) || !rendered(el)) continue;
          el.setAttribute("data-qfc-hidden", rule.name);
          stamped.add(el);
          count += 1;
          set("popups", count);
          set("last", rule.name);
          record(rule);
        }
      }
    }
    // Unlock scroll while any pop-up we hid is still in the document. A site
    // that takes its own dialog down gets its scroll behaviour back.
    let live = false;
    for (const el of stamped) if (el.isConnected) { live = true; break; }
    if (live) set("unlock", 1);
    else unset("unlock");
  };

  // Debounced: news pages mutate constantly (adverts, live blogs), and a
  // sweep per mutation would be a sweep per frame.
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; sweep(); }, 50);
  };

  schedule();
  new MutationObserver(schedule).observe(html, { childList: true, subtree: true });
  // A container that exists at display:none and is shown later changes no
  // child list, so the observer misses it; the tick does not.
  setInterval(sweep, 400);
})();
