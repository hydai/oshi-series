import type { Platform } from "./accounts";

// Shapes of the JSON the Worker returns from /api/*. Shared with the Vue client.

export interface Channel {
  name: string;
  url: string;
}

export interface Donation {
  provider: "ecpay" | "deer";
  url: string;
}

export interface LiveStream {
  id: string;
  url: string;
  startedAt: string | null;
  viewers: number | null;
  thumbnail: string | null;
}

export interface EndedStream {
  id: string;
  url: string;
  endedAt: string;
}

/** GET /api/last/:account */
export type LastLive =
  | { status: "live"; platform: Platform; channel: Channel; stream: LiveStream; donations: Donation[] }
  | { status: "ended"; platform: Platform; channel: Channel; stream: EndedStream; donations: Donation[] }
  | { status: "none"; platform: Platform; channel: Channel; donations: Donation[] };

/** GET /api/recent/:account */
export interface RecentLive {
  platform: Platform;
  channel: Channel;
  days: number;
  totalSeconds: number;
  count: number;
  longest: { id: string; url: string; seconds: number } | null;
  donations: Donation[];
}

/** GET /api/config */
export interface SiteConfig {
  twitch: boolean;
}

export type ApiErrorCode =
  | "invalid_account"
  | "forbidden"
  | "not_found"
  | "daily_limit"
  | "cooling_down"
  | "twitch_disabled"
  | "not_configured"
  | "upstream_error"
  | "internal_error"
  | "method_not_allowed";

export interface ApiError {
  error: ApiErrorCode;
  /** With "cooling_down": when YouTube's quota resets and lookups resume (ISO 8601). */
  resumesAt?: string;
}
