import { type Account, parseAccount } from "../shared/accounts";
import type { LastLive, RecentLive, SiteConfig } from "../shared/api";
import { kvCache, remember } from "./cache";
import { LookupError, UpstreamError } from "./errors";
import { apiError, json } from "./http";
import { clientKey, isCrossSite } from "./requester";
import { youtubeLastLive, youtubeRecentLive } from "./youtube";
import { YouTubeApi } from "./youtube/api";

/** What the Worker takes from the outside world, so tests can replace it. */
export interface Deps {
  fetch: typeof fetch;
  now: () => number;
}

type Mode = "last" | "recent";

const LOOKUP_PATH = /^\/api\/(last|recent)\/([^/]+)$/;

// How long a lookup result is reused. A live result goes stale fastest; a
// channel that has never streamed is unlikely to start within the hour.
const LIVE_TTL = 60;
const LAST_TTL = 5 * 60;
const NONE_TTL = 60 * 60;
const RECENT_TTL = 60 * 60;

const lastLiveTtl = (result: LastLive) =>
  result.status === "live" ? LIVE_TTL : result.status === "none" ? NONE_TTL : LAST_TTL;

export async function handleRequest(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  // wrangler.jsonc routes only /api/* here; everything else is a static asset.
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  if (request.method !== "GET") return apiError("method_not_allowed", { allow: "GET" });
  if (url.pathname === "/api/config") return json({ twitch: false } satisfies SiteConfig);

  const match = LOOKUP_PATH.exec(url.pathname);
  if (!match) return apiError("not_found");
  if (isCrossSite(request)) return apiError("forbidden");
  if (!(await withinRateLimit(request, env))) return apiError("rate_limited");

  const account = decodeAccount(match[2]!);
  if (!account) return apiError("invalid_account");

  try {
    return json(await lookup(match[1] as Mode, account, env, deps));
  } catch (error) {
    return errorResponse(error);
  }
}

async function lookup(mode: Mode, account: Account, env: Env, deps: Deps): Promise<LastLive | RecentLive> {
  if (account.platform === "twitch") throw new LookupError("twitch_disabled");
  if (!env.YOUTUBE_API_KEY) throw new LookupError("not_configured");

  const cache = kvCache(env.CACHE);
  const youtube = {
    api: new YouTubeApi({ apiKey: env.YOUTUBE_API_KEY, referer: env.YOUTUBE_API_REFERER || undefined, fetch: deps.fetch }),
    cache,
    now: deps.now(),
  };
  const key = `yt:${mode}:${account.id.toLowerCase()}`;
  return mode === "last"
    ? remember<LastLive>(cache, key, lastLiveTtl, () => youtubeLastLive(account.id, youtube))
    : remember<RecentLive>(cache, key, () => RECENT_TTL, () => youtubeRecentLive(account.id, youtube));
}

function decodeAccount(encoded: string): Account | null {
  try {
    return parseAccount(decodeURIComponent(encoded));
  } catch {
    return null; // malformed percent-encoding
  }
}

async function withinRateLimit(request: Request, env: Env): Promise<boolean> {
  const key = clientKey(request.headers.get("cf-connecting-ip"));
  try {
    return (await env.API_RATE_LIMIT.limit({ key })).success;
  } catch (error) {
    console.warn("rate limiter unavailable, letting the request through:", error);
    return true;
  }
}

function errorResponse(error: unknown): Response {
  if (error instanceof LookupError) return apiError(error.code);
  if (error instanceof UpstreamError) {
    console.error(error.message);
    return apiError(error.quotaExceeded ? "quota_exceeded" : "upstream_error");
  }
  console.error("lookup failed:", error);
  return apiError("internal_error");
}

export default {
  fetch(request, env) {
    return handleRequest(request, env, { fetch: (input, init) => fetch(input, init), now: () => Date.now() });
  },
} satisfies ExportedHandler<Env>;
