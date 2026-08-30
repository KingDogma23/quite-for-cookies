/**
 * Clear a site when its last tab closes.
 *
 * Chrome's own session_only content setting ends at BROWSER close, and its
 * Settings toggle says as much ("when you close all windows"), so it cannot do
 * this — hence our own bookkeeping.
 *
 * Three things this must get right, all of them learned the hard way elsewhere
 * in this project:
 *
 *  1. It must not fire while the site is still open somewhere. onRemoved gives
 *     us a tab id and nothing else, so the tab-to-site map is kept in
 *     storage.session — an in-memory map dies with the service worker, which
 *     MV3 suspends aggressively, and the failure would be silent.
 *  2. It must never touch a site on the spared list. That list is the one the
 *     user curates by hand in the popup, so it is already the right whitelist;
 *     inventing a second one would let the two disagree.
 *  3. It must count what it did. A feature that cannot report a success is
 *     indistinguishable from one that never runs, and this one runs where
 *     nobody is watching. Every sweep is recorded and shown in the popup.
 */
importScripts("psl-data.js", "psl.js", "signin.js");

/**
 * Every decision this worker makes is recorded, because it runs where nobody
 * can watch it and its failure mode is silence. The first version had no log,
 * and a switched-on sweep that cleared nothing was indistinguishable from a
 * sweep that never fired. That is the same shape as the stall-recovery feature
 * that shipped in eleven versions of the YouTube extension without once being
 * observed doing anything.
 */
let noteChain = Promise.resolve();

/**
 * @param {string} line
 * @param {"outcome"|"trace"} kind  An OUTCOME is something that happened to the
 *   user's data, or a reason it did not. A TRACE is bookkeeping. The popup shows
 *   the newest few, and it used to show them mixed: every tab close wrote a line
 *   whether or not anything followed, so a handful of ordinary closes pushed the
 *   one line that mattered out of view.
 */
function note(line, kind = "outcome") {
  // Serialised: concurrent tab events each did get-modify-set, and the later
  // write overwrote the earlier one. An instrument that drops its own readings
  // under load is worse than none, because it looks like it is working.
  noteChain = noteChain
    .then(async () => {
      const { autoLog } = await chrome.storage.local.get("autoLog");
      const log = autoLog || [];
      log.unshift({ t: Date.now(), line, kind });
      await chrome.storage.local.set({ autoLog: log.slice(0, 40) });
    })
    .catch(() => {});
  return noteChain;
}

/**
 * Seed the map from tabs that are already open.
 *
 * Measured 2026-08-27: with the switch ON and access granted, closing a tab
 * cleared nothing — three times. Only reloading the extension fixed it. The
 * worker had started BEFORE the grant, so tab URLs were invisible to it and
 * onUpdated never recorded anything; every close then found an empty map and
 * silently did nothing. A user who ticks the switch would hit exactly that,
 * and would have no way to tell it apart from the feature not working.
 *
 * So the map is rebuilt on worker start and again the moment access is granted,
 * rather than waiting for each tab to navigate.
 */
const siteOf = (url) => {
  try {
    return PSL.registrable(new URL(url).hostname);
  } catch {
    return null;
  }
};

async function seedFromOpenTabs(reason) {
  const map = {};
  const origins = {};
  let skipped = 0;
  for (const t of await chrome.tabs.query({})) {
    // Incognito tabs are never tracked. Nothing in the sweep is cookie-store
    // aware: chrome.cookies.getAll({domain}) uses the CALLING context's store
    // and chrome.browsingData.remove() acts on the regular profile. So if the
    // user grants this extension incognito access (default "spanning" — one
    // worker serving both), closing the last incognito tab for a site fired the
    // sweep against the REGULAR profile and deleted regular-profile cookies,
    // and with "Also clear stored site data" on, its localStorage, IndexedDB,
    // caches and service workers too. The "still open elsewhere" guard does not
    // help: it only counts normal tabs.
    //
    // Skipping is the correct fix rather than the cheap one — the browser
    // discards incognito data when the session ends, so there is nothing here
    // for this feature to add.
    if (t.incognito) { skipped++; continue; }
    const site = t.url && siteOf(t.url);
    if (!site) continue;
    map[t.id] = site;
    remember(origins, site, t.url);
  }
  await chrome.storage.session.set({ tabsites: map, origins });
  note(`${reason} — tracking ${Object.keys(map).length} open tab(s)` + (skipped ? `, ${skipped} incognito tab(s) left alone` : ""));
}

seedFromOpenTabs("worker started");
chrome.permissions.onAdded.addListener(() => seedFromOpenTabs("access granted"));

/**
 * Cookies are keyed by domain, but local storage, databases and caches are keyed
 * by ORIGIN — https://www.example.com is a different bucket from https://m.example.com.
 * So the origins actually visited are remembered per site, rather than guessed
 * from the domain afterwards.
 */
function remember(origins, site, url) {
  try {
    const origin = new URL(url).origin;
    origins[site] = origins[site] || [];
    if (!origins[site].includes(origin)) origins[site].push(origin);
  } catch {
    /* not a URL we can key storage on */
  }
}

async function originMap() {
  const { origins } = await chrome.storage.session.get("origins");
  return origins || {};
}

async function tabMap() {
  const { tabsites } = await chrome.storage.session.get("tabsites");
  return tabsites || {};
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // See seedFromOpenTabs: an incognito tab must never enter the map, or closing
  // it sweeps the regular profile.
  if (tab.incognito) return;
  const url = changeInfo.url || tab.url;
  if (!url || !/^https?:/.test(url)) return;
  const site = siteOf(url);
  if (!site) return;
  const map = await tabMap();
  if (map[tabId] === site) return;
  map[tabId] = site;
  const origins = await originMap();
  remember(origins, site, url);
  await chrome.storage.session.set({ tabsites: map, origins });
  // Deliberately not logged: one line per navigation buries the outcomes.
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const map = await tabMap();
  const site = map[tabId];
  if (site) {
    delete map[tabId];
    await chrome.storage.session.set({ tabsites: map });
  }
  // No line for a tab that was never tracked: it is not an outcome, and one per
  // close is what buried the outcomes.
  if (!site) return;
  note(`tab ${tabId} closed — was on ${site}`, "trace");

  const { globalPrefs } = await chrome.storage.local.get("globalPrefs");
  const prefs = { autoClear: false, autoKeepLogins: true, autoClearStorage: false, spared: [], ...(globalPrefs || {}) };
  if (!prefs.autoClear) return note(`${site}: switch is off`);
  if (prefs.spared.includes(site)) return note(`${site}: on the spared list, left alone`);

  // Still open elsewhere? Then this was not the last tab.
  const open = await chrome.tabs.query({});
  // Incognito tabs are not tracked, so they must not count as "still open"
  // either — otherwise an incognito tab on the same site would silently
  // suppress a sweep the user asked for in their normal profile.
  const stillOpen = open.filter((t) => !t.incognito && t.url && siteOf(t.url) === site).length;
  if (stillOpen) return note(`${site}: still open in ${stillOpen} other tab(s)`);

  // Without the browser-wide grant this returns an empty array rather than an
  // error, so the permission is checked before the result is believed.
  const allowed = await chrome.permissions.contains({ origins: ["*://*/*"] });
  if (!allowed) return note(`${site}: no browser-wide access granted`);

  const origins = await originMap();
  const siteOrigins = origins[site] || [];

  const present = await chrome.cookies.getAll({ domain: site });
  // Sign-ins are spared by default. Closing a tab should tidy the tracking, not
  // evict you from the site — and nobody is watching when this runs.
  const kept = prefs.autoKeepLogins ? present.filter(self.looksLikeSignIn).length : 0;
  const before = prefs.autoKeepLogins ? present.filter((c) => !self.looksLikeSignIn(c)) : present;
  if (!before.length && !(prefs.autoClearStorage && siteOrigins.length)) {
    return note(`${site}: ${present.length} cookie(s) found, ${kept} kept as sign-ins, nothing left to remove`);
  }

  for (const c of before) {
    const details = {
      url: `${c.secure ? "https" : "http"}://${c.domain.replace(/^\./, "")}${c.path}`,
      name: c.name,
      storeId: c.storeId,
    };
    if (c.partitionKey) details.partitionKey = c.partitionKey;
    try {
      await chrome.cookies.remove(details);
    } catch {
      /* counted below, never assumed */
    }
  }

  // Count only the ones we asked for: a re-count of the whole domain would
  // report the spared sign-ins as failures.
  const still = new Set(
    (await chrome.cookies.getAll({ domain: site })).map((c) => `${c.storeId}|${c.domain}|${c.path}|${c.name}`),
  );
  const removed = before.filter((c) => !still.has(`${c.storeId}|${c.domain}|${c.path}|${c.name}`)).length;

  // `kept` above is a count of what was spared BEFORE the removal loop, and it
  // was reported to the user as an outcome — "N sign-ins kept" — without
  // anything checking they survived. A claim that cannot fail is not a claim.
  // The re-read above already tells us; use it.
  const spared = prefs.autoKeepLogins ? present.filter(self.looksLikeSignIn) : [];
  const keptNow = spared.filter((c) => still.has(`${c.storeId}|${c.domain}|${c.path}|${c.name}`)).length;
  const lostSignIns = spared.length - keptNow;

  /**
   * Cookies alone are not enough, and this was measured rather than assumed: on
   * independent.co.uk the sweep removed the cookies and both the Chartbeat id
   * and the Permutive id came back BYTE-IDENTICAL, because those trackers mirror
   * the value in local storage and re-set the cookie from it. Clearing cookies
   * only, and calling the site cleaned, would have been a true sentence that
   * misleads — which is the one thing this extension is not allowed to be.
   */
  // NOTE ON WORDING: this counts origins the browser was ASKED to clear, not
  // origins verified empty afterwards. browsingData.remove() reports nothing
  // back, and by the time the sweep runs the tab is gone, so there is no page
  // left to measure from. The cookie half above is a genuine re-count; this half
  // cannot be, and the log now says "requested" rather than "cleared" instead of
  // implying a verification that never happened.
  let storageRequested = 0;
  if (prefs.autoClearStorage && siteOrigins.length) {
    const types = { cacheStorage: true, fileSystems: true, indexedDB: true, localStorage: true, serviceWorkers: true };
    try {
      await chrome.browsingData.remove({ origins: siteOrigins }, types);
      storageRequested = siteOrigins.length;
    } catch {
      try {
        await chrome.browsingData.remove({ origins: siteOrigins }, { indexedDB: true, localStorage: true, cacheStorage: true });
        storageRequested = siteOrigins.length;
      } catch {
        /* reported as zero rather than assumed */
      }
    }
  }
  delete origins[site];
  await chrome.storage.session.set({ origins });

  const { stats } = await chrome.storage.local.get("stats");
  const next = { cookies: 0, items: 0, sites: [], ...(stats || {}) };
  next.cookies += removed;
  if (removed && !next.sites.includes(site)) next.sites.push(site);

  await chrome.storage.local.set({
    stats: next,
    lastAuto: { site, removed, kept: keptNow, lostSignIns, at: Date.now() },
  });
  note(
    `${site}: removed ${removed} of ${before.length}, kept ${keptNow}` +
      // Loud, because it means the guard did not hold: a cookie the sweep was
      // told to spare is gone, and nobody was watching when it happened.
      (lostSignIns ? ` — ${lostSignIns} SIGN-IN(S) DID NOT SURVIVE` : "") +
      (prefs.autoClearStorage ? `, site data clear requested for ${storageRequested} origin(s)` : ""),
  );
});
