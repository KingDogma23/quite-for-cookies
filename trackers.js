/**
 * Domains that exist to track, and cookie names that exist to track.
 *
 * Written by hand rather than imported, for two reasons. The maintained lists
 * (Disconnect, DuckDuckGo's Tracker Radar) carry non-commercial or share-alike
 * terms that are awkward to bundle in a store listing, and — more importantly —
 * this list has one job the general-purpose ones do not: NOTHING on it may ever
 * hold a login. So no consumer domain appears here, however much tracking it
 * does. google.com, facebook.com, amazon.co.uk and their kin are absent by
 * design; their dedicated advertising domains are not.
 *
 * That is the whole safety argument for tracker mode. It cannot sign you out,
 * because nothing it will touch is capable of signing you in.
 *
 * Coverage is "the common case", not "everything". A tracker not on this list
 * simply survives, which is the correct way for it to fail.
 *
 * Measured on a clean profile — no ad blockers — across seven ordinary sites on
 * 2026-08-27: the list fired on four of the seven, catching scorecardresearch,
 * doubleclick, googletagmanager, google-analytics, rubiconproject, taboola,
 * amplitude and newrelic. It MISSED amazon-adsystem.com, which appeared on two
 * of the seven; that and six others were added from that run.
 *
 * One gap cannot be closed by domain at all: GA4 now beacons to
 * region1.analytics.google.com, whose registrable domain is google.com — a
 * login domain that must never appear here. Only the cookie-name rule catches
 * that one, which is why both halves of this file exist.
 *
 * SUBDOMAINS: every entry is a registrable domain, and cookies are matched by
 * their own registrable domain, so ads.doubleclick.net and rtb.doubleclick.net
 * are both covered by `doubleclick.net` without being listed. The list first
 * shipped with six entries like `adservice.google.com` and `bat.bing.com`, which
 * could never match anything — their registrable domain is google.com / bing.com,
 * and those are login domains that must never be on this list. They were dead
 * weight that read like coverage. Their cookies are caught by name instead.
 */
self.TRACKERS = new Set(
  `
  doubleclick.net
  googlesyndication.com
  googleadservices.com
  google-analytics.com
  googletagmanager.com
  googletagservices.com
  2mdn.net
  admob.com
  adsensecustomsearchads.com
  scorecardresearch.com
  quantserve.com
  quantcast.com
  chartbeat.com
  chartbeat.net
  parsely.com
  parse.ly
  newrelic.com
  nr-data.net
  hotjar.com
  hotjar.io
  mouseflow.com
  fullstory.com
  logrocket.com
  smartlook.com
  clarity.ms
  crazyegg.com
  luckyorange.com
  inspectlet.com
  mixpanel.com
  amplitude.com
  segment.com
  segment.io
  heap.io
  heapanalytics.com
  kissmetrics.com
  matomo.cloud
  statcounter.com
  hubspot.com
  hs-analytics.net
  hsforms.net
  marketo.net
  mktoresp.com
  pardot.com
  eloqua.com
  criteo.com
  criteo.net
  taboola.com
  outbrain.com
  adnxs.com
  appnexus.com
  rubiconproject.com
  pubmatic.com
  openx.net
  casalemedia.com
  indexww.com
  sharethrough.com
  triplelift.com
  sovrn.com
  lijit.com
  33across.com
  media.net
  smartadserver.com
  adform.net
  improvedigital.com
  yieldmo.com
  districtm.io
  gumgum.com
  teads.tv
  spotxchange.com
  spotx.tv
  springserve.com
  bidswitch.net
  360yield.com
  onetag-sys.com
  adsrvr.org
  thetradedesk.com
  mathtag.com
  mediamath.com
  turn.com
  bluekai.com
  krxd.net
  demdex.net
  everesttech.net
  omtrdc.net
  adobedtm.com
  agkn.com
  rlcdn.com
  liadm.com
  crwdcntrl.net
  exelator.com
  eyeota.net
  tapad.com
  addthis.com
  sharethis.com
  po.st
  bounceexchange.com
  optimizely.com
  dotmetrics.net
  visualwebsiteoptimizer.com
  vwo.com
  dynamicyield.com
  monetate.net
  branch.io
  appsflyer.com
  adjust.com
  kochava.com
  singular.net
  onesignal.com
  braze.com
  iterable.com
  klaviyo.com
  attn.tv
  postaffiliatepro.com
  impactradius-event.com
  awin1.com
  dwin1.com
  prf.hn
  webgains.com
  tradedoubler.com
  cj.com
  anrdoezrs.net
  dpbolvw.net
  kqzyfj.com
  jdoqocy.com
  tkqlhce.com
  linksynergy.com
  shareasale.com
  skimresources.com
  narrativ.com
  sail-horizon.com
  sailthru.com
  yieldlab.net
  zemanta.com
  advertising.com
  yieldmanager.com
  flashtalking.com
  serving-sys.com
  sizmek.com
  innovid.com
  moatads.com
  doubleverify.com
  adsafeprotected.com
  amazon-adsystem.com
  cloudflareinsights.com
  fastcmp.com
  sparteo.com
  optable.co
  stay22.com
  qovani.com
  ias.net
  `
    .trim()
    .split("\n")
    .map((d) => d.trim())
    .filter(Boolean),
);

/**
 * First-party analytics cookies — set on the site's OWN domain, so the domain
 * list cannot catch them, but named unambiguously enough to be safe to match.
 * Every entry here is a counter or an anonymous id. None is a credential.
 */
self.TRACKING_COOKIE_RE = new RegExp(
  "^(" +
    [
      "_ga(_[A-Z0-9]+)?", "_gid", "_gat(_.*)?", "_dc_gtm_.*", "__utm[a-z]",
      "_gcl_(au|aw|dc|gs)", "_fbp", "_fbc", "_uet(sid|vid)(_exp)?", "_rdt_uuid",
      "_hj[A-Za-z]+.*", "_clck", "_clsk", "CLID", "MR", "ANONCHK", "SM",
      "_pk_(id|ses|ref|cvar|hsr)\\..*", "_pin_unauth", "_pinterest_ct_ua",
      "_scid", "_sctr", "_ttp", "_tt_enable_cookie", "_derived_epik",
      "ajs_anonymous_id", "ajs_user_id", "__hstc", "__hssrc", "__hssc",
      "hubspotutk", "_mkto_trk", "__qca", "__gads", "__gpi", "IDE",
      "test_cookie", "MUID", "_omappv[ps]", "_uetmsclkid", "_vwo_uuid.*",
      "_vis_opt_.*", "optimizelyEndUserId", "amplitude_id.*",
      "mp_[a-f0-9]+_mixpanel", "AMP_[0-9a-f]+", "AMP_MKTG_[0-9a-f]+",
      "s_(cc|sq|vi|fid|nr[0-9]*)", "mbox", "at_check",
      "_cs_(id|s|c)", "cto_(bundle|bidid|lwid)", "panoramaId.*", "permutive-id",
      // Added after measuring a clean profile: Amazon's analytics beacon and
      // Amplitude's experiment store both appeared and both were missed.
      "csm-hit", "amplitude[-_][A-Za-z]+.*",
    ].join("|") +
    ")$",
);
