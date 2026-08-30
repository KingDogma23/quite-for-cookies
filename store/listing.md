# Chrome Web Store submission — Quite for Cookies

Publisher: **Quite Apps**  ·  Contact: **support@quiteapps.co.uk**
Store:  **https://chromewebstore.google.com/detail/quite-for-cookies/iagkmeadnfkmgocminiglpibkcnibnch**
Source: **github.com/KingDogma23/quite-for-cookies**
Package: `dist/cookie-cleaner-<version>-store.zip` (built with `./package.sh --store`)
Current version: **0.22.6**

> The zip is named from the working directory, which is still `cookie-cleaner`
> while the repository is `quite-for-cookies`. Harmless, but do not let it read
> as a different extension from the one being submitted.

## Summary (132 characters max)

See what a site has stored, delete only what you pick, and check it went. Or let
it clear each site as you close its last tab.

## Description

Quite for Cookies is a cookie cleaner that shows its working. Delete cookies and
site data for the site you are on, or switch on automatic clearing and each site
is cleared as you close its last tab — with a whitelist for anything you want
left alone.

Most cookie cleaners delete first and tell you nothing. This one shows you the
list before anything is removed, and checks afterwards that the removal worked.

**See what is there.** Every cookie the site has stored, grouped by the domain
that set it, with sizes. The ones that keep you signed in are marked, and they
are left alone unless you say otherwise. Local storage, databases, caches and
service workers are listed too.

**Remove only what you pick.** Untick a domain and it is genuinely spared —
removal is cookie by cookie, not a blunt "clear everything for this site" that
takes your other subdomains with it. Your choices are remembered per site.

**Then see what actually went.** After deleting, it counts again and reports the
result: how many were removed, how many could not be, and how many the page has
already set again because it is still open. The numbers come from re-reading the
browser, never from assuming the delete worked.

**Or let it clear a site as you close it.** Switch on "clear a site when I close
its last tab" and the job happens on its own, in the background, as you browse.
It only fires when the last tab for that site closes — another tab still open on
the same site stops it. Sites on your spared list are never touched, and sign-in
cookies are kept unless you turn that off. Chrome's own session-only setting
cannot do this: it waits until you close the entire browser, and says so in its
own wording. Every sweep is written down and shown in the popup, so a run that
cleared nothing can never be mistaken for one that worked.

**Clean the whole browser when you want to.** A second tab sweeps every site at
once. The default removes advertising and analytics cookies only, matched
against a list of known tracking domains and counter names, and spares
anything that looks like a sign-in. There is also an
everything option, which says plainly that it will sign you out before you use
it.

**It has no access to any website when you install it.** When you press the
button, it asks for access to the one site you are on, and nothing else. Cookies
set by other companies the page loaded stay hidden until you separately choose
to include them. You can grant access to every site if you prefer, and take it
back from the same line of text.

No account, no server, no analytics. Nothing is ever sent anywhere. The only
things stored are your per-site choices, the counters shown in the popup, and a
short local record of what the automatic clear has done.

## Category

Privacy & Security

## Single purpose statement

The single purpose of this extension is to show the user the cookies and site
data that websites have stored in their browser, and to delete the ones the user
chooses — either on request, or automatically for sites the user has asked it to
clear when their last tab closes.

## Permission justifications

- **activeTab** — reads the address of the tab you are on when you click the
  icon, so everything can be scoped to that one site. Nothing is read from the
  page until you press a button.
- **cookies** — lists and deletes cookies. This is the extension's function.
- **browsingData** — clears local storage, IndexedDB, cache storage and service
  workers. From the popup this is restricted to the origin of the page you are
  looking at. The automatic clear-on-tab-close covers every origin of that site
  the worker has recorded while you browsed it, which can be more than one
  address, and it runs unattended with no preview.
- **scripting** — injects three short snippets into the page you are looking
  at. One measures the site data the page holds — local storage, session
  storage, databases, caches and service workers — so the preview shows what
  is really there rather than an estimate. One lists the third-party domains
  the page loaded. The third clears session storage when you ask for site
  data to be removed, because the browsingData API has no session-storage
  type and it cannot be cleared any other way.

  (This bullet previously said the snippet was "read-only" and that it counts
  "the cookies the page itself can see". Neither was true: nothing in the
  extension reads document.cookie, and the third snippet deletes data. It was
  submitted to review in that form.)
- **storage** — remembers which domains you have chosen to spare on each site,
  the totals shown in the popup, and the record of what the automatic clear has
  done. Nothing leaves the browser.
- **background service worker (`background.js`)** — added in 0.20.0. It watches
  tabs closing so it can clear a site once its last tab has gone. It keeps a
  tab-to-site map in `storage.session`, because an in-memory map dies when MV3
  suspends the worker and the feature would then fail silently. It performs no
  network activity of any kind.
- **optional host permissions (`*://*/*`)** — NOT granted at install. For manual
  use the extension requests one registrable domain at a time, at the moment you
  press "Show what this site stored". Chrome's `activeTab` does not cover the
  cookies API, so a host permission is genuinely required to read a site's
  cookies; this is the narrowest form of it. The automatic clear is the one
  feature that needs the browser-wide grant, because it has to know which site a
  closing tab belonged to; it is requested only when that switch is turned on,
  the switch does nothing until it is granted, and the grant is reversible from
  the same line of text in the popup.

## Data usage disclosures

Select: **does not collect or use user data.**

- No personally identifiable information
- No health, financial, authentication, personal communications, location,
  web history or user activity collected
- No data sold or transferred to third parties
- No data used for creditworthiness or lending
- Not used for purposes unrelated to the single purpose above

For completeness, since 0.20.0 keeps a record of its own automatic sweeps: that
record is the last 40 entries, each a site name, a count and a timestamp, held
in `chrome.storage.local` on the user's own machine. It exists so the user can
see whether a background job that runs unattended actually did anything. It is
never transmitted, and the extension makes no network requests at all.

## Assets

- Screenshots, 1280x800, in `store/screenshots/`:
  - `01-see-it-before-you-delete-it.png`
  - `02-close-the-tab-and-it-is-cleared.png`
  - `03-then-check-that-it-went.png`
- `store/store-icon-128.png` — 96x96 mark on a transparent 128x128 canvas
- `store/promo-tile-440x280.png`
- `store/marquee-1400x560.png`

All three are drawn from the same generator as the other Quite Apps listings
(`tools/make-shots.py` in the website project), so the three extensions present
as one publisher.

On what the numbers in them are. The per-site screenshot shows a real bbc.co.uk
scan measured on 2026-08-27 — 22 cookies across 3 domains, and the sizes and
sign-in markings are that scan's. The ALL TIME counters read 357 / 45 / 228,
which are real measured totals from a profile in use; earlier versions of these
screenshots showed a fresh install's zeros instead.

Screenshot 02 was regenerated on 2026-08-30 and is now an OBSERVED run, not a
composed one. It previously depicted "a plausible run" of the bbc.co.uk scan on
the grounds that a background sweep cannot be screenshotted as it happens —
true of the sweep itself, but not of what it leaves behind. The procedure: load
the extension unpacked, grant the browser-wide permission, switch the automatic
clear on, open bbc.co.uk and theguardian.com in turn and close each tab, then
screenshot the popup. Everything in the panel is that run — all-time totals of
26 cookies / 0 data items / 2 sites, and "Last: theguardian.com — 6 cookies
removed, 1 sign-in kept". The sign-in that was kept is verified against a
re-read, not counted before the deletion.

The popup image is a live capture of the real 2.6.x popup rather than a mock, so
it also shows the corrected tracker-mode wording and the sign-in checkbox
enabled in that mode. Regenerate from store/screenshot-02-source.html at exactly
1280x800, device scale 1.

## Testing notes for review (0.22.6)

The automatic clear was verified on 38 sites using a planted probe cookie that
the site cannot regenerate. It was gone on all 38. Two negative controls hold: a
second tab open on the same site stops the sweep, and a site on the spared list
comes back byte-identical.

Cookies alone are not sufficient, and this was measured rather than assumed: on
independent.co.uk the sweep removed the cookies and two tracker IDs returned
byte-identical, restored from local storage. Clearing site data alongside is
therefore offered as a separate option, defaulting to off, with both consequences
stated where it is turned on — trackers restore themselves without it, and sites
that keep a session in local storage will sign you out with it.
