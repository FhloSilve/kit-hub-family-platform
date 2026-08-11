CREATE TABLE silvi_action_proposals (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('task.create','task.update','task.complete','event.create','event.update','meal.plan','meal.move','routine.create','routine.assign','routine.complete')),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 300),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','executing','completed','cancelled','failed')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  executed_at TEXT,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX idx_silvi_action_proposals_user_pending
  ON silvi_action_proposals(household_id, user_id, status, expires_at);
