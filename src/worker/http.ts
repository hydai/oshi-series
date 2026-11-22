import type { ApiErrorCode } from "../shared/api";

const STATUS: Record<ApiErrorCode, number> = {
  invalid_account: 400,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  daily_limit: 429,
  internal_error: 500,
  upstream_error: 502,
  quota_exceeded: 503,
  twitch_disabled: 503,
  not_configured: 503,
};

/** API responses are never cached by browsers; lookups are cached in KV instead. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function apiError(code: ApiErrorCode, headers?: Record<string, string>): Response {
  return json({ error: code }, STATUS[code], headers);
}
