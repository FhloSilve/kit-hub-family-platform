ALTER TABLE household_routines ADD COLUMN snoozed_until TEXT;
ALTER TABLE household_routines ADD COLUMN last_notified_due_at TEXT;

CREATE INDEX IF NOT EXISTS idx_household_routines_assignee_due
  ON household_routines(household_id, assignee_user_id, active, next_due_at);

CREATE TRIGGER IF NOT EXISTS notify_routine_assignment_insert
AFTER INSERT ON household_routines
WHEN NEW.assignee_user_id IS NOT NULL AND NEW.assignee_user_id <> NEW.created_by
BEGIN
  INSERT INTO household_notifications
    (id, household_id, user_id, actor_user_id, category, kind, title, body, entity_type, entity_id, direct)
  VALUES
    (lower(hex(randomblob(16))), NEW.household_id, NEW.assignee_user_id, NEW.created_by,
     'assignment', 'routine.assigned', 'A routine was assigned to you', NEW.title, 'routine', NEW.id, 1);
END;

CREATE TRIGGER IF NOT EXISTS notify_routine_assignment_update
AFTER UPDATE OF assignee_user_id ON household_routines
WHEN NEW.assignee_user_id IS NOT NULL
  AND NEW.assignee_user_id <> COALESCE(OLD.assignee_user_id, '')
BEGIN
  INSERT INTO household_notifications
    (id, household_id, user_id, actor_user_id, category, kind, title, body, entity_type, entity_id, direct)
  VALUES
    (lower(hex(randomblob(16))), NEW.household_id, NEW.assignee_user_id, NEW.created_by,
     'assignment', 'routine.assigned', 'A routine was assigned to you', NEW.title, 'routine', NEW.id, 1);
END;
