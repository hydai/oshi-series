import type { ApiErrorCode, LastLive, RecentLive, SiteConfig } from "../shared/api";

export type Failure = ApiErrorCode | "network_error";
export type Result<T> = { ok: true; data: T } | { ok: false; error: Failure };

async function getJson<T>(path: string): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { accept: "application/json" } });
  } catch {
    return { ok: false, error: "network_error" };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok && body !== null) return { ok: true, data: body as T };
  const code = (body as { error?: unknown } | null)?.error;
  return { ok: false, error: typeof code === "string" ? (code as ApiErrorCode) : "upstream_error" };
}

export const fetchConfig = () => getJson<SiteConfig>("/api/config");

export const fetchLastLive = (account: string) => getJson<LastLive>(`/api/last/${encodeURIComponent(account)}`);

export const fetchRecentLive = (account: string) =>
  getJson<RecentLive>(`/api/recent/${encodeURIComponent(account)}`);
