interface TestD1Migration {
  name: string;
  queries: string[];
}

declare module "cloudflare:test" {
  export const env: Env & { TEST_MIGRATIONS: TestD1Migration[] };
  export const SELF: Fetcher;
  export function applyD1Migrations(
    database: D1Database,
    migrations: TestD1Migration[],
    migrationsTableName?: string,
  ): Promise<void>;
}
