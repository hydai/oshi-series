import { describe, expect, it } from "vitest";
import { accountFromInput } from "../../src/shared/accounts";

describe("accountFromInput", () => {
  it.each([
    ["@NASA", "@NASA"],
    ["  @NASA  ", "@NASA"],
    ["NASA", "@NASA"],
    ["星街すいせい", "@星街すいせい"],
  ])("reads YouTube input %j as %j", (input, account) => {
    expect(accountFromInput(input, "youtube")).toBe(account);
  });

  it.each([
    ["shroud", "shroud"],
    ["Shroud", "shroud"],
    ["@shroud", "shroud"],
  ])("reads Twitch input %j as %j", (input, account) => {
    expect(accountFromInput(input, "twitch")).toBe(account);
  });

  it.each([
    ["", "youtube"],
    ["@", "youtube"],
    ["has space", "youtube"],
    ["https://www.youtube.com/@NASA", "youtube"],
    ["星街", "twitch"],
    ["ab", "twitch"],
  ] as const)("rejects %j for %s", (input, platform) => {
    expect(accountFromInput(input, platform)).toBeNull();
  });
});
