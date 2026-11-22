import { env, reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { kvCache } from "../../src/worker/cache";
import { LookupError, UpstreamError } from "../../src/worker/errors";
import { parseTwitchDuration, twitchLastLive, twitchRecentLive } from "../../src/worker/twitch";
import {
  CLIENT_ID,
  CLIENT_SECRET,
  type FakeTwitch,
  fakeTwitch,
  twitchArchive,
  twitchStream,
  twitchUser,
} from "./fake-twitch";

const NOW = Date.parse("2026-11-22T00:00:00Z");
const user = twitchUser("oshi_tw", "4242", "推しTW");
const CHANNEL = { name: "推しTW", url: "https://www.twitch.tv/oshi_tw" };

const deps = (tw: FakeTwitch, clientSecret = CLIENT_SECRET) => ({
  clientId: CLIENT_ID,
  clientSecret,
  cache: kvCache(env.CACHE),
  fetch: tw.fetch,
  now: NOW,
});

afterEach(() => reset());

describe("parseTwitchDuration", () => {
  it.each([
    ["3h8m33s", 3 * 3600 + 8 * 60 + 33],
    ["45m0s", 45 * 60],
    ["59s", 59],
    ["1h", 3600],
    ["", 0],
    ["garbage", 0],
  ])("reads %j as %i seconds", (text, seconds) => {
    expect(parseTwitchDuration(text)).toBe(seconds);
  });
});

describe("twitchLastLive", () => {
  it("reports when the newest archive ended", async () => {
    const tw = fakeTwitch({
      users: [user],
      videos: [
        twitchArchive(user, "900", "2026-11-18T12:00:00Z", "1h0m0s"),
        twitchArchive(user, "901", "2026-11-20T12:00:00Z", "3h8m33s"),
      ],
    });

    expect(await twitchLastLive("oshi_tw", deps(tw))).toEqual({
      status: "ended",
      platform: "twitch",
      channel: CHANNEL,
      stream: { id: "901", url: "https://www.twitch.tv/videos/901", endedAt: "2026-11-20T15:08:33.000Z" },
      donations: [],
    });
  });

  it("reports a live channel with its viewers and a sized thumbnail", async () => {
    const tw = fakeTwitch({
      users: [user],
      streams: [twitchStream(user, 321, "2026-11-21T20:00:00Z")],
      videos: [twitchArchive(user, "902", "2026-11-21T20:00:00Z", "4h0m0s")],
    });

    expect(await twitchLastLive("oshi_tw", deps(tw))).toEqual({
      status: "live",
      platform: "twitch",
      channel: CHANNEL,
      stream: {
        id: "stream-4242",
        url: "https://www.twitch.tv/oshi_tw",
        startedAt: "2026-11-21T20:00:00Z",
        viewers: 321,
        thumbnail: "https://static-cdn.jtvnw.net/previews-ttv/live_user_oshi_tw-640x360.jpg",
      },
      donations: [],
    });
  });

  it("reports none when the channel keeps no archives", async () => {
    const tw = fakeTwitch({ users: [user] });
    expect(await twitchLastLive("oshi_tw", deps(tw))).toEqual({
      status: "none",
      platform: "twitch",
      channel: CHANNEL,
      donations: [],
    });
  });

  it("rejects an unknown login as not found", async () => {
    const error = await twitchLastLive("nobody_here", deps(fakeTwitch({ users: [user] }))).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LookupError);
    expect((error as LookupError).code).toBe("not_found");
  });
});

describe("app token", () => {
  it("is fetched once and reused across lookups", async () => {
    const tw = fakeTwitch({ users: [user] });
    await twitchLastLive("oshi_tw", deps(tw));
    await twitchRecentLive("oshi_tw", deps(tw));
    expect(tw.tokensIssued()).toBe(1);
  });

  it("is renewed when Twitch stops accepting it", async () => {
    const tw = fakeTwitch({ users: [user], videos: [twitchArchive(user, "1", "2026-11-20T00:00:00Z", "1h")] });
    await twitchLastLive("oshi_tw", deps(tw));
    tw.revokeTokens();

    expect(await twitchLastLive("oshi_tw", deps(tw))).toMatchObject({ status: "ended" });
    expect(tw.tokensIssued()).toBe(2);
  });

  it("is renewed even when the cache still hands back the rejected token", async () => {
    // KV is eventually consistent: right after a delete, a read may still return the old value.
    const tw = fakeTwitch({ users: [user] });
    const staleCache = { ...kvCache(env.CACHE), delete: async () => {} };
    const staleDeps = { ...deps(tw), cache: staleCache };
    await twitchLastLive("oshi_tw", staleDeps);
    tw.revokeTokens();

    expect(await twitchLastLive("oshi_tw", staleDeps)).toMatchObject({ status: "none" });
    expect(tw.tokensIssued()).toBe(2);
  });

  it("surfaces wrong credentials as an upstream error", async () => {
    const error = await twitchLastLive("oshi_tw", deps(fakeTwitch({ users: [user] }), "wrong")).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({ service: "twitch", status: 403 });
  });
});

describe("twitchRecentLive", () => {
  it("totals the archives created in the last 30 days", async () => {
    const tw = fakeTwitch({
      users: [user],
      videos: [
        twitchArchive(user, "a", "2026-11-20T12:00:00Z", "2h0m0s"),
        twitchArchive(user, "b", "2026-10-24T12:00:00Z", "5h1m1s"),
        twitchArchive(user, "old", "2026-10-22T12:00:00Z", "9h0m0s"),
      ],
    });

    expect(await twitchRecentLive("oshi_tw", deps(tw))).toEqual({
      platform: "twitch",
      channel: CHANNEL,
      days: 30,
      totalSeconds: 2 * 3600 + 5 * 3600 + 61,
      count: 2,
      longest: { id: "b", url: "https://www.twitch.tv/videos/b", seconds: 5 * 3600 + 61 },
      donations: [],
    });
    const [videosRequest] = tw.requests.filter((r) => r.url.includes("/helix/videos"));
    expect(new URL(videosRequest!.url).searchParams.get("type")).toBe("archive");
  });

  it("reports zero when nothing was streamed in the window", async () => {
    const tw = fakeTwitch({ users: [user] });
    expect(await twitchRecentLive("oshi_tw", deps(tw))).toMatchObject({ totalSeconds: 0, count: 0, longest: null });
  });
});
