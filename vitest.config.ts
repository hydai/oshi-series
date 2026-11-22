import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// The plugin reads secrets.required from the environment. Always the fake key,
// even when a real one is exported in the shell: tests never call YouTube.
process.env.YOUTUBE_API_KEY = "test-youtube-key";

// Worker tests run inside workerd with the bindings declared in wrangler.jsonc
// (local KV, rate limiter and Durable Objects). Outbound HTTP is never real:
// tests replace fetch. The Durable Objects read their own env, so the fake
// Twitch credentials (test/worker/fake-twitch.ts) are bound for every test;
// tests of a site without Twitch pass the Worker an env without them.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { TWITCH_CLIENT_ID: "test-client-id", TWITCH_CLIENT_SECRET: "test-client-secret" },
      },
    }),
  ],
  test: {
    include: ["test/worker/**/*.test.ts"],
  },
});
