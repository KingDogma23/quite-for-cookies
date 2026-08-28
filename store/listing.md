# Chrome Web Store submission — Quite for Cookies

Publisher: **Quite Apps**  ·  Contact: **support@quiteapps.co.uk**
Package: `dist/cookie-cleaner-<version>-store.zip` (built with `./package.sh --store`)

## Summary (132 characters max)

Shows exactly what a site has stored, deletes only what you choose, and then
checks that it actually went.

## Description

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

**Clean the whole browser when you want to.** A second tab sweeps every site at
once. The default removes advertising and analytics cookies only, matched
against a list of known tracking domains and counter names — it cannot sign you
out, because no site you can log in to is on that list. There is also an
everything option, which says plainly that it will sign you out before you use
it.

**It asks for nothing when you install it.** No permissions at all. When you
press the button, it asks for access to the one site you are on, and nothing
else. Cookies set by other companies the page loaded stay hidden until you
separately choose to include them. You can grant access to every site if you
prefer, and take it back from the same line of text.

No account, no server, no analytics. Nothing is ever sent anywhere. The only
things stored are your per-site choices and the counters shown in the popup.

## Category

Privacy & Security

## Single purpose statement

The single purpose of this extension is to show the user the cookies and site
data that websites have stored in their browser, and to delete the ones the user
chooses.

## Permission justifications

- **activeTab** — reads the address of the tab you are on when you click the
  icon, so everything can be scoped to that one site. Nothing is read from the
  page until you press a button.
- **cookies** — lists and deletes cookies. This is the extension's function.
- **browsingData** — clears local storage, IndexedDB, cache storage and service
  workers, restricted to the origin of the site you are looking at.
- **scripting** — runs a short read-only snippet in the page to count the
  cookies the page itself can see, and to list the third-party domains the page
  loaded. This is what makes the preview accurate rather than approximate.
- **storage** — remembers which domains you have chosen to spare on each site,
  and the totals shown in the popup. Nothing leaves the browser.
- **optional host permissions (`*://*/*`)** — NOT granted at install. The
  extension requests one registrable domain at a time, at the moment you press
  "Show what this site stored". Chrome's `activeTab` does not cover the cookies
  API, so a host permission is genuinely required to read a site's cookies; this
  is the narrowest form of it. A browser-wide grant is offered for people who
  clean many sites, and is reversible from the popup.

## Data usage disclosures

Select: **does not collect or use user data.**

- No personally identifiable information
- No health, financial, authentication, personal communications, location,
  web history or user activity collected
- No data sold or transferred to third parties
- No data used for creditworthiness or lending
- Not used for purposes unrelated to the single purpose above

## Assets

- Screenshots, 1280x800, in `store/screenshots/`:
  - `01-see-it-before-you-delete-it.png`
  - `02-clean-everything-stay-signed-in.png`
  - `03-then-check-that-it-went.png`
- `store/store-icon-128.png` — 96x96 mark on a transparent 128x128 canvas
- `store/promo-tile-440x280.png`
- `store/marquee-1400x560.png`

The per-site screenshot shows a real bbc.co.uk scan measured on 2026-08-27. The
ALL TIME counters read zero because that is what a fresh install shows. The
every-site screenshot depicts a typical profile rather than a measured one, since
no two browsers hold the same cookies.
