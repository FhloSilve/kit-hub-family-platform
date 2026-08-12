import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(projectRoot, "migrations"));
      return {
        wrangler: { configPath: path.join(projectRoot, "wrangler.test.jsonc") },
        miniflare: {
          bindings: {
            BETTER_AUTH_SECRET: "test-secret-that-is-longer-than-thirty-two-characters",
            KIT_HUB_ADMIN_EMAILS: "admin@example.com",
            TEST_MIGRATIONS: migrations,
          },
        },
      };
    }),
  ],
  test: {
    include: ["worker/**/*.integration.test.ts"],
    setupFiles: ["./worker/test/setup.ts"],
    sequence: { concurrent: false },
  },
});
