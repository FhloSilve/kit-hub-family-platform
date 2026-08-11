ALTER TABLE household_routines ADD COLUMN rotation_mode TEXT NOT NULL DEFAULT 'none' CHECK (rotation_mode IN ('none','round_robin'));
ALTER TABLE household_routines ADD COLUMN rotation_member_ids TEXT;
ALTER TABLE household_routines ADD COLUMN rotation_index INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_household_routines_rotation
  ON household_routines(household_id, active, rotation_mode);
