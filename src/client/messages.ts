import type { Failure } from "./api";

export interface FailureText {
  title: string;
  detail?: string;
}

const ERROR_TEXT: Record<Failure, FailureText> = {
  invalid_account: { title: "帳號格式不正確" },
  forbidden: { title: "發生錯誤", detail: "請從 liveinfo.oshi.tw 查詢" },
  not_found: { title: "找不到這個頻道", detail: "請確認輸入的是頻道網址裡的帳號代碼，而不是頻道名稱" },
  daily_limit: { title: "今天的查詢次數已用完", detail: "每個網路位址每天能查的次數有上限，台灣時間午夜重新計算" },
  quota_exceeded: { title: "今天的 YouTube 查詢額度已用完", detail: "額度在台灣時間下午 3 或 4 點重置" },
  twitch_disabled: { title: "這個網站沒有開放 Twitch 查詢" },
  not_configured: { title: "網站尚未設定 YouTube API 金鑰" },
  upstream_error: { title: "查詢失敗", detail: "請稍後再試" },
  internal_error: { title: "發生錯誤", detail: "請稍後再試" },
  method_not_allowed: { title: "發生錯誤", detail: "請稍後再試" },
  network_error: { title: "連線失敗", detail: "請檢查網路後再試" },
};

export const errorText = (failure: Failure): FailureText => ERROR_TEXT[failure] ?? ERROR_TEXT.internal_error;
