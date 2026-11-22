import { UpstreamError } from "../errors";
import type { VideoItem } from "./streams";

const API_ROOT = "https://www.googleapis.com/youtube/v3";
const TIMEOUT_MS = 10_000;
const PAGE_SIZE = 50;

export interface YouTubeApiOptions {
  apiKey: string;
  /** Sent as Referer, for keys restricted to HTTP referrers. */
  referer?: string;
  fetch: typeof fetch;
}

export interface PlaylistPage {
  videoIds: string[];
  nextPageToken: string | null;
}

interface ErrorBody {
  error?: { status?: string; errors?: { reason?: string }[] };
}

/**
 * The few YouTube Data API v3 calls this site needs. Each call costs 1 quota
 * unit; search.list (100 units) is never used.
 */
export class YouTubeApi {
  constructor(private readonly options: YouTubeApiOptions) {}

  /** The channel that owns `handle` ("@name"), or null. */
  async channelByHandle(handle: string): Promise<{ id: string; title: string } | null> {
    const body = await this.get<{ items?: { id: string; snippet?: { title?: string } }[] }>("channels", {
      part: "snippet",
      forHandle: handle,
      fields: "items(id,snippet(title))",
    });
    const channel = body.items?.[0];
    return channel ? { id: channel.id, title: channel.snippet?.title ?? handle } : null;
  }

  /** One page of a playlist, newest first, or null when the playlist does not exist. */
  async playlistPage(playlistId: string, pageToken?: string): Promise<PlaylistPage | null> {
    try {
      const body = await this.get<{ nextPageToken?: string; items?: { contentDetails?: { videoId?: string } }[] }>(
        "playlistItems",
        {
          part: "contentDetails",
          playlistId,
          maxResults: String(PAGE_SIZE),
          fields: "nextPageToken,items(contentDetails(videoId))",
          ...(pageToken ? { pageToken } : {}),
        },
      );
      return {
        videoIds: (body.items ?? []).flatMap((item) => item.contentDetails?.videoId ?? []),
        nextPageToken: body.nextPageToken ?? null,
      };
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 404) return null;
      throw error;
    }
  }

  /** Details for up to 50 videos, in the order requested. */
  async videos(ids: string[]): Promise<VideoItem[]> {
    if (ids.length === 0) return [];
    const body = await this.get<{ items?: VideoItem[] }>("videos", {
      part: "snippet,liveStreamingDetails",
      id: ids.join(","),
      fields:
        "items(id,snippet(publishedAt,channelTitle,description,liveBroadcastContent,thumbnails)," +
        "liveStreamingDetails(scheduledStartTime,actualStartTime,actualEndTime,concurrentViewers))",
    });
    return body.items ?? [];
  }

  private async get<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API_ROOT}/${endpoint}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    // The key goes in a header: URLs end up in logs and traces.
    const headers: Record<string, string> = { "X-Goog-Api-Key": this.options.apiKey };
    if (this.options.referer) headers.Referer = this.options.referer;

    let res: Response;
    try {
      res = await this.options.fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new UpstreamError("youtube", 0, error instanceof Error ? error.name : "FetchError");
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as ErrorBody;
      throw new UpstreamError("youtube", res.status, body.error?.errors?.[0]?.reason ?? body.error?.status ?? "unknown");
    }
    return (await res.json()) as T;
  }
}
