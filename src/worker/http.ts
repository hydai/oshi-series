import type { ApiErrorCode } from "../shared/api";

const STATUS: Record<ApiErrorCode, number> = {
  invalid_account: 400,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  daily_limit: 429,
  internal_error: 500,
  upstream_error: 502,
  cooling_down: 503,
  twitch_disabled: 503,
  not_configured: 503,
};

/** API responses are never cached by browsers; answers are kept by the lookup coordinators instead. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function apiError(code: ApiErrorCode, headers?: Record<string, string>): Response {
  return json({ error: code }, STATUS[code], headers);
}

/** The day's YouTube units are spent: try again at `resumesAt` (ms), when YouTube resets its quota. */
export function coolingDown(resumesAt: number, now: number): Response {
  const seconds = Math.max(1, Math.ceil((resumesAt - now) / 1000));
  return json({ error: "cooling_down", resumesAt: new Date(resumesAt).toISOString() }, STATUS.cooling_down, {
    "retry-after": String(seconds),
  });
}
