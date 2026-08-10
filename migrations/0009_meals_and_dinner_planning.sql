-- Milestone 5: shared meal planning, recipes, suggestions and dietary notes.

INSERT OR IGNORE INTO permissions ("key", "description") VALUES
  ('meals.manage', 'Create and manage household meal plans and recipes.');

INSERT OR IGNORE INTO role_permissions ("role_key", "permission_key") VALUES
  ('owner', 'meals.manage'),
  ('admin', 'meals.manage'),
  ('adult', 'meals.manage'),
  ('teen', 'meals.manage');

CREATE TABLE IF NOT EXISTS "meal_recipes" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "name" TEXT NOT NULL CHECK (length("name") BETWEEN 1 AND 120),
  "description" TEXT CHECK ("description" IS NULL OR length("description") <= 500),
  "ingredients_json" TEXT NOT NULL DEFAULT '[]',
  "instructions" TEXT CHECK ("instructions" IS NULL OR length("instructions") <= 3000),
  "favorite" INTEGER NOT NULL DEFAULT 0 CHECK ("favorite" IN (0, 1)),
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "meal_recipes_household_favorite_idx"
  ON "meal_recipes" ("household_id", "favorite" DESC, "name" COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS "meal_plans" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "meal_date" TEXT NOT NULL,
  "meal_type" TEXT NOT NULL CHECK ("meal_type" IN ('breakfast', 'lunch', 'dinner', 'snack')),
  "title" TEXT NOT NULL CHECK (length("title") BETWEEN 1 AND 120),
  "recipe_id" TEXT,
  "cook_user_id" TEXT,
  "notes" TEXT CHECK ("notes" IS NULL OR length("notes") <= 500),
  "reminder_minutes" INTEGER CHECK ("reminder_minutes" IS NULL OR "reminder_minutes" BETWEEN 0 AND 10080),
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("recipe_id") REFERENCES "meal_recipes"("id") ON DELETE SET NULL,
  FOREIGN KEY ("cook_user_id") REFERENCES "user"("id") ON DELETE SET NULL,
  FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT,
  UNIQUE ("household_id", "meal_date", "meal_type")
);

CREATE INDEX IF NOT EXISTS "meal_plans_household_date_idx"
  ON "meal_plans" ("household_id", "meal_date", "meal_type");

CREATE TABLE IF NOT EXISTS "meal_suggestions" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "title" TEXT NOT NULL CHECK (length("title") BETWEEN 1 AND 120),
  "notes" TEXT CHECK ("notes" IS NULL OR length("notes") <= 300),
  "meal_type" TEXT NOT NULL DEFAULT 'dinner' CHECK ("meal_type" IN ('breakfast', 'lunch', 'dinner', 'snack')),
  "suggested_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("suggested_by") REFERENCES "user"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "meal_suggestions_household_created_idx"
  ON "meal_suggestions" ("household_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "meal_suggestion_votes" (
  "suggestion_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("suggestion_id", "user_id"),
  FOREIGN KEY ("suggestion_id") REFERENCES "meal_suggestions"("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "meal_settings" (
  "household_id" TEXT PRIMARY KEY NOT NULL,
  "dietary_notes" TEXT CHECK ("dietary_notes" IS NULL OR length("dietary_notes") <= 1000),
  "updated_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE RESTRICT
);
