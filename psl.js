/**
 * Registrable-domain lookup against the bundled Public Suffix List.
 *
 * This exists because of a measured result, not a style preference. A grant for
 * the exact host https://www.bbc.co.uk/* returned 3 of 23 cookies: cookies are
 * keyed on the domain that SET them, and most of bbc.co.uk's sit on .bbc.co.uk,
 * which an exact-host grant cannot reach. So the permission has to be asked for
 * as *://*.<registrable domain>/*, and the registrable domain has to be exact —
 * one label too far left and the preview is incomplete, one too far right and
 * the extension asks for permission over an entire country's co.uk.
 *
 * Standard PSL algorithm: exceptions win, then the longest matching rule,
 * wildcards matching a single label, defaulting to the rightmost label.
 */
const PSL = (() => {
  const rules = new Set();
  const exceptions = new Set();
  for (const line of self.PSL_RAW.split("\n")) {
    if (line.startsWith("!")) exceptions.add(line.slice(1));
    else rules.add(line);
  }

  function publicSuffix(host) {
    const labels = host.split(".");
    for (let i = 0; i < labels.length; i++) {
      // An exception rule's suffix is the rule with its leftmost label removed.
      if (exceptions.has(labels.slice(i).join("."))) return labels.slice(i + 1).join(".");
    }
    let best = "";
    for (let i = labels.length - 1; i >= 0; i--) {
      const candidate = labels.slice(i).join(".");
      const wildcard = ["*", ...labels.slice(i + 1)].join(".");
      if (rules.has(candidate) || rules.has(wildcard)) best = candidate;
    }
    return best || labels[labels.length - 1];
  }

  return {
    ruleCount: rules.size + exceptions.size,

    /**
     * The domain a site can set cookies on. Returns null when the host IS a
     * public suffix (or an IP address) — no cookie may be set there, and asking
     * for permission over it would be asking for permission over everyone.
     */
    registrable(host) {
      host = String(host || "").toLowerCase().replace(/\.$/, "");
      if (!host || /^\[|^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
      const suffix = publicSuffix(host);
      if (host === suffix) return null;
      const rest = host.slice(0, -(suffix.length + 1)).split(".");
      return rest[rest.length - 1] + "." + suffix;
    },
  };
})();
