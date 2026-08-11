import { Hono } from "hono";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];
type Priority = "attention" | "helpful" | "idea";
type Relevance = "personal" | "household";
type Step = { label: string; prompt: string; kind: "routine" | "task" | "meal" | "calendar"; benefit: string };
type Insight = {
  id: string;
  fingerprint: string;
  tone: "attention" | "balance" | "planning";
  priority: Priority;
  relevance: Relevance;
  title: string;
  body: string;
  reason: string;
  why: string[];
  steps: Step[];
};

type Access = { householdId: string; user: { id: string; name?: string | null } };

async function access(c: Ctx): Promise<Access | { response: ReturnType<typeof apiError> }> {
  const session = await createAuth(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return { response: apiError(c, 401, "AUTH_REQUIRED", "Sign in to open Silvi suggestions.") };
  const householdId = c.req.param("householdId") ?? "";
  const member = householdId ? await c.env.DB.prepare("SELECT 1 FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(householdId, session.user.id).first() : null;
  if (!member) return { response: apiError(c, 403, "HOUSEHOLD_VIEW_REQUIRED", "You do not have access to this household.") };
  return { householdId, user: session.user };
}

function hash(parts: unknown[]) {
  const text = JSON.stringify(parts);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

async function preferenceMap(c: Ctx, a: Access) {
  const rows = await c.env.DB.prepare("SELECT insight_id insightId,fingerprint,state,snoozed_until snoozedUntil FROM silvi_suggestion_preferences WHERE household_id=? AND user_id=?")
    .bind(a.householdId, a.user.id).all<any>();
  return new Map(rows.results.map((r:any) => [r.insightId, r]));
}

function visible(insight: Insight, pref: any) {
  if (!pref) return true;
  if (pref.fingerprint !== insight.fingerprint) return true;
  if (pref.state === "dismissed") return false;
  if (pref.state === "snoozed" && pref.snoozedUntil && Date.parse(pref.snoozedUntil) > Date.now()) return false;
  return true;
}

async function buildInsights(c: Ctx, a: Access) {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString();
  const today = now.toISOString().slice(0, 10);
  const [members, tasks, routines, events, meals] = await Promise.all([
    c.env.DB.prepare(`SELECT m.user_id userId,u.name FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.household_id=? AND m.status='active' ORDER BY u.name`).bind(a.householdId).all<any>(),
    c.env.DB.prepare(`SELECT id,title,assignee_user_id assigneeUserId,due_at dueAt,priority FROM everyday_tasks WHERE household_id=? AND status='todo'`).bind(a.householdId).all<any>(),
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
    const average = workload.reduce((sum:any,x:any)=>sum+x.open,0) / Math.max(1,workload.length);
    const gap = most.open - least.open;
    if (most.open >= 4 && gap >= 3) {
      const candidateRoutine = routines.results.find((r:any) => r.assigneeUserId === most.userId);
      const candidateTask = tasks.results.find((t:any) => t.assigneeUserId === most.userId);
      const steps: Step[] = [];
      if (candidateRoutine) steps.push({ kind:"routine", label:`Reassign ${candidateRoutine.title}`, benefit:`Moves one recurring responsibility from ${most.name} to ${least.name}.`, prompt:`Prepare a proposal to reassign the routine "${candidateRoutine.title}" from ${most.name} to ${least.name}.` });
      if (candidateTask) steps.push({ kind:"task", label:`Reassign ${candidateTask.title}`, benefit:`Reduces ${most.name}'s current open assignment count by one.`, prompt:`Prepare a proposal to reassign the task "${candidateTask.title}" from ${most.name} to ${least.name}.` });
      const personal = most.userId === a.user.id || least.userId === a.user.id;
      const fingerprint = hash([most.userId, most.open, least.userId, least.open, candidateRoutine?.id, candidateTask?.id]);
      insights.push({
        id:"workload-balance", fingerprint, tone:"balance", priority:gap >= 5 || most.overdue >= 2 ? "attention" : "helpful", relevance:personal?"personal":"household",
        title:personal && most.userId===a.user.id ? "Your assignment load is heavier right now" : `${most.name} has a heavier load`,
        body:`${most.name} has ${most.open} assigned open items while ${least.name} has ${least.open}. The household average is ${average.toFixed(1)}.`,
        reason:"Silvi compares assigned open Tasks and Routines across active household members.",
        why:[`${most.name}: ${most.openTasks} tasks + ${most.openRoutines} routines`,`${least.name}: ${least.openTasks} tasks + ${least.openRoutines} routines`,`${gap} item difference between the highest and lowest load`],
        steps:steps.slice(0,2),
      });
    }
  }

  const eventsByDate = new Map<string, any[]>();
  for (const e of events.results) { const key = String(e.startsAt).slice(0,10); const list = eventsByDate.get(key) ?? []; list.push(e); eventsByDate.set(key,list); }
  for (const [date, dayEvents] of eventsByDate) {
    const evening = dayEvents.filter((e:any) => { const h = new Date(e.startsAt).getHours(); return h >= 15 && h <= 21; });
    if (evening.length >= 2) {
      const dinner = meals.results.find((m:any) => m.mealDate === date && m.mealType === "dinner");
      const steps: Step[] = dinner
        ? [{ kind:"meal", label:`Simplify ${dinner.title}`, benefit:"Keeps dinner planning aligned with a crowded afternoon/evening.", prompt:`It is a busy evening on ${date}. Suggest a simpler dinner than "${dinner.title}" and prepare a meal proposal for ${date} dinner. Keep it practical and do not change anything until I approve.` }]
        : [{ kind:"meal", label:"Plan an easy dinner", benefit:"Removes one decision from an already busy evening.", prompt:`It is a busy evening on ${date}. Prepare a simple practical dinner plan for ${date}. Do not change anything until I approve.` }];
      insights.push({
        id:`busy-evening-${date}`, fingerprint:hash([date,evening.map((e:any)=>e.id),dinner?.id]), tone:"planning", priority:evening.length>=3?"attention":"helpful", relevance:"household",
        title:`Busy evening on ${date}`, body:`There are ${evening.length} calendar events that afternoon/evening${dinner?` and ${dinner.title} is planned for dinner`:" and no dinner is planned yet"}.`,
        reason:"Silvi combines Calendar density with the dinner plan to spot evenings that may need less friction.",
        why:[`${evening.length} events between 15:00 and 21:00`,dinner?`Dinner currently planned: ${dinner.title}`:"No dinner is currently planned"], steps,
      });
      break;
    }
  }

  const overdueRoutines = routines.results.filter((r:any) => r.nextDueAt && Date.parse(r.nextDueAt) < Date.now());
  const myOverdue = overdueRoutines.filter((r:any)=>r.assigneeUserId===a.user.id);
  if (overdueRoutines.length >= 2) {
    const first = myOverdue[0] ?? overdueRoutines[0];
    insights.push({
      id:"overdue-routines", fingerprint:hash(overdueRoutines.map((r:any)=>[r.id,String(r.nextDueAt).slice(0,16)])), tone:"attention", priority:myOverdue.length?"attention":"helpful", relevance:myOverdue.length?"personal":"household",
      title:myOverdue.length?`${myOverdue.length} of your routines are overdue`:`${overdueRoutines.length} routines are overdue`,
      body:"Several recurring jobs are past their next due time and may need attention before they pile up.",
      reason:"Silvi only raises this once multiple active routines are overdue, rather than flagging every small delay.",
      why:[`${overdueRoutines.length} overdue routines household-wide`,...(myOverdue.length?[`${myOverdue.length} assigned to you`]:[])],
      steps:[{ kind:"routine", label:`Review ${first.title}`, benefit:"Helps decide whether to complete, reschedule or rebalance this recurring job.", prompt:`Help me deal with the overdue routine "${first.title}". If reassignment would make sense based on household workload, prepare that proposal; otherwise explain the best next step.` }],
    });
  }

  const unassignedUrgent = tasks.results.filter((t:any)=>!t.assigneeUserId && (t.priority==="high" || (t.dueAt && Date.parse(t.dueAt)-Date.now()<86400000)));
  if (unassignedUrgent.length >= 2) {
    insights.push({
      id:"unassigned-urgent", fingerprint:hash(unassignedUrgent.map((t:any)=>[t.id,t.dueAt,t.priority])), tone:"planning", priority:"helpful", relevance:"household",
      title:`${unassignedUrgent.length} important tasks have no owner`, body:"A few time-sensitive tasks are still unassigned, which can make them easier to miss.",
      reason:"Silvi looks for high-priority or soon-due Tasks that do not have an assignee.",
      why:[`${unassignedUrgent.length} unassigned important tasks`],
      steps:unassignedUrgent.slice(0,2).map((t:any)=>({kind:"task" as const,label:`Assign ${t.title}`,benefit:"Makes responsibility explicit before the task is due.",prompt:`Review the unassigned task "${t.title}" and household workload. Suggest the fairest assignee and prepare only that assignment proposal for me to approve.`})),
    });
  }

  const pref = await preferenceMap(c,a);
  const priorityRank:Record<Priority,number>={attention:0,helpful:1,idea:2};
  const relevanceRank:Record<Relevance,number>={personal:0,household:1};
  const filtered = insights.filter(i=>visible(i,pref.get(i.id))).sort((x,y)=>relevanceRank[x.relevance]-relevanceRank[y.relevance] || priorityRank[x.priority]-priorityRank[y.priority]);
  return { generatedAt:new Date().toISOString(), insights:filtered.slice(0,3), workload };
}

app.get("/api/v1/households/:householdId/silvi/insights", async (c) => {
  const a = await access(c); if ("response" in a) return a.response;
  return c.json(await buildInsights(c,a));
});

app.post("/api/v1/households/:householdId/silvi/insights/:insightId/preference", async (c) => {
  const a = await access(c); if ("response" in a) return a.response;
  const body = await c.req.json().catch(()=>null) as { action?:unknown; minutes?:unknown; fingerprint?:unknown } | null;
  const action = body?.action;
  const insightId = c.req.param("insightId");
  const fingerprint = typeof body?.fingerprint === "string" ? body.fingerprint.slice(0,80) : "";
  if (!fingerprint || (action!=="dismiss" && action!=="snooze" && action!=="clear")) return apiError(c,422,"VALIDATION_FAILED","Choose a valid suggestion preference.");
  if (action === "clear") {
    await c.env.DB.prepare("DELETE FROM silvi_suggestion_preferences WHERE household_id=? AND user_id=? AND insight_id=?").bind(a.householdId,a.user.id,insightId).run();
    return c.json({ok:true});
  }
  const minutes = action === "snooze" ? ([1440,10080].includes(Number(body?.minutes)) ? Number(body?.minutes) : 1440) : null;
  const until = minutes ? new Date(Date.now()+minutes*60000).toISOString() : null;
  await c.env.DB.prepare(`INSERT INTO silvi_suggestion_preferences(household_id,user_id,insight_id,fingerprint,state,snoozed_until,updated_at) VALUES(?,?,?,?,?,?,datetime('now')) ON CONFLICT(household_id,user_id,insight_id) DO UPDATE SET fingerprint=excluded.fingerprint,state=excluded.state,snoozed_until=excluded.snoozed_until,updated_at=datetime('now')`)
    .bind(a.householdId,a.user.id,insightId,fingerprint,action==="dismiss"?"dismissed":"snoozed",until).run();
  return c.json({ok:true,snoozedUntil:until});
});

export default app;
