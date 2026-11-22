import type { ApiErrorCode } from "../shared/api";

/** A lookup that cannot succeed for a reason the visitor should be told about. */
export class LookupError extends Error {
  constructor(readonly code: ApiErrorCode) {
    super(code);
    this.name = "LookupError";
  }
}

/** The site has spent the day's YouTube units; lookups that need YouTube wait until `resumesAt` (ms). */
export class CoolingDown extends LookupError {
  constructor(readonly resumesAt: number) {
    super("cooling_down");
    this.name = "CoolingDown";
  }
}

const QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded"]);

/**
 * YouTube or Twitch answered with an error, or could not be reached
 * (status 0). `reason` is the API's error reason or the network error name.
 */
export class UpstreamError extends Error {
  readonly quotaExceeded: boolean;

  constructor(
    readonly service: "youtube" | "twitch",
    readonly status: number,
    readonly reason: string,
  ) {
    super(`${service} API ${status} (${reason})`);
    this.name = "UpstreamError";
    this.quotaExceeded = service === "youtube" && QUOTA_REASONS.has(reason);
  }
}
