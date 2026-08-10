import type { AppBindings } from "./http";
import type { Context } from "hono";

type AppContext = Context<AppBindings>;

export async function recordHouseholdActivity(
  c: AppContext,
  householdId: string,
  actorUserId: string | null,
  kind: string,
  summary: string,
) {
  await c.env.DB.prepare(
    "INSERT INTO household_activity (id, household_id, actor_user_id, kind, summary) VALUES (?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), householdId, actorUserId, kind, summary.slice(0, 300)).run();
}
