/**
 * Quite for Cookies — show what a site stored, remove what you pick, prove it went.
 *
 * Three findings from the spike shape this file. All measured, 2026-08-27:
 *
 *  1. activeTab does NOT grant chrome.cookies, and the refusal is SILENT — an
 *     empty array, never an error. So an empty result is never reported as
 *     "nothing stored" without first checking the permission is actually held.
 *     A cleaner that skips that check tells the user it worked and does nothing,
 *     which is the complaint filed against half the incumbents on this shelf.
 *  2. permissions.request({origins}) from this popup DOES grant it, scoped. The
 *     extension therefore installs asking for nothing, and asks per site.
 *  3. Cookies are keyed on the domain that set them. getAll({url}) missed 2 of
 *     23 on bbc.co.uk; getAll({domain}) found all of them. Query by domain.
 *
 * And the rule the whole thing turns on: never report a deletion from the
 * return value of the delete call. Count again afterwards and report the count.
 */

const $ = (s) => document.querySelector(s);
const pattern = (domain) => `*://*.${domain}/*`;

/**
 * The blanket grant. Offered, never assumed — and never the default. Asking for
 * it up front is what every competitor does, and the reason their install screen
 * says "read and change all your data on all websites" before the user has seen
 * a single thing the extension can do. Here it is a choice made after the fact,
 * by someone who has already watched it work on one site, and it is reversible
 * from the same line of text that turned it on.
 */
const ALL_SITES = "*://*/*";

/**
 * Two different questions, and conflating them logged a real user out of every
 * site they used on 2026-08-27.
 *
 * looksLikeSignIn — "is this probably the login cookie?" Narrow, name-led, used
 * only for the badge and the warning in per-site mode, where a false positive
 * would train people to ignore both.
 *
 * It is NOT allowed anywhere near the browser-wide sweep. Guessing at logins by
 * shape failed twice in one evening: a name pattern missed Facebook's `c_user`
 * and signed a real user out of everything, and the cautious replacement —
 * spare anything Secure, HttpOnly or without an expiry — spared so much that it
 * targeted three cookies out of a thousand, while its own label read "clears far
 * more". Harmful, then useless. The sweep now works from a curated list of
 * things that are definitely trackers, or clears everything and says so.
 */
const { looksLikeSignIn } = self;   // signin.js — one definition, two callers

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

function cookieUrl(c) {
  const host = c.domain.startsWith(".") ? c.domain.slice(1) : c.domain;
  return `${c.secure ? "https" : "http"}://${host}${c.path}`;
}

/**
 * Totals, kept because the other two extensions keep them and because a number
 * that only ever counts VERIFIED removals is worth something. Every figure here
 * came from a re-count after deleting, never from a delete call returning
 * without complaint — which, on this API, it does even when it removed nothing.
 */
async function readStats() {
  const { stats } = await chrome.storage.local.get("stats");
  const merged = { cookies: 0, items: 0, sites: [], ...(stats || {}) };
  // 0.6.0 recorded a browser-wide sweep as one pseudo-site called "every site".
  // Drop it rather than leave a fake entry inflating the count for ever.
  merged.sites = merged.sites.filter((s) => s !== "every site");
  return merged;
}

async function addStats(cookies, items, sites) {
  const stats = await readStats();
  stats.cookies += cookies;
  stats.items += items;
  // A browser-wide sweep touches hundreds of sites. Passing it a single label
  // credited it with one, which made "Sites cleaned" quietly meaningless.
  for (const site of sites) if (!stats.sites.includes(site)) stats.sites.push(site);
  await chrome.storage.local.set({ stats });
  return stats;
}

/** Which mode the popup opens in, so the common action is not two clicks away. */
async function readUi() {
  const { ui } = await chrome.storage.local.get("ui");
  return { mode: "site", ...(ui || {}) };
}

async function paintStats(stats) {
  const s = stats || (await readStats());
  const n = (v) => v.toLocaleString();
  $("#stats").hidden = false;
  $("#stats").innerHTML = `<div class="statlabel">ALL TIME, EVERY SITE</div>
    <div class="statrow">
      <div><b>${n(s.cookies)}</b><span>Cookies removed</span></div>
      <div><b>${n(s.items)}</b><span>Data items cleared</span></div>
      <div><b>${n(s.sites.length)}</b><span>Sites cleaned</span></div>
    </div>
    <a class="coffee" href="https://buymeacoffee.com/kingdogma23" target="_blank" rel="noopener">Free, and staying that way — buy me a coffee</a>`;
}

/**
 * What the user chose to spare, per site, remembered.
 *
 * Two faults it fixes, reported after a real session: unticking a sign-in group
 * lasted exactly until the next scan, and everything arrived ticked anyway — so
 * the extension signed you out of a site repeatedly while claiming, in its own
 * warning text, to be the thing that doesn't do that.
 *
 * The default is now the cautious one. Sign-in cookies start UNTICKED, because
 * the reason people clear cookies is almost never "log me out of everywhere",
 * and an accidental sign-out costs more than a spared cookie. An explicit tick
 * is remembered just as faithfully as an explicit untick.
 */
async function loadSelection() {
  const { prefs } = await chrome.storage.local.get("prefs");
  const saved = (prefs || {})[state.site];
  if (saved) {
    state.deselected = new Set(saved.off || []);
    state.skipStorage = !!saved.skipStorage;
    return;
  }
  state.deselected = new Set(state.groups.filter((g) => g.signIn).map((g) => g.domain));
  state.skipStorage = false;
}

async function saveSelection() {
  const { prefs } = await chrome.storage.local.get("prefs");
  await chrome.storage.local.set({
    prefs: { ...(prefs || {}), [state.site]: { off: [...state.deselected], skipStorage: state.skipStorage } },
  });
}

const state = {
  tab: null, host: "", site: "", origin: "", allSites: false, mode: "site", allGroups: [], expanded: false,
  groups: [], storage: null, thirdParties: [], deselected: new Set(), skipStorage: false,
};

/* ---------------------------------------------------------------- reading */

async function inPage(func) {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: state.tab.id }, func });
    return res.result;
  } catch {
    return null; // Injection is blocked on some pages; callers render that honestly.
  }
}

const readStorage = () =>
  inPage(async () => {
    const measure = (store) => {
      try {
        let keys = 0, size = 0;
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          keys++;
          size += k.length + (store.getItem(k) || "").length;
        }
        return { keys, size };
      } catch {
        return null; // Storage can be blocked outright; not the same as empty.
      }
    };
    const safe = async (fn) => { try { return await fn(); } catch { return []; } };
    return {
      local: measure(localStorage),
      session: measure(sessionStorage),
      dbs: (await safe(() => indexedDB.databases())).map((d) => d.name).filter(Boolean),
      caches: await safe(() => caches.keys()),
      workers: (await safe(() => navigator.serviceWorker.getRegistrations())).length,
    };
  });

const readThirdPartyHosts = () =>
  inPage(() => {
    const hosts = new Set();
    for (const e of performance.getEntriesByType("resource")) {
      try { hosts.add(new URL(e.name).hostname); } catch { /* blob:, data: */ }
    }
    return [...hosts];
  });

/** Cookies for every domain we currently hold permission for, grouped by the domain that set them. */
async function scan() {
  const domains = [state.site, ...state.thirdParties.filter((t) => t.granted).map((t) => t.domain)];
  const seen = new Map();
  for (const domain of domains) {
    for (const c of await chrome.cookies.getAll({ domain })) {
      seen.set(`${c.storeId}|${c.domain}|${c.path}|${c.name}`, c);
    }
  }
  const groups = new Map();
  for (const c of seen.values()) {
    if (!groups.has(c.domain)) groups.set(c.domain, []);
    groups.get(c.domain).push(c);
  }
  return [...groups.entries()]
    .map(([domain, cookies]) => ({
      domain,
      cookies,
      bytes: cookies.reduce((n, c) => n + c.name.length + c.value.length, 0),
      signIn: cookies.filter(looksLikeSignIn).length,
      firstParty: domain.replace(/^\./, "").endsWith(state.site),
    }))
    .sort((a, b) => Number(b.firstParty) - Number(a.firstParty) || b.cookies.length - a.cookies.length);
}

async function refreshThirdParties() {
  const hosts = (await readThirdPartyHosts()) || [];
  const domains = [...new Set(hosts.map((h) => PSL.registrable(h)).filter((d) => d && d !== state.site))];
  state.thirdParties = await Promise.all(
    domains.sort().map(async (domain) => ({
      domain,
      granted: await chrome.permissions.contains({ origins: [pattern(domain)] }),
    })),
  );
}

/* --------------------------------------------------------------- removing */

async function removeSelected() {
  const targets = state.groups.filter((g) => !state.deselected.has(g.domain)).flatMap((g) => g.cookies);

  for (const c of targets) {
    const details = { url: cookieUrl(c), name: c.name, storeId: c.storeId };
    // Partitioned (CHIPS) cookies are invisible to a remove() that omits the
    // key — they survive, and the extension would claim otherwise.
    if (c.partitionKey) details.partitionKey = c.partitionKey;
    try { await chrome.cookies.remove(details); } catch { /* survivors are counted below */ }
  }

  if (!state.skipStorage && state.storage) {
    // No webSQL: Chrome removed it, and asking throws "Requested data type(s)
    // are not supported" for the WHOLE call — which the fallback below caught,
    // but not before logging an error on every single run. A red Errors button
    // on a privacy extension is its own kind of bug.
    const full = { cacheStorage: true, fileSystems: true, indexedDB: true, localStorage: true, serviceWorkers: true };
    const core = { cacheStorage: true, indexedDB: true, localStorage: true };
    try {
      await chrome.browsingData.remove({ origins: [state.origin] }, full);
    } catch {
      try { await chrome.browsingData.remove({ origins: [state.origin] }, core); } catch { /* re-counted below */ }
    }
    // browsingData has no sessionStorage type; it has to be cleared in the page.
    await inPage(() => { try { sessionStorage.clear(); } catch {} });
  }

  return targets.length;
}

/* --------------------------------------------------------------- painting */

function paintGroups() {
  const rows = state.groups
    .map((g) => {
      const tags =
        (g.firstParty ? "" : '<span class="tag">third party</span>') +
        (g.signIn ? `<span class="tag warn">${plural(g.signIn, "sign-in", "sign-in")}</span>` : "");
      return `<label class="group">
        <input type="checkbox" data-domain="${esc(g.domain)}" ${state.deselected.has(g.domain) ? "" : "checked"} />
        <span class="gmain">
          <span class="gname">${esc(g.domain)}${tags}</span>
          <span class="gmeta">${plural(g.cookies.length, "cookie", "cookies")} · ${kb(g.bytes)}</span>
        </span>
      </label>`;
    })
    .join("");

  const s = state.storage;
  const bits = [];
  if (s) {
    if (s.local?.keys) bits.push(`${plural(s.local.keys, "item", "items")} local storage (${kb(s.local.size)})`);
    if (s.session?.keys) bits.push(`${plural(s.session.keys, "item", "items")} session storage`);
    if (s.dbs.length) bits.push(plural(s.dbs.length, "database", "databases"));
    if (s.caches.length) bits.push(plural(s.caches.length, "cache", "caches"));
    if (s.workers) bits.push(plural(s.workers, "service worker", "service workers"));
  }
  const hasStorage = bits.length > 0;
  const storageRow = !s
    ? `<div class="group"><span class="gmain"><span class="gmeta">Site data couldn't be read on this page.</span></span></div>`
    : !hasStorage
      ? `<div class="group"><span class="gmain"><span class="gmeta empty">No site data stored.</span></span></div>`
      : `<label class="group">
          <input type="checkbox" id="storage" ${state.skipStorage ? "" : "checked"} />
          <span class="gmain">
            <span class="gname">${esc(state.origin.replace(/^https?:\/\//, ""))}</span>
            <span class="gmeta">${bits.join(" · ")}</span>
          </span>
        </label>`;

  const pending = state.thirdParties.filter((t) => !t.granted);
  const thirdRow = pending.length
    ? `<div class="section">Also loaded by this page</div>
       <div class="pad">
         <p class="lead">${plural(pending.length, "other domain", "other domains")} set resources here.
         Their cookies stay hidden until you allow it: ${pending.slice(0, 6).map((t) => `<code>${esc(t.domain)}</code>`).join(", ")}${pending.length > 6 ? "…" : ""}</p>
         <button id="includeThird" class="ghost">Include their cookies too</button>
       </div>`
    : "";

  const selected = state.groups.filter((g) => !state.deselected.has(g.domain));
  const total = selected.reduce((n, g) => n + g.cookies.length, 0);
  const signOut = selected.filter((g) => g.signIn).length;

  const spared = state.groups.filter((g) => g.signIn && state.deselected.has(g.domain)).length;
  $("#main").innerHTML =
    (signOut
      ? `<p class="notice">This will sign you out of ${esc(state.site)} — and only ${esc(state.site)}.</p>`
      : spared
        ? `<p class="notice">Keeping the cookies that hold your sign-in, so you'll stay logged in to ${esc(state.site)}. Tick them if you'd rather be signed out.</p>`
        : "") +
    `<div class="section">Cookies</div>${rows || '<div class="pad"><span class="empty">No cookies stored.</span></div>'}` +
    `<div class="section">Site data</div>${storageRow}` +
    thirdRow;

  // The button names everything it is about to take. Saying "Remove 22 cookies"
  // while a ticked box also wipes 46 local-storage items is the exact behaviour
  // this extension exists to be the opposite of.
  const clearingStorage = hasStorage && !state.skipStorage;
  const label = total && clearingStorage
    ? `Remove ${plural(total, "cookie", "cookies")} and site data`
    : total ? `Remove ${plural(total, "cookie", "cookies")}`
    : clearingStorage ? "Remove site data"
    : "Nothing selected";

  $("#footer").hidden = false;
  $("#footer").innerHTML = `<button id="go" ${total || clearingStorage ? "" : "disabled"}>${label}</button>`;

  $("#main").querySelectorAll("input[data-domain]").forEach((box) =>
    box.addEventListener("change", () => {
      box.checked ? state.deselected.delete(box.dataset.domain) : state.deselected.add(box.dataset.domain);
      saveSelection();
      paintGroups();
    }),
  );
  const storageBox = $("#storage");
  if (storageBox) storageBox.addEventListener("change", () => {
    state.skipStorage = !storageBox.checked;
    saveSelection();
    paintGroups();
  });
  $("#includeThird")?.addEventListener("click", includeThirdParties);
  $("#go").addEventListener("click", runRemoval);
}

/**
 * The master switch.
 *
 * The other two extensions open with one, and this one had none — reasonable
 * while every action was a button press, wrong once it gained a job that runs
 * in the background. It is the same setting as the auto-clear checkbox rather
 * than a second control beside it: two switches for one behaviour is how they
 * come to disagree.
 */
async function paintMaster() {
  const prefs = await readGlobalPrefs();
  const box = $("#enabled");
  $("#master").hidden = false;
  box.checked = prefs.autoClear;
  $("#stateText").textContent = prefs.autoClear ? "Clearing on" : "Clearing off";
  $("#stateSub").textContent = prefs.autoClear
    ? "Sites cleared as you close their last tab"
    : "Nothing is cleared unless you ask";

  box.onchange = async () => {
    if (box.checked && !state.allSites) {
      // It cannot work without the browser-wide grant, and a switch that
      // silently does nothing is the defect this extension exists to be the
      // opposite of.
      let ok = false;
      try { ok = await chrome.permissions.request({ origins: [ALL_SITES] }); } catch {}
      if (!ok) { box.checked = false; paintMaster(); return; }
      state.allSites = true;
    }
    await saveGlobalPrefs({ autoClear: box.checked });
    await paintMaster();
    if (state.mode === "all") paintAll();
  };
}

function paintScope() {
  const el = $("#scope");
  el.hidden = false;
  // "Allowed for bbc.co.uk" never said allowed to do what. Name the capability.
  el.innerHTML = state.allSites
    ? `<span>Can read cookies on <b>every site</b></span><button id="scopeToggle">Limit to one site</button>`
    : `<span>Can read cookies on <b>${esc(state.site)}</b> only</span><button id="scopeToggle">Allow every site</button>`;

  $("#scopeToggle").addEventListener("click", async () => {
    $("#scopeToggle").disabled = true;
    try {
      if (state.allSites) await chrome.permissions.remove({ origins: [ALL_SITES] });
      else await chrome.permissions.request({ origins: [ALL_SITES] });
    } catch { /* declined, or dismissed; start() re-reads the truth either way */ }
    start();
  });
}

async function paintScan() {
  state.groups = await scan();
  await loadSelection();
  const count = state.groups.reduce((n, g) => n + g.cookies.length, 0);
  $("#sub").textContent = `${plural(count, "cookie", "cookies")} across ${plural(state.groups.length, "domain", "domains")}`;
  paintGroups();
  paintScope();
  paintStats();
  paintMaster();
}

/* ----------------------------------------------------------- every site */

/**
 * The whole browser at once, minus the things that keep you logged in.
 *
 * This is the feature the shelf is missing. The loudest complaint in the recent
 * reviews of the incumbents is not that they fail to delete — it is that they
 * delete everything and sign the reader out of every site they use. So the
 * default here is inverted: a global sweep spares anything that looks like a
 * sign-in, and the user has to deliberately turn that protection off.
 *
 * Cookies only. Clearing local storage across every origin would need a
 * different, blunter API and would take service workers and databases with it,
 * so it stays a per-site action where the preview can be honest about scope.
 */
async function readGlobalPrefs() {
  const { globalPrefs } = await chrome.storage.local.get("globalPrefs");
  return {
    mode: "trackers", keepLogins: true, autoClear: false, autoKeepLogins: true,
    autoClearStorage: false, spared: [], ...(globalPrefs || {}),
  };
}

/**
 * A cookie that exists to follow people around. Either it lives on a domain
 * whose only business is advertising or analytics, or it carries a name that
 * belongs unmistakably to a counter. Both tests are curated, and neither can
 * match a credential — which is the point. Tracker mode cannot sign anyone out,
 * because nothing it will touch is capable of signing anyone in.
 */
const isTracker = (c) =>
  self.TRACKERS.has(PSL.registrable(c.domain.replace(/^\./, "")) || "") ||
  self.TRACKING_COOKIE_RE.test(c.name);

/**
 * Merge a change into whatever is stored NOW, rather than spreading a copy read
 * when the panel was last painted.
 *
 * Every handler used to save `{...prefs, oneField}` from its closure. Paint,
 * change something, and a second handler bound to the earlier paint writes the
 * whole object back — silently reverting anything changed in between. That is
 * the likeliest explanation for the auto-clear switch turning itself off
 * between sessions on 2026-08-28, having demonstrably worked minutes earlier.
 */
async function saveGlobalPrefs(patch) {
  const { globalPrefs } = await chrome.storage.local.get("globalPrefs");
  await chrome.storage.local.set({ globalPrefs: { ...(globalPrefs || {}), ...patch } });
}

async function scanAll() {
  const groups = new Map();
  for (const c of await chrome.cookies.getAll({})) {
    const host = c.domain.replace(/^\./, "");
    const site = PSL.registrable(host) || host; // IPs and odd hosts keep their own name
    if (!groups.has(site)) groups.set(site, []);
    groups.get(site).push(c);
  }
  return [...groups]
    .map(([site, cookies]) => ({
      site,
      cookies,
      signIn: cookies.filter(looksLikeSignIn).length,
      bytes: cookies.reduce((n, c) => n + c.name.length + c.value.length, 0),
    }))
    .sort((a, b) => b.cookies.length - a.cookies.length);
}

function targetsFor(prefs) {
  return state.allGroups
    .filter((g) => !prefs.spared.includes(g.site))
    .flatMap((g) => g.cookies)
    .filter((c) =>
      prefs.mode === "everything" ? !(prefs.keepLogins && looksLikeSignIn(c)) : isTracker(c),
    );
}

async function paintAll() {
  const prefs = await readGlobalPrefs();
  const totalCookies = state.allGroups.reduce((n, g) => n + g.cookies.length, 0);
  const doomed =
    prefs.mode === "everything"
      ? (c) => !(prefs.keepLogins && looksLikeSignIn(c))
      : isTracker;
  const trackerCount = state.allGroups.reduce((n, g) => n + g.cookies.filter(isTracker).length, 0);
  const unspared = state.allGroups.filter((g) => !prefs.spared.includes(g.site)).flatMap((g) => g.cookies);
  const loginish = unspared.filter(looksLikeSignIn).length;
  const everythingCount = prefs.keepLogins ? unspared.length - loginish : unspared.length;
  const targets = targetsFor(prefs);

  $("#sub").textContent = `${plural(totalCookies, "cookie", "cookies")} across ${plural(state.allGroups.length, "site", "sites")}`;
  $("#scope").hidden = true;

  const { lastAuto, autoLog } = await chrome.storage.local.get(["lastAuto", "autoLog"]);
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? "just now" : m < 60 ? `${plural(m, "minute", "minutes")} ago` : `${plural(Math.round(m / 60), "hour", "hours")} ago`;
  };
  const autoRow = `<div class="auto">
    <span><b>${prefs.autoClear ? "Clearing as you close tabs" : "Automatic clearing is off"}</b>
    <span>${prefs.autoClear ? "Sites you have spared below are never touched" : "Turn it on with the switch at the top"}${
      state.allSites || !prefs.autoClear ? "" : " — needs access to every site, which you have not given yet"
    }.${
      lastAuto ? `<span class="last">Last: ${esc(lastAuto.site)} — ${plural(lastAuto.removed, "cookie", "cookies")} removed${
        lastAuto.kept ? `, ${plural(lastAuto.kept, "sign-in", "sign-ins")} kept` : ""
      }, ${ago(lastAuto.at)}</span>` : ""
    }</span></span>
  </div>
  <label class="auto sub">
    <input type="checkbox" id="autoKeepLogins" ${prefs.autoKeepLogins ? "checked" : ""} ${prefs.autoClear ? "" : "disabled"} />
    <span><b>Keep sign-in cookies when it does</b>
    <span>Leaves anything that looks like a login, so closing a tab tidies the
    tracking without logging you out of the site.</span></span>
  </label>
  <label class="auto sub">
    <input type="checkbox" id="autoClearStorage" ${prefs.autoClearStorage ? "checked" : ""} ${prefs.autoClear ? "" : "disabled"} />
    <span><b>Also clear stored site data</b>
    <span>Without this, trackers that keep a copy of your ID in local storage put
    the same cookie straight back — measured, not theoretical. With it, sites that
    keep your login in local storage rather than a cookie will sign you out.</span></span>
  </label>`;

  const rows = !state.expanded ? "" : [...state.allGroups]
    .sort((a, b) => a.site.localeCompare(b.site))
    .map((g) => {
      const spared = prefs.spared.includes(g.site);
      const going = spared ? 0 : g.cookies.filter(doomed).length;
      const kept = g.cookies.length - going;
      return `<label class="group">
        <input type="checkbox" data-site="${esc(g.site)}" ${spared ? "" : "checked"} />
        <span class="gmain">
          <span class="gname">${esc(g.site)}${g.signIn ? `<span class="tag warn">${g.signIn} sign-in</span>` : ""}</span>
          <span class="gmeta">${plural(g.cookies.length, "cookie", "cookies")} · ${
            spared ? "left alone" : going ? `${going} to remove${kept ? `, ${kept} kept` : ""}` : `nothing to remove, ${kept} kept`
          }</span>
        </span>
      </label>`;
    })
    .join("");

  $("#main").innerHTML =
    `<label class="choice">
       <input type="radio" name="sweep" value="trackers" ${prefs.mode === "trackers" ? "checked" : ""} />
       <span><b>Trackers only — ${plural(trackerCount, "cookie", "cookies")}</b>
       <span>${trackerCount
         ? `Advertising and analytics cookies, matched against a list of ${self.TRACKERS.size} tracking domains and known counter names. It cannot log you out: no site you can sign in to is on that list.`
         : `None found. If you run an ad blocker, that is why — these cookies were never set in the first place. Nothing here needs cleaning.`}</span></span>
     </label>
     <label class="choice risky">
       <input type="radio" name="sweep" value="everything" ${prefs.mode === "everything" ? "checked" : ""} />
       <span><b>Everything — ${plural(everythingCount, "cookie", "cookies")}</b>
       <span>Every cookie on every site you haven't spared.${
         prefs.keepLogins ? "" : " Logins included — you will be signed out of all of them."
       }</span></span>
     </label>
     <label class="choice sub">
       <input type="checkbox" id="keepLogins" ${prefs.keepLogins ? "checked" : ""} ${prefs.mode === "everything" ? "" : "disabled"} />
       <span><b>Keep the ones that look like sign-ins — ${plural(loginish, "cookie", "cookies")}</b>
       <span>Spares cookies that are Secure and HttpOnly, or named like a login. Best effort:
       it now covers the ones that caught us out, but a site with an unusual name can still slip through.</span></span>
     </label>
     ${autoRow}
     ${(autoLog || []).length ? `<div class="section">What it has been doing</div>
       <div class="pad log">${autoLog.slice(0, 8).map((e) =>
         `<div><span>${new Date(e.t).toLocaleTimeString()}</span> ${esc(e.line)}</div>`).join("")}</div>` : ""}
     <div class="section">Sites</div>
     ${state.expanded ? `<div class="find"><input id="find" type="search" placeholder="Find a site — type part of its name" /></div>${rows}<div class="nohits" id="nohits" hidden>No site matches that.</div>` : `<div class="pad"><p class="lead">${plural(state.allGroups.length, "site", "sites")} found. ${
       prefs.spared.length ? `${plural(prefs.spared.length, "site is", "sites are")} on your spared list.` : "Nothing is on your spared list."
     }</p><button id="expand" class="ghost">Review them one by one</button></div>`}`;

  $("#footer").hidden = false;
  $("#footer").innerHTML = `<button id="goAll" ${targets.length ? "" : "disabled"}>Remove ${plural(targets.length, "cookie", "cookies")}</button>`;

  $("#expand")?.addEventListener("click", () => { state.expanded = true; paintAll(); });

  // Filter by hiding rows rather than repainting: a repaint on every keystroke
  // would take the caret out of the box you are typing in.
  const find = $("#find");
  if (find) {
    find.addEventListener("input", () => {
      const q = find.value.trim().toLowerCase();
      let hits = 0;
      $("#main").querySelectorAll("label.group").forEach((row) => {
        const site = row.querySelector("input[data-site]")?.dataset.site || "";
        const show = !q || site.toLowerCase().includes(q);
        row.hidden = !show;
        if (show) hits++;
      });
      $("#nohits").hidden = hits > 0;
    });
    find.focus();
  }
  $("#autoKeepLogins").addEventListener("change", async (e) => {
    await saveGlobalPrefs({ autoKeepLogins: e.target.checked });
    paintAll();
  });
  $("#autoClearStorage").addEventListener("change", async (e) => {
    await saveGlobalPrefs({ autoClearStorage: e.target.checked });
    paintAll();
  });
  $("#keepLogins").addEventListener("change", async (e) => {
    await saveGlobalPrefs({ keepLogins: e.target.checked });
    paintAll();
  });
  $("#main").querySelectorAll('input[name="sweep"]').forEach((r) =>
    r.addEventListener("change", async () => {
      await saveGlobalPrefs({ mode: r.value });
      paintAll();
    }),
  );
  $("#main").querySelectorAll("input[data-site]").forEach((box) =>
    box.addEventListener("change", async () => {
      const site = box.dataset.site;
      const spared = box.checked ? prefs.spared.filter((x) => x !== site) : [...prefs.spared, site];
      await saveGlobalPrefs({ spared });
      paintAll();
    }),
  );
  $("#goAll").addEventListener("click", () => runGlobalRemoval(prefs));
}

async function runGlobalRemoval(prefs) {
  const go = $("#goAll");
  go.disabled = true;

  const key = (c) => `${c.storeId}|${c.domain}|${c.path}|${c.name}`;
  const targets = targetsFor(prefs);
  const asked = new Set(targets.map(key));

  // Sequential removal of a few thousand cookies is slow enough to look hung,
  // so they go in batches with the count on the button. Failures are ignored
  // here on purpose — the re-count below is what decides what actually went.
  const BATCH = 40;
  for (let i = 0; i < targets.length; i += BATCH) {
    await Promise.all(
      targets.slice(i, i + BATCH).map((c) => {
        const details = { url: cookieUrl(c), name: c.name, storeId: c.storeId };
        if (c.partitionKey) details.partitionKey = c.partitionKey;
        return chrome.cookies.remove(details).catch(() => {});
      }),
    );
    go.textContent = `Removing… ${Math.min(i + BATCH, targets.length)} of ${targets.length}`;
  }

  state.allGroups = await scanAll();
  const present = new Set(state.allGroups.flatMap((g) => g.cookies).map(key));
  const gone = [...asked].filter((k) => !present.has(k)).length;
  const stuck = asked.size - gone;
  const keptSignIn =
    prefs.mode === "everything"
      ? prefs.keepLogins
        ? state.allGroups.reduce((n, g) => n + g.cookies.filter(looksLikeSignIn).length, 0)
        : 0
      : state.allGroups.reduce((n, g) => n + g.cookies.filter((c) => !isTracker(c)).length, 0);
  const keptSites = state.allGroups.filter((g) => prefs.spared.includes(g.site)).length;

  const touched = [...new Set(targets.filter((c) => !present.has(key(c)))
    .map((c) => PSL.registrable(c.domain.replace(/^\./, "")) || c.domain))];
  paintStats(await addStats(gone, 0, touched));

  $("#main").innerHTML = `<div class="pad">
    <p class="result"><b>${plural(gone, "cookie", "cookies")} removed</b> across the browser.</p>
    ${stuck ? `<p class="result kept">${plural(stuck, "cookie", "cookies")} could not be removed.</p>` : ""}
    ${keptSignIn ? `<p class="result">${plural(keptSignIn, "cookie", "cookies")} left in place — ${
      prefs.mode === "everything" ? "they look like sign-ins" : "they are not trackers"
    }.</p>` : ""}
    ${keptSites ? `<p class="result">${plural(keptSites, "site", "sites")} left alone entirely, as you asked.</p>` : ""}
    <p class="result">Counted after deleting, not assumed from it.</p>
  </div>`;
  $("#footer").innerHTML = `<button id="againAll" class="ghost">Scan again</button>`;
  $("#againAll").addEventListener("click", startAll);
}

function renderNeedAll() {
  $("#sub").textContent = "not allowed yet";
  $("#main").innerHTML = `<div class="pad">
    <p class="lead">Cleaning every site means reading every site's cookies, so this one
    needs the browser-wide permission. It is asked for once and you can take it back
    from the line under any site's list.</p>
    <p class="lead">Nothing is read or removed until you allow it.</p>
  </div>`;
  $("#footer").hidden = false;
  $("#footer").innerHTML = `<button id="grantAll2">Allow reading every site</button>`;
  $("#grantAll2").addEventListener("click", async () => {
    try { await chrome.permissions.request({ origins: [ALL_SITES] }); } catch {}
    start();
  });
}

async function startAll() {
  $("#host").textContent = "Every site";
  state.allSites = await chrome.permissions.contains({ origins: [ALL_SITES] });
  if (!state.allSites) return renderNeedAll();
  $("#sub").textContent = "reading every cookie…";
  state.allGroups = await scanAll();
  await paintAll();
  paintStats();
}

function paintTabs() {
  const nav = $("#tabs");
  nav.hidden = false;
  nav.querySelectorAll(".tab").forEach((b) => {
    b.setAttribute("aria-selected", String(b.dataset.mode === state.mode));
    b.onclick = async () => {
      if (state.mode === b.dataset.mode) return;
      state.mode = b.dataset.mode;
      state.expanded = false;
      await chrome.storage.local.set({ ui: { mode: state.mode } });
      start();
    };
  });
}

/* ----------------------------------------------------------------- flow */

async function includeThirdParties() {
  const wanted = state.thirdParties.filter((t) => !t.granted).map((t) => pattern(t.domain));
  try { await chrome.permissions.request({ origins: wanted }); } catch { /* declined */ }
  await refreshThirdParties();
  await paintScan();
}

async function runRemoval() {
  const go = $("#go");
  go.disabled = true;
  go.textContent = "Removing…";

  const key = (c) => `${c.storeId}|${c.domain}|${c.path}|${c.name}`;
  const selected = new Map(
    state.groups.filter((g) => !state.deselected.has(g.domain)).flatMap((g) => g.cookies).map((c) => [key(c), c.value]),
  );
  const b = state.storage;
  const tally = (x) => (x ? (x.local?.keys || 0) + (x.session?.keys || 0) + x.dbs.length + x.caches.length + x.workers : 0);
  const storageBefore = tally(b);
  const hadStorage = storageBefore > 0;

  await removeSelected();

  // Verify by re-reading. The return value of remove() is not evidence, and on
  // this API neither is the absence of an error.
  state.groups = await scan();
  state.storage = await readStorage();

  const present = new Map(state.groups.flatMap((g) => g.cookies).map((c) => [key(c), c.value]));

  // The header is a live count, so it must not keep advertising the pre-deletion
  // number under a report saying those cookies are gone.
  $("#sub").textContent = present.size
    ? `${plural(present.size, "cookie", "cookies")} still here`
    : "nothing left for this site";
  const gone = [...selected.keys()].filter((k) => !present.has(k)).length;

  // A cookie we asked to remove that is present again is one of two things, and
  // the difference is the whole story for the user: still there because removal
  // failed, or back because the page in front of them is live and set it again
  // a second later. Same value means the former, a new value means the latter.
  // Counting "before minus after" would have called both of them zero removed.
  const stuck = [...selected].filter(([k, v]) => present.has(k) && present.get(k) === v).length;
  const back = [...selected].filter(([k, v]) => present.has(k) && present.get(k) !== v).length;

  const untouched = state.groups
    .filter((g) => state.deselected.has(g.domain))
    .reduce((n, g) => n + g.cookies.length, 0);
  const s2 = state.storage;
  const storageLeft = s2 ? tally(s2) : null;
  const itemsCleared = storageLeft === null ? 0 : Math.max(0, storageBefore - storageLeft);
  paintStats(await addStats(gone, itemsCleared, gone || itemsCleared ? [state.site] : []));

  $("#main").innerHTML = `<div class="pad">
    <p class="result"><b>${plural(gone, "cookie", "cookies")} removed</b> of ${selected.size} selected.</p>
    ${stuck ? `<p class="result kept">${plural(stuck, "cookie", "cookies")} could not be removed at all.</p>` : ""}
    ${back ? `<p class="result kept">${plural(back, "cookie", "cookies")} ${back === 1 ? "has" : "have"} already been set again by the page, which is still open behind this. Reload it to start clean.</p>` : ""}
    ${!hadStorage ? ""
      : state.skipStorage ? '<p class="result">Site data left untouched, as asked.</p>'
      : storageLeft === null ? '<p class="result">Site data could not be re-checked on this page.</p>'
      : storageLeft === 0 ? '<p class="result">Site data cleared, and confirmed empty.</p>'
      : `<p class="result kept">${plural(storageLeft, "item", "items")} of site data present again — the open page rebuilds it as it runs.</p>`}
    ${untouched ? `<p class="result">${plural(untouched, "cookie", "cookies")} left alone, as you asked.</p>` : ""}
    <p class="result">Counted after deleting, not assumed from it.</p>
  </div>`;

  $("#footer").innerHTML =
    `<button id="reload">Reload the page and scan again</button><button id="again" class="ghost">Scan without reloading</button>`;

  $("#again").addEventListener("click", start);
  $("#reload").addEventListener("click", async () => {
    $("#reload").disabled = true;
    await chrome.tabs.reload(state.tab.id);
    await new Promise((resolve) => {
      const done = (id, info) => {
        if (id !== state.tab.id || info.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(done);
        resolve();
      };
      chrome.tabs.onUpdated.addListener(done);
      setTimeout(() => { chrome.tabs.onUpdated.removeListener(done); resolve(); }, 5000);
    });
    start();
  });
}

function renderIntro() {
  $("#sub").textContent = "nothing read yet";
  $("#main").innerHTML = `<div class="pad">
    <p class="lead">This extension asks for no access when you install it. To list what
    <b>${esc(state.site)}</b> has stored, it needs permission for that one domain — and nothing else.</p>
    <p class="lead">You'll see everything before anything is deleted.</p>
  </div>`;
  $("#scope").hidden = true;
  paintStats();
  paintMaster();
  $("#footer").hidden = false;
  $("#footer").innerHTML =
    `<button id="grant">Show what ${esc(state.site)} stored</button>` +
    `<button id="grantAll" class="ghost">Or let it read every site, asked once</button>`;
  $("#grantAll").addEventListener("click", async () => {
    try { await chrome.permissions.request({ origins: [ALL_SITES] }); } catch {}
    start();
  });
  $("#grant").addEventListener("click", async () => {
    let ok = false;
    try { ok = await chrome.permissions.request({ origins: [pattern(state.site)] }); } catch {}
    if (ok) return start();
    $("#main").insertAdjacentHTML("beforeend",
      `<p class="notice">Permission declined, so nothing can be listed. Nothing was deleted either.</p>`);
  });
}

function renderUnsupported(message) {
  $("#host").textContent = "Not available here";
  $("#sub").textContent = "";
  $("#main").innerHTML = `<div class="pad"><p class="lead">${esc(message)}</p></div>`;
  $("#scope").hidden = true;
  $("#stats").hidden = true;
  $("#master").hidden = true;
  $("#footer").hidden = true;
}

let modeLoaded = false;

async function start() {
  if (!modeLoaded) {
    state.mode = (await readUi()).mode;
    modeLoaded = true;
  }
  [state.tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  paintTabs();
  if (state.mode === "all") return startAll();

  if (!state.tab || !/^https?:/.test(state.tab.url || "")) {
    return renderUnsupported("Open an ordinary web page — Chrome's own pages and the Web Store store nothing an extension may touch.");
  }

  const url = new URL(state.tab.url);
  state.host = url.hostname;
  state.origin = url.origin;
  state.site = PSL.registrable(state.host);
  $("#host").textContent = state.site || state.host;

  if (!state.site) {
    return renderUnsupported(`${state.host} isn't a domain cookies can be set on, so there's nothing to scope a permission to.`);
  }

  // The permission check comes first on purpose: without it, an empty cookie
  // list is indistinguishable from a refusal, and this extension would confidently
  // report a clean site while being blind to every cookie on it.
  state.allSites = await chrome.permissions.contains({ origins: [ALL_SITES] });
  const perSite = state.allSites || (await chrome.permissions.contains({ origins: [pattern(state.site)] }));
  if (!perSite) return renderIntro();

  $("#sub").textContent = "reading…";
  await refreshThirdParties();
  state.storage = await readStorage();
  await paintScan();
}

start();
