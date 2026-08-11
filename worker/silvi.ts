import { Hono } from "hono";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app=new Hono<AppBindings>();
type Ctx=Parameters<typeof apiError>[0];

async function access(c:Ctx){
 const session=await createAuth(c.env,c.req.raw).api.getSession({headers:c.req.raw.headers});
 if(!session?.user)return{response:apiError(c,401,"AUTH_REQUIRED","Sign in to ask Silvi about your household.")};
 const householdId=c.req.param("householdId")??"";
 if(!householdId)return{response:apiError(c,404,"HOUSEHOLD_NOT_FOUND","That household could not be found.")};
 const membership=await c.env.DB.prepare("SELECT role_key role FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(householdId,session.user.id).first<{role:string}>();
 if(!membership)return{response:apiError(c,403,"HOUSEHOLD_VIEW_REQUIRED","You do not have access to this household.")};
 return{user:session.user,householdId};
}

function isoNow(){return new Date().toISOString()}
function clean(value:unknown,max=500){return typeof value==="string"?value.trim().slice(0,max):""}

async function context(c:Ctx,householdId:string,userId:string){
 const now=isoNow();
 const today=now.slice(0,10);
 const weekEnd=new Date(Date.now()+7*86400000).toISOString();
 const [household,tasks,events,meals,routines,activity]=await Promise.all([
  c.env.DB.prepare("SELECT name,default_language defaultLanguage,timezone FROM households WHERE id=?").bind(householdId).first(),
  c.env.DB.prepare(`SELECT t.title,t.notes,t.priority,t.due_at dueAt,t.status,t.assignee_user_id assigneeUserId,u.name assigneeName FROM everyday_tasks t LEFT JOIN "user" u ON u.id=t.assignee_user_id WHERE t.household_id=? AND t.status='todo' ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,t.due_at LIMIT 30`).bind(householdId).all(),
  c.env.DB.prepare(`SELECT title,description,location,starts_at startsAt,ends_at endsAt,all_day allDay,event_type eventType FROM everyday_events WHERE household_id=? AND starts_at>=? AND starts_at<=? ORDER BY starts_at LIMIT 30`).bind(householdId,now,weekEnd).all(),
  c.env.DB.prepare(`SELECT p.meal_date mealDate,p.meal_type mealType,p.title,u.name cookName,p.notes FROM meal_plans p LEFT JOIN "user" u ON u.id=p.cook_user_id WHERE p.household_id=? AND p.meal_date>=? AND p.meal_date<=date(?, '+7 day') ORDER BY p.meal_date,CASE p.meal_type WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'dinner' THEN 2 ELSE 3 END LIMIT 40`).bind(householdId,today,today).all(),
  c.env.DB.prepare(`SELECT r.title,r.notes,r.cadence,r.next_due_at nextDueAt,r.reminder_minutes reminderMinutes,r.assignee_user_id assigneeUserId,u.name assigneeName,CASE WHEN r.next_due_at IS NOT NULL AND r.next_due_at<? THEN 1 ELSE 0 END overdue FROM household_routines r LEFT JOIN "user" u ON u.id=r.assignee_user_id WHERE r.household_id=? AND r.active=1 ORDER BY CASE WHEN r.next_due_at IS NULL THEN 1 ELSE 0 END,r.next_due_at LIMIT 30`).bind(now,householdId).all(),
  c.env.DB.prepare(`SELECT kind,summary,created_at createdAt FROM household_activity WHERE household_id=? ORDER BY created_at DESC LIMIT 15`).bind(householdId).all().catch(()=>({results:[]} as any)),
 ]);
 const mineTasks=(tasks.results as any[]).filter(x=>x.assigneeUserId===userId);
 const mineRoutines=(routines.results as any[]).filter(x=>x.assigneeUserId===userId);
 return{
  household,
  currentTime:now,
  summary:{openTasks:tasks.results.length,myOpenTasks:mineTasks.length,upcomingEvents:events.results.length,plannedMeals:meals.results.length,activeRoutines:routines.results.length,myRoutines:mineRoutines.length,overdueRoutines:(routines.results as any[]).filter(x=>Boolean(x.overdue)).length},
  tasks:tasks.results,
  upcomingEvents:events.results,
  meals:meals.results,
  routines:routines.results,
  recentActivity:(activity as any).results??[],
 };
}

app.get("/api/v1/households/:householdId/silvi/context",async c=>{
 const a=await access(c);if(a.response)return a.response;
 return c.json(await context(c,a.householdId,a.user.id));
});

app.post("/api/v1/households/:householdId/silvi/ask",async c=>{
 const a=await access(c);if(a.response)return a.response;
 const body=await c.req.json().catch(()=>null) as {question?:unknown}|null;
 const question=clean(body?.question,700);
 if(!question)return apiError(c,422,"VALIDATION_FAILED","Ask Silvi a household question.");
 const householdContext=await context(c,a.householdId,a.user.id);
 const system=`You are Silvi, the private household assistant inside Kit Hub. Answer only from the supplied household context. Be warm, concise and practical. Never invent events, tasks, meals, assignments or routines. If the context does not contain the answer, say so clearly. Distinguish the current user from other household members. Do not claim to have changed anything; this version of Silvi is read-only. Dates should be explained naturally. Prefer short summaries and call out overdue or time-sensitive items when relevant.`;
 const prompt=`Current user: ${a.user.name ?? "Household member"}\nHousehold context JSON:\n${JSON.stringify(householdContext)}\n\nQuestion: ${question}`;
 try{
  const result:any=await c.env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast",{messages:[{role:"system",content:system},{role:"user",content:prompt}],max_tokens:500,temperature:.2});
  const answer=clean(result?.response??result?.result?.response??result?.text,4000);
  if(!answer)return apiError(c,500,"SILVI_EMPTY_RESPONSE","Silvi could not form an answer yet.");
  return c.json({answer,generatedAt:isoNow(),readOnly:true});
 }catch{
  return apiError(c,500,"SILVI_UNAVAILABLE","Silvi is unavailable right now. Your household data was not changed.");
 }
});

export default app;
