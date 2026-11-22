import type { Account } from "../shared/accounts";
import type { ApiErrorCode, LastLive, RecentLive } from "../shared/api";
import { kvCache } from "./cache";
import { CoolingDown, LookupError, UpstreamError } from "./errors";
import { runtime } from "./runtime";
import { twitchLastLive, twitchRecentLive } from "./twitch";
import { youtubeLastLive, youtubeRecentLive } from "./youtube";
import { YouTubeApi } from "./youtube/api";

export type Mode = "last" | "recent";
export type LookupResult = LastLive | RecentLive;

// How long an answer is reused. A live result goes stale fastest; a channel
// that has never streamed is unlikely to start within the hour.
const LIVE_TTL = 60;
const LAST_TTL = 5 * 60;
const NONE_TTL = 60 * 60;
const RECENT_TTL = 60 * 60;

const DEFAULT_DAILY_UNITS = 10_000;

/** Seconds an answer stays fresh. */
export function answerTtl(mode: Mode, result: LookupResult): number {
  if (mode === "recent" || !("status" in result)) return RECENT_TTL;
  return result.status === "live" ? LIVE_TTL : result.status === "none" ? NONE_TTL : LAST_TTL;
}

export const twitchEnabled = (env: Env) => Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET);

/** Asks YouTube or Twitch. Throws LookupError or UpstreamError. */
export async function runLookup(mode: Mode, account: Account, env: Env): Promise<LookupResult> {
  const cache = kvCache(env.CACHE);
  const now = runtime.now();

  if (account.platform === "twitch") {
    if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) throw new LookupError("twitch_disabled");
    const twitch = {
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      cache,
      fetch: runtime.fetch,
      now,
    };
    return mode === "last" ? twitchLastLive(account.id, twitch) : twitchRecentLive(account.id, twitch);
  }

  if (!env.YOUTUBE_API_KEY) throw new LookupError("not_configured");
  // Every call is charged to the site's daily units first (see quota.ts).
  const ledger = env.QUOTA.get(env.QUOTA.idFromName("youtube"));
  const limit = Number.parseInt(env.YOUTUBE_DAILY_UNITS, 10) || DEFAULT_DAILY_UNITS;
  const youtube = {
    api: new YouTubeApi({
      apiKey: env.YOUTUBE_API_KEY,
      referer: env.YOUTUBE_API_REFERER || undefined,
      fetch: runtime.fetch,
      beforeCall: async () => {
        const spend = await ledger.spend(runtime.now(), 1, limit);
        if (!spend.ok) throw new CoolingDown(spend.resumesAt);
      },
    }),
    cache,
    now,
  };
  try {
    return mode === "last" ? await youtubeLastLive(account.id, youtube) : await youtubeRecentLive(account.id, youtube);
  } catch (error) {
    // YouTube ran out first (its count includes calls this ledger never saw): stop until the reset.
    if (error instanceof UpstreamError && error.quotaExceeded) {
      throw new CoolingDown(await ledger.exhaust(runtime.now(), limit));
    }
    throw error;
  }
}

/** The error code to answer a failed lookup with. Unexpected failures are logged. */
export function failureCode(error: unknown): ApiErrorCode {
  if (error instanceof LookupError) return error.code;
  if (error instanceof UpstreamError) {
    console.error(error.message);
    return "upstream_error";
  }
  console.error("lookup failed:", error);
  return "internal_error";
}
