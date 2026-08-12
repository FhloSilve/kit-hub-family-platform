import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, MessageSquarePlus, ShieldCheck, Sparkles, X } from "lucide-react";
import "../beta-first-session.css";

type Journey={welcomeSeen:boolean;householdReady:boolean;sharedActionDone:boolean;silviTried:boolean;feedbackSubmitted:boolean;feedbackPromptDismissed:boolean;completed:number;total:number;percent:number;showFeedbackPrompt:boolean};
type Data={eligible:boolean;tester?:{status:string;invitedAt:string;activatedAt:string|null};journey?:Journey};
async function request<T>(url:string,init?:RequestInit){const response=await fetch(url,{credentials:"include",...init,headers:{"content-type":"application/json",...init?.headers}});const body=await response.json().catch(()=>({})) as any;if(!response.ok)throw new Error(body?.error?.message||"Beta journey could not be updated.");return body as T}

export function BetaFirstSession(){
 const[data,setData]=useState<Data|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 async function load(){try{const next=await request<Data>("/api/v1/beta-journey");setData(next);if(next.eligible&&next.journey&&!next.journey.welcomeSeen)setOpen(true)}catch{}}
 useEffect(()=>{void load();const changed=()=>void load();const journey=(event:Event)=>{const detail=(event as CustomEvent<{event?:string}>).detail;if(detail?.event)void mark(detail.event)};window.addEventListener("kit-hub-household-data-changed",changed);window.addEventListener("kit-hub-beta-journey",journey);window.addEventListener("focus",changed);return()=>{window.removeEventListener("kit-hub-household-data-changed",changed);window.removeEventListener("kit-hub-beta-journey",journey);window.removeEventListener("focus",changed)}},[]);
 async function mark(event:string){try{await request("/api/v1/beta-journey/event",{method:"POST",body:JSON.stringify({event})});await load()}catch{}}
 async function start(){setBusy(true);await mark("welcome_seen");setOpen(false);setBusy(false)}
 async function dismissPrompt(){await mark("feedback_prompt_dismissed");}
 const steps=useMemo(()=>data?.journey?[{label:"Signed in to the private beta",done:true},{label:"Created or joined a household",done:data.journey.householdReady},{label:"Completed a first shared action",done:data.journey.sharedActionDone},{label:"Tried Silvi",done:data.journey.silviTried},{label:"Sent first feedback",done:data.journey.feedbackSubmitted}]:[],[data]);
 if(!data?.eligible||!data.journey)return null;
 return <>
  {open&&<div className="beta-welcome-backdrop"><section className="beta-welcome-card" role="dialog" aria-modal="true" aria-label="Private beta welcome"><div className="beta-welcome-icon"><Sparkles/></div><small>PRIVATE BETA</small><h1>Welcome to Kit Hub</h1><p>You are one of the first people testing the family platform. Try a real household workflow, use Silvi when it helps, and tell us what feels confusing or useful.</p><div className="beta-welcome-points"><span><ShieldCheck/><b>Your household stays private.</b> Beta progress only records simple milestones, never your messages, notes, searches or locations.</span><span><CheckCircle2/><b>Nothing Silvi changes is automatic.</b> Actions still require your approval.</span><span><MessageSquarePlus/><b>Feedback is part of the beta.</b> Report bugs or ideas whenever something stands out.</span></div><button className="button button--primary" onClick={()=>void start()} disabled={busy}>{busy?"Opening Kit Hub…":"Start exploring"}</button></section></div>}
  {!open&&data.journey.completed<data.journey.total&&<aside className="beta-journey-card"><header><div><small>YOUR BETA JOURNEY</small><strong>{data.journey.percent}% complete</strong></div><button className="icon-button" aria-label="Hide beta journey" onClick={()=>setOpen(false)}><X/></button></header><div className="beta-journey-progress"><i style={{width:`${data.journey.percent}%`}}/></div><div className="beta-journey-steps">{steps.map(step=><span key={step.label} className={step.done?"is-done":""}>{step.done?<CheckCircle2/>:<Circle/>}{step.label}</span>)}</div></aside>}
  {data.journey.showFeedbackPrompt&&<div className="beta-feedback-nudge"><button className="icon-button" aria-label="Dismiss feedback reminder" onClick={()=>void dismissPrompt()}><X/></button><Sparkles/><div><strong>You have tried enough to have a useful first impression.</strong><small>What felt smooth, confusing or missing?</small></div><button className="button button--primary" onClick={()=>window.dispatchEvent(new Event("kit-hub-open-feedback"))}>Give feedback</button></div>}
 </>;
}
