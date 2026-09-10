# Quite for Cookies

Shows exactly what a website has stored on your machine — cookies, local
storage, databases, caches — lets you choose what goes, and then checks
afterwards that it actually went.

**Consent answers are kept by default.** Clearing a site's cookies deletes the cookie that remembered your answer to its "accept cookies?" pop-up, so the pop-up comes back. The cookies that hold that answer are now spared — beside sign-ins, and unticked the same way if you would rather they went. Sites that store the answer outside cookies will still ask.

## Why another one

Most cleaners delete first and tell you nothing. Two things this does instead:

- **You see the list before anything is removed**, grouped by the domain that
  set each cookie, with the ones that keep you signed in marked as such.
- **It counts again after deleting** and reports what is actually gone. If
  something survives, it says so rather than showing a tick.

## Permissions

It requests no access to any website at install — the five API permissions it
declares (activeTab, cookies, browsingData, scripting, storage) carry no site
access on their own. When you press *Show what this site stored*, it
requests access to that one domain, and nothing else. Cookies set by other
companies the page loaded stay hidden until you separately choose to include
them.

## Install (unpacked)

1. `chrome://extensions` → Developer mode
2. Load unpacked → this folder

## Elsewhere

- [quiteapps.co.uk](https://quiteapps.co.uk/) — the other extensions in the family
- [facebook.com/quiteapps](https://www.facebook.com/quiteapps/) — where breakages get
  announced. When the site this extension runs on changes its markup, the fix takes
  hours and clearing store review takes days; that is where the gap gets explained.
