import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckSquare2, ChefHat, FileText, ListTodo, MapPin, MessageCircle, Search, ShoppingBasket, UserRound, X } from "lucide-react";
import "../search-enhancements.css";

type Result={id:string;kind:string;title:string;subtitle:string|null;sortAt:string|null};
const labels:Record<string,string>={event:"Calendar",task:"Task",grocery:"Grocery",meal:"Meal",recipe:"Recipe",note:"Family note",message:"Message",announcement:"Announcement",routine:"Routine",member:"Household member"};
function icon(kind:string){if(kind==="event")return <CalendarDays/>;if(kind==="task")return <CheckSquare2/>;if(kind==="grocery")return <ShoppingBasket/>;if(kind==="meal"||kind==="recipe")return <ChefHat/>;if(kind==="message"||kind==="announcement")return <MessageCircle/>;if(kind==="member")return <UserRound/>;if(kind==="routine")return <ListTodo/>;return <FileText/>}

export function GlobalSearchDock({householdId}:{householdId:string}){
 const[open,setOpen]=useState(false),[query,setQuery]=useState(""),[results,setResults]=useState<Result[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const desktopInput=useRef<HTMLInputElement|null>(null);
 useEffect(()=>{
  const cleanups:Array<()=>void>=[];let observedInput:HTMLInputElement|null=null,observedButton:HTMLButtonElement|null=null;
  function bind(){
   const input=document.querySelector<HTMLInputElement>(".topbar-search input");
   if(input&&input!==observedInput){observedInput=input;desktopInput.current=input;input.disabled=false;input.removeAttribute("disabled");input.placeholder="Search Kit Hub…";const focus=()=>setOpen(true),change=()=>{setQuery(input.value);setOpen(true)};input.addEventListener("focus",focus);input.addEventListener("input",change);cleanups.push(()=>{input.removeEventListener("focus",focus);input.removeEventListener("input",change)})}
   const button=document.querySelector<HTMLButtonElement>(".mobile-search-button");
   if(button&&button!==observedButton){observedButton=button;button.disabled=false;button.removeAttribute("disabled");button.setAttribute("aria-label","Search Kit Hub");const click=(e:Event)=>{e.preventDefault();setOpen(true)};button.addEventListener("click",click);cleanups.push(()=>button.removeEventListener("click",click))}
  }
  bind();const observer=new MutationObserver(bind);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["disabled"]});
  return()=>{observer.disconnect();cleanups.forEach(fn=>fn())};
 },[]);
 useEffect(()=>{if(!open||query.trim().length<2){setResults([]);setError("");return}const controller=new AbortController();const timer=window.setTimeout(async()=>{setLoading(true);setError("");try{const response=await fetch(`/api/v1/households/${encodeURIComponent(householdId)}/search?q=${encodeURIComponent(query.trim())}`,{credentials:"include",signal:controller.signal});const body=await response.json().catch(()=>({})) as any;if(!response.ok)throw new Error(body?.error?.message||"Search could not be completed.");setResults(Array.isArray(body.results)?body.results:[])}catch(e){if((e as Error).name!=="AbortError")setError(e instanceof Error?e.message:"Search could not be completed.")}finally{setLoading(false)}},220);return()=>{window.clearTimeout(timer);controller.abort()}},[open,query,householdId]);
 const groups=useMemo(()=>results.reduce<Record<string,Result[]>>((map,item)=>{(map[item.kind]??=[]).push(item);return map},{}),[results]);
 function close(){setOpen(false);setQuery("");setResults([]);if(desktopInput.current)desktopInput.current.value=""}
 function activate(result:Result){
  const target=result.kind==="event"?1:result.kind==="task"?2:result.kind==="grocery"?3:(result.kind==="meal"||result.kind==="recipe")?4:(result.kind==="message"||result.kind==="announcement")?5:result.kind==="member"?6:result.kind==="routine"?-1:0;
  close();
  if(result.kind==="routine"){window.setTimeout(()=>document.querySelector<HTMLButtonElement>(".routines-launcher")?.click(),0);return}
  const buttons=document.querySelectorAll<HTMLButtonElement>(".sidebar-nav button");buttons[target]?.click();
  if(result.kind==="event")window.setTimeout(()=>window.dispatchEvent(new CustomEvent("kit-hub-open-calendar-event",{detail:{eventId:result.id}})),120);
 }
 if(!open)return null;
 return <div className="global-search-backdrop" onMouseDown={close}><section className="global-search-panel" role="dialog" aria-modal="true" aria-label="Search Kit Hub" onMouseDown={e=>e.stopPropagation()}>
  <header><div><Search/><input autoFocus value={query} onChange={e=>{setQuery(e.target.value);if(desktopInput.current)desktopInput.current.value=e.target.value}} placeholder="Search events, tasks, meals, messages…"/></div><button className="icon-button" onClick={close} aria-label="Close search"><X/></button></header>
  {query.trim().length<2?<div className="global-search-empty"><Search/><strong>Search your household</strong><p>Find Calendar events, tasks, groceries, meals, recipes, notes, Family Hub messages, routines and household members.</p></div>:loading?<div className="global-search-empty"><strong>Searching Kit Hub…</strong></div>:error?<div className="global-search-empty is-error"><strong>Search unavailable</strong><p>{error}</p></div>:results.length?<div className="global-search-results">{Object.entries(groups).map(([kind,items])=><section key={kind}><h3>{labels[kind]||kind}</h3>{items.map(item=><button key={`${kind}-${item.id}`} onClick={()=>activate(item)}><span>{icon(kind)}</span><div><strong>{item.title}</strong>{item.subtitle&&<small>{item.subtitle}</small>}</div>{kind==="event"&&<MapPin className="global-search-arrow"/>}</button>)}</section>)}</div>:<div className="global-search-empty"><Search/><strong>No matches</strong><p>Try another name, place, task, meal or message.</p></div>}
 </section></div>
}
