import type { ApiError, ApiErrorCode, LastLive, RecentLive, SiteConfig } from "../shared/api";

export type Failure = ApiErrorCode | "network_error";

export interface FailedLookup {
  error: Failure;
  /** With "cooling_down": when lookups resume (ISO 8601). */
  resumesAt?: string;
}

export type Result<T> = { ok: true; data: T } | ({ ok: false } & FailedLookup);

async function getJson<T>(path: string): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { accept: "application/json" } });
  } catch {
    return { ok: false, error: "network_error" };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok && body !== null) return { ok: true, data: body as T };
  const { error, resumesAt } = (body ?? {}) as Partial<Record<keyof ApiError, unknown>>;
  return {
    ok: false,
    error: typeof error === "string" ? (error as ApiErrorCode) : "upstream_error",
    ...(typeof resumesAt === "string" ? { resumesAt } : {}),
  };
}

export const fetchConfig = () => getJson<SiteConfig>("/api/config");

export const fetchLastLive = (account: string) => getJson<LastLive>(`/api/last/${encodeURIComponent(account)}`);

export const fetchRecentLive = (account: string) =>
  getJson<RecentLive>(`/api/recent/${encodeURIComponent(account)}`);
