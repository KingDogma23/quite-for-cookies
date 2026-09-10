/**
 * What popups.js hides, by name.
 *
 * Selectors, never heuristics. Each rule names one container that was
 * measured on a real page in a real profile, with the measurement beside it,
 * because a "big fixed thing with a high z-index" heuristic also matches
 * video players, menus, sign-in sheets and the consent dialog a user is in
 * the middle of answering. A rule that is wrong hides one container on one
 * site; a heuristic that is wrong hides the web.
 *
 * Two kinds:
 *   platforms  consent dialogs by the platform that draws them, applied on
 *              every site this script runs on;
 *   sites      a paper's own "subscribe" or sale modal, keyed by the
 *              registrable domain.
 *
 * popups.css is GENERATED from this file by test/build-popups-css.mjs, so a
 * selector exists in exactly one place; test/verify.mjs fails if the two
 * drift. Loaded by the content script (before popups.js), by the popup, by
 * the worker and by the suite.
 *
 * `papers` is the list the popup offers as tick boxes. Nothing runs on a
 * site until the user ticks it: the tick asks Chrome for access to that one
 * site and the worker registers the script there (background.js). The
 * manifest names no site at all.
 */
self.QFC_RULES = {
  papers: [
    { name: "The Telegraph", site: "telegraph.co.uk" },
    { name: "The Independent", site: "independent.co.uk" },
    { name: "The Sun", site: "thesun.co.uk" },
    { name: "The Times", site: "thetimes.com", also: ["thetimes.co.uk"] },
    { name: "The Standard", site: "standard.co.uk" },
    { name: "The Scotsman", site: "scotsman.com" },
    { name: "The Herald", site: "heraldscotland.com" },
    { name: "The Mirror", site: "mirror.co.uk" },
    { name: "Daily Express", site: "express.co.uk" },
    { name: "Manchester Evening News", site: "manchestereveningnews.co.uk" },
    { name: "Liverpool Echo", site: "liverpoolecho.co.uk" },
    { name: "Birmingham Mail", site: "birminghammail.co.uk" },
    { name: "Daily Record", site: "dailyrecord.co.uk" },
    { name: "WalesOnline", site: "walesonline.co.uk" },
    { name: "Belfast Telegraph", site: "belfasttelegraph.co.uk" },
    { name: "Financial Times", site: "ft.com" },
    { name: "Daily Mail", site: "dailymail.co.uk" },
    { name: "Metro", site: "metro.co.uk" },
    { name: "The i Paper", site: "inews.co.uk" },
    { name: "The Guardian", site: "theguardian.com" },
  ],
  platforms: [
    {
      name: "Sourcepoint consent",
      hide: ['[id^="sp_message_container_"]'],
      measured:
        "2026-09-10 independent, sun, times, standard: div#sp_message_container_<n>, fixed, 100% of the viewport, z 2147483647; body carries an inline overflow:hidden while it is up",
    },
    {
      name: "Quantcast consent",
      hide: ["#qc-cmp2-container", "#qc-cmp2-main", "#qc-cmp2-ui"],
      measured:
        "2026-09-10 mirror, express: #qc-cmp2-container > #qc-cmp2-main are static, zero-height wrappers; inside them div.qc-cmp-cleanslate.css-<hash> is the fixed 100% backdrop, z 2147483647, holding dialog#qc-cmp2-ui (980x474). Hiding the container hides the tree by inheritance; the dialog is the box that is rendered, so it is the one counted. Body overflow auto, no lock. Reach's own dialog.CIPAConsentNotice_* sits beside it display:none and is NOT hidden here — never shown, so never counted",
    },
    {
      name: "Didomi consent",
      hide: ["#didomi-popup"],
      measured:
        "2026-09-10 belfasttelegraph: div#didomi-popup.didomi-popup-backdrop, fixed, 98%, z 2147483641; body.didomi-popup-open locks scroll",
    },
  ],
  sites: {
    "ft.com": [
      {
        name: "FT marketing prompt",
        hide: [".o-banner--exponea-marketing-popup-prompt"],
        measured:
          "2026-09-10 ft.com: div.o-banner.n-messaging-client-messaging-banner.n-exponea.o-banner--exponea-marketing-popup-prompt, fixed, 17% of the viewport, z 107, 'Sale now live — Explore offers'; no lock. FT's own cookie message was not up (its answer survives the sweep) and has no rule",
      },
    ],
    "dailymail.co.uk": [
      {
        name: "Daily Mail consent-or-pay",
        hide: ['div[class*="overlay_"][class*="fullHeight_"]'],
        measured:
          "2026-09-10 dailymail.co.uk: div.overlay_QGo9N.fullHeight_Of_IL inside div.app-0-0-2, fixed, 100%, 'Choose how to use Daily Mail — Purchase a Daily Mail Essential subscription…'; html and body overflow:hidden while it is up. The class hashes are the build's and the semantic prefixes are the handle — the counter is what says when they change",
      },
    ],
    "metro.co.uk": [
      {
        name: "Metro consent-or-pay",
        hide: ['div[class*="overlay_"][class*="fullHeight_"]'],
        measured:
          "2026-09-10 metro.co.uk: the Mail's overlay, same build — div.overlay_QGo9N.fullHeight_Of_IL inside div.app-0-0-10, fixed, 98%, 'Choose how to use Metro — Purchase a Metro Essential subscription…'; html and body overflow:hidden",
      },
    ],
    "inews.co.uk": [
      {
        name: "i Paper consent-or-pay",
        hide: ['div[class*="overlay_"][class*="fullHeight_"]'],
        measured:
          "2026-09-10 inews.co.uk: the Mail's overlay, same build — div.overlay_QGo9N.fullHeight_Of_IL inside div.app-0-0-10, fixed, 100%, 'Choose how to use The i Paper — Purchase The i Paper Lite subscription…'; html and body overflow:hidden",
      },
    ],
    "telegraph.co.uk": [
      {
        name: "Telegraph sale spotlight",
        hide: ["#spotlight-modal", "#martech-spotlight-scrim"],
        measured:
          "2026-09-10: aside#spotlight-modal.martech-spotlight-modal 600x366, absolute, z 2147483646, 'SUMMER SALE: LAST CHANCE — Try 4 months free'; div#martech-spotlight-scrim role=dialog is its backdrop; no scroll lock",
      },
    ],
  },
};
