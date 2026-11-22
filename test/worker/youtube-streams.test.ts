import { describe, expect, it } from "vitest";
import {
  findDonations,
  pickLastLive,
  startedBefore,
  summarizeRecent,
  toStream,
  type VideoItem,
} from "../../src/worker/youtube/streams";

const ended: VideoItem = {
  id: "ended1",
  snippet: {
    publishedAt: "2026-11-20T10:00:00Z",
    channelTitle: "NASA",
    description: "Thanks for watching",
    liveBroadcastContent: "none",
    thumbnails: {
      high: { url: "https://i.ytimg.com/vi/ended1/hqdefault.jpg" },
      maxres: { url: "https://i.ytimg.com/vi/ended1/maxresdefault.jpg" },
    },
  },
  liveStreamingDetails: {
    scheduledStartTime: "2026-11-20T10:00:00Z",
    actualStartTime: "2026-11-20T10:00:30Z",
    actualEndTime: "2026-11-20T12:00:00Z",
  },
};

const live: VideoItem = {
  id: "live1",
  snippet: {
    publishedAt: "2026-11-21T22:00:00Z",
    channelTitle: "NASA",
    description: "",
    liveBroadcastContent: "live",
    thumbnails: { high: { url: "https://i.ytimg.com/vi/live1/hqdefault_live.jpg" } },
  },
  liveStreamingDetails: {
    scheduledStartTime: "2026-11-21T22:00:00Z",
    actualStartTime: "2026-11-21T22:01:00Z",
    concurrentViewers: "1234",
  },
};

const upcoming: VideoItem = {
  id: "upcoming1",
  snippet: {
    publishedAt: "2026-11-01T00:00:00Z",
    channelTitle: "NASA",
    description: "",
    liveBroadcastContent: "upcoming",
    thumbnails: {},
  },
  liveStreamingDetails: { scheduledStartTime: "2026-12-01T00:00:00Z" },
};

const upload: VideoItem = {
  id: "video1",
  snippet: {
    publishedAt: "2026-11-15T08:00:00Z",
    channelTitle: "NASA",
    description: "",
    liveBroadcastContent: "none",
    thumbnails: {},
  },
};

/** An ended stream that started at `start` and ran for `seconds`. */
const endedAt = (id: string, start: string, seconds: number) =>
  toStream({
    id,
    snippet: { publishedAt: start, liveBroadcastContent: "none" },
    liveStreamingDetails: {
      actualStartTime: start,
      actualEndTime: new Date(Date.parse(start) + seconds * 1000).toISOString(),
    },
  });

describe("toStream", () => {
  it("reads an ended stream's actual times and its best thumbnail", () => {
    expect(toStream(ended)).toEqual({
      id: "ended1",
      state: "ended",
      publishedAt: Date.parse("2026-11-20T10:00:00Z"),
      startedAt: Date.parse("2026-11-20T10:00:30Z"),
      endedAt: Date.parse("2026-11-20T12:00:00Z"),
      viewers: null,
      thumbnail: "https://i.ytimg.com/vi/ended1/maxresdefault.jpg",
      channelTitle: "NASA",
      description: "Thanks for watching",
    });
  });

  it("treats a started stream without an end time as live and parses its viewers", () => {
    expect(toStream(live)).toMatchObject({
      state: "live",
      startedAt: Date.parse("2026-11-21T22:01:00Z"),
      endedAt: null,
      viewers: 1234,
      thumbnail: "https://i.ytimg.com/vi/live1/hqdefault_live.jpg",
    });
  });

  it("leaves viewers empty when the channel hides its viewer count", () => {
    const hidden = { ...live, liveStreamingDetails: { actualStartTime: "2026-11-21T22:01:00Z" } };
    expect(toStream(hidden)).toMatchObject({ state: "live", viewers: null });
  });

  it("does not call a started stream live unless YouTube marks it live", () => {
    const stuck: VideoItem = {
      id: "stuck1",
      snippet: { ...live.snippet, liveBroadcastContent: "none" },
      liveStreamingDetails: { actualStartTime: "2026-11-01T00:00:00Z" },
    };
    expect(toStream(stuck)).toMatchObject({ state: "unknown", startedAt: Date.parse("2026-11-01T00:00:00Z") });
  });

  it("treats a scheduled stream that has not started as upcoming", () => {
    expect(toStream(upcoming)).toMatchObject({ state: "upcoming", startedAt: null });
  });

  it("treats a video without live details as a plain video", () => {
    expect(toStream(upload)).toMatchObject({ state: "video", startedAt: null, endedAt: null });
  });
});

describe("pickLastLive", () => {
  it("reports a live stream ahead of any ended one", () => {
    const result = pickLastLive([toStream(ended), toStream(live)]);
    expect(result).toMatchObject({ kind: "live", stream: { id: "live1" } });
  });

  it("picks the ended stream that finished last, whatever the playlist order", () => {
    const older = endedAt("older", "2026-11-10T00:00:00Z", 3600);
    const newer = endedAt("newer", "2026-11-18T00:00:00Z", 3600);
    expect(pickLastLive([older, newer, toStream(upcoming)])).toMatchObject({
      kind: "ended",
      stream: { id: "newer" },
    });
  });

  it("skips a stream that started but has neither an end time nor a live mark", () => {
    const stuck = toStream({
      id: "stuck",
      snippet: { liveBroadcastContent: "none" },
      liveStreamingDetails: { actualStartTime: "2026-11-21T00:00:00Z" },
    });
    expect(pickLastLive([stuck, endedAt("older", "2026-11-10T00:00:00Z", 60)])).toMatchObject({
      kind: "ended",
      stream: { id: "older" },
    });
  });

  it("reports none when there are only scheduled streams and plain videos", () => {
    expect(pickLastLive([toStream(upcoming), toStream(upload)])).toEqual({ kind: "none" });
  });
});

describe("summarizeRecent", () => {
  const since = Date.parse("2026-10-23T00:00:00Z");

  it("adds up ended streams that started inside the window and finds the longest", () => {
    const streams = [
      toStream(live),
      endedAt("a", "2026-11-20T10:00:00Z", 2 * 3600),
      endedAt("b", "2026-11-01T10:00:00Z", 5 * 3600 + 61),
      endedAt("c", "2026-10-23T00:00:00Z", 90),
      endedAt("too-old", "2026-10-22T23:59:59Z", 10 * 3600),
      toStream(upcoming),
      toStream(upload),
    ];
    expect(summarizeRecent(streams, since)).toEqual({
      totalSeconds: 2 * 3600 + 5 * 3600 + 61 + 90,
      count: 3,
      longest: { id: "b", seconds: 5 * 3600 + 61 },
    });
  });

  it("reports zero with no longest stream when nothing ended inside the window", () => {
    expect(summarizeRecent([toStream(upcoming)], since)).toEqual({
      totalSeconds: 0,
      count: 0,
      longest: null,
    });
  });
});

describe("startedBefore", () => {
  const since = Date.parse("2026-11-01T00:00:00Z");

  it("is true once a stream that started before the window shows up", () => {
    expect(startedBefore([endedAt("old", "2026-10-31T00:00:00Z", 60)], since)).toBe(true);
  });

  it("uses the publish time for plain videos", () => {
    const old = toStream({ ...upload, snippet: { ...upload.snippet, publishedAt: "2026-10-01T00:00:00Z" } });
    expect(startedBefore([old], since)).toBe(true);
  });

  it("ignores scheduled streams, which can be created long before they air", () => {
    expect(startedBefore([toStream(upcoming)], Date.parse("2026-11-10T00:00:00Z"))).toBe(false);
  });

  it("is false while everything is inside the window", () => {
    expect(startedBefore([toStream(ended), toStream(live)], since)).toBe(false);
  });
});

describe("findDonations", () => {
  it("finds ECPay and DeerDonate links", () => {
    const text = "斗內 https://p.ecpay.com.tw/A1B2C3D\n鹿 https://deerdonate.herokuapp.com/donation/myVtuber_01 ";
    expect(findDonations([text])).toEqual([
      { provider: "ecpay", url: "https://p.ecpay.com.tw/A1B2C3D" },
      { provider: "deer", url: "https://deerdonate.herokuapp.com/donation/myVtuber_01" },
    ]);
  });

  it("stops a link at punctuation that follows it", () => {
    expect(findDonations(["（https://p.ecpay.com.tw/XYZ123）。"])).toEqual([
      { provider: "ecpay", url: "https://p.ecpay.com.tw/XYZ123" },
    ]);
  });

  it("keeps the first link of each provider, from the newest description", () => {
    expect(findDonations(["https://p.ecpay.com.tw/NEW1", "https://p.ecpay.com.tw/OLD1"])).toEqual([
      { provider: "ecpay", url: "https://p.ecpay.com.tw/NEW1" },
    ]);
  });

  it("returns nothing when no description has a donation link", () => {
    expect(findDonations(["no links here", ""])).toEqual([]);
  });
});
