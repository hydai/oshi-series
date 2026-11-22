import { DurableObject } from "cloudflare:workers";

// Taiwan is UTC+8 all year round.
const TAIPEI_OFFSET = 8 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** The date in Taiwan, e.g. "2026-11-22", at the moment `ms`. */
export const taipeiDay = (ms: number): string => new Date(ms + TAIPEI_OFFSET).toISOString().slice(0, 10);

interface Usage {
  day: string;
  used: number;
}

/**
 * One instance per visitor (an IPv4 address or an IPv6 /64, see
 * requester.ts). Counts that visitor's lookups since midnight Taiwan time.
 */
export class DailyAllowance extends DurableObject<Env> {
  /** Uses one of today's lookups. False once `limit` have been used. */
  async take(now: number, limit: number): Promise<boolean> {
    const day = taipeiDay(now);
    const usage = await this.ctx.storage.get<Usage>("usage");
    const used = usage?.day === day ? usage.used : 0;
    if (used >= limit) return false;

    await this.ctx.storage.put<Usage>("usage", { day, used: used + 1 });
    // A day after the day's first lookup, the count belongs to a past day.
    if (used === 0) await this.ctx.storage.setAlarm(Date.now() + DAY);
    return true;
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
