import { Hono } from "hono";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];
type Step = { label: string; prompt: string; kind: "routine" | "task" | "meal" | "calendar" };
type Insight = { id: string; tone: "attention" | "balance" | "planning"; title: string; body: string; reason: string; steps: Step[] };

async function access(c: Ctx) {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return { response: apiError(c, 401, "AUTH_REQUIRED", "Sign in to open Silvi suggestions.") } as const;
  const householdId = c.req.param("householdId") ?? "";
  const member = householdId ? await c.env.DB.prepare("SELECT 1 FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(householdId, session.user.id).first() : null;
  if (!member) return { response: apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.") } as const;
  return { householdId, user: session.user } as const;
}

app.get("/api/v1/households/:householdId/silvi/insights", async (c) => {
  const a = await access(c); if ("response" in a) return a.response;
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString();
  const today = now.toISOString().slice(0, 10);
  const [members, tasks, routines, events, meals] = await Promise.all([
    c.env.DB.prepare(`SELECT m.user_id userId,u.name FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.household_id=? AND m.status='active' ORDER BY u.name`).bind(a.householdId).all<any>(),
    c.env.DB.prepare(`SELECT id,title,assignee_user_id assigneeUserId,due_at dueAt FROM everyday_tasks WHERE household_id=? AND status='todo'`).bind(a.householdId).all<any>(),
    c.env.DB.prepare(`SELECT id,title,assignee_user_id assigneeUserId,next_due_at nextDueAt FROM household_routines WHERE household_id=? AND active=1`).bind(a.householdId).all<any>(),
    c.env.DB.prepare(`SELECT id,title,starts_at startsAt,ends_at endsAt FROM everyday_events WHERE household_id=? AND starts_at>=? AND starts_at<=? ORDER BY starts_at`).bind(a.householdId, now.toISOString(), weekEnd).all<any>(),
    c.env.DB.prepare(`SELECT id,meal_date mealDate,meal_type mealType,title FROM meal_plans WHERE household_id=? AND meal_date>=? AND meal_date<=date(?, '+7 day')`).bind(a.householdId, today, today).all<any>(),
  ]);

  const insights: Insight[] = [];
  const workload = members.results.map((m:any) => {
    const openTasks = tasks.results.filter((t:any) => t.assigneeUserId === m.userId).length;
    const openRoutines = routines.results.filter((r:any) => r.assigneeUserId === m.userId).length;
    const overdue = routines.results.filter((r:any) => r.assigneeUserId === m.userId && r.nextDueAt && Date.parse(r.nextDueAt) < Date.now()).length;
    return { ...m, open: openTasks + openRoutines, openTasks, openRoutines, overdue };
  });
  if (workload.length >= 2) {
    const sorted = [...workload].sort((x,y) => y.open - x.open);
    const most = sorted[0], least = sorted[sorted.length - 1];
    if (most.open >= least.open + 3) {
      const candidateRoutine = routines.results.find((r:any) => r.assigneeUserId === most.userId);
      const candidateTask = tasks.results.find((t:any) => t.assigneeUserId === most.userId);
      const steps: Step[] = [];
      if (candidateRoutine) steps.push({ kind:"routine", label:`Reassign ${candidateRoutine.title}`, prompt:`Prepare a proposal to reassign the routine "${candidateRoutine.title}" from ${most.name} to ${least.name}.` });
      if (candidateTask) steps.push({ kind:"task", label:`Reassign ${candidateTask.title}`, prompt:`Prepare a proposal to reassign the task "${candidateTask.title}" from ${most.name} to ${least.name}.` });
      insights.push({ id:"workload-balance", tone:"balance", title:`${most.name} has a heavier load`, body:`${most.name} has ${most.open} assigned open items while ${least.name} has ${least.open}.`, reason:"Silvi noticed an assignment imbalance across open tasks and routines.", steps:steps.slice(0,2) });
    }
  }

  const eventsByDate = new Map<string, any[]>();
  for (const e of events.results) {
    const key = String(e.startsAt).slice(0,10);
    const list = eventsByDate.get(key) ?? []; list.push(e); eventsByDate.set(key,list);
  }
  for (const [date, dayEvents] of eventsByDate) {
    const evening = dayEvents.filter((e:any) => { const h = new Date(e.startsAt).getHours(); return h >= 15 && h <= 21; });
    if (evening.length >= 2) {
      const dinner = meals.results.find((m:any) => m.mealDate === date && m.mealType === "dinner");
      const steps: Step[] = dinner
        ? [{ kind:"meal", label:`Simplify ${dinner.title}`, prompt:`It is a busy evening on ${date}. Suggest a simpler dinner than "${dinner.title}" and prepare a meal proposal for ${date} dinner. Keep it practical and do not change anything until I approve.` }]
        : [{ kind:"meal", label:"Plan an easy dinner", prompt:`It is a busy evening on ${date}. Prepare a simple practical dinner plan for ${date}. Do not change anything until I approve.` }];
      insights.push({ id:`busy-evening-${date}`, tone:"planning", title:`Busy evening on ${date}`, body:`There are ${evening.length} calendar events that afternoon/evening${dinner?` and ${dinner.title} is planned for dinner`:" and no dinner is planned yet"}.`, reason:"Silvi combined Calendar and Meals to spot a potentially rushed evening.", steps });
      break;
    }
  }

  const overdueRoutines = routines.results.filter((r:any) => r.nextDueAt && Date.parse(r.nextDueAt) < Date.now());
  if (overdueRoutines.length >= 2) {
    const first = overdueRoutines[0];
    insights.push({ id:"overdue-routines", tone:"attention", title:`${overdueRoutines.length} routines are overdue`, body:"A few recurring jobs may need attention before they pile up.", reason:"Silvi noticed multiple routines past their next due time.", steps:[{ kind:"routine", label:`Review ${first.title}`, prompt:`Help me deal with the overdue routine "${first.title}". If reassignment would make sense based on household workload, prepare that proposal; otherwise explain the best next step.` }] });
  }

  return c.json({ generatedAt:new Date().toISOString(), insights:insights.slice(0,4), workload });
});

export default app;
