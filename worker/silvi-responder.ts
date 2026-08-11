import { Hono } from "hono";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];
type ActionType = "task.create" | "task.update" | "task.complete" | "event.create" | "event.update" | "meal.plan" | "meal.move" | "routine.create" | "routine.assign" | "routine.complete";
const supported = new Set<ActionType>(["task.create","task.update","task.complete","event.create","event.update","meal.plan","meal.move","routine.create","routine.assign","routine.complete"]);
const models = ["@cf/meta/llama-3.1-8b-instruct-fast", "@cf/zai-org/glm-4.7-flash"] as const;

function clean(value: unknown, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function requestId(c: Ctx) { return c.get("requestId") || c.req.header("cf-ray") || crypto.randomUUID(); }
function timeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race<T>([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), ms))]);
}
function parseEnvelope(raw: string): { answer: string; action: { type?: unknown; payload?: unknown } | null } {
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = stripped.indexOf("{"); const last = stripped.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(stripped.slice(first, last + 1)) as { answer?: unknown; action?: unknown };
      return { answer: clean(parsed.answer, 4000) || "I can help with that.", action: parsed.action && typeof parsed.action === "object" ? parsed.action as { type?: unknown; payload?: unknown } : null };
    } catch { /* fall through */ }
  }
  return { answer: clean(raw, 4000) || "Silvi could not form an answer yet.", action: null };
}
async function access(c: Ctx) {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return { response: apiError(c, 401, "AUTH_REQUIRED", "Sign in to ask Silvi about your household.") } as const;
  const householdId = c.req.param("householdId") ?? "";
  const membership = householdId ? await c.env.DB.prepare("SELECT role_key role FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(householdId, session.user.id).first<{role:string}>() : null;
  if (!membership) return { response: apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.") } as const;
  return { user: session.user, householdId, role: membership.role } as const;
}
async function contextFor(c: Ctx, householdId: string, userId: string) {
  const now = new Date().toISOString(); const today = now.slice(0,10); const weekEnd = new Date(Date.now()+7*86400000).toISOString();
  const [household, locale, members, tasks, events, meals, routines] = await Promise.all([
    c.env.DB.prepare("SELECT name,default_language defaultLanguage,timezone FROM households WHERE id=?").bind(householdId).first(),
    c.env.DB.prepare("SELECT language,region,time_zone timeZone FROM user_locale_preferences WHERE user_id=?").bind(userId).first(),
    c.env.DB.prepare(`SELECT m.user_id userId,u.name,m.role_key role FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.household_id=? AND m.status='active' ORDER BY u.name`).bind(householdId).all(),
    c.env.DB.prepare(`SELECT t.id,t.title,t.notes,t.priority,t.due_at dueAt,t.assignee_user_id assigneeUserId,u.name assigneeName FROM everyday_tasks t LEFT JOIN "user" u ON u.id=t.assignee_user_id WHERE t.household_id=? AND t.status='todo' ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,t.due_at LIMIT 30`).bind(householdId).all(),
    c.env.DB.prepare(`SELECT id,title,description,location,starts_at startsAt,ends_at endsAt,all_day allDay,event_type eventType,recurrence,reminder_minutes reminderMinutes FROM everyday_events WHERE household_id=? AND starts_at>=? AND starts_at<=? ORDER BY starts_at LIMIT 30`).bind(householdId,now,weekEnd).all(),
    c.env.DB.prepare(`SELECT p.id,p.meal_date mealDate,p.meal_type mealType,p.title,p.cook_user_id cookUserId,u.name cookName,p.notes FROM meal_plans p LEFT JOIN "user" u ON u.id=p.cook_user_id WHERE p.household_id=? AND p.meal_date>=? AND p.meal_date<=date(?, '+7 day') ORDER BY p.meal_date LIMIT 40`).bind(householdId,today,today).all(),
    c.env.DB.prepare(`SELECT r.id,r.title,r.notes,r.cadence,r.next_due_at nextDueAt,r.assignee_user_id assigneeUserId,u.name assigneeName,CASE WHEN r.next_due_at IS NOT NULL AND r.next_due_at<? THEN 1 ELSE 0 END overdue FROM household_routines r LEFT JOIN "user" u ON u.id=r.assignee_user_id WHERE r.household_id=? AND r.active=1 ORDER BY CASE WHEN r.next_due_at IS NULL THEN 1 ELSE 0 END,r.next_due_at LIMIT 30`).bind(now,householdId).all(),
  ]);
  return { household, locale: locale ?? null, currentTime: now, currentUserId: userId, members: members.results, tasks: tasks.results, upcomingEvents: events.results, meals: meals.results, routines: routines.results };
}
async function runModel(c: Ctx, system: string, prompt: string) {
  let last: unknown = null;
  for (const model of models) {
    try {
      const started = Date.now();
      const ai: any = await timeout(c.env.AI.run(model, { messages:[{role:"system",content:system},{role:"user",content:prompt}], max_tokens:850, temperature:.12 }) as Promise<any>, 12000);
      const raw = clean(ai?.response ?? ai?.result?.response ?? ai?.text, 7000);
      if (raw) {
        console.log(JSON.stringify({level:"info",event:"silvi_ai_success",requestId:requestId(c),model,durationMs:Date.now()-started}));
        return raw;
      }
      last = new Error("EMPTY_RESPONSE");
    } catch (error) {
      last = error;
      console.error(JSON.stringify({level:"error",event:"silvi_ai_attempt_failed",requestId:requestId(c),model,message:error instanceof Error?error.message:"Unknown AI error"}));
    }
  }
  throw last instanceof Error ? last : new Error("AI_UNAVAILABLE");
}

app.get("/api/v1/households/:householdId/silvi/status", async c => {
  const a = await access(c); if ("response" in a) return a.response;
  return c.json({ configured: Boolean(c.env.AI), primaryModel: models[0], fallbackModel: models[1] });
});

app.post("/api/v1/households/:householdId/silvi/ask", async c => {
  const a = await access(c); if ("response" in a) return a.response;
  const body = await c.req.json().catch(()=>null) as {question?:unknown}|null; const question = clean(body?.question,700);
  if (!question) return apiError(c,422,"VALIDATION_FAILED","Ask Silvi a household question.");
  const context = await contextFor(c,a.householdId,a.user.id);
  const system = `You are Silvi, the private household assistant inside Kit Hub. Answer only from supplied household context and never invent household facts. You may propose exactly one change when the user clearly asks to change something, but never claim it already happened. Every proposal requires explicit confirmation in Kit Hub. Supported action types: task.create, task.update, task.complete, event.create, event.update, meal.plan, meal.move, routine.create, routine.assign, routine.complete. Use only IDs present in context. If the user says an event is cancelled, explain that removing/cancelling calendar items is not yet an available Silvi action; identify the likely matching event if there is one and ask whether they want to open it. If details are missing or ambiguous, ask one short clarification and action=null. Return ONLY JSON: {"answer":"...","action":null} or {"answer":"... confirmation required ...","action":{"type":"supported.type","payload":{}}}. No markdown.`;
  const prompt = `Current user: ${a.user.name ?? "Household member"}\nHousehold context JSON:\n${JSON.stringify(context)}\n\nUser request: ${question}`;
  try {
    const raw = await runModel(c,system,prompt); const envelope = parseEnvelope(raw);
    const actionType = typeof envelope.action?.type === "string" && supported.has(envelope.action.type as ActionType) ? envelope.action.type as ActionType : null;
    const payload = envelope.action?.payload && typeof envelope.action.payload === "object" ? envelope.action.payload as Record<string,unknown> : null;
    if (!actionType || !payload) return c.json({answer:envelope.answer,generatedAt:new Date().toISOString(),requiresConfirmation:false});
    const id=crypto.randomUUID(), expiresAt=new Date(Date.now()+10*60*1000).toISOString();
    await c.env.DB.prepare("INSERT INTO silvi_action_proposals(id,household_id,user_id,action_type,summary,payload_json,expires_at) VALUES(?,?,?,?,?,?,?)").bind(id,a.householdId,a.user.id,actionType,"Review Silvi's proposed household change.",JSON.stringify(payload),expiresAt).run();
    return c.json({answer:envelope.answer,generatedAt:new Date().toISOString(),requiresConfirmation:true,proposal:{id,type:actionType,summary:"Review Silvi's proposed household change.",payload,expiresAt}});
  } catch (error) {
    const timedOut = error instanceof Error && error.message === "AI_TIMEOUT";
    console.error(JSON.stringify({level:"error",event:"silvi_ai_unavailable",requestId:requestId(c),message:error instanceof Error?error.message:"Unknown AI error"}));
    return apiError(c,500,timedOut?"SILVI_TIMEOUT":"SILVI_UNAVAILABLE",timedOut?"Silvi took too long to answer. Please try again.":"Silvi could not reach the AI service right now. Please try again in a moment. Your household data was not changed.");
  }
});

export default app;
