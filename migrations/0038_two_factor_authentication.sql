-- Better Auth TOTP two-factor authentication.
-- The secret and backup codes are encrypted by Better Auth before storage.

ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "twoFactor" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "verified" INTEGER NOT NULL DEFAULT 0,
  "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" INTEGER,
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "twoFactor_userId_idx" ON "twoFactor" ("userId");
