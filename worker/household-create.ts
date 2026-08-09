export interface HouseholdCreationWrite {
  sql: string;
  values: string[];
}

interface HouseholdCreationInput {
  householdId: string;
  membershipId: string;
  auditId: string;
  userId: string;
  userName: string;
  householdName: string;
  slug: string;
  defaultLanguage: string;
  timezone: string;
  requestId: string;
  now: string;
}

/**
 * Builds the atomic write set used when a signed-in user creates a household.
 *
 * Timestamps and the retained legacy `language` value are explicit so this
 * works against both the original production schema and fresh installations.
 */
export function buildHouseholdCreationWrites({
  householdId,
  membershipId,
  auditId,
  userId,
  userName,
  householdName,
  slug,
  defaultLanguage,
  timezone,
  requestId,
  now,
}: HouseholdCreationInput): HouseholdCreationWrite[] {
  return [
    {
      sql: `INSERT INTO profiles
              (user_id, display_name, preferred_language, timezone, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              display_name = excluded.display_name,
              preferred_language = excluded.preferred_language,
              timezone = excluded.timezone,
              updated_at = excluded.updated_at`,
      values: [userId, userName, defaultLanguage, timezone, now, now],
    },
    {
      sql: `INSERT INTO households
              (id, name, slug, language, default_language, timezone, theme, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        householdId,
        householdName,
        slug,
        defaultLanguage,
        defaultLanguage,
        timezone,
        "meadow",
        userId,
        now,
        now,
      ],
    },
    {
      sql: `INSERT INTO memberships
              (id, household_id, user_id, role_key, status, joined_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [membershipId, householdId, userId, "owner", "active", now, now, now],
    },
    {
      sql: `INSERT INTO audit_events
              (id, household_id, actor_user_id, action, resource_type, resource_id, result, request_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        auditId,
        householdId,
        userId,
        "household.create",
        "household",
        householdId,
        "success",
        requestId,
        now,
      ],
    },
  ];
}
