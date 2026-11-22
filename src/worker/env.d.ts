// Optional secrets that `wrangler types` cannot know about. Twitch lookup is
// enabled only when both are set (`wrangler secret put TWITCH_CLIENT_ID`, …).

interface Env {
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
}

declare namespace Cloudflare {
  interface Env {
    TWITCH_CLIENT_ID?: string;
    TWITCH_CLIENT_SECRET?: string;
  }
}
