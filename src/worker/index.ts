import { type Account, parseAccount } from "../shared/accounts";
import type { SiteConfig } from "../shared/api";
import { apiError, json } from "./http";
import { type Mode, twitchEnabled } from "./lookup";
import { clientKey, isCrossSite } from "./requester";
import { runtime } from "./runtime";

export { DailyAllowance } from "./allowance";
export { LookupCoordinator } from "./coordinator";

const LOOKUP_PATH = /^\/api\/(last|recent)\/([^/]+)$/;
const APP_PATH = /^\/(last|recent)\//;

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  // The asset handler would answer /last/@NASA with a redirect to /last/%40NASA;
  // serve the app shell instead so the address stays readable.
  if (APP_PATH.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL("/", url), request));
  // wrangler.jsonc routes only /api/* and the pages above here.
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  if (request.method !== "GET") return apiError("method_not_allowed", { allow: "GET" });
  if (url.pathname === "/api/config") return json({ twitch: twitchEnabled(env) } satisfies SiteConfig);

  const match = LOOKUP_PATH.exec(url.pathname);
  if (!match) return apiError("not_found");
  if (isCrossSite(request)) return apiError("forbidden");

  const account = decodeAccount(match[2]!);
  if (!account) return apiError("invalid_account");
  if (account.platform === "twitch" && !twitchEnabled(env)) return apiError("twitch_disabled");
  if (account.platform === "youtube" && !env.YOUTUBE_API_KEY) return apiError("not_configured");
  if (!(await withinDailyLimit(request, env))) return apiError("daily_limit");

  // Every request for the same lookup goes to the same Durable Object, which
  // shares the answer (see coordinator.ts).
  const mode = match[1] as Mode;
  const key = `${account.platform}:${mode}:${account.id.toLowerCase()}`;
  try {
    const outcome = await env.LOOKUPS.get(env.LOOKUPS.idFromName(key)).lookup(mode, account);
    return outcome.ok ? json(outcome.result) : apiError(outcome.error);
  } catch (error) {
    console.error(`lookup ${key} failed:`, error);
    return apiError("internal_error");
  }
}

function decodeAccount(encoded: string): Account | null {
  try {
    return parseAccount(decodeURIComponent(encoded));
  } catch {
    return null; // malformed percent-encoding
  }
}

const DEFAULT_DAILY_LIMIT = 30;

/** Uses one of the visitor's lookups for today (see allowance.ts). */
async function withinDailyLimit(request: Request, env: Env): Promise<boolean> {
  const visitor = clientKey(request.headers.get("cf-connecting-ip"));
  const limit = Number.parseInt(env.DAILY_LOOKUP_LIMIT, 10) || DEFAULT_DAILY_LIMIT;
  try {
    return await env.ALLOWANCES.get(env.ALLOWANCES.idFromName(visitor)).take(runtime.now(), limit);
  } catch (error) {
    console.warn("daily allowance unavailable, letting the request through:", error);
    return true;
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
