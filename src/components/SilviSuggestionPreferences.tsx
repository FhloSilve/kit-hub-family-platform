import { useEffect } from "react";
import "../silvi-suggestions.css";

type Insight={id:string;fingerprint:string;priority:"attention"|"helpful"|"idea";relevance:"personal"|"household";title:string;reason:string;why:string[];steps:Array<{label:string;benefit:string}>};
type Response={insights:Insight[]};

function priorityLabel(value:Insight["priority"]){return value==="attention"?"Needs attention":value==="helpful"?"Worth considering":"Just an idea"}

export function SilviSuggestionPreferences({householdId}:{householdId:string}){
 useEffect(()=>{
  let stopped=false,queued=false,insights:Insight[]=[];
  const endpoint=`/api/v1/households/${encodeURIComponent(householdId)}/silvi/insights`;
  async function load(){
   try{const r=await fetch(endpoint,{credentials:"include"});if(!r.ok)return;const body=await r.json() as Response;if(stopped)return;insights=body.insights??[];decorate()}catch{/* Silvi suggestions remain usable without enhancement. */}
  }
  async function preference(insight:Insight,action:"dismiss"|"snooze",minutes?:number){
   const r=await fetch(`${endpoint}/${encodeURIComponent(insight.id)}/preference`,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({action,minutes,fingerprint:insight.fingerprint})});
   if(!r.ok)return;
   const card=findCard(insight.title);if(card)card.remove();
   await load();
  }
  function findCard(title:string){return Array.from(document.querySelectorAll<HTMLElement>(".silvi-insight")).find(card=>Array.from(card.querySelectorAll("strong")).some(x=>x.textContent?.trim()===title))}
  function decorate(){
   if(stopped)return;
   for(const insight of insights){
    const card=findCard(insight.title);if(!card||card.querySelector("[data-silvi-pref-controls]"))continue;
    card.dataset.silviPriority=insight.priority;card.dataset.silviRelevance=insight.relevance;
    const box=document.createElement("div");box.className="silvi-insight-controls";box.dataset.silviPrefControls="true";
    const badges=document.createElement("div");badges.className="silvi-insight-badges";
    const priority=document.createElement("span");priority.className=`is-${insight.priority}`;priority.textContent=priorityLabel(insight.priority);badges.append(priority);
    if(insight.relevance==="personal"){const personal=document.createElement("span");personal.className="is-personal";personal.textContent="Relevant to you";badges.append(personal)}
    const details=document.createElement("details");details.className="silvi-insight-why";
    const summary=document.createElement("summary");summary.textContent="Why am I seeing this?";details.append(summary);
    const reason=document.createElement("p");reason.textContent=insight.reason;details.append(reason);
    if(insight.why?.length){const list=document.createElement("ul");for(const line of insight.why){const li=document.createElement("li");li.textContent=line;list.append(li)}details.append(list)}
    if(insight.steps?.some(s=>s.benefit)){const benefit=document.createElement("div");benefit.className="silvi-insight-benefits";for(const step of insight.steps){if(!step.benefit)continue;const p=document.createElement("p");p.innerHTML=`<strong></strong><span></span>`;(p.querySelector("strong") as HTMLElement).textContent=step.label;(p.querySelector("span") as HTMLElement).textContent=step.benefit;benefit.append(p)}details.append(benefit)}
    const actions=document.createElement("div");actions.className="silvi-insight-pref-actions";
    const tomorrow=document.createElement("button");tomorrow.type="button";tomorrow.textContent="Snooze until tomorrow";tomorrow.onclick=()=>void preference(insight,"snooze",1440);
    const week=document.createElement("button");week.type="button";week.textContent="Snooze 1 week";week.onclick=()=>void preference(insight,"snooze",10080);
    const dismiss=document.createElement("button");dismiss.type="button";dismiss.textContent="Dismiss";dismiss.onclick=()=>void preference(insight,"dismiss");
    actions.append(tomorrow,week,dismiss);box.append(badges,details,actions);card.append(box);
   }
  }
  function schedule(){if(queued||stopped)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate()})}
  void load();
  const observer=new MutationObserver(schedule);observer.observe(document.body,{subtree:true,childList:true});
  return()=>{stopped=true;observer.disconnect()}
 },[householdId]);
 return null;
}
