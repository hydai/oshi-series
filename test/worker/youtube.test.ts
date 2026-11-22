import { env, reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { kvCache } from "../../src/worker/cache";
import { LookupError, UpstreamError } from "../../src/worker/errors";
import { youtubeLastLive, youtubeRecentLive } from "../../src/worker/youtube";
import { YouTubeApi } from "../../src/worker/youtube/api";
import {
  endedVideo,
  type FakeChannel,
  type FakeYouTube,
  fakeYouTube,
  liveVideo,
  upcomingVideo,
  uploadedVideo,
} from "./fake-youtube";

const NOW = Date.parse("2026-11-22T00:00:00Z");
const NASA: FakeChannel = { id: "UCLA_DiR1FfKNvjuUpBHmylQ", handle: "@NASA", title: "NASA" };
const CHANNEL = { name: "NASA", url: "https://www.youtube.com/channel/UCLA_DiR1FfKNvjuUpBHmylQ" };

const deps = (yt: FakeYouTube) => ({
  api: new YouTubeApi({ apiKey: "test-key", referer: "https://liveinfo.oshi.tw/", fetch: yt.fetch }),
  cache: kvCache(env.CACHE),
  now: NOW,
});

/** `n` ended one-hour streams, newest first, starting every 12 hours back from `first`. */
const twiceDaily = (n: number, first = "2026-11-21T12:00:00Z") =>
  Array.from({ length: n }, (_, i) =>
    endedVideo(`s${i}`, new Date(Date.parse(first) - i * 12 * 3600 * 1000).toISOString(), 3600),
  );

afterEach(() => reset());

describe("youtubeLastLive", () => {
  it("reports when the most recent stream ended, skipping scheduled ones", async () => {
    const yt = fakeYouTube({
      channels: [{ ...NASA, live: ["waiting", "newer", "older"] }],
      videos: [
        upcomingVideo("waiting", "2026-12-01T00:00:00Z"),
        endedVideo("newer", "2026-11-20T10:00:00Z", 7200, { description: "斗內 https://p.ecpay.com.tw/ABC123" }),
        endedVideo("older", "2026-11-18T10:00:00Z", 3600),
      ],
    });

    expect(await youtubeLastLive("@NASA", deps(yt))).toEqual({
      status: "ended",
      platform: "youtube",
      channel: CHANNEL,
      stream: { id: "newer", url: "https://www.youtube.com/watch?v=newer", endedAt: "2026-11-20T12:00:00.000Z" },
      donations: [{ provider: "ecpay", url: "https://p.ecpay.com.tw/ABC123" }],
    });
    // channels.list + one playlist page + one videos.list = 3 quota units.
    expect(yt.count()).toBe(3);
  });

  it("reports a stream that is live right now", async () => {
    const yt = fakeYouTube({
      channels: [{ ...NASA, live: ["now", "before"] }],
      videos: [liveVideo("now", "2026-11-21T22:00:00Z", 4321), endedVideo("before", "2026-11-20T10:00:00Z", 60)],
    });

    expect(await youtubeLastLive("@NASA", deps(yt))).toEqual({
      status: "live",
      platform: "youtube",
      channel: CHANNEL,
      stream: {
        id: "now",
        url: "https://www.youtube.com/watch?v=now",
        startedAt: "2026-11-21T22:00:00.000Z",
        viewers: 4321,
        thumbnail: "https://i.ytimg.com/vi/now/hqdefault_live.jpg",
      },
      donations: [],
    });
  });

  it("reads further pages when the first one holds only scheduled streams", async () => {
    const waiting = Array.from({ length: 50 }, (_, i) => upcomingVideo(`w${i}`, "2026-12-24T00:00:00Z"));
    const yt = fakeYouTube({
      channels: [{ ...NASA, live: [...waiting.map((v) => v.id), "last"] }],
      videos: [...waiting, endedVideo("last", "2026-11-01T00:00:00Z", 600)],
    });

    expect(await youtubeLastLive("@NASA", deps(yt))).toMatchObject({
      status: "ended",
      stream: { id: "last", endedAt: "2026-11-01T00:10:00.000Z" },
    });
    expect(yt.count("playlistItems")).toBe(2);
    expect(yt.count("videos")).toBe(2);
  });

  it("falls back to the uploads playlist when the channel has no live playlist", async () => {
    const yt = fakeYouTube({
      channels: [{ ...NASA, uploads: ["clip", "stream"] }],
      videos: [uploadedVideo("clip", "2026-11-21T00:00:00Z"), endedVideo("stream", "2026-11-10T00:00:00Z", 60)],
    });

    expect(await youtubeLastLive("@NASA", deps(yt))).toMatchObject({ status: "ended", stream: { id: "stream" } });
    const playlists = yt.requests
      .filter((r) => r.url.includes("/playlistItems"))
      .map((r) => new URL(r.url).searchParams.get("playlistId"));
    expect(playlists).toEqual(["UULVLA_DiR1FfKNvjuUpBHmylQ", "UULA_DiR1FfKNvjuUpBHmylQ"]);
  });

  it.each([
    ["youtubeLastLive", youtubeLastLive],
    ["youtubeRecentLive", youtubeRecentLive],
  ] as const)("%s reads one page of uploads at most when there is no live playlist", async (_, lookup) => {
    const uploads = Array.from({ length: 120 }, (_, i) =>
      uploadedVideo(`u${i}`, new Date(Date.parse("2026-11-21T00:00:00Z") - i * 3600 * 1000).toISOString()),
    );
    const yt = fakeYouTube({ channels: [{ ...NASA, uploads: uploads.map((v) => v.id) }], videos: uploads });

    await lookup("@NASA", deps(yt));
    // channels.list + the missing live playlist + one uploads page + one videos.list
    expect(yt.count()).toBe(4);
  });

  it("reports none for a channel that has never streamed", async () => {
    const yt = fakeYouTube({
      channels: [{ ...NASA, uploads: ["clip"] }],
      videos: [uploadedVideo("clip", "2026-11-21T00:00:00Z")],
    });

    expect(await youtubeLastLive("@NASA", deps(yt))).toEqual({
      status: "none",
      platform: "youtube",
      channel: CHANNEL,
      donations: [],
    });
  });

  it("remembers which channel a handle belongs to, ignoring case", async () => {
    const yt = fakeYouTube({
      channels: [{ ...NASA, live: ["s"] }],
      videos: [endedVideo("s", "2026-11-20T10:00:00Z", 60)],
    });

    await youtubeLastLive("@NASA", deps(yt));
    await youtubeLastLive("@nasa", deps(yt));
    expect(yt.count("channels")).toBe(1);
  });

  it("rejects an unknown handle as not found, and remembers that too", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos: [] });

    for (let i = 0; i < 2; i++) {
      const error = await youtubeLastLive("@nobody", deps(yt)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LookupError);
      expect((error as LookupError).code).toBe("not_found");
    }
    expect(yt.count("channels")).toBe(1);
  });

  it("sends the API key in a header, never in the URL, with the configured Referer", async () => {
    const yt = fakeYouTube({ channels: [{ ...NASA, live: [] }], videos: [] });

    await youtubeLastLive("@NASA", deps(yt));
    expect(yt.requests.length).toBeGreaterThan(0);
    for (const request of yt.requests) {
      expect(request.headers.get("x-goog-api-key")).toBe("test-key");
      expect(request.url).not.toContain("test-key");
      expect(request.headers.get("referer")).toBe("https://liveinfo.oshi.tw/");
    }
    expect(new URL(yt.requests[0]!.url).searchParams.get("forHandle")).toBe("@NASA");
  });

  it("surfaces an exhausted daily quota", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos: [], failWith: { status: 403, reason: "quotaExceeded" } });

    const error = await youtubeLastLive("@NASA", deps(yt)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({ status: 403, reason: "quotaExceeded", quotaExceeded: true });
  });

  it("surfaces other API errors without calling them a quota problem", async () => {
    const yt = fakeYouTube({ channels: [NASA], videos: [], failWith: { status: 500, reason: "backendError" } });

    const error = await youtubeLastLive("@NASA", deps(yt)).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 500, quotaExceeded: false });
  });

  it("asks before every call, and makes no more once refused", async () => {
    const yt = fakeYouTube({
      channels: [{ ...NASA, live: ["s"] }],
      videos: [endedVideo("s", "2026-11-20T10:00:00Z", 60)],
    });
    let allowed = 2;
    const api = new YouTubeApi({
      apiKey: "test-key",
      fetch: yt.fetch,
      beforeCall: async () => {
        if (allowed-- <= 0) throw new LookupError("cooling_down");
      },
    });

    const error = await youtubeLastLive("@NASA", { api, cache: kvCache(env.CACHE), now: NOW }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(LookupError);
    expect((error as LookupError).code).toBe("cooling_down");
    // channels.list and the playlist page went out; videos.list did not.
    expect(yt.count()).toBe(2);
  });

  it("turns a network failure into an upstream error", async () => {
    const api = new YouTubeApi({
      apiKey: "test-key",
      fetch: async () => {
        throw new TypeError("Network connection lost.");
      },
    });

    const error = await youtubeLastLive("@NASA", { api, cache: kvCache(env.CACHE), now: NOW }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({ status: 0, quotaExceeded: false });
  });
});

describe("youtubeRecentLive", () => {
  it("totals the streams that started in the last 30 days", async () => {
    const yt = fakeYouTube({
      channels: [{ ...NASA, live: ["now", "a", "b", "old"] }],
      videos: [
        liveVideo("now", "2026-11-21T22:00:00Z", 10),
        endedVideo("a", "2026-11-20T10:00:00Z", 7200),
        endedVideo("b", "2026-10-25T00:00:00Z", 3 * 3600 + 5),
        endedVideo("old", "2026-10-20T00:00:00Z", 9999),
      ],
    });

    expect(await youtubeRecentLive("@NASA", deps(yt))).toEqual({
      platform: "youtube",
      channel: CHANNEL,
      days: 30,
      totalSeconds: 7200 + 3 * 3600 + 5,
      count: 2,
      longest: { id: "b", url: "https://www.youtube.com/watch?v=b", seconds: 3 * 3600 + 5 },
      donations: [],
    });
  });

  it("pages until it passes the start of the window, then stops", async () => {
    // 160 streams twice a day: the first 60 fall inside the 30 days, page 2 crosses the boundary.
    const streams = twiceDaily(160);
    const yt = fakeYouTube({ channels: [{ ...NASA, live: streams.map((v) => v.id) }], videos: streams });

    const result = await youtubeRecentLive("@NASA", deps(yt));
    expect(result).toMatchObject({ count: 60, totalSeconds: 60 * 3600 });
    expect(yt.count("playlistItems")).toBe(2);
  });

  it("reports zero for a channel that has not streamed in the window", async () => {
    const yt = fakeYouTube({
      channels: [{ ...NASA, live: ["old"] }],
      videos: [endedVideo("old", "2026-09-01T00:00:00Z", 3600)],
    });

    expect(await youtubeRecentLive("@NASA", deps(yt))).toMatchObject({ totalSeconds: 0, count: 0, longest: null });
  });
});
