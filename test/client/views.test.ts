import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LastLive, RecentLive } from "../../src/shared/api";
import { type FakeApi, jsonResponse, renderAt } from "./render";

const NASA = { name: "NASA", url: "https://www.youtube.com/channel/UCLA_DiR1FfKNvjuUpBHmylQ" };
const twitchOff: FakeApi = { "/api/config": { status: 200, body: { twitch: false } } };
const twitchOn: FakeApi = { "/api/config": { status: 200, body: { twitch: true } } };

const text = (wrapper: { text(): string }) => wrapper.text().replace(/\s+/g, " ");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("home", () => {
  it("looks up a YouTube handle typed without its @", async () => {
    const { wrapper, router } = await renderAt("/", twitchOff);
    expect(wrapper.find("h1").text()).toBe("你推多久沒開台了？");

    await wrapper.find("input").setValue("NASA");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("last");
    expect(router.currentRoute.value.params.account).toBe("@NASA");
  });

  it("sends /recent lookups to the recent page", async () => {
    const { wrapper, router } = await renderAt("/recent", twitchOff);
    expect(wrapper.find("h1").text()).toBe("你推最近開了多久？");

    await wrapper.find("input").setValue("@NASA");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("recent");
    expect(router.currentRoute.value.params.account).toBe("@NASA");
  });

  it("warns about input that cannot be an account and stays put", async () => {
    const { wrapper, router } = await renderAt("/", twitchOff);

    await wrapper.find("input").setValue("has space");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(router.currentRoute.value.path).toBe("/");
  });

  it("fills the input with the example", async () => {
    const { wrapper } = await renderAt("/", twitchOff);
    await wrapper.find("button.example").trigger("click");
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("@TED");
  });

  it("offers Twitch only when the site has it", async () => {
    const off = await renderAt("/", twitchOff);
    expect(off.wrapper.text()).not.toContain("Twitch");
    off.wrapper.unmount();

    const { wrapper, router } = await renderAt("/", twitchOn);
    const twitchTab = wrapper.findAll("button").find((b) => b.text() === "Twitch");
    await twitchTab!.trigger("click");
    await wrapper.find("input").setValue("Shroud");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(router.currentRoute.value.params.account).toBe("shroud");
  });
});

describe("/last/:account", () => {
  const ended: LastLive = {
    status: "ended",
    platform: "youtube",
    channel: NASA,
    stream: { id: "abc123", url: "https://www.youtube.com/watch?v=abc123", endedAt: "2026-11-18T19:47:51Z" },
    donations: [{ provider: "ecpay", url: "https://p.ecpay.com.tw/A1B2C3D" }],
  };

  it("counts up from the end of the last stream", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-22T00:00:00Z"), toFake: ["Date", "setInterval", "clearInterval"] });
    const { wrapper } = await renderAt("/last/@NASA", { "/api/last/@NASA": { status: 200, body: ended } });

    expect(text(wrapper.find("h1"))).toBe("距離 NASA 上次在 YouTube 開台已經過了");
    expect(text(wrapper.find('[role="timer"]'))).toBe("3 天 04 時 12 分 09 秒");
    expect(document.title).toBe("NASA｜你推多久沒開台了？");

    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(text(wrapper.find('[role="timer"]'))).toBe("3 天 04 時 12 分 10 秒");
  });

  it("links to the channel, the last stream and a donation page", async () => {
    const { wrapper } = await renderAt("/last/@NASA", { "/api/last/@NASA": { status: 200, body: ended } });
    const hrefs = wrapper.findAll("a").map((a) => a.attributes("href"));
    expect(hrefs).toContain("https://www.youtube.com/@NASA?sub_confirmation=1");
    expect(hrefs).toContain("https://www.youtube.com/watch?v=abc123");
    expect(hrefs).toContain("https://p.ecpay.com.tw/A1B2C3D");
    expect(hrefs).toContain("/recent/@NASA");
  });

  it("shows a live stream with its viewers", async () => {
    const live: LastLive = {
      status: "live",
      platform: "youtube",
      channel: NASA,
      stream: {
        id: "now1",
        url: "https://www.youtube.com/watch?v=now1",
        startedAt: "2026-11-21T22:00:00Z",
        viewers: 1234,
        thumbnail: "https://i.ytimg.com/vi/now1/hqdefault_live.jpg",
      },
      donations: [],
    };
    const { wrapper } = await renderAt("/last/@NASA", { "/api/last/@NASA": { status: 200, body: live } });

    expect(text(wrapper)).toContain("NASA 正在 YouTube 直播中");
    expect(text(wrapper)).toContain("1,234 人正在觀看");
    expect(wrapper.find("img").attributes("src")).toBe("https://i.ytimg.com/vi/now1/hqdefault_live.jpg");
    expect(wrapper.findAll("a").map((a) => a.attributes("href"))).toContain("https://www.youtube.com/watch?v=now1");
  });

  it("says when a channel has never streamed", async () => {
    const none: LastLive = { status: "none", platform: "youtube", channel: NASA, donations: [] };
    const { wrapper } = await renderAt("/last/@NASA", { "/api/last/@NASA": { status: 200, body: none } });
    expect(text(wrapper)).toContain("NASA 目前沒有直播紀錄");
  });

  it.each([
    [404, "not_found", "找不到這個頻道"],
    [429, "daily_limit", "今天的查詢次數已用完"],
    [503, "quota_exceeded", "查詢額度已用完"],
    [503, "twitch_disabled", "沒有開放 Twitch 查詢"],
    [502, "upstream_error", "查詢失敗"],
  ])("explains a %i %s answer", async (status, error, message) => {
    const { wrapper } = await renderAt("/last/@NASA", { "/api/last/@NASA": { status, body: { error } } });
    expect(text(wrapper)).toContain(message);
  });

  it("explains a dropped connection", async () => {
    const { wrapper } = await renderAt("/last/@NASA");
    expect(text(wrapper)).toContain("連線失敗");
  });

  it("shows a live Twitch channel and links to follow it", async () => {
    const live: LastLive = {
      status: "live",
      platform: "twitch",
      channel: { name: "推しTW", url: "https://www.twitch.tv/oshi_tw" },
      stream: {
        id: "s1",
        url: "https://www.twitch.tv/oshi_tw",
        startedAt: "2026-11-21T20:00:00Z",
        viewers: 321,
        thumbnail: "https://static-cdn.jtvnw.net/previews-ttv/live_user_oshi_tw-640x360.jpg",
      },
      donations: [],
    };
    const { wrapper } = await renderAt("/last/Oshi_TW", { "/api/last/oshi_tw": { status: 200, body: live } });

    expect(text(wrapper.find("h1"))).toBe("推しTW 正在 Twitch 直播中");
    expect(wrapper.find("img").attributes("src")).toBe(live.stream.thumbnail);
    const follow = wrapper.findAll("li").find((li) => li.text().startsWith("追隨頻道"));
    expect(follow?.find("a").attributes("href")).toBe("https://www.twitch.tv/oshi_tw");
  });

  it("drops an answer that arrives after the visitor has left the page", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let answer!: (res: Response) => void;
    const { router } = await renderAt("/last/@SLOW", (path) =>
      path === "/api/last/@SLOW"
        ? new Promise<Response>((resolve) => (answer = resolve))
        : Promise.resolve(jsonResponse(200, { twitch: false })),
    );

    await router.push("/");
    await flushPromises();
    answer(jsonResponse(200, { ...ended, channel: { ...NASA, name: "SLOW" } }));
    await flushPromises();

    expect(document.title).toBe("你推多久沒開台了？");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects a malformed account without asking the server", async () => {
    const { wrapper, requested } = await renderAt("/last/NASA!");
    expect(text(wrapper)).toContain("帳號格式不正確");
    expect(requested).toEqual([]);
  });
});

describe("/recent/:account", () => {
  const recent: RecentLive = {
    platform: "youtube",
    channel: NASA,
    days: 30,
    totalSeconds: 42 * 3600 + 13 * 60 + 5,
    count: 12,
    longest: { id: "long1", url: "https://www.youtube.com/watch?v=long1", seconds: 5 * 3600 + 2 * 60 + 11 },
    donations: [],
  };

  it("shows the 30-day total, the number of streams and the longest one", async () => {
    const { wrapper } = await renderAt("/recent/@NASA", { "/api/recent/@NASA": { status: 200, body: recent } });

    expect(text(wrapper.find("h1"))).toBe("最近 30 天內 NASA 在 YouTube 總共直播了");
    expect(text(wrapper.find(".counter"))).toBe("42 時 13 分 05 秒");
    expect(wrapper.find('[role="timer"]').exists()).toBe(false);
    expect(text(wrapper)).toContain("共 12 場");
    expect(text(wrapper)).toContain("最長一場 5 時 2 分 11 秒");
    expect(wrapper.findAll("a").map((a) => a.attributes("href"))).toContain(
      "https://www.youtube.com/watch?v=long1",
    );
  });

  it("drops an answer that arrives after the visitor has left the page", async () => {
    let answer!: (res: Response) => void;
    const { router } = await renderAt("/recent/@SLOW", (path) =>
      path === "/api/recent/@SLOW"
        ? new Promise<Response>((resolve) => (answer = resolve))
        : Promise.resolve(jsonResponse(200, { twitch: false })),
    );

    await router.push("/recent");
    await flushPromises();
    answer(jsonResponse(200, { ...recent, channel: { ...NASA, name: "SLOW" } }));
    await flushPromises();

    expect(document.title).toBe("你推最近開了多久？");
  });

  it("points to the last-live page when nothing was streamed in the window", async () => {
    const empty: RecentLive = { ...recent, totalSeconds: 0, count: 0, longest: null };
    const { wrapper } = await renderAt("/recent/@NASA", { "/api/recent/@NASA": { status: 200, body: empty } });

    expect(text(wrapper)).toContain("最近 30 天內 NASA 在 YouTube 沒有直播");
    expect(wrapper.findAll("a").map((a) => a.attributes("href"))).toContain("/last/@NASA");
  });

  it("follows a Twitch channel instead of subscribing", async () => {
    const twitch: RecentLive = {
      ...recent,
      platform: "twitch",
      channel: { name: "推しTW", url: "https://www.twitch.tv/oshi_tw" },
      longest: { id: "9", url: "https://www.twitch.tv/videos/9", seconds: 60 },
    };
    const { wrapper } = await renderAt("/recent/oshi_tw", { "/api/recent/oshi_tw": { status: 200, body: twitch } });

    expect(text(wrapper.find("h1"))).toBe("最近 30 天內 推しTW 在 Twitch 總共直播了");
    expect(wrapper.findAll("a").map((a) => a.attributes("href"))).toContain("https://www.twitch.tv/oshi_tw");
  });
});

describe("routing", () => {
  it.each([["/last"], ["/last/"], ["/nowhere"]])("sends %s back home", async (path) => {
    const { router } = await renderAt(path, twitchOff);
    expect(router.currentRoute.value.path).toBe("/");
  });

  it("accepts /recent/ with a trailing slash as the recent home", async () => {
    const { wrapper } = await renderAt("/recent/", twitchOff);
    expect(wrapper.find("h1").text()).toBe("你推最近開了多久？");
  });
});
