import type { FailedLookup, Failure } from "./api";
import { taipeiTime } from "./format";

export interface FailureText {
  title: string;
  detail?: string;
}

const ERROR_TEXT: Record<Failure, FailureText> = {
  invalid_account: { title: "帳號格式不正確" },
  forbidden: { title: "發生錯誤", detail: "請從 liveinfo.oshi.tw 查詢" },
  not_found: { title: "找不到這個頻道", detail: "請確認輸入的是頻道網址裡的帳號代碼，而不是頻道名稱" },
  daily_limit: { title: "今天的查詢次數已用完", detail: "每個網路位址每天能查的次數有上限，台灣時間午夜重新計算" },
  cooling_down: { title: "冷卻中", detail: "今天的 YouTube 查詢額度用完了，台灣時間下午 3 或 4 點恢復" },
  twitch_disabled: { title: "這個網站沒有開放 Twitch 查詢" },
  not_configured: { title: "網站尚未設定 YouTube API 金鑰" },
  upstream_error: { title: "查詢失敗", detail: "請稍後再試" },
  internal_error: { title: "發生錯誤", detail: "請稍後再試" },
  method_not_allowed: { title: "發生錯誤", detail: "請稍後再試" },
  network_error: { title: "連線失敗", detail: "請檢查網路後再試" },
};

export function errorText(failure: FailedLookup): FailureText {
  if (failure.error === "cooling_down" && failure.resumesAt) {
    return { title: "冷卻中", detail: `今天的 YouTube 查詢額度用完了，台灣時間 ${taipeiTime(failure.resumesAt)} 恢復` };
  }
  return ERROR_TEXT[failure.error] ?? ERROR_TEXT.internal_error;
}

/** The footnote for an answer shown from before a cool-down. */
export const staleNote = (coolingDownUntil: string): string =>
  `* YouTube 查詢冷卻中，這是先前查到的結果，台灣時間 ${taipeiTime(coolingDownUntil)} 後更新`;
