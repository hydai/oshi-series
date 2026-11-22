import { DurableObject } from "cloudflare:workers";
import type { Account } from "../shared/accounts";
import type { ApiErrorCode } from "../shared/api";
import { answerTtl, failureCode, type LookupResult, type Mode, runLookup } from "./lookup";

export type LookupOutcome = { ok: true; result: LookupResult } | { ok: false; error: ApiErrorCode };

interface StoredAnswer {
  result: LookupResult;
  /** Wall-clock ms, the same clock as the alarm that deletes it. */
  expiresAt: number;
}

/**
 * One instance per lookup, named like "youtube:last:@nasa". Every request for
 * that lookup comes here, whichever visitor or data centre it is from: a fresh
 * stored answer is shared, and while a lookup is running, later requests wait
 * for it instead of starting their own. So each answer costs API quota once.
 */
export class LookupCoordinator extends DurableObject<Env> {
  private running: Promise<LookupOutcome> | null = null;

  async lookup(mode: Mode, account: Account): Promise<LookupOutcome> {
    const stored = await this.ctx.storage.get<StoredAnswer>("answer");
    if (stored && stored.expiresAt > Date.now()) return { ok: true, result: stored.result };
    this.running ??= this.refresh(mode, account).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** The answer has expired. Deleting it leaves nothing behind for lookups nobody repeats. */
  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  private async refresh(mode: Mode, account: Account): Promise<LookupOutcome> {
    let result: LookupResult;
    try {
      result = await runLookup(mode, account, this.env);
    } catch (error) {
      return { ok: false, error: failureCode(error) };
    }
    const expiresAt = Date.now() + answerTtl(mode, result) * 1000;
    await this.ctx.storage.put<StoredAnswer>("answer", { result, expiresAt });
    await this.ctx.storage.setAlarm(expiresAt);
    return { ok: true, result };
  }
}
