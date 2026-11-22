import { describe, expect, it } from "vitest";
import { elapsedSince, formatDuration, shortUrl, splitDuration } from "../../src/client/format";

describe("elapsedSince", () => {
  it("splits the time since a moment into days, hours, minutes and seconds", () => {
    const now = Date.parse("2026-11-22T00:00:00Z");
    expect(elapsedSince("2026-11-18T19:47:51Z", now)).toEqual({ days: 3, hours: 4, minutes: 12, seconds: 9 });
  });

  it("drops partial seconds", () => {
    expect(elapsedSince("2026-11-22T00:00:00.000Z", Date.parse("2026-11-22T00:00:01.999Z"))).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 1,
    });
  });

  it("never goes negative when the clock is behind", () => {
    expect(elapsedSince("2026-11-22T00:00:05Z", Date.parse("2026-11-22T00:00:00Z"))).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });
});

describe("splitDuration", () => {
  it("keeps hours past a day instead of rolling them into days", () => {
    expect(splitDuration(42 * 3600 + 13 * 60 + 5)).toEqual({ hours: 42, minutes: 13, seconds: 5 });
  });
});

describe("formatDuration", () => {
  it.each([
    [5 * 3600 + 2 * 60 + 11, "5 時 2 分 11 秒"],
    [45 * 60 + 3, "45 分 3 秒"],
    [3600, "1 時 0 分 0 秒"],
    [0, "0 分 0 秒"],
  ])("writes %i seconds as %j", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

describe("shortUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc123", "youtube.com/watch?v=abc123"],
    ["https://www.twitch.tv/oshi_tw", "twitch.tv/oshi_tw"],
    ["https://p.ecpay.com.tw/A1B2C3D", "p.ecpay.com.tw/A1B2C3D"],
    ["https://liveinfo.oshi.tw/", "liveinfo.oshi.tw"],
  ])("shows %s as %s", (url, text) => {
    expect(shortUrl(url)).toBe(text);
  });
});
