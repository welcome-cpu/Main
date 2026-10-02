import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      // The real package throws when imported outside Next.js's server build.
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Database tests make many network round trips to Neon.
    testTimeout: 30_000,
  },
});
