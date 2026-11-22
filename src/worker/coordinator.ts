import { DurableObject } from "cloudflare:workers";
import type { Account } from "../shared/accounts";
import type { ApiErrorCode } from "../shared/api";
import { CoolingDown } from "./errors";
import { answerTtl, failureCode, type LookupResult, type Mode, runLookup } from "./lookup";

export type LookupOutcome =
  /** `coolingDownUntil` (ms) marks the last answer, shown because YouTube's quota is spent until then. */
  | { ok: true; result: LookupResult; coolingDownUntil?: number }
  /** `resumesAt` (ms) comes with "cooling_down": when YouTube's quota resets. */
  | { ok: false; error: ApiErrorCode; resumesAt?: number };

interface StoredAnswer {
  result: LookupResult;
  /** Wall-clock ms after which the answer is refreshed. */
  expiresAt: number;
}

/**
 * One instance per lookup, named like "youtube:last:@nasa". Every request for
 * that lookup comes here, whichever visitor or data centre it is from: a fresh
 * stored answer is shared, and while a lookup is running, later requests wait
 * for it instead of starting their own. So each answer costs API quota once.
 *
 * An expired answer is never deleted, only replaced by a fresher one, so a
 * cool-down always has the last answer to show.
 */
export class LookupCoordinator extends DurableObject<Env> {
  private running: Promise<LookupOutcome> | null = null;

  async lookup(mode: Mode, account: Account): Promise<LookupOutcome> {
    const stored = await this.ctx.storage.get<StoredAnswer>("answer");
    if (stored && stored.expiresAt > Date.now()) return { ok: true, result: stored.result };
    this.running ??= this.refresh(mode, account, stored).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async refresh(mode: Mode, account: Account, previous: StoredAnswer | undefined): Promise<LookupOutcome> {
    let result: LookupResult;
    try {
      result = await runLookup(mode, account, this.env);
    } catch (error) {
      if (error instanceof CoolingDown) {
        // No YouTube units left: the last answer, however old, beats none.
        return previous
          ? { ok: true, result: previous.result, coolingDownUntil: error.resumesAt }
          : { ok: false, error: "cooling_down", resumesAt: error.resumesAt };
      }
      return { ok: false, error: failureCode(error) };
    }
    const expiresAt = Date.now() + answerTtl(mode, result) * 1000;
    await this.ctx.storage.put<StoredAnswer>("answer", { result, expiresAt });
    return { ok: true, result };
  }
}
