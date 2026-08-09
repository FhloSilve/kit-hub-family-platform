-- Milestone 3: Calendar V2 + grocery priority

ALTER TABLE everyday_grocery_items ADD COLUMN important INTEGER NOT NULL DEFAULT 0 CHECK (important IN (0, 1));

ALTER TABLE everyday_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'event'
  CHECK (event_type IN ('event', 'birthday', 'happening', 'appointment', 'school', 'pet', 'meal', 'holiday'));
ALTER TABLE everyday_events ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'
  CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly', 'yearly'));
ALTER TABLE everyday_events ADD COLUMN reminder_minutes INTEGER;

CREATE INDEX IF NOT EXISTS everyday_grocery_household_important_idx
  ON everyday_grocery_items (household_id, important DESC, checked ASC, created_at DESC);

CREATE INDEX IF NOT EXISTS everyday_events_household_type_idx
  ON everyday_events (household_id, event_type, starts_at);
