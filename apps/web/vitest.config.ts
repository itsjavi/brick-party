import { defineConfig } from "vitest/config";

// Unit tests cover plain TS helpers, so they skip the Workers and React Router plugins in vite.config.ts.
export default defineConfig({
  test: {
    include: ["app/**/*.test.ts"],
  },
});
