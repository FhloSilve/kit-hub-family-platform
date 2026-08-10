-- Family tools: relevant notifications, attachments/photos, polls and per-user locale preferences.

ALTER TABLE household_notification_preferences ADD COLUMN polls INTEGER NOT NULL DEFAULT 1 CHECK (polls IN (0,1));
ALTER TABLE household_notification_preferences ADD COLUMN attachments INTEGER NOT NULL DEFAULT 0 CHECK (attachments IN (0,1));

CREATE TABLE IF NOT EXISTS "household_notifications" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "category" TEXT NOT NULL CHECK ("category" IN ('assignment','mention','meals','polls','attachments','activity')),
  "kind" TEXT NOT NULL CHECK (length("kind") BETWEEN 1 AND 80),
  "title" TEXT NOT NULL CHECK (length("title") BETWEEN 1 AND 160),
  "body" TEXT CHECK ("body" IS NULL OR length("body") <= 500),
  "entity_type" TEXT,
  "entity_id" TEXT,
  "direct" INTEGER NOT NULL DEFAULT 0 CHECK ("direct" IN (0,1)),
  "read_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
  FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "household_notifications_user_created_idx"
  ON "household_notifications" ("household_id", "user_id", "read_at", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "household_attachments" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "uploaded_by" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL DEFAULT 'household' CHECK ("entity_type" IN ('household','note','meal','recipe','message','task','event','poll')),
  "entity_id" TEXT,
  "file_name" TEXT NOT NULL CHECK (length("file_name") BETWEEN 1 AND 180),
  "mime_type" TEXT NOT NULL CHECK (length("mime_type") BETWEEN 1 AND 120),
  "size_bytes" INTEGER NOT NULL CHECK ("size_bytes" BETWEEN 1 AND 1572864),
  "data_base64" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("uploaded_by") REFERENCES "user"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "household_attachments_entity_idx"
  ON "household_attachments" ("household_id", "entity_type", "entity_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "household_polls" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "question" TEXT NOT NULL CHECK (length("question") BETWEEN 1 AND 240),
  "multiple_choice" INTEGER NOT NULL DEFAULT 0 CHECK ("multiple_choice" IN (0,1)),
  "closes_at" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "closed_at" TEXT,
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "household_polls_household_created_idx"
  ON "household_polls" ("household_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "household_poll_options" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "poll_id" TEXT NOT NULL,
  "label" TEXT NOT NULL CHECK (length("label") BETWEEN 1 AND 120),
  "position" INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY ("poll_id") REFERENCES "household_polls"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "household_poll_options_poll_idx" ON "household_poll_options" ("poll_id", "position");

CREATE TABLE IF NOT EXISTS "household_poll_votes" (
  "poll_id" TEXT NOT NULL,
  "option_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("poll_id", "option_id", "user_id"),
  FOREIGN KEY ("poll_id") REFERENCES "household_polls"("id") ON DELETE CASCADE,
  FOREIGN KEY ("option_id") REFERENCES "household_poll_options"("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "household_poll_votes_user_idx" ON "household_poll_votes" ("poll_id", "user_id");

CREATE TABLE IF NOT EXISTS "user_locale_preferences" (
  "user_id" TEXT PRIMARY KEY NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en' CHECK (length("language") BETWEEN 2 AND 12),
  "region" TEXT NOT NULL DEFAULT 'BE' CHECK (length("region") BETWEEN 2 AND 8),
  "time_zone" TEXT NOT NULL DEFAULT 'Europe/Brussels' CHECK (length("time_zone") BETWEEN 1 AND 80),
  "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS "notify_task_assignment_insert"
AFTER INSERT ON "everyday_tasks"
WHEN NEW.assignee_user_id IS NOT NULL AND NEW.assignee_user_id <> NEW.created_by
BEGIN
  INSERT INTO household_notifications
    (id, household_id, user_id, actor_user_id, category, kind, title, body, entity_type, entity_id, direct)
  VALUES
    (lower(hex(randomblob(16))), NEW.household_id, NEW.assignee_user_id, NEW.created_by,
     'assignment', 'task.assigned', 'A task was assigned to you', NEW.title, 'task', NEW.id, 1);
END;

CREATE TRIGGER IF NOT EXISTS "notify_task_assignment_update"
AFTER UPDATE OF assignee_user_id ON "everyday_tasks"
WHEN NEW.assignee_user_id IS NOT NULL
  AND NEW.assignee_user_id <> COALESCE(OLD.assignee_user_id, '')
  AND NEW.assignee_user_id <> NEW.created_by
BEGIN
  INSERT INTO household_notifications
    (id, household_id, user_id, actor_user_id, category, kind, title, body, entity_type, entity_id, direct)
  VALUES
    (lower(hex(randomblob(16))), NEW.household_id, NEW.assignee_user_id, NEW.created_by,
     'assignment', 'task.assigned', 'A task was assigned to you', NEW.title, 'task', NEW.id, 1);
END;

CREATE TRIGGER IF NOT EXISTS "notify_message_mention_insert"
AFTER INSERT ON "household_message_mentions"
BEGIN
  INSERT INTO household_notifications
    (id, household_id, user_id, actor_user_id, category, kind, title, body, entity_type, entity_id, direct)
  SELECT lower(hex(randomblob(16))), m.household_id, NEW.mentioned_user_id, m.author_user_id,
         'mention', 'message.mentioned', 'You were mentioned in Family Hub', substr(m.body, 1, 500), 'message', m.id, 1
  FROM household_messages m
  WHERE m.id = NEW.message_id AND NEW.mentioned_user_id <> m.author_user_id;
END;

CREATE TRIGGER IF NOT EXISTS "meal_recipe_activity_insert"
AFTER INSERT ON "meal_recipes"
BEGIN
  INSERT INTO household_activity (id, household_id, actor_user_id, kind, summary)
  VALUES (lower(hex(randomblob(16))), NEW.household_id, NEW.created_by, 'recipe.created', 'Added recipe: ' || NEW.name);
  INSERT INTO household_notifications
    (id, household_id, user_id, actor_user_id, category, kind, title, body, entity_type, entity_id, direct)
  SELECT lower(hex(randomblob(16))), NEW.household_id, m.user_id, NEW.created_by, 'meals', 'recipe.created',
         'New recipe in your household', NEW.name, 'recipe', NEW.id, 0
  FROM memberships m
  LEFT JOIN household_notification_preferences p ON p.household_id = m.household_id AND p.user_id = m.user_id
  WHERE m.household_id = NEW.household_id AND m.status = 'active' AND m.user_id <> NEW.created_by AND COALESCE(p.meals, 1) = 1;
END;

CREATE TRIGGER IF NOT EXISTS "meal_recipe_activity_update"
AFTER UPDATE OF name, description, ingredients_json, instructions, favorite ON "meal_recipes"
BEGIN
  INSERT INTO household_activity (id, household_id, actor_user_id, kind, summary)
  VALUES (lower(hex(randomblob(16))), NEW.household_id, NEW.created_by, 'recipe.updated', 'Updated recipe: ' || NEW.name);
  INSERT INTO household_notifications
    (id, household_id, user_id, actor_user_id, category, kind, title, body, entity_type, entity_id, direct)
  SELECT lower(hex(randomblob(16))), NEW.household_id, m.user_id, NEW.created_by, 'meals', 'recipe.updated',
         'Recipe updated', NEW.name, 'recipe', NEW.id, 0
  FROM memberships m
  LEFT JOIN household_notification_preferences p ON p.household_id = m.household_id AND p.user_id = m.user_id
  WHERE m.household_id = NEW.household_id AND m.status = 'active' AND m.user_id <> NEW.created_by AND COALESCE(p.meals, 1) = 1;
END;

CREATE TRIGGER IF NOT EXISTS "meal_recipe_activity_delete"
AFTER DELETE ON "meal_recipes"
BEGIN
  INSERT INTO household_activity (id, household_id, actor_user_id, kind, summary)
  VALUES (lower(hex(randomblob(16))), OLD.household_id, OLD.created_by, 'recipe.deleted', 'Removed recipe: ' || OLD.name);
END;

CREATE TRIGGER IF NOT EXISTS "meal_plan_activity_insert"
AFTER INSERT ON "meal_plans"
BEGIN
  INSERT INTO household_activity (id, household_id, actor_user_id, kind, summary)
  VALUES (lower(hex(randomblob(16))), NEW.household_id, NEW.created_by, 'meal.planned', 'Planned ' || NEW.title || ' for ' || NEW.meal_date);
  INSERT INTO household_notifications
    (id, household_id, user_id, actor_user_id, category, kind, title, body, entity_type, entity_id, direct)
  SELECT lower(hex(randomblob(16))), NEW.household_id, NEW.cook_user_id, NEW.created_by, 'assignment', 'meal.cook_assigned',
         'You are cooking ' || NEW.title, NEW.meal_date || ' · ' || NEW.meal_type, 'meal', NEW.id, 1
  WHERE NEW.cook_user_id IS NOT NULL AND NEW.cook_user_id <> NEW.created_by;
  INSERT INTO household_notifications
    (id, household_id, user_id, actor_user_id, category, kind, title, body, entity_type, entity_id, direct)
  SELECT lower(hex(randomblob(16))), NEW.household_id, m.user_id, NEW.created_by, 'meals', 'meal.planned',
         'Meal planned: ' || NEW.title, NEW.meal_date || ' · ' || NEW.meal_type, 'meal', NEW.id, 0
  FROM memberships m
  LEFT JOIN household_notification_preferences p ON p.household_id = m.household_id AND p.user_id = m.user_id
  WHERE m.household_id = NEW.household_id AND m.status = 'active' AND m.user_id <> NEW.created_by
    AND m.user_id <> COALESCE(NEW.cook_user_id, '') AND COALESCE(p.meals, 1) = 1;
END;

CREATE TRIGGER IF NOT EXISTS "meal_plan_activity_update"
AFTER UPDATE OF title, recipe_id, cook_user_id, notes, reminder_minutes, meal_date, meal_type ON "meal_plans"
BEGIN
  INSERT INTO household_activity (id, household_id, actor_user_id, kind, summary)
  VALUES (lower(hex(randomblob(16))), NEW.household_id, NEW.created_by, 'meal.updated', 'Updated ' || NEW.title || ' on ' || NEW.meal_date);
  INSERT INTO household_notifications
    (id, household_id, user_id, actor_user_id, category, kind, title, body, entity_type, entity_id, direct)
  SELECT lower(hex(randomblob(16))), NEW.household_id, NEW.cook_user_id, NEW.created_by, 'assignment', 'meal.cook_assigned',
         'You are cooking ' || NEW.title, NEW.meal_date || ' · ' || NEW.meal_type, 'meal', NEW.id, 1
  WHERE NEW.cook_user_id IS NOT NULL
    AND NEW.cook_user_id <> COALESCE(OLD.cook_user_id, '')
    AND NEW.cook_user_id <> NEW.created_by;
  INSERT INTO household_notifications
    (id, household_id, user_id, actor_user_id, category, kind, title, body, entity_type, entity_id, direct)
  SELECT lower(hex(randomblob(16))), NEW.household_id, m.user_id, NEW.created_by, 'meals', 'meal.updated',
         'Meal plan updated: ' || NEW.title, NEW.meal_date || ' · ' || NEW.meal_type, 'meal', NEW.id, 0
  FROM memberships m
  LEFT JOIN household_notification_preferences p ON p.household_id = m.household_id AND p.user_id = m.user_id
  WHERE m.household_id = NEW.household_id AND m.status = 'active' AND m.user_id <> NEW.created_by
    AND m.user_id <> COALESCE(NEW.cook_user_id, '') AND COALESCE(p.meals, 1) = 1;
END;

CREATE TRIGGER IF NOT EXISTS "meal_plan_activity_delete"
AFTER DELETE ON "meal_plans"
BEGIN
  INSERT INTO household_activity (id, household_id, actor_user_id, kind, summary)
  VALUES (lower(hex(randomblob(16))), OLD.household_id, OLD.created_by, 'meal.deleted', 'Removed ' || OLD.title || ' from ' || OLD.meal_date);
END;
