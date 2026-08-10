CREATE TABLE household_routines (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  cadence TEXT NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily','weekly','monthly')),
  assignee_user_id TEXT,
  next_due_at TEXT,
  reminder_minutes INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_user_id) REFERENCES "user"(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX idx_household_routines_household_due ON household_routines(household_id, active, next_due_at);

CREATE TABLE household_routine_completions (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  completed_by TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (routine_id) REFERENCES household_routines(id) ON DELETE CASCADE,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (completed_by) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX idx_routine_completions_household ON household_routine_completions(household_id, completed_at DESC);
