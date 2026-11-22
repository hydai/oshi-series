/**
 * The rate-limit key for a client address. IPv6 hosts usually own a whole
 * /64, so they are limited per /64; IPv4 addresses are used as they are.
 */
export function clientKey(ip: string | null): string {
  if (!ip) return "unknown";
  // IPv4, including the IPv4-mapped IPv6 form "::ffff:203.0.113.7".
  if (ip.includes(".")) return ip.slice(ip.lastIndexOf(":") + 1);
  if (!ip.includes(":")) return ip;

  const [head = "", tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined ? left : [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
  const network = groups.slice(0, 4).map((group) => Number.parseInt(group || "0", 16).toString(16));
  return `${network.join(":")}::/64`;
}

/**
 * Whether a browser says the request comes from another site, e.g. an <img>
 * on some page pointing at /api/... Such requests would spend this site's
 * YouTube quota from each visitor's address, so lookups refuse them.
 * Requests without the header (non-browser clients) are allowed.
 */
export function isCrossSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site === "cross-site" || site === "same-site";
}
