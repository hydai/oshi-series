export type Platform = "youtube" | "twitch";

export interface Account {
  platform: Platform;
  /** YouTube: the handle with its "@" and original case. Twitch: the lowercase login. */
  id: string;
}

// "@" plus letters, marks and digits of any script, "_", "-", "." or "·".
// YouTube allows at most 30 characters; 100 leaves room without allowing abuse.
const YOUTUBE_HANDLE = /^@[\p{L}\p{M}\p{N}_.·-]{1,100}$/u;

// Twitch logins are ASCII letters, digits and "_"; they are case-insensitive.
const TWITCH_LOGIN = /^[a-z0-9_]{3,25}$/;

/** Reads the account part of /last/:account or /recent/:account. */
export function parseAccount(raw: string): Account | null {
  if (YOUTUBE_HANDLE.test(raw)) return { platform: "youtube", id: raw };
  const login = raw.toLowerCase();
  if (TWITCH_LOGIN.test(login)) return { platform: "twitch", id: login };
  return null;
}
