import { DurableObject } from "cloudflare:workers";

// YouTube resets API quotas at midnight Pacific time.
const PACIFIC_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const HOUR = 60 * 60 * 1000;

/** The date in California, e.g. "2026-11-21", at the moment `ms`. */
export const pacificDay = (ms: number): string => PACIFIC_DATE.format(ms);

/** The next midnight in California after `ms`: 07:00 UTC in summer (PDT), 08:00 UTC in winter (PST). */
export function nextPacificMidnight(ms: number): number {
  const [year, month, day] = pacificDay(ms).split("-").map(Number) as [number, number, number];
  const summer = Date.UTC(year, month - 1, day + 1, 7);
  const winter = summer + HOUR;
  // At 07:00 UTC it is already the next day in summer, but still 23:00 the day before in winter.
  return pacificDay(summer) === pacificDay(winter) ? summer : winter;
}

export type Spend = { ok: true } | { ok: false; resumesAt: number };

interface Usage {
  day: string;
  used: number;
}

/**
 * The one ledger of YouTube API units the whole site spends per Pacific day.
 * Every YouTube API call is charged here first; once the day's units are
 * gone, lookups cool down until YouTube resets the quota.
 */
export class QuotaLedger extends DurableObject<Env> {
  /** Charges `units` if they fit under today's `limit`; otherwise says when the day resets. */
  async spend(now: number, units: number, limit: number): Promise<Spend> {
    const day = pacificDay(now);
    const usage = await this.ctx.storage.get<Usage>("usage");
    const used = usage?.day === day ? usage.used : 0;
    if (used + units > limit) return { ok: false, resumesAt: nextPacificMidnight(now) };
    await this.ctx.storage.put<Usage>("usage", { day, used: used + units });
    return { ok: true };
  }

  /** YouTube says the quota is gone, whatever this ledger counted: stop until the reset, which is returned. */
  async exhaust(now: number, limit: number): Promise<number> {
    await this.ctx.storage.put<Usage>("usage", { day: pacificDay(now), used: limit });
    return nextPacificMidnight(now);
  }
}
