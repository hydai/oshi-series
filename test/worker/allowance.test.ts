import { env, reset, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { taipeiDay } from "../../src/worker/allowance";

describe("taipeiDay", () => {
  it.each([
    ["2026-11-21T15:59:59Z", "2026-11-21"],
    ["2026-11-21T16:00:00Z", "2026-11-22"],
    ["2026-12-31T23:30:00Z", "2027-01-01"],
  ])("puts %s on %s in Taiwan", (iso, day) => {
    expect(taipeiDay(Date.parse(iso))).toBe(day);
  });
});

describe("DailyAllowance", () => {
  const allowance = (visitor: string) => env.ALLOWANCES.get(env.ALLOWANCES.idFromName(visitor));
  const morning = Date.parse("2026-11-22T01:00:00Z"); // 09:00 in Taiwan
  const lateEvening = Date.parse("2026-11-22T15:30:00Z"); // 23:30 in Taiwan, the same day
  const nextMorning = Date.parse("2026-11-23T01:00:00Z");

  afterEach(() => reset());

  it("allows the limit's worth of lookups in a Taiwan day, then refuses", async () => {
    const visitor = allowance("203.0.113.7");
    const answers: boolean[] = [];
    for (let i = 0; i < 3; i++) answers.push(await visitor.take(morning, 3));
    answers.push(await visitor.take(lateEvening, 3));

    expect(answers).toEqual([true, true, true, false]);
  });

  it("starts again the next day", async () => {
    const visitor = allowance("203.0.113.7");
    for (let i = 0; i < 3; i++) await visitor.take(morning, 3);

    expect(await visitor.take(nextMorning, 3)).toBe(true);
  });

  it("keeps visitors apart", async () => {
    await allowance("203.0.113.7").take(morning, 1);
    expect(await allowance("203.0.113.8").take(morning, 1)).toBe(true);
  });

  it("deletes the count when its alarm fires", async () => {
    const visitor = allowance("203.0.113.7");
    await visitor.take(morning, 3);

    expect(await runDurableObjectAlarm(visitor)).toBe(true);
    const stored = await runInDurableObject(visitor, (_, state) => state.storage.list());
    expect(stored.size).toBe(0);
  });
});
