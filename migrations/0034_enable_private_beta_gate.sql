-- Private beta is now the default production access mode.
-- Platform admins remain allowed; all other signed-in users must be on the beta tester allowlist.
INSERT INTO launch_settings(key, value, updated_at)
VALUES('private_beta_enabled', 'true', datetime('now'))
ON CONFLICT(key) DO UPDATE SET
  value='true',
  updated_at=datetime('now');
