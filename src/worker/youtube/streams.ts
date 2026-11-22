import type { Donation } from "../../shared/api";

/** A videos.list item, limited to the fields the client asks for. */
export interface VideoItem {
  id: string;
  snippet?: {
    publishedAt?: string;
    channelTitle?: string;
    description?: string;
    liveBroadcastContent?: string;
    thumbnails?: Partial<Record<"default" | "medium" | "high" | "standard" | "maxres", { url: string }>>;
  };
  liveStreamingDetails?: {
    scheduledStartTime?: string;
    actualStartTime?: string;
    actualEndTime?: string;
    concurrentViewers?: string;
  };
}

/**
 * "video" is an upload that never was a live stream (only seen in the
 * uploads-playlist fallback). "unknown" started but has no end time and is no
 * longer marked live, so neither its state nor its length can be trusted.
 */
export type StreamState = "live" | "ended" | "upcoming" | "unknown" | "video";

export interface Stream {
  id: string;
  state: StreamState;
  publishedAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  viewers: number | null;
  thumbnail: string | null;
  channelTitle: string | null;
  description: string;
}

const time = (value: string | undefined): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

export function toStream(item: VideoItem): Stream {
  const details = item.liveStreamingDetails;
  const startedAt = time(details?.actualStartTime);
  const endedAt = time(details?.actualEndTime);
  const state: StreamState = !details
    ? "video"
    : endedAt !== null
      ? "ended"
      : item.snippet?.liveBroadcastContent === "live"
        ? "live"
        : startedAt !== null
          ? "unknown"
          : "upcoming";
  const viewers = details?.concurrentViewers ? Number.parseInt(details.concurrentViewers, 10) : NaN;
  const thumbs = item.snippet?.thumbnails ?? {};
  return {
    id: item.id,
    state,
    publishedAt: time(item.snippet?.publishedAt),
    startedAt,
    endedAt,
    viewers: Number.isNaN(viewers) ? null : viewers,
    thumbnail: (thumbs.maxres ?? thumbs.standard ?? thumbs.high ?? thumbs.medium ?? thumbs.default)?.url ?? null,
    channelTitle: item.snippet?.channelTitle ?? null,
    description: item.snippet?.description ?? "",
  };
}

export type LastLivePick =
  | { kind: "live"; stream: Stream }
  | { kind: "ended"; stream: Stream & { endedAt: number } }
  | { kind: "none" };

export function pickLastLive(streams: Stream[]): LastLivePick {
  const live = streams.find((s) => s.state === "live");
  if (live) return { kind: "live", stream: live };
  let last: (Stream & { endedAt: number }) | null = null;
  for (const s of streams) {
    if (s.state === "ended" && s.endedAt !== null && (last === null || s.endedAt > last.endedAt)) {
      last = { ...s, endedAt: s.endedAt };
    }
  }
  return last ? { kind: "ended", stream: last } : { kind: "none" };
}

export interface RecentSummary {
  totalSeconds: number;
  count: number;
  longest: { id: string; seconds: number } | null;
}

/** Ended streams that started at or after `since`. Live and scheduled streams do not count. */
export function summarizeRecent(streams: Stream[], since: number): RecentSummary {
  let totalSeconds = 0;
  let count = 0;
  let longest: RecentSummary["longest"] = null;
  for (const s of streams) {
    if (s.state !== "ended" || s.startedAt === null || s.endedAt === null || s.startedAt < since) continue;
    const seconds = Math.max(0, Math.floor((s.endedAt - s.startedAt) / 1000));
    totalSeconds += seconds;
    count += 1;
    if (longest === null || seconds > longest.seconds) longest = { id: s.id, seconds };
  }
  return { totalSeconds, count, longest };
}

/**
 * Whether a page of the newest-first playlist has reached past `since`, so
 * older pages cannot hold anything inside the window. Scheduled streams are
 * ignored: a waiting room can be created months before it airs.
 */
export function startedBefore(streams: Stream[], since: number): boolean {
  return streams.some((s) => {
    const at = s.state === "video" ? s.publishedAt : s.state === "upcoming" ? null : s.startedAt;
    return at !== null && at < since;
  });
}

const DONATION_PATTERNS: { provider: Donation["provider"]; pattern: RegExp; url: (code: string) => string }[] = [
  {
    provider: "ecpay",
    pattern: /https:\/\/p\.ecpay\.com\.tw\/([A-Za-z0-9_-]+)/,
    url: (code) => `https://p.ecpay.com.tw/${code}`,
  },
  {
    provider: "deer",
    pattern: /deerdonate\.herokuapp\.com\/donation\/([A-Za-z0-9_-]+)/,
    url: (code) => `https://deerdonate.herokuapp.com/donation/${code}`,
  },
];

/** Donation links found in video descriptions, newest description first; one per provider. */
export function findDonations(descriptions: string[]): Donation[] {
  const found: Donation[] = [];
  for (const { provider, pattern, url } of DONATION_PATTERNS) {
    for (const text of descriptions) {
      const code = pattern.exec(text)?.[1];
      if (code) {
        found.push({ provider, url: url(code) });
        break;
      }
    }
  }
  return found;
}
