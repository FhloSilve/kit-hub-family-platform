import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, CheckSquare2, ChefHat, FileText, ListTodo, MapPin, MessageCircle, Search, ShoppingBasket, UserRound, X } from "lucide-react";
import "../search-enhancements.css";

type Result={id:string;kind:string;title:string;subtitle:string|null;sortAt:string|null};
const labels:Record<string,string>={event:"Calendar",task:"Task",grocery:"Grocery",meal:"Meal",recipe:"Recipe",note:"Family note",message:"Message",announcement:"Announcement",routine:"Routine",member:"Household member"};
function icon(kind:string){if(kind==="event")return <CalendarDays/>;if(kind==="task")return <CheckSquare2/>;if(kind==="grocery")return <ShoppingBasket/>;if(kind==="meal"||kind==="recipe")return <ChefHat/>;if(kind==="message"||kind==="announcement")return <MessageCircle/>;if(kind==="member")return <UserRound/>;if(kind==="routine")return <ListTodo/>;return <FileText/>}

export function GlobalSearchDock({householdId}:{householdId:string}){
 const[modalOpen,setModalOpen]=useState(false),[inlineOpen,setInlineOpen]=useState(false),[query,setQuery]=useState(""),[results,setResults]=useState<Result[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(""),[searchHost,setSearchHost]=useState<HTMLElement|null>(null),[profileMenu,setProfileMenu]=useState<HTMLElement|null>(null);
 const desktopInput=useRef<HTMLInputElement|null>(null);
 useEffect(()=>{const openSearch=()=>{setModalOpen(true);setInlineOpen(false)};window.addEventListener("kit-hub-open-search",openSearch);return()=>window.removeEventListener("kit-hub-open-search",openSearch)},[]);
 useEffect(()=>{
  const cleanups:Array<()=>void>=[];let observedInput:HTMLInputElement|null=null;
  function bind(){
   const host=document.querySelector<HTMLElement>(".topbar-search");if(host)setSearchHost(host);
   const menu=document.querySelector<HTMLElement>(".mobile-account-menu");setProfileMenu(menu);
   const input=document.querySelector<HTMLInputElement>(".topbar-search input");
   if(input&&input!==observedInput){observedInput=input;desktopInput.current=input;input.disabled=false;input.removeAttribute("disabled");input.placeholder="Search your home";const focus=()=>{setModalOpen(false);setInlineOpen(true)},change=()=>{setQuery(input.value);setModalOpen(false);setInlineOpen(true)},key=(event:KeyboardEvent)=>{if(event.key==="Escape"){setInlineOpen(false);input.blur()}};input.addEventListener("focus",focus);input.addEventListener("input",change);input.addEventListener("keydown",key);cleanups.push(()=>{input.removeEventListener("focus",focus);input.removeEventListener("input",change);input.removeEventListener("keydown",key)})}
  }
  bind();const observer=new MutationObserver(bind);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["disabled"]});
  return()=>{observer.disconnect();cleanups.forEach(fn=>fn())};
 },[]);
 useEffect(()=>{const open=modalOpen||inlineOpen;if(!open||query.trim().length<2){setResults([]);setError("");return}const controller=new AbortController();const timer=window.setTimeout(async()=>{setLoading(true);setError("");try{const response=await fetch(`/api/v1/households/${encodeURIComponent(householdId)}/search?q=${encodeURIComponent(query.trim())}`,{credentials:"include",signal:controller.signal});const body=await response.json().catch(()=>({})) as any;if(!response.ok)throw new Error(body?.error?.message||"Search could not be completed.");setResults(Array.isArray(body.results)?body.results:[])}catch(e){if((e as Error).name!=="AbortError")setError(e instanceof Error?e.message:"Search could not be completed.")}finally{setLoading(false)}},180);return()=>{window.clearTimeout(timer);controller.abort()}},[modalOpen,inlineOpen,query,householdId]);
 useEffect(()=>{if(!inlineOpen)return;const outside=(event:MouseEvent)=>{const node=event.target as Node|null;if(searchHost&&node&&!searchHost.contains(node))setInlineOpen(false)};document.addEventListener("mousedown",outside);return()=>document.removeEventListener("mousedown",outside)},[inlineOpen,searchHost]);
 const groups=useMemo(()=>results.reduce<Record<string,Result[]>>((map,item)=>{(map[item.kind]??=[]).push(item);return map},{}),[results]);
 function clear(resetInput=true){setQuery("");setResults([]);setError("");if(resetInput&&desktopInput.current)desktopInput.current.value=""}
 function closeModal(){setModalOpen(false);clear()}
 function activate(result:Result){
  const target=result.kind==="event"?1:result.kind==="task"?2:result.kind==="grocery"?3:(result.kind==="meal"||result.kind==="recipe")?4:(result.kind==="message"||result.kind==="announcement")?5:result.kind==="member"?6:result.kind==="routine"?-1:0;
  setModalOpen(false);setInlineOpen(false);clear();
  if(result.kind==="routine"){window.setTimeout(()=>document.querySelector<HTMLButtonElement>(".routines-launcher")?.click(),0);return}
  const buttons=document.querySelectorAll<HTMLButtonElement>(".sidebar-nav button");buttons[target]?.click();
  if(result.kind==="event")window.setTimeout(()=>window.dispatchEvent(new CustomEvent("kit-hub-open-calendar-event",{detail:{eventId:result.id}})),120);
 }
 const resultContent=query.trim().length<2?<div className="global-search-empty global-search-empty--compact"><Search/><strong>Search your household</strong><p>Events, tasks, groceries, meals, messages, routines and people.</p></div>:loading?<div className="global-search-empty global-search-empty--compact"><strong>Searching Kit Hub…</strong></div>:error?<div className="global-search-empty global-search-empty--compact is-error"><strong>Search unavailable</strong><p>{error}</p></div>:results.length?<div className="global-search-results">{Object.entries(groups).map(([kind,items])=><section key={kind}><h3>{labels[kind]||kind}</h3>{items.map(item=><button key={`${kind}-${item.id}`} onClick={()=>activate(item)}><span>{icon(kind)}</span><div><strong>{item.title}</strong>{item.subtitle&&<small>{item.subtitle}</small>}</div>{kind==="event"&&<MapPin className="global-search-arrow"/>}</button>)}</section>)}</div>:<div className="global-search-empty global-search-empty--compact"><Search/><strong>No matches</strong><p>Try another name, place, task, meal or message.</p></div>;
 return <>
  {profileMenu&&createPortal(<button type="button" className="profile-search-entry" onClick={()=>{setModalOpen(true);setInlineOpen(false)}}><Search/>Search Kit Hub</button>,profileMenu)}
  {searchHost&&inlineOpen&&createPortal(<section className="topbar-search-results" aria-label="Search results">{resultContent}</section>,searchHost)}
  {modalOpen&&<div className="global-search-backdrop" onMouseDown={closeModal}><section className="global-search-panel" role="dialog" aria-modal="true" aria-label="Search Kit Hub" onMouseDown={e=>e.stopPropagation()}>
   <header><div><Search/><input autoFocus value={query} onChange={e=>{setQuery(e.target.value);if(desktopInput.current)desktopInput.current.value=e.target.value}} placeholder="Search events, tasks, meals, messages…"/></div><button className="icon-button" onClick={closeModal} aria-label="Close search"><X/></button></header>{resultContent}
  </section></div>}
 </>;
}
