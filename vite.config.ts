import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// The Worker (`npm run dev:worker`, port 8787) answers /api/* during development.
export default defineConfig({
  plugins: [vue()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
