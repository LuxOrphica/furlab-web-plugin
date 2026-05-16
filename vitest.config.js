import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.js", "tests/property/**/*.test.js"],
    exclude: ["tests/integration/**", "tests/e2e/**"],
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      include: ["src/services/**/*.js"],
      exclude: ["src/server.js"],
      reporter: ["text", "html"],
    },
  },
});
