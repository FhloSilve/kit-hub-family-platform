-- Security Hardening II: make privacy-safe security monitoring cheap enough for production.
CREATE INDEX IF NOT EXISTS audit_events_action_created_idx
  ON audit_events(action, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_result_created_idx
  ON audit_events(result, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx
  ON audit_events(actor_user_id, created_at DESC);
