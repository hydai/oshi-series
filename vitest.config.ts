import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Fake secrets for every test, bound explicitly so they win over the real ones
// in .dev.vars (which the plugin also reads) and in the shell. Tests never
// call YouTube or Twitch, but real secrets must not even be in their env.
const FAKE_SECRETS = {
  YOUTUBE_API_KEY: "test-youtube-key",
  // test/worker/fake-twitch.ts accepts these.
  TWITCH_CLIENT_ID: "test-client-id",
  TWITCH_CLIENT_SECRET: "test-client-secret",
};

// Without .dev.vars (e.g. in CI) the plugin looks for secrets.required in the
// environment and warns when they are missing.
process.env.YOUTUBE_API_KEY = FAKE_SECRETS.YOUTUBE_API_KEY;

// Worker tests run inside workerd with the bindings declared in wrangler.jsonc
// (local KV and Durable Objects). Outbound HTTP is never real: tests replace
// fetch. The Durable Objects read their own env, so Twitch is configured for
// every test; tests of a site without Twitch pass the Worker an env without it.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: FAKE_SECRETS },
    }),
  ],
  test: {
    include: ["test/worker/**/*.test.ts"],
  },
});
