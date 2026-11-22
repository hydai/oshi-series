import type { VideoItem } from "../../src/worker/youtube/streams";

export interface FakeChannel {
  id: string;
  handle: string;
  title: string;
  /** Ids on the channel's Live tab (playlist UULV…), newest first. Omit when the channel has no Live tab. */
  live?: string[];
  /** Every upload (playlist UU…), newest first. */
  uploads?: string[];
}

export interface FakeYouTubeOptions {
  channels: FakeChannel[];
  videos: VideoItem[];
  /** Answer every request with this Data API error instead. */
  failWith?: { status: number; reason: string };
}

export interface FakeYouTube {
  fetch: typeof fetch;
  requests: Request[];
  /** Data API calls made so far, by endpoint ("channels", "playlistItems", "videos"). */
  count(endpoint?: string): number;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=UTF-8" } });

/** The error envelope the Data API sends, e.g. reason "quotaExceeded" or "playlistNotFound". */
const apiError = (status: number, reason: string) =>
  json(
    {
      error: {
        code: status,
        message: `fake ${reason}`,
        errors: [{ message: `fake ${reason}`, domain: "youtube.fake", reason }],
      },
    },
    status,
  );

/**
 * A stand-in for https://www.googleapis.com/youtube/v3 that serves fixtures
 * the way the real API does: forHandle lookups, 50-item playlist pages with
 * page tokens, and videos.list in the order of the requested ids.
 */
export function fakeYouTube({ channels, videos, failWith }: FakeYouTubeOptions): FakeYouTube {
  const requests: Request[] = [];
  const videoById = new Map(videos.map((v) => [v.id, v]));
  const playlists = new Map<string, string[]>();
  for (const c of channels) {
    if (c.live) playlists.set(`UULV${c.id.slice(2)}`, c.live);
    playlists.set(`UU${c.id.slice(2)}`, c.uploads ?? []);
  }

  const handle = (request: Request): Response => {
    const url = new URL(request.url);
    if (url.origin !== "https://www.googleapis.com" || !url.pathname.startsWith("/youtube/v3/")) {
      throw new Error(`unexpected request to ${url.origin}${url.pathname}`);
    }
    // Like the real API, a key works as the X-Goog-Api-Key header or the key parameter.
    if (!request.headers.get("x-goog-api-key") && !url.searchParams.get("key")) return apiError(403, "forbidden");
    if (failWith) return apiError(failWith.status, failWith.reason);
    const params = url.searchParams;

    switch (url.pathname.slice("/youtube/v3/".length)) {
      case "channels": {
        const wanted = (params.get("forHandle") ?? "").replace(/^@/, "").toLowerCase();
        const channel = channels.find((c) => c.handle.slice(1).toLowerCase() === wanted);
        return json(channel ? { items: [{ id: channel.id, snippet: { title: channel.title } }] } : {});
      }
      case "playlistItems": {
        const ids = playlists.get(params.get("playlistId") ?? "");
        if (!ids) return apiError(404, "playlistNotFound");
        const size = Number(params.get("maxResults") ?? 5);
        const start = Number(params.get("pageToken") ?? 0);
        const next = start + size < ids.length ? String(start + size) : undefined;
        return json({
          ...(next ? { nextPageToken: next } : {}),
          items: ids.slice(start, start + size).map((videoId) => ({ contentDetails: { videoId } })),
        });
      }
      case "videos": {
        const ids = (params.get("id") ?? "").split(",").filter(Boolean);
        if (ids.length > 50) return apiError(400, "tooManyIds");
        return json({ items: ids.flatMap((id) => videoById.get(id) ?? []) });
      }
      default:
        return apiError(404, "notFound");
    }
  };

  return {
    requests,
    count: (endpoint) =>
      requests.filter((r) => endpoint === undefined || new URL(r.url).pathname.endsWith(`/${endpoint}`)).length,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return handle(request);
    },
  };
}

// ---- Fixture builders ----

const at = (iso: string, plusSeconds = 0) => new Date(Date.parse(iso) + plusSeconds * 1000).toISOString();

export function endedVideo(
  id: string,
  start: string,
  seconds: number,
  { channelTitle = "NASA", description = "" } = {},
): VideoItem {
  return {
    id,
    snippet: {
      publishedAt: start,
      channelTitle,
      description,
      liveBroadcastContent: "none",
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } },
    },
    liveStreamingDetails: {
      scheduledStartTime: start,
      actualStartTime: start,
      actualEndTime: at(start, seconds),
    },
  };
}

export function liveVideo(id: string, start: string, viewers: number): VideoItem {
  return {
    id,
    snippet: {
      publishedAt: start,
      channelTitle: "NASA",
      description: "",
      liveBroadcastContent: "live",
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${id}/hqdefault_live.jpg` } },
    },
    liveStreamingDetails: {
      scheduledStartTime: start,
      actualStartTime: start,
      concurrentViewers: String(viewers),
    },
  };
}

export function upcomingVideo(id: string, scheduled: string): VideoItem {
  return {
    id,
    snippet: {
      publishedAt: "2026-01-01T00:00:00Z",
      channelTitle: "NASA",
      description: "",
      liveBroadcastContent: "upcoming",
      thumbnails: {},
    },
    liveStreamingDetails: { scheduledStartTime: scheduled },
  };
}

export function uploadedVideo(id: string, published: string): VideoItem {
  return {
    id,
    snippet: {
      publishedAt: published,
      channelTitle: "NASA",
      description: "",
      liveBroadcastContent: "none",
      thumbnails: {},
    },
  };
}
