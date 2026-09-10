# Live probe for the tab-close sweep

Two cookies, written by hand into the site's console, are the witness for the
sweep. Not the site's own consent cookies, and not its tracker ids:

- On the Sourcepoint sites the consent cookies are constants (`_sp_su=false`,
  `gdpr=1`), so "present after reopening" cannot tell SURVIVED from RE-CREATED.
- The tracker ids that look like witnesses (`esi-permutive-id`, `_cb` on
  independent.co.uk) come back byte-identical after a sweep because the page
  re-sets them from localStorage — background.js records that measurement.

So the witness is two cookies with unique values: one under a NAME `consent.js`
recognises, one under a name nothing recognises. The sweep keys on the name,
which is exactly the thing under test.

## Write — on the site, in its console

```js
const tag = Math.random().toString(36).slice(2, 10);
document.cookie = "cc_cookie=ccprobe-consent-" + tag + "; path=/; max-age=7200; SameSite=Lax";
document.cookie = "zz_control=ccprobe-control-" + tag + "; path=/; max-age=7200; SameSite=Lax";
```

Then close that tab — it must be the site's LAST tab — open the site again, and:

## Read

```js
const jar = Object.fromEntries(document.cookie.split("; ").filter(Boolean)
  .map((s) => { const i = s.indexOf("="); return [s.slice(0, i), s.slice(i + 1)]; }));
({ consent: jar.cc_cookie ?? "(gone)", control: jar.zz_control ?? "(gone)" });
```

## Three states, never two

| consent probe | control probe | meaning |
|---|---|---|
| gone | gone | the sweep ran and did NOT spare the consent name |
| survived | gone | the sweep ran and spared it — what 0.22.9+ must read |
| survived | survived | the sweep did not run: switch off, no browser-wide grant, or the site is still open in ANOTHER tab. **Void, not a negative.** |

Controls that must pass before any verdict is believed, because a probe that
vanishes for some other reason reads exactly like a sweep:

- write, reload the page twice, read: both survive (the site removes nothing)
- write, close the tab while the site is open in another tab, read: both
  survive (the sweep stands down, as designed)

## Readings

2026-09-10, real profile, worker not reloaded since it was loaded (the popup's
version line proves the popup's file, not the worker's build — after a Reload
they agree, before one they need not):

    independent.co.uk   last tab closed            consent GONE, control GONE
    telegraph.co.uk     last tab closed            consent GONE, control GONE
    independent.co.uk   still open in another tab  both survived   (control)
    independent.co.uk   two reloads, no close      both survived   (control)
    independent.co.uk   last tab closed, 2nd try   both survived   VOID — a tab
                        left outside the scripted group was still on the site

That is the fault 0.22.9 fixes, reproduced through the real path.

Same day, after the Reload (worker on 0.22.10), same procedure:

    telegraph.co.uk     Sourcepoint   last tab closed   consent SURVIVED, control GONE
    walesonline.co.uk   Quantcast     last tab closed   consent SURVIVED, control GONE

The control probe going proves the sweep ran; the consent probe staying proves
the name was spared. Two sites, two consent platforms, both the required
reading. The site's own `_sp_su` and `usprivacy` were present afterwards as
well, but being constants they would have been whether spared or re-created,
which is why they are not the witness.
