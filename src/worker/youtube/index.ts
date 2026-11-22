import type { Channel, LastLive, RecentLive } from "../../shared/api";
import type { JsonCache } from "../cache";
import { LookupError } from "../errors";
import type { YouTubeApi } from "./api";
import { findDonations, pickLastLive, type Stream, startedBefore, summarizeRecent, toStream } from "./streams";

export interface YouTubeDeps {
  api: YouTubeApi;
  cache: JsonCache;
  /** Current time in ms. */
  now: number;
}

export const RECENT_DAYS = 30;

// Handles rarely move between channels; an unknown handle is retried sooner.
const CHANNEL_TTL = 7 * 24 * 60 * 60;
const MISSING_CHANNEL_TTL = 60 * 60;

// Upper bounds on playlist pages (50 videos each) read per lookup.
const LAST_MAX_PAGES = 3;
const RECENT_MAX_PAGES = 4;

const videoUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const iso = (ms: number) => new Date(ms).toISOString();

interface ResolvedChannel {
  id: string;
  title: string;
}

async function resolveChannel(handle: string, { api, cache }: YouTubeDeps): Promise<ResolvedChannel> {
  const key = `yt:channel:${handle.toLowerCase()}`;
  const cached = await cache.get<ResolvedChannel | { missing: true }>(key);
  if (cached && "missing" in cached) throw new LookupError("not_found");
  if (cached) return cached;

  const channel = await api.channelByHandle(handle);
  await cache.put(key, channel ?? { missing: true }, channel ? CHANNEL_TTL : MISSING_CHANNEL_TTL);
  if (!channel) throw new LookupError("not_found");
  return channel;
}

/**
 * Pages of the channel's streams, newest first. Reads the Live-tab playlist
 * (UULV…). A channel without one has most likely never streamed, so only the
 * first page of its uploads (UU…) is checked; non-stream videos there show up
 * with state "video".
 */
async function* streamPages(channelId: string, api: YouTubeApi, maxPages: number): AsyncGenerator<Stream[]> {
  const suffix = channelId.slice(2);
  let playlistId = `UULV${suffix}`;
  let page = await api.playlistPage(playlistId);
  if (page === null) {
    playlistId = `UU${suffix}`;
    page = await api.playlistPage(playlistId);
    maxPages = 1;
  }
  for (let n = 1; page !== null; n++) {
    yield (await api.videos(page.videoIds)).map(toStream);
    if (page.nextPageToken === null || n >= maxPages) return;
    page = await api.playlistPage(playlistId, page.nextPageToken);
  }
}

function describeChannel(channel: ResolvedChannel, streams: Stream[]): Channel {
  // Video snippets carry the current channel name; the cached title may be days old.
  const name = streams.find((s) => s.channelTitle)?.channelTitle ?? channel.title;
  return { name, url: `https://www.youtube.com/channel/${channel.id}` };
}

export async function youtubeLastLive(handle: string, deps: YouTubeDeps): Promise<LastLive> {
  const channel = await resolveChannel(handle, deps);
  const streams: Stream[] = [];
  for await (const page of streamPages(channel.id, deps.api, LAST_MAX_PAGES)) {
    streams.push(...page);
    if (page.some((s) => s.state === "live" || s.state === "ended")) break;
  }

  const base = {
    platform: "youtube" as const,
    channel: describeChannel(channel, streams),
    donations: findDonations(streams.map((s) => s.description)),
  };
  const last = pickLastLive(streams);
  switch (last.kind) {
    case "live": {
      const { id, startedAt, viewers, thumbnail } = last.stream;
      return {
        ...base,
        status: "live",
        stream: { id, url: videoUrl(id), startedAt: startedAt === null ? null : iso(startedAt), viewers, thumbnail },
      };
    }
    case "ended":
      return {
        ...base,
        status: "ended",
        stream: { id: last.stream.id, url: videoUrl(last.stream.id), endedAt: iso(last.stream.endedAt) },
      };
    case "none":
      return { ...base, status: "none" };
  }
}

export async function youtubeRecentLive(handle: string, deps: YouTubeDeps): Promise<RecentLive> {
  const channel = await resolveChannel(handle, deps);
  const since = deps.now - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const streams: Stream[] = [];
  for await (const page of streamPages(channel.id, deps.api, RECENT_MAX_PAGES)) {
    streams.push(...page);
    if (startedBefore(page, since)) break;
  }

  const { totalSeconds, count, longest } = summarizeRecent(streams, since);
  return {
    platform: "youtube",
    channel: describeChannel(channel, streams),
    days: RECENT_DAYS,
    totalSeconds,
    count,
    longest: longest && { ...longest, url: videoUrl(longest.id) },
    donations: findDonations(streams.map((s) => s.description)),
  };
}
