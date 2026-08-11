import { Hono } from "hono";
import { createAuth } from "./auth";
import { apiError, type AppBindings } from "./http";

const app = new Hono<AppBindings>();
type Ctx = Parameters<typeof apiError>[0];
type Priority = "attention" | "helpful" | "idea";
type Relevance = "personal" | "household";
type Step = { label: string; prompt: string; kind: "routine" | "task" | "meal" | "calendar"; benefit: string };
type Insight = { id:string; fingerprint:string; tone:"attention"|"balance"|"planning"; priority:Priority; relevance:Relevance; title:string; body:string; reason:string; why:string[]; steps:Step[] };
type Access = { householdId:string; user:{id:string;name?:string|null} };

type TaskRow={id:string;title:string;assigneeUserId:string|null;dueAt:string|null;priority:"low"|"normal"|"high";createdAt:string};
type RoutineRow={id:string;title:string;assigneeUserId:string|null;nextDueAt:string|null;cadence:string};
type EventRow={id:string;title:string;startsAt:string;endsAt:string|null;allDay:number};
type MealRow={id:string;mealDate:string;mealType:string;title:string;cookUserId:string|null};
type MemberRow={userId:string;name:string};

async function access(c:Ctx):Promise<Access|{response:ReturnType<typeof apiError>}>{
 const session=await createAuth(c.env,c.req.raw).api.getSession({headers:c.req.raw.headers});
 if(!session?.user)return{response:apiError(c,401,"AUTH_REQUIRED","Sign in to open Silvi suggestions.")};
 const householdId=c.req.param("householdId")??"";
 const member=householdId?await c.env.DB.prepare("SELECT 1 FROM memberships WHERE household_id=? AND user_id=? AND status='active'").bind(householdId,session.user.id).first():null;
 if(!member)return{response:apiError(c,403,"HOUSEHOLD_VIEW_REQUIRED","You do not have access to this household.")};
 return{householdId,user:session.user};
}

function hash(parts:unknown[]){const text=JSON.stringify(parts);let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(36)}
function dayKey(value:string){return String(value).slice(0,10)}
function fmtTime(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
function daysBetween(a:number,b:number){return Math.floor(Math.abs(a-b)/86400000)}
function eventEnd(event:EventRow){const start=Date.parse(event.startsAt);const end=event.endsAt?Date.parse(event.endsAt):start+3600000;return Number.isFinite(end)?end:start+3600000}
function eventStart(event:EventRow){return Date.parse(event.startsAt)}
function overlapMinutes(a:EventRow,b:EventRow){const start=Math.max(eventStart(a),eventStart(b));const end=Math.min(eventEnd(a),eventEnd(b));return Math.max(0,Math.round((end-start)/60000))}
function turnaroundMinutes(a:EventRow,b:EventRow){const first=eventStart(a)<=eventStart(b)?a:b;const second=first===a?b:a;return Math.round((eventStart(second)-eventEnd(first))/60000)}

async function preferenceMap(c:Ctx,a:Access){
 const rows=await c.env.DB.prepare("SELECT insight_id insightId,fingerprint,state,snoozed_until snoozedUntil FROM silvi_suggestion_preferences WHERE household_id=? AND user_id=?")
  .bind(a.householdId,a.user.id).all<any>();
 return new Map(rows.results.map((r:any)=>[r.insightId,r]));
}
function visible(insight:Insight,pref:any){
 if(!pref||pref.fingerprint!==insight.fingerprint)return true;
 if(pref.state==="dismissed")return false;
 if(pref.state==="snoozed"&&pref.snoozedUntil&&Date.parse(pref.snoozedUntil)>Date.now())return false;
 return true;
}

function taskAttentionScore(task:TaskRow,nowMs:number,currentUserId:string){
 let score=0;
 const age=daysBetween(nowMs,Date.parse(task.createdAt));
 if(task.priority==="high")score+=4; else if(task.priority==="normal")score+=1;
 if(task.dueAt){
  const delta=Date.parse(task.dueAt)-nowMs;
  if(delta<-7*86400000)score+=7;
  else if(delta<-2*86400000)score+=5;
  else if(delta<0)score+=3;
  else if(delta<86400000)score+=2;
 }else{
  if(age>=30)score+=5; else if(age>=14)score+=3; else if(age>=7)score+=1;
 }
 if(!task.assigneeUserId)score+=2;
 if(task.assigneeUserId===currentUserId)score+=2;
 return score;
}

function eveningPressure(events:EventRow[],tasks:TaskRow[],date:string,nowMs:number,currentUserId:string){
 const evening=events.filter(e=>dayKey(e.startsAt)===date&&!e.allDay&&new Date(e.startsAt).getHours()>=15&&new Date(e.startsAt).getHours()<=21);
 const dueTasks=tasks.filter(t=>t.dueAt&&dayKey(t.dueAt)===date);
 const myDue=dueTasks.filter(t=>t.assigneeUserId===currentUserId).length;
 let score=evening.length*2+dueTasks.length+myDue;
 const ordered=[...evening].sort((a,b)=>eventStart(a)-eventStart(b));
 for(let i=1;i<ordered.length;i++){const gap=turnaroundMinutes(ordered[i-1],ordered[i]);if(gap<0)score+=4;else if(gap<=30)score+=2;else if(gap<=60)score+=1}
 return{score,evening,dueTasks,myDue};
}

async function buildInsights(c:Ctx,a:Access){
 const now=new Date(),nowMs=now.getTime(),weekEnd=new Date(nowMs+7*86400000).toISOString(),today=now.toISOString().slice(0,10),monthAgo=new Date(nowMs-30*86400000).toISOString();
 const[members,tasksResult,routinesResult,eventsResult,mealsResult,completions]=await Promise.all([
  c.env.DB.prepare(`SELECT m.user_id userId,u.name FROM memberships m JOIN "user" u ON u.id=m.user_id WHERE m.household_id=? AND m.status='active' ORDER BY u.name`).bind(a.householdId).all<MemberRow>(),
  c.env.DB.prepare(`SELECT id,title,assignee_user_id assigneeUserId,due_at dueAt,priority,created_at createdAt FROM everyday_tasks WHERE household_id=? AND status='todo'`).bind(a.householdId).all<TaskRow>(),
  c.env.DB.prepare(`SELECT id,title,assignee_user_id assigneeUserId,next_due_at nextDueAt,cadence FROM household_routines WHERE household_id=? AND active=1`).bind(a.householdId).all<RoutineRow>(),
  c.env.DB.prepare(`SELECT id,title,starts_at startsAt,ends_at endsAt,all_day allDay FROM everyday_events WHERE household_id=? AND starts_at>=? AND starts_at<=? ORDER BY starts_at`).bind(a.householdId,now.toISOString(),weekEnd).all<EventRow>(),
  c.env.DB.prepare(`SELECT id,meal_date mealDate,meal_type mealType,title,cook_user_id cookUserId FROM meal_plans WHERE household_id=? AND meal_date>=? AND meal_date<=date(?, '+7 day')`).bind(a.householdId,today,today).all<MealRow>(),
  c.env.DB.prepare(`SELECT completed_by completedBy,COUNT(*) count FROM household_routine_completions WHERE household_id=? AND completed_at>=? GROUP BY completed_by`).bind(a.householdId,monthAgo).all<any>(),
 ]);
 const members=members.results,tasks=tasksResult.results,routines=routinesResult.results,events=eventsResult.results,meals=mealsResult.results;
 const insights:Insight[]=[];
 const completionMap=new Map(completions.results.map((x:any)=>[x.completedBy,Number(x.count)]));
 const workload=members.map(m=>{const openTasks=tasks.filter(t=>t.assigneeUserId===m.userId).length,openRoutines=routines.filter(r=>r.assigneeUserId===m.userId).length,overdue=routines.filter(r=>r.assigneeUserId===m.userId&&r.nextDueAt&&Date.parse(r.nextDueAt)<nowMs).length,completed30=completionMap.get(m.userId)??0;return{...m,open:openTasks+openRoutines,openTasks,openRoutines,overdue,completed30}});

 // Personalized day-by-day weekly briefing.
 const briefingLines:string[]=[];
 let busiestDay:{date:string;score:number;events:number;tasks:number;mine:number}|null=null;
 for(let offset=0;offset<7;offset++){
  const d=new Date(nowMs+offset*86400000);const date=d.toISOString().slice(0,10);const label=offset===0?"Today":offset===1?"Tomorrow":d.toLocaleDateString([], {weekday:"short"});
  const dayEvents=events.filter(e=>dayKey(e.startsAt)===date);
  const dayTasks=tasks.filter(t=>t.dueAt&&dayKey(t.dueAt)===date);
  const myTasks=dayTasks.filter(t=>t.assigneeUserId===a.user.id);
  const dayRoutines=routines.filter(r=>r.nextDueAt&&dayKey(r.nextDueAt)===date);
  const dinner=meals.find(m=>m.mealDate===date&&m.mealType==="dinner");
  const pressure=eveningPressure(events,tasks,date,nowMs,a.user.id);
  if(!busiestDay||pressure.score>busiestDay.score)busiestDay={date,score:pressure.score,events:pressure.evening.length,tasks:pressure.dueTasks.length,mine:pressure.myDue};
  if(dayEvents.length||dayTasks.length||dayRoutines.length||dinner){
   const personal=myTasks.length?` · ${myTasks.length} assigned to you`:"";
   briefingLines.push(`${label}: ${dayEvents.length} event${dayEvents.length===1?"":"s"}, ${dayTasks.length} due task${dayTasks.length===1?"":"s"}${personal}, ${dayRoutines.length} routine${dayRoutines.length===1?"":"s"}${dinner?` · dinner: ${dinner.title}`:""}`);
  }
 }
 const overdueTasks=tasks.filter(t=>t.dueAt&&Date.parse(t.dueAt)<nowMs);
 const overdueRoutines=routines.filter(r=>r.nextDueAt&&Date.parse(r.nextDueAt)<nowMs);
 const mineOverdue=overdueTasks.filter(t=>t.assigneeUserId===a.user.id).length+overdueRoutines.filter(r=>r.assigneeUserId===a.user.id).length;
 const dinnerCount=meals.filter(m=>m.mealType==="dinner").length;
 insights.push({
  id:"weekly-briefing",
  fingerprint:hash([today,briefingLines,overdueTasks.length,overdueRoutines.length,dinnerCount]),
  tone:"planning",
  priority:mineOverdue>0||overdueTasks.length+overdueRoutines.length>3?"attention":"idea",
  relevance:"personal",
  title:"Your next 7 days, day by day",
  body:`${events.length} events, ${tasks.filter(t=>t.dueAt&&Date.parse(t.dueAt)>=nowMs&&Date.parse(t.dueAt)<=nowMs+7*86400000).length} tasks due, ${overdueTasks.length+overdueRoutines.length} overdue items and ${dinnerCount} dinners planned.`,
  reason:"Silvi now organizes the household week by day and highlights what is specifically assigned to you.",
  why:[...(briefingLines.length?briefingLines:["No dated household plans are currently recorded for the next 7 days."]),mineOverdue?`${mineOverdue} overdue item${mineOverdue===1?" is":"s are"} assigned to you`:"Nothing overdue is currently assigned to you"],
  steps:[{kind:"calendar",label:"Open a practical weekly briefing",benefit:"Turns the overview into a concise plan with busy days, personal responsibilities and meal gaps.",prompt:"Give me a concise day-by-day household briefing for the next 7 days. Prioritize anything assigned to me, hard Calendar conflicts, tight turnarounds, overdue work, and dinner planning. Do not change anything."}]
 });

 // Fairer work balancing using current load plus completed routines.
 if(workload.length>=2){
  const sorted=[...workload].sort((x:any,y:any)=>(y.open+y.completed30*.35)-(x.open+x.completed30*.35)),most=sorted[0],least=sorted[sorted.length-1],gap=most.open-least.open,completionGap=most.completed30-least.completed30;
  if((most.open>=4&&gap>=3)||completionGap>=5){
   const candidateRoutine=routines.find(r=>r.assigneeUserId===most.userId),candidateTask=tasks.find(t=>t.assigneeUserId===most.userId),steps:Step[]=[];
   if(candidateRoutine)steps.push({kind:"routine",label:`Reassign ${candidateRoutine.title}`,benefit:`Moves one recurring responsibility away from ${most.name}.`,prompt:`Prepare a proposal to reassign the routine "${candidateRoutine.title}" from ${most.name} to ${least.name}.`});
   if(candidateTask)steps.push({kind:"task",label:`Reassign ${candidateTask.title}`,benefit:`Reduces ${most.name}'s current open assignment count by one.`,prompt:`Prepare a proposal to reassign the task "${candidateTask.title}" from ${most.name} to ${least.name}.`});
   const personal=most.userId===a.user.id||least.userId===a.user.id;
   insights.push({id:"workload-balance",fingerprint:hash([most.userId,most.open,most.completed30,least.userId,least.open,least.completed30,candidateRoutine?.id,candidateTask?.id]),tone:"balance",priority:gap>=5||completionGap>=8?"attention":"helpful",relevance:personal?"personal":"household",title:personal&&most.userId===a.user.id?"Your household load is heavier right now":`${most.name} has been carrying more household work`,body:`${most.name} has ${most.open} open assignments and completed ${most.completed30} routines in the last 30 days; ${least.name} has ${least.open} open and completed ${least.completed30}.`,reason:"Silvi considers both current ownership and recent routine completions so chore balancing is less dependent on a single snapshot.",why:[`${most.name}: ${most.open} open, ${most.completed30} routine completions in 30 days`,`${least.name}: ${least.open} open, ${least.completed30} completions`,"This is a coordination signal, not a score of effort or contribution."],steps:steps.slice(0,2)});
  }
 }

 // Hard conflicts and tight turnarounds are different severities.
 const hard:Array<{a:EventRow;b:EventRow;minutes:number}>=[];
 const tight:Array<{a:EventRow;b:EventRow;gap:number}>=[];
 const timed=events.filter(e=>!e.allDay).sort((x,y)=>eventStart(x)-eventStart(y));
 for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length;j++){
  const x=timed[i],y=timed[j];if(dayKey(x.startsAt)!==dayKey(y.startsAt))continue;
  const overlap=overlapMinutes(x,y);if(overlap>0)hard.push({a:x,b:y,minutes:overlap});
  else{const gap=turnaroundMinutes(x,y);if(gap>=0&&gap<=30)tight.push({a:x,b:y,gap})}
 }
 if(hard.length){
  const first=hard.sort((x,y)=>y.minutes-x.minutes)[0],date=dayKey(first.a.startsAt);
  insights.push({id:`schedule-conflict-${date}`,fingerprint:hash(hard.slice(0,5).map(x=>[x.a.id,x.b.id,x.minutes])),tone:"attention",priority:"attention",relevance:"household",title:`Hard Calendar conflict on ${date}`,body:`“${first.a.title}” overlaps with “${first.b.title}” by about ${first.minutes} minutes.`,reason:"Silvi now distinguishes true overlaps from merely busy scheduling.",why:[`${first.a.title}: ${fmtTime(first.a.startsAt)}–${fmtTime(first.a.endsAt||first.a.startsAt)}`,`${first.b.title}: ${fmtTime(first.b.startsAt)}–${fmtTime(first.b.endsAt||first.b.startsAt)}`,`${hard.length} hard overlap${hard.length===1?"":"s"} found this week`],steps:[{kind:"calendar",label:"Resolve the hard conflict",benefit:"Lets Silvi suggest the least disruptive move while preserving both events.",prompt:`Review the hard Calendar conflict between "${first.a.title}" and "${first.b.title}" on ${date}. Suggest the least disruptive resolution and prepare at most one Calendar change proposal.`}]});
 }else if(tight.length){
  const first=tight.sort((x,y)=>x.gap-y.gap)[0],date=dayKey(first.a.startsAt);
  insights.push({id:`tight-turnaround-${date}`,fingerprint:hash(tight.slice(0,5).map(x=>[x.a.id,x.b.id,x.gap])),tone:"planning",priority:"helpful",relevance:"household",title:`Tight turnaround on ${date}`,body:`There are only ${first.gap} minutes between “${first.a.title}” and “${first.b.title}”.`,reason:"Silvi treats close back-to-back events as a planning warning rather than a conflict.",why:[`${first.a.title} ends around ${fmtTime(first.a.endsAt||first.a.startsAt)}`,`${first.b.title} starts at ${fmtTime(first.b.startsAt)}`,`${tight.length} tight turnaround${tight.length===1?"":"s"} found this week`],steps:[{kind:"calendar",label:"Review the turnaround",benefit:"Checks whether travel, preparation or buffer time makes the schedule unrealistic.",prompt:`Review the tight turnaround between "${first.a.title}" and "${first.b.title}" on ${date}. Explain whether the gap looks workable and prepare a Calendar proposal only if a clear adjustment makes sense.`}]});
 }

 // Forgotten task scoring combines age, priority, assignment and due state.
 const scored=tasks.map(task=>({task,score:taskAttentionScore(task,nowMs,a.user.id)})).filter(x=>x.score>=4).sort((x,y)=>y.score-x.score);
 if(scored.length){
  const first=scored[0],personal=scored.some(x=>x.task.assigneeUserId===a.user.id),high=scored.filter(x=>x.score>=7).length;
  const details=scored.slice(0,4).map(x=>`${x.task.title}: attention score ${x.score}${x.task.dueAt?` · due ${dayKey(x.task.dueAt)}`:` · ${daysBetween(nowMs,Date.parse(x.task.createdAt))} days old`}${x.task.assigneeUserId===a.user.id?" · yours":""}`);
  insights.push({id:"forgotten-tasks",fingerprint:hash(scored.slice(0,8).map(x=>[x.task.id,x.score,x.task.dueAt,x.task.assigneeUserId])),tone:"attention",priority:high>0?"attention":"helpful",relevance:personal?"personal":"household",title:personal?"A task assigned to you may need a decision":`${scored.length} tasks may need a decision`,body:"Silvi now weighs how overdue or old a task is, its priority, whether it has an owner, and whether it is assigned to you.",reason:"Older undated tasks and slightly late low-priority tasks are treated more gently than high-priority or long-overdue work.",why:details,steps:[{kind:"task",label:`Review ${first.task.title}`,benefit:"Helps decide whether to finish, reschedule, reassign, add a due date or leave it alone.",prompt:`Review the task "${first.task.title}". Consider its age, priority, assignment, due date and household workload. Suggest the best next step and prepare at most one task proposal.`}]});
 }

 // Meal coordination uses an evening pressure score rather than event count alone.
 let best:{date:string;score:number;evening:EventRow[];dueTasks:TaskRow[];myDue:number}|null=null;
 for(let offset=0;offset<7;offset++){
  const date=new Date(nowMs+offset*86400000).toISOString().slice(0,10);const pressure=eveningPressure(events,tasks,date,nowMs,a.user.id);
  if(pressure.score>=4&&(!best||pressure.score>best.score))best={date,...pressure};
 }
 if(best){
  const dinner=meals.find(m=>m.mealDate===best!.date&&m.mealType==="dinner");
  const pressureLabel=best.score>=9?"very busy":best.score>=6?"busy":"a little packed";
  const steps:Step[]=dinner?
   [{kind:"meal",label:`Simplify ${dinner.title}`,benefit:"Keeps dinner effort proportional to the actual evening load.",prompt:`The evening of ${best.date} looks ${pressureLabel} with ${best.evening.length} events and ${best.dueTasks.length} due tasks. Suggest a simpler dinner than "${dinner.title}" and prepare a replacement meal proposal only if that would reduce friction.`}]:
   [{kind:"meal",label:"Plan a low-effort dinner",benefit:"Removes one decision from a crowded evening.",prompt:`The evening of ${best.date} looks ${pressureLabel} with ${best.evening.length} events and ${best.dueTasks.length} due tasks, and no dinner is planned. Prepare one low-effort dinner proposal for that evening.`}];
  insights.push({id:`busy-evening-${best.date}`,fingerprint:hash([best.date,best.score,best.evening.map(e=>e.id),best.dueTasks.map(t=>t.id),dinner?.id]),tone:"planning",priority:best.score>=9?"attention":"helpful",relevance:best.myDue>0?"personal":"household",title:`${best.date} looks ${pressureLabel}`,body:`Evening pressure score ${best.score}: ${best.evening.length} events, ${best.dueTasks.length} due tasks${best.myDue?` (${best.myDue} yours)`:""}${dinner?`, with “${dinner.title}” planned for dinner`:" and no dinner planned"}.`,reason:"Silvi now combines event density, tight scheduling and due Tasks instead of assuming every two-event evening needs a simpler meal.",why:[`${best.evening.length} afternoon/evening events`,`${best.dueTasks.length} Tasks due that day${best.myDue?` · ${best.myDue} assigned to you`:""}`,dinner?`Dinner currently planned: ${dinner.title}`:"No dinner currently planned",`Evening pressure score: ${best.score}`],steps});
 }

 const unassignedUrgent=tasks.filter(t=>!t.assigneeUserId&&(t.priority==="high"||(t.dueAt&&Date.parse(t.dueAt)-nowMs<86400000)));
 if(unassignedUrgent.length>=2)insights.push({id:"unassigned-urgent",fingerprint:hash(unassignedUrgent.map(t=>[t.id,t.dueAt,t.priority])),tone:"planning",priority:"helpful",relevance:"household",title:`${unassignedUrgent.length} important tasks have no owner`,body:"A few time-sensitive tasks are still unassigned, which can make them easier to miss.",reason:"Silvi looks for high-priority or soon-due Tasks that do not have an assignee.",why:[`${unassignedUrgent.length} unassigned important tasks`],steps:unassignedUrgent.slice(0,2).map(t=>({kind:"task" as const,label:`Assign ${t.title}`,benefit:"Makes responsibility explicit before the task is due.",prompt:`Review the unassigned task "${t.title}" and household workload. Suggest the fairest assignee and prepare only that assignment proposal for me to approve.`}))});

 const pref=await preferenceMap(c,a),priorityRank:Record<Priority,number>={attention:0,helpful:1,idea:2},relevanceRank:Record<Relevance,number>={personal:0,household:1};
 const filtered=insights.filter(i=>visible(i,pref.get(i.id))).sort((x,y)=>relevanceRank[x.relevance]-relevanceRank[y.relevance]||priorityRank[x.priority]-priorityRank[y.priority]);
 return{generatedAt:new Date().toISOString(),insights:filtered.slice(0,4),workload,busiestDay};
}

app.get("/api/v1/households/:householdId/silvi/insights",async c=>{const a=await access(c);if("response"in a)return a.response;return c.json(await buildInsights(c,a))});

app.post("/api/v1/households/:householdId/silvi/insights/:insightId/preference",async c=>{
 const a=await access(c);if("response"in a)return a.response;
 const body=await c.req.json().catch(()=>null) as {action?:unknown;minutes?:unknown;fingerprint?:unknown}|null;
 const action=body?.action,insightId=c.req.param("insightId"),fingerprint=typeof body?.fingerprint==="string"?body.fingerprint.slice(0,80):"";
 if(!fingerprint||(action!=="dismiss"&&action!=="snooze"&&action!=="clear"))return apiError(c,422,"VALIDATION_FAILED","Choose a valid suggestion preference.");
 if(action==="clear"){await c.env.DB.prepare("DELETE FROM silvi_suggestion_preferences WHERE household_id=? AND user_id=? AND insight_id=?").bind(a.householdId,a.user.id,insightId).run();return c.json({ok:true})}
 const minutes=action==="snooze"?([1440,10080].includes(Number(body?.minutes))?Number(body?.minutes):1440):null;
 const until=minutes?new Date(Date.now()+minutes*60000).toISOString():null;
 await c.env.DB.prepare(`INSERT INTO silvi_suggestion_preferences(household_id,user_id,insight_id,fingerprint,state,snoozed_until,updated_at) VALUES(?,?,?,?,?,?,datetime('now')) ON CONFLICT(household_id,user_id,insight_id) DO UPDATE SET fingerprint=excluded.fingerprint,state=excluded.state,snoozed_until=excluded.snoozed_until,updated_at=datetime('now')`).bind(a.householdId,a.user.id,insightId,fingerprint,action==="dismiss"?"dismissed":"snoozed",until).run();
 return c.json({ok:true,snoozedUntil:until});
});

export default app;
