-- Milestone 6: private household direct messages and lightweight reactions.

CREATE TABLE IF NOT EXISTS "household_direct_messages" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "household_id" TEXT NOT NULL,
  "sender_user_id" TEXT NOT NULL,
  "recipient_user_id" TEXT NOT NULL,
  "body" TEXT NOT NULL CHECK (length("body") BETWEEN 1 AND 1000),
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("sender_user_id") REFERENCES "user"("id") ON DELETE CASCADE,
  FOREIGN KEY ("recipient_user_id") REFERENCES "user"("id") ON DELETE CASCADE,
  CHECK ("sender_user_id" <> "recipient_user_id")
);

CREATE INDEX IF NOT EXISTS "household_direct_messages_pair_idx"
  ON "household_direct_messages" ("household_id", "sender_user_id", "recipient_user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "household_direct_message_reads" (
  "household_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "peer_user_id" TEXT NOT NULL,
  "last_read_at" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("household_id", "user_id", "peer_user_id"),
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
  FOREIGN KEY ("peer_user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "household_message_reactions" (
  "message_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "emoji" TEXT NOT NULL CHECK ("emoji" IN ('👍','❤️','😂','🎉','👀')),
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY ("message_id", "user_id", "emoji"),
  FOREIGN KEY ("message_id") REFERENCES "household_messages"("id") ON DELETE CASCADE,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);
