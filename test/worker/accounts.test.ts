import { describe, expect, it } from "vitest";
import { parseAccount } from "../../src/shared/accounts";

describe("parseAccount", () => {
  it.each([
    ["@NASA"],
    ["@hololive-en"],
    ["@user.name_1"],
    ["@星街すいせい"],
    ["@हिन्दी"], // Devanagari needs combining marks
  ])("treats %s as a YouTube handle, keeping its case", (raw) => {
    expect(parseAccount(raw)).toEqual({ platform: "youtube", id: raw });
  });

  it.each([
    ["nasa", "nasa"],
    ["Shroud", "shroud"],
    ["some_user_123", "some_user_123"],
  ])("treats %s as the Twitch login %s", (raw, login) => {
    expect(parseAccount(raw)).toEqual({ platform: "twitch", id: login });
  });

  it.each([
    [""],
    ["@"],
    ["@has space"],
    ["@bad/handle"],
    ["@" + "a".repeat(101)],
    ["NASA!"],
    ["ab"],
    ["a".repeat(26)],
    ["@@double"],
  ])("rejects %j", (raw) => {
    expect(parseAccount(raw)).toBeNull();
  });
});
