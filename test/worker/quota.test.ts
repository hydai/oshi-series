import { env, reset, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { nextPacificMidnight, pacificDay } from "../../src/worker/quota";

const at = (iso: string) => Date.parse(iso);

describe("pacificDay", () => {
  it.each([
    ["2026-11-22T07:59:59Z", "2026-11-21"], // 23:59 PST
    ["2026-11-22T08:00:00Z", "2026-11-22"], // 00:00 PST
    ["2026-07-01T06:59:59Z", "2026-06-30"], // 23:59 PDT
    ["2026-07-01T07:00:00Z", "2026-07-01"], // 00:00 PDT
  ])("puts %s on %s in California", (iso, day) => {
    expect(pacificDay(at(iso))).toBe(day);
  });
});

describe("nextPacificMidnight", () => {
  it.each([
    ["in winter (PST)", "2026-11-22T03:00:00Z", "2026-11-22T08:00:00Z"],
    ["in summer (PDT)", "2026-07-01T12:00:00Z", "2026-07-02T07:00:00Z"],
    ["on the day clocks go forward", "2026-03-08T09:00:00Z", "2026-03-09T07:00:00Z"],
    ["on the day clocks go back", "2026-11-01T08:30:00Z", "2026-11-02T08:00:00Z"],
    ["exactly at midnight", "2026-11-22T08:00:00Z", "2026-11-23T08:00:00Z"],
  ])("finds the next reset %s", (_, now, reset) => {
    expect(new Date(nextPacificMidnight(at(now))).toISOString()).toBe(new Date(at(reset)).toISOString());
  });
});

describe("QuotaLedger", () => {
  const ledger = () => env.QUOTA.get(env.QUOTA.idFromName("youtube"));
  const evening = at("2026-11-22T03:00:00Z"); // 19:00 PST on the 21st
  const nextDay = at("2026-11-22T09:00:00Z"); // 01:00 PST on the 22nd

  afterEach(() => reset());

  it("spends units until the next would pass the limit, then says when it resets", async () => {
    const answers = [];
    for (let i = 0; i < 4; i++) answers.push(await ledger().spend(evening, 1, 3));

    expect(answers.slice(0, 3)).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(answers[3]).toEqual({ ok: false, resumesAt: at("2026-11-22T08:00:00Z") });
  });

  it("starts a new count when the Pacific day changes", async () => {
    for (let i = 0; i < 3; i++) await ledger().spend(evening, 1, 3);
    expect(await ledger().spend(nextDay, 1, 3)).toEqual({ ok: true });
  });

  it("treats the day as used up once YouTube says so", async () => {
    expect(await ledger().exhaust(evening, 10_000)).toBe(at("2026-11-22T08:00:00Z"));
    expect(await ledger().spend(evening, 1, 10_000)).toEqual({ ok: false, resumesAt: at("2026-11-22T08:00:00Z") });
  });

  it("reports what has been spent today", async () => {
    await ledger().spend(evening, 2, 10);
    const usage = await runInDurableObject(ledger(), (_, state) => state.storage.get("usage"));
    expect(usage).toEqual({ day: "2026-11-21", used: 2 });
  });
});
