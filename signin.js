/**
 * "Is this probably the cookie that keeps you signed in?"
 *
 * One definition, loaded by both the popup and the background worker. It was
 * briefly tempting to copy the three lines into the service worker; that is how
 * two rules drift apart, and here a drift means signing someone out of every
 * site they use — which this project has already done once, on 2026-08-27,
 * because a name pattern missed Facebook's `c_user`.
 *
 * Deliberately generous rather than clever: a name that reads like a session or
 * an account, or the Secure+HttpOnly pairing that real session cookies almost
 * always carry. It will spare some cookies that were never logins. That is the
 * cheap error. The expensive one is the other way round.
 */
self.AUTH_RE = /(^|[_.-])(sess|sid|auth|token|login|logged|jwt|remember|sso|oauth|identity|user|account)/i;
self.looksLikeSignIn = (c) => self.AUTH_RE.test(c.name) || (c.secure && c.httpOnly);
