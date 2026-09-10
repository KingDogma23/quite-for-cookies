# Quite for Cookies

Shows exactly what a website has stored on your machine — cookies, local
storage, databases, caches — lets you choose what goes, and then checks
afterwards that it actually went.

**Consent answers are kept by default.** Clearing a site's cookies deletes the cookie that remembered your answer to its "accept cookies?" pop-up, so the pop-up comes back. The cookies that hold that answer are now spared — beside sign-ins, and unticked the same way if you would rather they went. Sites that store the answer outside cookies will still ask.

**Pop-ups on UK news sites can be hidden** (optional, off by default). On
twenty UK newspapers the "accept cookies?" dialog and the paper's own subscribe
and sale pop-ups are hidden, and the page they were holding is unlocked.
Nothing is answered for you and paid articles stay paid. The popup counts what
it hid.

## Why another one

Most cleaners delete first and tell you nothing. Two things this does instead:

- **You see the list before anything is removed**, grouped by the domain that
  set each cookie, with the ones that keep you signed in marked as such.
- **It counts again after deleting** and reports what is actually gone. If
  something survives, it says so rather than showing a tick.

## Permissions

The five API permissions it declares (activeTab, cookies, browsingData,
scripting, storage) carry no site access on their own. When you press *Show
what this site stored*, it requests access to that one domain, and nothing
else. Cookies set by other companies the page loaded stay hidden until you
separately choose to include them.

Since 0.23.0 it also runs a small script on twenty named UK newspaper sites,
which is where the pop-up hiding lives — Chrome lists those sites at install.
It runs nowhere else, and on those sites it reads nothing: it hides the named
pop-up containers and counts them.

## Install (unpacked)

1. `chrome://extensions` → Developer mode
2. Load unpacked → this folder

## Elsewhere

- [quiteapps.co.uk](https://quiteapps.co.uk/) — the other extensions in the family
- [facebook.com/quiteapps](https://www.facebook.com/quiteapps/) — where breakages get
  announced. When the site this extension runs on changes its markup, the fix takes
  hours and clearing store review takes days; that is where the gap gets explained.
