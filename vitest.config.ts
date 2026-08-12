import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "worker/**/*.test.ts"],
    exclude: ["worker/**/*.integration.test.ts"],
  },
});
