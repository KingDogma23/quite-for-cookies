/**
 * "Is this the cookie that remembers the answer you gave a consent pop-up?"
 *
 * One definition, loaded by both the popup and the background worker, for the
 * same reason signin.js is: two copies drift, and a drift here means either
 * the pop-up comes back on every site after a clear, or a tracking cookie is
 * quietly spared under the wrong label.
 *
 * Why it exists: clearing a site's cookies deletes the cookie that held your
 * "reject" — so the site genuinely no longer knows you answered, and asks
 * again. Measured on 2026-09-03 across seven sites from a real profile. On
 * the ones that keep the answer in a COOKIE this list catches it:
 *
 *   bbc.co.uk           ckns_policy, ckns_explicit
 *   stackoverflow.com   OptanonConsent (OneTrust)
 *   independent.co.uk   gdpr, _sp_su (Sourcepoint's cookie half)
 *   telegraph.co.uk     _sp_su
 *   mirror.co.uk        usprivacy (Quantcast's cookie half)
 *
 * The rest of the field is the well-known consent platforms: IAB TCF
 * (euconsent-v2, addtl_consent), OneTrust, Sourcepoint, Didomi, Cookiebot,
 * TrustArc, CookieYes, CookieScript, Osano.
 *
 * Deliberately PRECISE, the opposite of AUTH_RE. Sparing a sign-in cookie by
 * mistake is cheap; sparing a tracking cookie under the name "consent" is the
 * expensive error here, so every pattern is anchored to a whole name.
 *
 * What this cannot do, stated so nobody expects it: Sourcepoint and Quantcast
 * keep the real answer in localStorage (measured: _sp_user_consent_*,
 * consentString, iabVendorConsents), in the same origin bucket as the
 * tracking ids, and "Also clear stored site data" takes that bucket whole.
 * Those sites will still ask. The option's label says so.
 */
self.CONSENT_RE = new RegExp(
  "^(" +
    [
      "euconsent(-v2)?", "addtl_consent", "usprivacy", "gdpr(_consent)?",
      "OptanonConsent", "OptanonAlertBoxClosed", "OptanonChoice",
      "consentUUID", "consentDate", "_sp_su", "_sp_v1_[a-z_]+", "_sp_enable_dfp_personalized_ads",
      "didomi_token", "CookieConsent", "cookieconsent_status", "cookie_consent(_user_accepted)?",
      "cmapi_cookie_privacy", "notice_preferences", "notice_gdpr_prefs", "TAconsentID",
      "cookieyes-consent", "cky-consent", "CookieScriptConsent", "cc_cookie", "osano_consentmanager",
      "ckns_policy", "ckns_explicit", "ckns_privacy",
      "cmpStatus", "_cmpRepromptHash",
    ].join("|") +
    ")$",
  "i",
);
self.looksLikeConsent = (c) => self.CONSENT_RE.test(c.name);
