import type { Channel, LastLive, RecentLive } from "../shared/api";
import type { JsonCache } from "./cache";
import { LookupError, UpstreamError } from "./errors";

export interface TwitchDeps {
  clientId: string;
  clientSecret: string;
  cache: JsonCache;
  fetch: typeof fetch;
  /** Current time in ms. */
  now: number;
}

const RECENT_DAYS = 30;
const TIMEOUT_MS = 10_000;
const TOKEN_KEY = "twitch:app-token";
// Renew an app token an hour before Twitch says it expires.
const TOKEN_MARGIN = 60 * 60;

interface User {
  id: string;
  login: string;
  display_name: string;
}

interface Stream {
  id: string;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
}

interface Video {
  id: string;
  url: string;
  created_at: string;
  duration: string;
}

/** "3h8m33s" → 11313. Anything unreadable counts as 0. */
export function parseTwitchDuration(text: string): number {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
  if (!match) return 0;
  const [, h = "0", m = "0", s = "0"] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** Helix calls with an app access token from the client-credentials flow. */
class Helix {
  constructor(private readonly deps: TwitchDeps) {}

  async get<T>(path: string, params: Record<string, string>): Promise<T[]> {
    let res = await this.request(path, params, await this.token());
    if (res.status === 401) {
      // The token was revoked or expired early: get a new one and try once more.
      // Not through the cache, which may still hold the rejected token for a while.
      await this.deps.cache.delete(TOKEN_KEY);
      res = await this.request(path, params, await this.token({ fresh: true }));
    }
    if (!res.ok) throw await upstreamError(res);
    return ((await res.json()) as { data?: T[] }).data ?? [];
  }

  private async request(path: string, params: Record<string, string>, token: string): Promise<Response> {
    return this.send(`https://api.twitch.tv/helix/${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${token}`, "Client-Id": this.deps.clientId },
    });
  }

  private async token({ fresh = false } = {}): Promise<string> {
    if (!fresh) {
      const cached = await this.deps.cache.get<string>(TOKEN_KEY);
      if (cached) return cached;
    }

    const res = await this.send("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.deps.clientId,
        client_secret: this.deps.clientSecret,
        grant_type: "client_credentials",
      }),
    });
    if (!res.ok) throw await upstreamError(res);
    const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
    await this.deps.cache.put(TOKEN_KEY, access_token, expires_in - TOKEN_MARGIN);
    return access_token;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.deps.fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new UpstreamError("twitch", 0, error instanceof Error ? error.name : "FetchError");
    }
  }
}

async function upstreamError(res: Response): Promise<UpstreamError> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  return new UpstreamError("twitch", res.status, body.message || body.error || "unknown");
}

async function findUser(helix: Helix, login: string): Promise<{ user: User; channel: Channel }> {
  const [user] = await helix.get<User>("users", { login });
  if (!user) throw new LookupError("not_found");
  return { user, channel: { name: user.display_name, url: `https://www.twitch.tv/${user.login}` } };
}

export async function twitchLastLive(login: string, deps: TwitchDeps): Promise<LastLive> {
  const helix = new Helix(deps);
  const { user, channel } = await findUser(helix, login);
  const base = { platform: "twitch" as const, channel, donations: [] };

  const [stream] = await helix.get<Stream>("streams", { user_id: user.id });
  if (stream) {
    return {
      ...base,
      status: "live",
      stream: {
        id: stream.id,
        url: channel.url,
        startedAt: stream.started_at,
        viewers: stream.viewer_count,
        thumbnail: stream.thumbnail_url.replace("{width}x{height}", "640x360"),
      },
    };
  }

  // Not live, so the newest archive is a finished broadcast: it ended `duration` after it was created.
  const [video] = await helix.get<Video>("videos", { user_id: user.id, type: "archive", first: "1" });
  if (!video) return { ...base, status: "none" };
  const endedAt = Date.parse(video.created_at) + parseTwitchDuration(video.duration) * 1000;
  return { ...base, status: "ended", stream: { id: video.id, url: video.url, endedAt: new Date(endedAt).toISOString() } };
}

/** Counts archives created in the last 30 days, including the one of a broadcast still in progress. */
export async function twitchRecentLive(login: string, deps: TwitchDeps): Promise<RecentLive> {
  const helix = new Helix(deps);
  const { user, channel } = await findUser(helix, login);
  const videos = await helix.get<Video>("videos", { user_id: user.id, type: "archive", period: "month", first: "100" });

  const since = deps.now - RECENT_DAYS * 24 * 60 * 60 * 1000;
  let totalSeconds = 0;
  let count = 0;
  let longest: RecentLive["longest"] = null;
  for (const video of videos) {
    if (Date.parse(video.created_at) < since) continue;
    const seconds = parseTwitchDuration(video.duration);
    totalSeconds += seconds;
    count += 1;
    if (longest === null || seconds > longest.seconds) longest = { id: video.id, url: video.url, seconds };
  }
  return { platform: "twitch", channel, days: RECENT_DAYS, totalSeconds, count, longest, donations: [] };
}
