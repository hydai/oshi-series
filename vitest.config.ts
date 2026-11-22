import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// The plugin reads secrets.required from the environment. Always the fake key,
// even when a real one is exported in the shell: tests never call YouTube.
process.env.YOUTUBE_API_KEY = "test-youtube-key";

// Worker tests run inside workerd with the bindings declared in wrangler.jsonc
// (local KV and rate limiter). Outbound HTTP is never real: tests inject fetch.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    include: ["test/worker/**/*.test.ts"],
  },
});
