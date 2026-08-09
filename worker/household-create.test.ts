import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { buildHouseholdCreationWrites } from "./household-create";

function productionShapedDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE "user" (
      "id" TEXT PRIMARY KEY NOT NULL
    );

    CREATE TABLE "profiles" (
      "user_id" TEXT PRIMARY KEY NOT NULL,
      "display_name" TEXT NOT NULL,
      "preferred_language" TEXT NOT NULL,
      "timezone" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
    );

    CREATE TABLE "households" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "name" TEXT NOT NULL,
      "language" TEXT NOT NULL,
      "timezone" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "created_by" TEXT NOT NULL,
      "slug" TEXT NOT NULL UNIQUE,
      "default_language" TEXT NOT NULL,
      "theme" TEXT NOT NULL,
      "deleted_at" TEXT,
      FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT
    );

    CREATE TABLE "roles" (
      "key" TEXT PRIMARY KEY NOT NULL
    );

    CREATE TABLE "memberships" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "household_id" TEXT NOT NULL,
      "user_id" TEXT NOT NULL,
      "role_key" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "joined_at" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
      FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
      FOREIGN KEY ("role_key") REFERENCES "roles"("key") ON DELETE RESTRICT
    );

    CREATE TABLE "audit_events" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "household_id" TEXT,
      "actor_user_id" TEXT,
      "action" TEXT NOT NULL,
      "resource_type" TEXT NOT NULL,
      "resource_id" TEXT,
      "result" TEXT NOT NULL CHECK ("result" IN ('success', 'denied', 'failure')),
      "request_id" TEXT,
      "created_at" TEXT NOT NULL,
      FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL,
      FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL
    );

    INSERT INTO "user" ("id") VALUES ('user-1');
    INSERT INTO "roles" ("key") VALUES ('owner');
  `);
  return db;
}

describe("buildHouseholdCreationWrites", () => {
  it("creates a household against the legacy production timestamp contract", () => {
    const db = productionShapedDatabase();
    const now = "2026-08-09T08:15:00.000Z";
    const writes = buildHouseholdCreationWrites({
      householdId: "household-1",
      membershipId: "membership-1",
      auditId: "audit-1",
      userId: "user-1",
      userName: "Louisa",
      householdName: "The Fox Den",
      slug: "the-fox-den-123456",
      defaultLanguage: "nl",
      timezone: "Europe/Brussels",
      requestId: "request-1",
      now,
    });

    db.exec("BEGIN");
    try {
      for (const { sql, values } of writes) db.prepare(sql).run(...values);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    expect(
      db.prepare(`SELECT name, language, default_language, theme, created_at, updated_at FROM households`).get(),
    ).toEqual({
      name: "The Fox Den",
      language: "nl",
      default_language: "nl",
      theme: "meadow",
      created_at: now,
      updated_at: now,
    });
    expect(db.prepare(`SELECT role_key, status, joined_at, created_at, updated_at FROM memberships`).get())
      .toEqual({ role_key: "owner", status: "active", joined_at: now, created_at: now, updated_at: now });
    expect(db.prepare(`SELECT action, result, request_id, created_at FROM audit_events`).get())
      .toEqual({ action: "household.create", result: "success", request_id: "request-1", created_at: now });

    db.close();
  });
});
