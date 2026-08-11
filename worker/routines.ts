import { Hono } from "hono";
import { createAuth } from "./auth";
import { recordHouseholdActivity } from "./activity";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];
type Access = { user:{id:string;name?:string|null}; householdId:string; canManage:boolean; response?:never } | { response:ReturnType<typeof apiError> };
type RotationMode = "none" | "round_robin";

async function access(c:Ctx):Promise<Access>{
  const session=await createAuth(c.env,c.req.raw).api.getSession({headers:c.req.raw.headers});
  if(!session?.user)return{response:apiError(c,401,"AUTH_REQUIRED","Sign in to continue.")};
  const householdId=c.req.param("householdId")??"";
  if(!householdId)return{response:apiError(c,404,"HOUSEHOLD_NOT_FOUND","That household could not be found.")};
  const member=await c.env.DB.prepare("SELECT role_key role FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(householdId,session.user.id).first<{role:string}>();
  if(!member)return{response:apiError(c,403,"HOUSEHOLD_VIEW_REQUIRED","You do not have access to this household.")};
  return{user:session.user,householdId,canManage:["owner","admin","adult","teen"].includes(member.role)};
}
function nextDue(current:string|null,cadence:string){const d=current?new Date(current):new Date();if(Number.isNaN(d.getTime()))return null;if(cadence==="daily")d.setDate(d.getDate()+1);else if(cadence==="monthly")d.setMonth(d.getMonth()+1);else d.setDate(d.getDate()+7);return d.toISOString()}
function timing(nextDueAt:string|null){if(!nextDueAt)return"unscheduled";const delta=new Date(nextDueAt).getTime()-Date.now();if(delta<0)return"overdue";if(delta<=86400000)return"today";if(delta<=259200000)return"soon";return"later"}
function actorName(user:{name?:string|null}){return user.name??"A household member"}
function parseRotation(raw:unknown){if(typeof raw!=="string"||!raw)return[] as string[];try{const value=JSON.parse(raw);return Array.isArray(value)?value.filter(x=>typeof x==="string"):[]}catch{return[]}}
async function validateRotationMembers(c:Ctx,householdId:string,ids:string[]){const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return[];const placeholders=unique.map(()=>"?").join(",");const rows=await c.env.DB.prepare(`SELECT user_id userId FROM memberships WHERE household_id=? AND status='active' AND user_id IN (${placeholders})`).bind(householdId,...unique).all<{userId:string}>();return rows.results.map(x=>x.userId)}
async function issueReminders(c:Ctx,householdId:string,userId:string){
  const rows=await c.env.DB.prepare(`SELECT id,title,next_due_at nextDueAt,reminder_minutes reminderMinutes,snoozed_until snoozedUntil,last_notified_due_at lastNotifiedDueAt FROM household_routines WHERE household_id=? AND active=1 AND assignee_user_id=? AND next_due_at IS NOT NULL`).bind(householdId,userId).all<any>();
  const now=Date.now();let count=0;
  for(const r of rows.results){const due=new Date(r.nextDueAt).getTime(),snooze=r.snoozedUntil?new Date(r.snoozedUntil).getTime():0,reminder=Number(r.reminderMinutes??0)*60000;const ready=Number.isFinite(due)&&now>=due-reminder&&(!snooze||now>=snooze)&&r.lastNotifiedDueAt!==r.nextDueAt;if(!ready)continue;await c.env.DB.batch([c.env.DB.prepare("INSERT INTO household_notifications(id,household_id,user_id,actor_user_id,category,kind,title,body,entity_type,entity_id,direct) VALUES(?,?,?,?,?,?,?,?,?,?,1)").bind(crypto.randomUUID(),householdId,userId,null,"assignment",now>due?"routine.overdue":"routine.due","Routine needs your attention",r.title,"routine",r.id),c.env.DB.prepare("UPDATE household_routines SET last_notified_due_at=?,updated_at=datetime('now') WHERE id=? AND household_id=?").bind(r.nextDueAt,r.id,householdId)]);count++}
  return count;
}

app.get("/api/v1/households/:householdId/routines",async c=>{
  const a=await access(c);if("response" in a)return a.response;await issueReminders(c,a.householdId,a.user.id);
  const[routines,members,recent]=await Promise.all([
    c.env.DB.prepare(`SELECT r.id,r.title,r.notes,r.cadence,r.assignee_user_id assigneeUserId,u.name assigneeName,r.next_due_at nextDueAt,r.reminder_minutes reminderMinutes,r.snoozed_until snoozedUntil,r.active,r.created_at createdAt,r.rotation_mode rotationMode,r.rotation_member_ids rotationMemberIds,r.rotation_index rotationIndex,(SELECT MAX(completed_at) FROM household_routine_completions x WHERE x.routine_id=r.id) lastCompletedAt FROM household_routines r LEFT JOIN "user" u ON u.id=r.assignee_user_id WHERE r.household_id=? AND r.active=1 ORDER BY CASE WHEN r.next_due_at IS NULL THEN 1 ELSE 0 END,r.next_due_at,r.title`).bind(a.householdId).all(),
    c.env.DB.prepare(`SELECT m.user_id userId,u.name FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.household_id=? AND m.status='active' ORDER BY u.name`).bind(a.householdId).all(),
    c.env.DB.prepare(`SELECT x.id,r.title,u.name completedByName,x.completed_at completedAt FROM household_routine_completions x JOIN household_routines r ON r.id=x.routine_id JOIN "user" u ON u.id=x.completed_by WHERE x.household_id=? ORDER BY x.completed_at DESC LIMIT 12`).bind(a.householdId).all()
  ]);
  const memberNames=new Map((members.results as any[]).map(m=>[m.userId,m.name]));
  const list=routines.results.map((r:any)=>{const rotationMemberIds=parseRotation(r.rotationMemberIds);return{...r,active:Boolean(r.active),timingState:timing(r.nextDueAt),assignedToMe:r.assigneeUserId===a.user.id,rotationMode:r.rotationMode||"none",rotationMemberIds,rotationMembers:rotationMemberIds.map(id=>({userId:id,name:memberNames.get(id)||"Household member"}))}});
  const workload=(members.results as any[]).map(m=>({userId:m.userId,name:m.name,open:list.filter((r:any)=>r.assigneeUserId===m.userId).length,overdue:list.filter((r:any)=>r.assigneeUserId===m.userId&&r.timingState==="overdue").length}));
  return c.json({routines:list,members:members.results,recent:recent.results,canManage:a.canManage,summary:{active:list.length,overdue:list.filter((r:any)=>r.timingState==="overdue").length,dueToday:list.filter((r:any)=>r.timingState==="today").length,mine:list.filter((r:any)=>r.assignedToMe).length,completedThisWeek:recent.results.filter((r:any)=>Date.now()-new Date(r.completedAt).getTime()<=7*86400000).length,workload}});
});

app.post("/api/v1/households/:householdId/routines",async c=>{
  const a=await access(c);if("response" in a)return a.response;if(!a.canManage)return apiError(c,403,"ROUTINES_MANAGE_REQUIRED","You do not have permission to manage routines.");
  const b=await c.req.json().catch(()=>null) as any;const title=typeof b?.title==="string"?b.title.trim():"";const cadence=["daily","weekly","monthly"].includes(b?.cadence)?b.cadence:"weekly";
  if(!title||title.length>160)return apiError(c,422,"VALIDATION_FAILED","Routine title must be between 1 and 160 characters.");
  const requestedMode:RotationMode=b?.rotationMode==="round_robin"?"round_robin":"none";const requestedIds=Array.isArray(b?.rotationMemberIds)?b.rotationMemberIds.filter((x:unknown)=>typeof x==="string"):[];const validIds=await validateRotationMembers(c,a.householdId,requestedIds as string[]);const rotationMode=requestedMode==="round_robin"&&validIds.length>=2?"round_robin":"none";const rotationMemberIds=rotationMode==="round_robin"?validIds:[];
  let assignee=typeof b?.assigneeUserId==="string"&&b.assigneeUserId?b.assigneeUserId:null;if(rotationMode==="round_robin")assignee=rotationMemberIds[0]??null;
  if(assignee){const m=await c.env.DB.prepare("SELECT 1 FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(a.householdId,assignee).first();if(!m)return apiError(c,422,"ASSIGNEE_NOT_MEMBER","Choose an active household member.")}
  const due=typeof b?.nextDueAt==="string"&&b.nextDueAt&&!Number.isNaN(Date.parse(b.nextDueAt))?new Date(b.nextDueAt).toISOString():null;const reminder=typeof b?.reminderMinutes==="number"?Math.max(0,Math.min(10080,b.reminderMinutes)):null;const id=crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO household_routines(id,household_id,title,notes,cadence,assignee_user_id,next_due_at,reminder_minutes,created_by,rotation_mode,rotation_member_ids,rotation_index) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,a.householdId,title,typeof b?.notes==="string"?b.notes.trim().slice(0,1200)||null:null,cadence,assignee,due,reminder,a.user.id,rotationMode,rotationMemberIds.length?JSON.stringify(rotationMemberIds):null,0).run();
  await recordHouseholdActivity(c,a.householdId,a.user.id,"routine.add",`${actorName(a.user)} added routine “${title}”.`);return c.json({id},201);
});

app.patch("/api/v1/households/:householdId/routines/:routineId",async c=>{
  const a=await access(c);if("response" in a)return a.response;if(!a.canManage)return apiError(c,403,"ROUTINES_MANAGE_REQUIRED","You do not have permission to manage routines.");
  const b=await c.req.json().catch(()=>null) as any;const routine=await c.env.DB.prepare("SELECT id,title,assignee_user_id assigneeUserId,rotation_mode rotationMode,rotation_member_ids rotationMemberIds,rotation_index rotationIndex FROM household_routines WHERE id=? AND household_id=? AND active=1").bind(c.req.param("routineId"),a.householdId).first<any>();if(!routine)return apiError(c,404,"ROUTINE_NOT_FOUND","That routine could not be found.");
  let rotationMode:RotationMode=routine.rotationMode==="round_robin"?"round_robin":"none";let rotationIds=parseRotation(routine.rotationMemberIds);let rotationIndex=Number(routine.rotationIndex||0);let assignee=typeof b?.assigneeUserId==="string"&&b.assigneeUserId?b.assigneeUserId:routine.assigneeUserId;
  if(Object.prototype.hasOwnProperty.call(b||{},"rotationMode")||Object.prototype.hasOwnProperty.call(b||{},"rotationMemberIds")){const requestedMode:RotationMode=b?.rotationMode==="round_robin"?"round_robin":"none";const requested=Array.isArray(b?.rotationMemberIds)?b.rotationMemberIds.filter((x:unknown)=>typeof x==="string"):rotationIds;rotationIds=await validateRotationMembers(c,a.householdId,requested as string[]);rotationMode=requestedMode==="round_robin"&&rotationIds.length>=2?"round_robin":"none";rotationIndex=0;if(rotationMode==="round_robin")assignee=rotationIds[0]??null;else rotationIds=[]}
  if(assignee){const m=await c.env.DB.prepare("SELECT 1 FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(a.householdId,assignee).first();if(!m)return apiError(c,422,"ASSIGNEE_NOT_MEMBER","Choose an active household member.")}
  const due=typeof b?.nextDueAt==="string"&&b.nextDueAt&&!Number.isNaN(Date.parse(b.nextDueAt))?new Date(b.nextDueAt).toISOString():null;
  await c.env.DB.prepare("UPDATE household_routines SET assignee_user_id=?,next_due_at=COALESCE(?,next_due_at),reminder_minutes=COALESCE(?,reminder_minutes),rotation_mode=?,rotation_member_ids=?,rotation_index=?,last_notified_due_at=NULL,snoozed_until=NULL,updated_at=datetime('now') WHERE id=? AND household_id=?").bind(assignee,due,typeof b?.reminderMinutes==="number"?b.reminderMinutes:null,rotationMode,rotationIds.length?JSON.stringify(rotationIds):null,rotationIndex,routine.id,a.householdId).run();
  await recordHouseholdActivity(c,a.householdId,a.user.id,"routine.updated",`${actorName(a.user)} updated “${routine.title}”.`);return c.json({ok:true});
});

app.post("/api/v1/households/:householdId/routines/:routineId/snooze",async c=>{const a=await access(c);if("response" in a)return a.response;const b=await c.req.json().catch(()=>null) as any;const minutes=[60,180,1440].includes(Number(b?.minutes))?Number(b.minutes):60;const until=new Date(Date.now()+minutes*60000).toISOString();const result=await c.env.DB.prepare("UPDATE household_routines SET snoozed_until=?,last_notified_due_at=NULL,updated_at=datetime('now') WHERE id=? AND household_id=? AND active=1 AND (assignee_user_id=? OR ?=1)").bind(until,c.req.param("routineId"),a.householdId,a.user.id,a.canManage?1:0).run();if(!result.meta.changes)return apiError(c,403,"ROUTINE_SNOOZE_REQUIRED","You cannot snooze that routine.");return c.json({snoozedUntil:until})});

app.post("/api/v1/households/:householdId/routines/:routineId/complete",async c=>{
  const a=await access(c);if("response" in a)return a.response;const routine=await c.env.DB.prepare("SELECT id,title,cadence,next_due_at nextDueAt,assignee_user_id assigneeUserId,rotation_mode rotationMode,rotation_member_ids rotationMemberIds,rotation_index rotationIndex FROM household_routines WHERE id=? AND household_id=? AND active=1").bind(c.req.param("routineId"),a.householdId).first<any>();if(!routine)return apiError(c,404,"ROUTINE_NOT_FOUND","That routine could not be found.");if(routine.assigneeUserId&&routine.assigneeUserId!==a.user.id&&!a.canManage)return apiError(c,403,"ROUTINE_ASSIGNEE_REQUIRED","This routine is assigned to another household member.");
  const ids=parseRotation(routine.rotationMemberIds);let nextAssignee=routine.assigneeUserId;let nextIndex=Number(routine.rotationIndex||0);if(routine.rotationMode==="round_robin"&&ids.length>=2){const currentIndex=Math.max(0,ids.indexOf(routine.assigneeUserId));nextIndex=(currentIndex+1)%ids.length;nextAssignee=ids[nextIndex]}
  await c.env.DB.batch([c.env.DB.prepare("INSERT INTO household_routine_completions(id,routine_id,household_id,completed_by) VALUES(?,?,?,?)").bind(crypto.randomUUID(),routine.id,a.householdId,a.user.id),c.env.DB.prepare("UPDATE household_routines SET next_due_at=?,assignee_user_id=?,rotation_index=?,snoozed_until=NULL,last_notified_due_at=NULL,updated_at=datetime('now') WHERE id=?").bind(nextDue(routine.nextDueAt,routine.cadence),nextAssignee,nextIndex,routine.id)]);
  await recordHouseholdActivity(c,a.householdId,a.user.id,"routine.completed",`${actorName(a.user)} completed “${routine.title}”.`);return c.json({ok:true,nextAssigneeUserId:nextAssignee});
});

app.delete("/api/v1/households/:householdId/routines/:routineId",async c=>{const a=await access(c);if("response" in a)return a.response;if(!a.canManage)return apiError(c,403,"ROUTINES_MANAGE_REQUIRED","You do not have permission to manage routines.");const result=await c.env.DB.prepare("UPDATE household_routines SET active=0,updated_at=datetime('now') WHERE id=? AND household_id=?").bind(c.req.param("routineId"),a.householdId).run();if(!result.meta.changes)return apiError(c,404,"ROUTINE_NOT_FOUND","That routine could not be found.");return c.json({deleted:true})});
export default app;
