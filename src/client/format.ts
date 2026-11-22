export interface Elapsed {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Whole days, hours, minutes and seconds from `iso` until `now` (ms); zero if `iso` is in the future. */
export function elapsedSince(iso: string, now: number): Elapsed {
  const total = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** Hours (not capped at 24), minutes and seconds. */
export function splitDuration(totalSeconds: number) {
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/** "5 時 2 分 11 秒"; the hours are left out when zero. */
export function formatDuration(totalSeconds: number): string {
  const { hours, minutes, seconds } = splitDuration(totalSeconds);
  return `${hours > 0 ? `${hours} 時 ` : ""}${minutes} 分 ${seconds} 秒`;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** A link's text without the scheme, "www." or a trailing slash. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}
