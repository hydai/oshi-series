import { env, reset, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { handleRequest } from "../../src/worker/index";
import { endedVideo, type FakeChannel, type FakeYouTube, fakeYouTube, liveVideo } from "./fake-youtube";

const NOW = Date.parse("2026-11-22T00:00:00Z");
const NASA: FakeChannel = {
  id: "UCLA_DiR1FfKNvjuUpBHmylQ",
  handle: "@NASA",
  title: "NASA",
  live: ["s1", "s2"],
};
const videos = [endedVideo("s1", "2026-11-20T10:00:00Z", 7200), endedVideo("s2", "2026-11-10T10:00:00Z", 3600)];

let ip = 0;
/** Each request comes from a new address unless one is given, so the rate limiter stays out of the way. */
const get = (path: string, yt: FakeYouTube, init: RequestInit & { ip?: string } = {}, testEnv: Env = env) =>
  handleRequest(
    new Request(`https://liveinfo.oshi.tw${path}`, {
      ...init,
      headers: { "cf-connecting-ip": init.ip ?? `198.51.100.${++ip % 250}`, ...(init.headers as Record<string, string>) },
    }),
    testEnv,
    { fetch: yt.fetch, now: () => NOW },
  );

const noYouTube = () => fakeYouTube({ channels: [], videos: [] });

afterEach(() => reset());

describe("GET /api/last/:account", () => {
  it("answers with the last stream as uncached JSON", async () => {
    const res = await get("/api/last/%40NASA", fakeYouTube({ channels: [NASA], videos }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({
      status: "ended",
      platform: "youtube",
      stream: { id: "s1", endedAt: "2026-11-20T12:00:00.000Z" },
    });
  });

  it("serves a repeated lookup from the cache without calling YouTube", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos });
    await get("/api/last/@NASA", yt);
    const calls = yt.count();

    const again = await get("/api/last/@nasa", yt);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ status: "ended", stream: { id: "s1" } });
    expect(yt.count()).toBe(calls);
  });

  it("reports a live channel", async () => {
    const yt = fakeYouTube({
      channels: [{ ...NASA, live: ["now"] }],
      videos: [liveVideo("now", "2026-11-21T23:00:00Z", 99)],
    });

    const res = await get("/api/last/@NASA", yt);
    expect(await res.json()).toMatchObject({ status: "live", stream: { id: "now", viewers: 99 } });
  });
});

describe("GET /api/recent/:account", () => {
  it("answers with the 30-day total", async () => {
    const res = await get("/api/recent/@NASA", fakeYouTube({ channels: [NASA], videos }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ days: 30, totalSeconds: 7200 + 3600, count: 2 });
  });

  it("keeps last-live and recent results apart in the cache", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos });
    await get("/api/last/@NASA", yt);

    const res = await get("/api/recent/@NASA", yt);
    expect(await res.json()).toMatchObject({ totalSeconds: 7200 + 3600 });
  });
});

describe("errors", () => {
  it.each([
    ["an account that is neither a handle nor a login", "/api/last/NASA%21"],
    ["a broken percent-encoding", "/api/last/%E0%A4%A"],
  ])("rejects %s with 400", async (_, path) => {
    const res = await get(path, noYouTube());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_account" });
  });

  it("answers 404 for a handle no channel uses", async () => {
    const res = await get("/api/recent/@nobody", fakeYouTube({ channels: [NASA], videos }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("answers 503 when the YouTube quota is used up", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos, failWith: { status: 403, reason: "quotaExceeded" } });
    const res = await get("/api/last/@NASA", yt);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "quota_exceeded" });
  });

  it("answers 502 when YouTube fails, and does not cache the failure", async () => {
    const failing = fakeYouTube({ channels: [NASA], videos, failWith: { status: 500, reason: "backendError" } });
    const res = await get("/api/last/@NASA", failing);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_error" });

    const retry = await get("/api/last/@NASA", fakeYouTube({ channels: [NASA], videos }));
    expect(retry.status).toBe(200);
  });

  it("answers 503 when no YouTube API key is configured", async () => {
    const res = await get("/api/last/@NASA", noYouTube(), {}, { ...env, YOUTUBE_API_KEY: "" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });
  });

  it("answers 503 for a Twitch login while Twitch is not configured", async () => {
    const res = await get("/api/last/nasa", noYouTube());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "twitch_disabled" });
  });

  it.each([["/api/last"], ["/api/last/"], ["/api/last/@NASA/extra"], ["/api/other/@NASA"]])(
    "answers 404 for the unknown API path %s",
    async (path) => {
      const res = await get(path, noYouTube());
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found" });
    },
  );

  it("only accepts GET", async () => {
    const res = await get("/api/last/@NASA", noYouTube(), { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
  });
});

describe("rate limiting", () => {
  it("turns away an address after 30 lookups a minute, but not others", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos });
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await get("/api/last/@NASA", yt, { ip: "203.0.113.7" })).status);

    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect((await get("/api/last/@NASA", yt, { ip: "203.0.113.8" })).status).toBe(200);
  });

  it("counts every address in one IPv6 /64 together", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos });
    for (let i = 1; i <= 30; i++) await get("/api/last/@NASA", yt, { ip: `2001:db8:1:2::${i.toString(16)}` });

    expect((await get("/api/last/@NASA", yt, { ip: "2001:db8:1:2::ffff" })).status).toBe(429);
    expect((await get("/api/last/@NASA", yt, { ip: "2001:db8:1:3::1" })).status).toBe(200);
  });
});

describe("requests from other sites", () => {
  it.each([["cross-site"], ["same-site"]])("refuses a lookup a browser marks %s, without calling YouTube", async (site) => {
    const yt = fakeYouTube({ channels: [NASA], videos });
    const res = await get("/api/last/@NASA", yt, { headers: { "sec-fetch-site": site } });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(yt.count()).toBe(0);
  });

  it("answers this site's own pages", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos });
    const res = await get("/api/recent/@NASA", yt, { headers: { "sec-fetch-site": "same-origin" } });
    expect(res.status).toBe(200);
  });
});

describe("cache lifetimes", () => {
  /** Seconds until the cached result whose KV key ends in `suffix` expires. */
  const expiresIn = async (suffix: string) => {
    const { keys } = await env.CACHE.list();
    const expiration = keys.find((k) => k.name.endsWith(suffix))?.expiration;
    return expiration === undefined ? null : expiration - Date.now() / 1000;
  };

  it.each([
    ["a live answer", "last", [liveVideo("now", "2026-11-21T23:00:00Z", 5)], 60],
    ["an ended stream", "last", videos, 5 * 60],
    ["a channel that never streamed", "last", [], 60 * 60],
    ["a 30-day total", "recent", videos, 60 * 60],
  ] as const)("keeps %s for its documented time", async (_, mode, streams, seconds) => {
    const yt = fakeYouTube({ channels: [{ ...NASA, live: streams.map((v) => v.id) }], videos: [...streams] });
    await get(`/api/${mode}/@NASA`, yt);

    const left = await expiresIn(`:${mode}:@nasa`);
    expect(left).toBeGreaterThan(seconds - 10);
    expect(left).toBeLessThanOrEqual(seconds + 1);
  });
});

describe("GET /api/config", () => {
  it("is served by the deployed entry point and reports Twitch as off without credentials", async () => {
    const res = await SELF.fetch("https://liveinfo.oshi.tw/api/config");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ twitch: false });
  });
});
