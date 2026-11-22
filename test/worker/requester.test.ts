import { describe, expect, it } from "vitest";
import { clientKey, isCrossSite } from "../../src/worker/requester";

describe("clientKey", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["2001:db8:1:2::1", "2001:db8:1:2::/64"],
    ["2001:db8:1:2:ffff:ffff:ffff:9", "2001:db8:1:2::/64"],
    ["2001:0DB8:0001:0002:0000:0000:0000:0001", "2001:db8:1:2::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
    [null, "unknown"],
  ])("keys %s as %s", (ip, key) => {
    expect(clientKey(ip)).toBe(key);
  });

  it("keeps neighbouring IPv6 networks apart", () => {
    expect(clientKey("2001:db8:1:2::1")).not.toBe(clientKey("2001:db8:1:3::1"));
  });
});

describe("isCrossSite", () => {
  const withSite = (site?: string) =>
    new Request("https://liveinfo.oshi.tw/api/last/@NASA", site ? { headers: { "sec-fetch-site": site } } : {});

  it.each([["cross-site"], ["same-site"]])("refuses a browser request marked %s", (site) => {
    expect(isCrossSite(withSite(site))).toBe(true);
  });

  it.each([["same-origin"], ["none"], [undefined]])("accepts a request marked %s", (site) => {
    expect(isCrossSite(withSite(site))).toBe(false);
  });
});
