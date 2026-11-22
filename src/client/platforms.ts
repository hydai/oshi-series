import type { Platform } from "../shared/accounts";
import type { Mode } from "./modes";

/** Wording and links that differ between YouTube and Twitch. */
export interface PlatformText {
  label: string;
  placeholder: string;
  hint: string;
  examples: Record<Mode, string>;
  invalid: string;
  follow: string;
  /** The page where a visitor can subscribe to / follow the channel. */
  followUrl(account: string, channelUrl: string): string;
}

export const PLATFORMS: Record<Platform, PlatformText> = {
  youtube: {
    label: "YouTube",
    placeholder: "@帳號代碼",
    hint: "頻道網址裡 @ 開頭的帳號代碼",
    examples: { last: "@TED", recent: "@NASA" },
    invalid: "帳號代碼格式不正確，請輸入頻道網址裡 @ 開頭的那一段",
    follow: "訂閱頻道",
    followUrl: (account) => `https://www.youtube.com/${account}?sub_confirmation=1`,
  },
  twitch: {
    label: "Twitch",
    placeholder: "頻道帳號",
    hint: "頻道網址最後那一段",
    examples: { last: "nasa", recent: "nasa" },
    invalid: "帳號格式不正確，只能有英文、數字和底線",
    follow: "追隨頻道",
    followUrl: (_account, channelUrl) => channelUrl,
  },
};
