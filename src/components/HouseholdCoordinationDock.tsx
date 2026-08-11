import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChefHat, CheckSquare2, RefreshCw, Repeat2, Scale, Sparkles, UserRound, UsersRound, X } from "lucide-react";
import "../household-coordination.css";

type Context = {
  currentUserId: string;
  summary: { openTasks:number; myOpenTasks:number; upcomingEvents:number; plannedMeals:number; activeRoutines:number; myRoutines:number; overdueRoutines:number };
  tasks: Array<{ id:string; title:string; dueAt:string|null; priority:string; assigneeUserId:string|null; assigneeName:string|null }>;
  upcomingEvents: Array<{ id:string; title:string; startsAt:string; endsAt:string|null; allDay:number }>;
  meals: Array<{ id:string; mealDate:string; mealType:string; title:string; cookUserId:string|null; cookName:string|null }>;
  routines: Array<{ id:string; title:string; nextDueAt:string|null; assigneeUserId:string|null; assigneeName:string|null; overdue:number }>;
};
type Insights = { workload:Array<{userId:string;name:string;open:number;openTasks:number;openRoutines:number;overdue:number;completed30?:number}> };

async function json<T>(url:string){const response=await fetch(url,{credentials:"include"});const body=await response.json().catch(()=>({})) as any;if(!response.ok)throw new Error(body?.error?.message||"Household planning could not be loaded.");return body as T}

export function HouseholdCoordinationDock({householdId}:{householdId:string}){
  const[open,setOpen]=useState(false),[context,setContext]=useState<Context|null>(null),[insights,setInsights]=useState<Insights|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{const handler=()=>setOpen(true);window.addEventListener("kit-hub-open-coordination",handler);return()=>window.removeEventListener("kit-hub-open-coordination",handler)},[]);
  useEffect(()=>{if(open)void load()},[open,householdId]);
  async function load(){setBusy(true);setError("");try{const[c,i]=await Promise.all([json<Context>(`/api/v1/households/${encodeURIComponent(householdId)}/silvi/context`),json<Insights>(`/api/v1/households/${encodeURIComponent(householdId)}/silvi/insights`)]);setContext(c);setInsights(i)}catch(e){setError(e instanceof Error?e.message:"Household planning could not be loaded.")}finally{setBusy(false)}}
  const next7=useMemo(()=>{if(!context)return[];const now=Date.now(),end=now+7*86400000;const rows:Array<{when:number;kind:string;title:string;meta:string}>=[];for(const event of context.upcomingEvents){const when=Date.parse(event.startsAt);if(when<=end)rows.push({when,kind:"event",title:event.title,meta:event.allDay?"All day":new Date(event.startsAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})})}for(const task of context.tasks){if(!task.dueAt)continue;const when=Date.parse(task.dueAt);if(when>=now&&when<=end)rows.push({when,kind:"task",title:task.title,meta:task.assigneeName||"Unassigned"})}for(const routine of context.routines){if(!routine.nextDueAt)continue;const when=Date.parse(routine.nextDueAt);if(when>=now-86400000&&when<=end)rows.push({when,kind:"routine",title:routine.title,meta:routine.assigneeName||"Anyone"})}for(const meal of context.meals){const when=Date.parse(`${meal.mealDate}T18:00:00`);if(when>=now-86400000&&when<=end&&meal.mealType==="dinner")rows.push({when,kind:"meal",title:meal.title,meta:meal.cookName?`Cook: ${meal.cookName}`:"Cook unassigned"})}return rows.sort((a,b)=>a.when-b.when).slice(0,14)},[context]);
  const mine=insights?.workload.find(x=>x.userId===context?.currentUserId);
  const maxOpen=Math.max(1,...(insights?.workload.map(x=>x.open)??[1]));
  const openSilvi=()=>document.querySelector<HTMLButtonElement>(".silvi-launcher")?.click();
  const openRoutines=()=>document.querySelector<HTMLButtonElement>(".routines-launcher")?.click();
  if(!open)return null;
  return <div className="coordination-backdrop" onMouseDown={()=>setOpen(false)}><aside className="coordination-panel" role="dialog" aria-modal="true" aria-label="Household plan" onMouseDown={e=>e.stopPropagation()}>
    <header><div><small>HOUSEHOLD COORDINATION</small><h2>Household plan</h2><p>A practical view of the week: what is happening, who owns what, and where the household may need attention.</p></div><button className="icon-button" onClick={()=>setOpen(false)} aria-label="Close household plan"><X/></button></header>
    {error&&<p className="module-alert">{error}</p>}
    {context&&<>
      <section className="coordination-summary">
        <div><CheckSquare2/><strong>{context.summary.openTasks}</strong><span>open tasks</span></div>
        <div><CalendarDays/><strong>{context.summary.upcomingEvents}</strong><span>events this week</span></div>
        <div><ChefHat/><strong>{context.summary.plannedMeals}</strong><span>planned meals</span></div>
        <div className={context.summary.overdueRoutines?"has-alert":""}><Repeat2/><strong>{context.summary.overdueRoutines}</strong><span>overdue routines</span></div>
      </section>
      <section className="coordination-grid">
        <article className="coordination-card coordination-my-load"><div className="coordination-card__title"><UserRound/><div><small>MY LOAD</small><h3>Your current responsibilities</h3></div></div><div className="coordination-personal-numbers"><span><b>{context.summary.myOpenTasks}</b> tasks</span><span><b>{context.summary.myRoutines}</b> routines</span><span><b>{mine?.overdue??0}</b> overdue</span></div><p>This is a coordination view, not a score. It is meant to make ownership visible before work gets forgotten.</p></article>
        <article className="coordination-card"><div className="coordination-card__title"><Scale/><div><small>HOUSEHOLD LOAD</small><h3>Assignment balance</h3></div></div><div className="coordination-workload">{(insights?.workload??[]).map(person=><div key={person.userId}><span><strong>{person.name}</strong><small>{person.openTasks} tasks · {person.openRoutines} routines{person.overdue?` · ${person.overdue} overdue`:""}</small></span><i><b style={{width:`${Math.max(8,(person.open/maxOpen)*100)}%`}}/></i></div>)}</div></article>
      </section>
      <section className="coordination-card coordination-week"><div className="coordination-card__title"><CalendarDays/><div><small>NEXT 7 DAYS</small><h3>What is coming up</h3></div></div>{next7.length?<div className="coordination-timeline">{next7.map((row,index)=><div key={`${row.kind}-${row.when}-${index}`}><time>{new Date(row.when).toLocaleDateString([], {weekday:"short",day:"numeric",month:"short"})}</time><span className={`is-${row.kind}`}>{row.kind}</span><strong>{row.title}</strong><small>{row.meta}</small></div>)}</div>:<p className="coordination-empty">Nothing dated is currently recorded for the next seven days.</p>}</section>
      <section className="coordination-actions"><button className="button button--primary" onClick={()=>{setOpen(false);window.setTimeout(openSilvi,0)}}><Sparkles/>Ask Silvi to coordinate the week</button><button className="button button--secondary" onClick={()=>{setOpen(false);window.setTimeout(openRoutines,0)}}><Repeat2/>Open routines & recurring chores</button><button className="button button--secondary" disabled={busy} onClick={()=>void load()}><RefreshCw/>Refresh</button></section>
      <footer><UsersRound/> Shared household information is shown according to your signed-in household access.</footer>
    </>}
    {!context&&!error&&<p>Loading household plan…</p>}
  </aside></div>;
}
