import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "dist/",
    ".wrangler/",
    "worker-configuration.d.ts",
    // The Express backend and old frontend are being replaced; not linted.
    "backend/",
    "frontend/",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["*.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
]);
