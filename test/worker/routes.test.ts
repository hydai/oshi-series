import { env, reset, runDurableObjectAlarm, runInDurableObject, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../../src/worker/index";
import { runtime } from "../../src/worker/runtime";
import { type FakeTwitch, fakeTwitch, twitchArchive, twitchUser } from "./fake-twitch";
import { endedVideo, type FakeChannel, type FakeYouTube, fakeYouTube, liveVideo } from "./fake-youtube";

const NOW = Date.parse("2026-11-22T00:00:00Z");
const NASA: FakeChannel = {
  id: "UCLA_DiR1FfKNvjuUpBHmylQ",
  handle: "@NASA",
  title: "NASA",
  live: ["s1", "s2"],
};
const videos = [endedVideo("s1", "2026-11-20T10:00:00Z", 7200), endedVideo("s2", "2026-11-10T10:00:00Z", 3600)];
// The test bindings include fake Twitch credentials (vitest.config.ts); this is a site without them.
const noTwitchEnv: Env = { ...env, TWITCH_CLIENT_ID: undefined, TWITCH_CLIENT_SECRET: undefined };

/** The Durable Object that answers the lookup `key`, e.g. "youtube:last:@nasa". */
const coordinator = (key: string) => env.LOOKUPS.get(env.LOOKUPS.idFromName(key));

/** Moves the stored answer for `key` past its lifetime, `ago` ms ago, as if time had passed. */
const expire = (key: string, ago = 1000) =>
  runInDurableObject(coordinator(key), async (_, state) => {
    const answer = await state.storage.get<{ expiresAt: number }>("answer");
    await state.storage.put("answer", { ...answer, expiresAt: Date.now() - ago });
  });

let ip = 0;
/**
 * Sends a request to the Worker, with every outbound call (the Durable
 * Objects' included) answered by `network`. Each request comes from a new
 * address unless one is given, so the rate limiter stays out of the way.
 */
const get = (
  path: string,
  network: FakeYouTube | FakeTwitch,
  init: RequestInit & { ip?: string } = {},
  testEnv: Env = env,
) => {
  vi.spyOn(runtime, "fetch").mockImplementation(network.fetch);
  return handleRequest(
    new Request(`https://liveinfo.oshi.tw${path}`, {
      ...init,
      headers: { "cf-connecting-ip": init.ip ?? `198.51.100.${++ip % 250}`, ...(init.headers as Record<string, string>) },
    }),
    testEnv,
  );
};

const noYouTube = () => fakeYouTube({ channels: [], videos: [] });

beforeEach(() => {
  vi.spyOn(runtime, "now").mockReturnValue(NOW);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

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

  it("keeps last-live and recent answers apart", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos });
    await get("/api/last/@NASA", yt);

    const res = await get("/api/recent/@NASA", yt);
    expect(await res.json()).toMatchObject({ totalSeconds: 7200 + 3600 });
  });
});

describe("sharing lookups", () => {
  it("gives a later visitor, from anywhere, the stored answer without calling YouTube", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos });
    await get("/api/last/@NASA", yt, { ip: "203.0.113.1" });
    const calls = yt.count();

    const again = await get("/api/last/@nasa", yt, { ip: "2001:db8::1" });
    expect(await again.json()).toMatchObject({ status: "ended", stream: { id: "s1" } });
    expect(yt.count()).toBe(calls);
  });

  it("makes one set of YouTube calls for visitors asking at the same time", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const yt = fakeYouTube({ channels: [NASA], videos });
    const slow = {
      ...yt,
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        await gate;
        return yt.fetch(input, init);
      }) as typeof fetch,
    };

    const answers = Promise.all(Array.from({ length: 5 }, () => get("/api/last/@NASA", slow)));
    await new Promise((resolve) => setTimeout(resolve, 100));
    open();

    expect((await answers).map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
    // channels.list + one playlist page + one videos.list, once for all five.
    expect(yt.count()).toBe(3);
  });

  it("asks YouTube again once the answer has expired", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos });
    await get("/api/last/@NASA", yt);
    const lookups = yt.count("videos");

    await expire("youtube:last:@nasa");
    await get("/api/last/@NASA", yt);
    expect(yt.count("videos")).toBe(lookups + 1);
  });

  it("never deletes an answer, so a cool-down always has one to show", async () => {
    await get("/api/last/@NASA", fakeYouTube({ channels: [NASA], videos }));
    const stub = coordinator("youtube:last:@nasa");

    await runDurableObjectAlarm(stub); // whatever is scheduled, if anything
    expect(await runInDurableObject(stub, (_, state) => state.storage.get("answer"))).toBeDefined();
  });

  it.each([
    ["a live answer", "last", [liveVideo("now", "2026-11-21T23:00:00Z", 5)], 60],
    ["an ended stream", "last", videos, 5 * 60],
    ["a channel that never streamed", "last", [], 60 * 60],
    ["a 30-day total", "recent", videos, 60 * 60],
  ] as const)("keeps %s fresh for its documented time", async (_, mode, streams, seconds) => {
    const yt = fakeYouTube({ channels: [{ ...NASA, live: streams.map((v) => v.id) }], videos: [...streams] });
    await get(`/api/${mode}/@NASA`, yt);

    const left = await runInDurableObject(coordinator(`youtube:${mode}:@nasa`), async (_, state) => {
      const answer = await state.storage.get<{ expiresAt: number }>("answer");
      return answer ? (answer.expiresAt - Date.now()) / 1000 : null;
    });
    expect(left).toBeGreaterThan(seconds - 10);
    expect(left).toBeLessThanOrEqual(seconds + 1);
  });
});

describe("YouTube's daily units", () => {
  const ledger = () => env.QUOTA.get(env.QUOTA.idFromName("youtube"));
  const unitsSpent = () =>
    runInDurableObject(ledger(), async (_, state) => (await state.storage.get<{ used: number }>("usage"))?.used ?? 0);
  // NOW is 16:00 on the 21st in California; YouTube's quota resets at 08:00 UTC.
  const RESET = "2026-11-22T08:00:00.000Z";

  it("charges every YouTube API call to the site's daily units", async () => {
    await get("/api/last/@NASA", fakeYouTube({ channels: [NASA], videos }));
    expect(await unitsSpent()).toBe(3); // channels.list, one playlist page, one videos.list
  });

  it("cools down a lookup that needs YouTube once the day's units are spent", async () => {
    await ledger().exhaust(NOW, 10_000);
    const yt = fakeYouTube({ channels: [NASA], videos });
    const res = await get("/api/last/@NASA", yt);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "cooling_down", resumesAt: RESET });
    expect(res.headers.get("retry-after")).toBe(String(8 * 60 * 60));
    expect(yt.count()).toBe(0);
  });

  it("keeps serving answers that are still fresh, unmarked, while cooling down", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos });
    await get("/api/last/@NASA", yt);
    await ledger().exhaust(NOW, 10_000);

    const res = await get("/api/last/@NASA", yt);
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("coolingDownUntil");
  });

  it("shows the last answer, marked as old, however long ago it expired", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos });
    const fresh = await (await get("/api/last/@NASA", yt)).json<object>();
    await expire("youtube:last:@nasa", 90 * 24 * 60 * 60 * 1000);
    await ledger().exhaust(NOW, 10_000);
    const calls = yt.count();

    const res = await get("/api/last/@NASA", yt);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...fresh, coolingDownUntil: RESET });
    expect(yt.count()).toBe(calls);
  });

  it("falls back to the last answer when YouTube itself says the quota is gone", async () => {
    const fresh = await (await get("/api/recent/@NASA", fakeYouTube({ channels: [NASA], videos }))).json<object>();
    await expire("youtube:recent:@nasa");

    const exhausted = fakeYouTube({ channels: [NASA], videos, failWith: { status: 403, reason: "quotaExceeded" } });
    const res = await get("/api/recent/@NASA", exhausted);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...fresh, coolingDownUntil: RESET });
  });

  it("cools down when YouTube says the quota is gone, and stops asking it", async () => {
    const exhausted = fakeYouTube({ channels: [NASA], videos, failWith: { status: 403, reason: "quotaExceeded" } });
    const res = await get("/api/last/@NASA", exhausted);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "cooling_down", resumesAt: RESET });

    const yt = fakeYouTube({ channels: [NASA], videos });
    expect((await get("/api/recent/@NASA", yt)).status).toBe(503);
    expect(yt.count()).toBe(0);
  });

  it("leaves Twitch lookups alone", async () => {
    await ledger().exhaust(NOW, 10_000);
    const user = twitchUser("oshi_tw", "4242", "推しTW");
    const res = await get("/api/last/oshi_tw", fakeTwitch({ users: [user] }));
    expect(res.status).toBe(200);
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

  it("answers 502 when YouTube fails, and does not keep the failure", async () => {
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
    const res = await get("/api/last/nasa", noYouTube(), {}, noTwitchEnv);
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

describe("daily limit", () => {
  /** `count` lookups of the same channel (answered from the stored answer after the first). */
  const lookUp = async (count: number, ip: (i: number) => string) => {
    const yt = fakeYouTube({ channels: [NASA], videos });
    const statuses: number[] = [];
    for (let i = 0; i < count; i++) statuses.push((await get("/api/last/@NASA", yt, { ip: ip(i) })).status);
    return statuses;
  };

  it("turns a visitor away after 30 lookups in a day, stored answers included", async () => {
    const statuses = await lookUp(31, () => "203.0.113.7");

    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    const refused = await get("/api/recent/@NASA", noYouTube(), { ip: "203.0.113.7" });
    expect(await refused.json()).toEqual({ error: "daily_limit" });
  });

  it("does not count other visitors against it", async () => {
    await lookUp(30, () => "203.0.113.7");
    expect((await get("/api/last/@NASA", fakeYouTube({ channels: [NASA], videos }), { ip: "203.0.113.8" })).status).toBe(
      200,
    );
  });

  it("counts every address in one IPv6 /64 as one visitor", async () => {
    await lookUp(30, (i) => `2001:db8:1:2::${(i + 1).toString(16)}`);

    const yt = fakeYouTube({ channels: [NASA], videos });
    expect((await get("/api/last/@NASA", yt, { ip: "2001:db8:1:2::ffff" })).status).toBe(429);
    expect((await get("/api/last/@NASA", yt, { ip: "2001:db8:1:3::1" })).status).toBe(200);
  });

  it("starts again at midnight Taiwan time", async () => {
    vi.spyOn(runtime, "now").mockReturnValue(Date.parse("2026-11-22T15:59:00Z")); // 23:59 in Taiwan
    await lookUp(31, () => "203.0.113.7");

    vi.spyOn(runtime, "now").mockReturnValue(Date.parse("2026-11-22T16:00:00Z")); // 00:00 the next day
    expect((await get("/api/last/@NASA", fakeYouTube({ channels: [NASA], videos }), { ip: "203.0.113.7" })).status).toBe(
      200,
    );
  });

  it("does not spend the allowance on requests that cannot be looked up", async () => {
    for (let i = 0; i < 30; i++) await get("/api/last/NASA%21", noYouTube(), { ip: "203.0.113.7" });
    expect((await get("/api/last/@NASA", fakeYouTube({ channels: [NASA], videos }), { ip: "203.0.113.7" })).status).toBe(
      200,
    );
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

describe("pages", () => {
  // Stands in for the static assets: answers with the path it was asked for.
  const assets = {
    fetch: async (input: RequestInfo | URL) =>
      new Response(`asset ${new URL(input instanceof Request ? input.url : String(input)).pathname}`),
  };
  const page = (path: string) =>
    handleRequest(new Request(`https://liveinfo.oshi.tw${path}`), { ...env, ASSETS: assets as Fetcher });

  it.each([["/last/@NASA"], ["/recent/@NASA"], ["/recent/"], ["/last/%40%E6%98%9F%E8%A1%97"]])(
    "serves the app itself for %s instead of a redirect to an encoded path",
    async (path) => {
      const res = await page(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("asset /");
    },
  );

  it("leaves other paths to the static assets", async () => {
    expect(await (await page("/favicon.svg")).text()).toBe("asset /favicon.svg");
  });
});

describe("GET /api/config", () => {
  it("is served by the deployed entry point", async () => {
    const res = await SELF.fetch("https://liveinfo.oshi.tw/api/config");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ twitch: true });
  });

  it("reports Twitch as on only when both credentials are set", async () => {
    const config = async (testEnv: Env) => (await get("/api/config", noYouTube(), {}, testEnv)).json();
    expect(await config(env)).toEqual({ twitch: true });
    expect(await config({ ...env, TWITCH_CLIENT_SECRET: undefined })).toEqual({ twitch: false });
    expect(await config(noTwitchEnv)).toEqual({ twitch: false });
  });
});

describe("Twitch lookups", () => {
  const user = twitchUser("oshi_tw", "4242", "推しTW");
  const twitch = () =>
    fakeTwitch({
      users: [user],
      videos: [
        twitchArchive(user, "901", "2026-11-20T12:00:00Z", "2h0m0s"),
        twitchArchive(user, "900", "2026-11-18T12:00:00Z", "1h0m0s"),
      ],
    });

  it("answers /api/last for a login, ignoring its case", async () => {
    const res = await get("/api/last/Oshi_TW", twitch());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "ended",
      platform: "twitch",
      stream: { id: "901", endedAt: "2026-11-20T14:00:00.000Z" },
    });
  });

  it("answers /api/recent and keeps the answer", async () => {
    const tw = twitch();
    const first = await get("/api/recent/oshi_tw", tw);
    expect(await first.json()).toMatchObject({ platform: "twitch", totalSeconds: 3 * 3600, count: 2 });
    const calls = tw.requests.length;

    await get("/api/recent/oshi_tw", tw);
    expect(tw.requests.length).toBe(calls);
  });

  it("answers 404 for a login Twitch does not know", async () => {
    const res = await get("/api/last/nobody_here", twitch());
    expect(res.status).toBe(404);
  });
});
