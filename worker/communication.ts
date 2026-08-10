import { Hono } from "hono";
import type { HouseholdRole } from "../shared/contracts";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();

async function sessionUser(c: Parameters<typeof apiError>[0]) {
  const auth = createAuth(c.env, c.req.raw);
  return (await auth.api.getSession({ headers: c.req.raw.headers }))?.user ?? null;
}
async function allowed(c: Parameters<typeof apiError>[0], householdId: string, userId: string, key: string) {
  const member = await c.env.DB.prepare("SELECT role_key AS roleKey FROM memberships WHERE household_id=? AND user_id=? AND status='active' LIMIT 1").bind(householdId, userId).first<{ roleKey: HouseholdRole }>();
  if (!member) return false;
  const override = await c.env.DB.prepare("SELECT effect FROM member_permission_overrides WHERE household_id=? AND user_id=? AND permission_key=? LIMIT 1").bind(householdId, userId, key).first<{ effect: "allow" | "deny" }>();
  if (override) return override.effect === "allow";
  const role = await c.env.DB.prepare("SELECT effect FROM role_permissions WHERE role_key=? AND permission_key=? LIMIT 1").bind(member.roleKey, key).first<{ effect: "allow" | "deny" }>();
  return role?.effect === "allow";
}
async function activity(c: Parameters<typeof apiError>[0], householdId: string, userId: string | null, kind: string, summary: string) {
  await c.env.DB.prepare("INSERT INTO household_activity (id,household_id,actor_user_id,kind,summary) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), householdId, userId, kind, summary).run();
}

app.get("/api/v1/households/:householdId/communication", async (c) => {
  const user = await sessionUser(c); if (!user) return apiError(c,401,"AUTH_REQUIRED","Sign in to open household communication.");
  const householdId = c.req.param("householdId");
  if (!(await allowed(c,householdId,user.id,"household.view"))) return apiError(c,403,"HOUSEHOLD_VIEW_REQUIRED","You do not have access to this household.");
  const [messages, announcements, activities, read, canSend, canAnnounce] = await Promise.all([
    c.env.DB.prepare(`SELECT m.id,m.body,m.author_user_id AS authorUserId,u.name AS authorName,m.created_at AS createdAt,m.edited_at AS editedAt FROM household_messages m JOIN "user" u ON u.id=m.author_user_id WHERE m.household_id=? ORDER BY m.created_at DESC LIMIT 100`).bind(householdId).all(),
    c.env.DB.prepare(`SELECT a.id,a.title,a.body,a.pinned,a.created_by AS createdBy,u.name AS createdByName,a.created_at AS createdAt,a.updated_at AS updatedAt FROM household_announcements a JOIN "user" u ON u.id=a.created_by WHERE a.household_id=? ORDER BY a.pinned DESC,a.updated_at DESC LIMIT 30`).bind(householdId).all(),
    c.env.DB.prepare(`SELECT a.id,a.kind,a.summary,a.actor_user_id AS actorUserId,u.name AS actorName,a.created_at AS createdAt FROM household_activity a LEFT JOIN "user" u ON u.id=a.actor_user_id WHERE a.household_id=? ORDER BY a.created_at DESC LIMIT 50`).bind(householdId).all(),
    c.env.DB.prepare("SELECT last_read_at AS lastReadAt FROM household_message_reads WHERE household_id=? AND user_id=?").bind(householdId,user.id).first<{lastReadAt:string}>(),
    allowed(c,householdId,user.id,"communication.send"), allowed(c,householdId,user.id,"announcements.manage")
  ]);
  const lastReadAt = read?.lastReadAt ?? null;
  const messageResults = messages.results as Array<{authorUserId:string;createdAt:string}>;
  const unreadCount = messageResults.filter((m) => m.authorUserId !== user.id && (!lastReadAt || m.createdAt > lastReadAt)).length;
  return c.json({ messages: messageResults, announcements: announcements.results, activity: activities.results, unreadCount, canSend, canAnnounce });
});

app.post("/api/v1/households/:householdId/messages", async (c) => {
  const user = await sessionUser(c); if (!user) return apiError(c,401,"AUTH_REQUIRED","Sign in to send a message.");
  const householdId=c.req.param("householdId"); if (!(await allowed(c,householdId,user.id,"communication.send"))) return apiError(c,403,"COMMUNICATION_SEND_REQUIRED","You cannot send household messages.");
  const body=String((await c.req.json<{body?:string}>()).body??"").trim(); if (!body || body.length>1000) return apiError(c,400,"INVALID_MESSAGE","Messages must contain 1 to 1000 characters.");
  const id=crypto.randomUUID(); await c.env.DB.prepare("INSERT INTO household_messages (id,household_id,author_user_id,body) VALUES (?,?,?,?)").bind(id,householdId,user.id,body).run();
  const message=await c.env.DB.prepare(`SELECT m.id,m.body,m.author_user_id AS authorUserId,u.name AS authorName,m.created_at AS createdAt,m.edited_at AS editedAt FROM household_messages m JOIN "user" u ON u.id=m.author_user_id WHERE m.id=?`).bind(id).first();
  return c.json(message,201);
});

app.post("/api/v1/households/:householdId/messages/read", async (c) => {
  const user=await sessionUser(c); if (!user) return apiError(c,401,"AUTH_REQUIRED","Sign in to update messages."); const householdId=c.req.param("householdId");
  if (!(await allowed(c,householdId,user.id,"household.view"))) return apiError(c,403,"HOUSEHOLD_VIEW_REQUIRED","You do not have access to this household.");
  await c.env.DB.prepare("INSERT INTO household_message_reads (household_id,user_id,last_read_at) VALUES (?,?,datetime('now')) ON CONFLICT(household_id,user_id) DO UPDATE SET last_read_at=datetime('now')").bind(householdId,user.id).run(); return c.json({ok:true});
});

app.post("/api/v1/households/:householdId/announcements", async (c) => {
  const user=await sessionUser(c); if (!user) return apiError(c,401,"AUTH_REQUIRED","Sign in to post an announcement."); const householdId=c.req.param("householdId");
  if (!(await allowed(c,householdId,user.id,"announcements.manage"))) return apiError(c,403,"ANNOUNCEMENTS_MANAGE_REQUIRED","You cannot manage announcements.");
  const input=await c.req.json<{title?:string;body?:string}>(); const title=String(input.title??"").trim(), body=String(input.body??"").trim();
  if (!title || title.length>120 || !body || body.length>1200) return apiError(c,400,"INVALID_ANNOUNCEMENT","Add a title and message within the allowed length.");
  const id=crypto.randomUUID(); await c.env.DB.prepare("INSERT INTO household_announcements (id,household_id,title,body,created_by) VALUES (?,?,?,?,?)").bind(id,householdId,title,body,user.id).run(); await activity(c,householdId,user.id,"announcement",`${user.name} posted “${title}”.`);
  const row=await c.env.DB.prepare(`SELECT a.id,a.title,a.body,a.pinned,a.created_by AS createdBy,u.name AS createdByName,a.created_at AS createdAt,a.updated_at AS updatedAt FROM household_announcements a JOIN "user" u ON u.id=a.created_by WHERE a.id=?`).bind(id).first(); return c.json(row,201);
});

app.patch("/api/v1/households/:householdId/announcements/:id/pin", async (c) => {
  const user=await sessionUser(c); if (!user) return apiError(c,401,"AUTH_REQUIRED","Sign in to manage announcements."); const householdId=c.req.param("householdId");
  if (!(await allowed(c,householdId,user.id,"announcements.manage"))) return apiError(c,403,"ANNOUNCEMENTS_MANAGE_REQUIRED","You cannot manage announcements."); const pinned=Boolean((await c.req.json<{pinned?:boolean}>()).pinned);
  await c.env.DB.prepare("UPDATE household_announcements SET pinned=?,updated_at=datetime('now') WHERE id=? AND household_id=?").bind(pinned?1:0,c.req.param("id"),householdId).run(); return c.json({pinned});
});

export default app;
