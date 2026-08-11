import { useEffect, useMemo, useState } from "react";
import { ExternalLink, MapPin, Navigation, UsersRound, X } from "lucide-react";
import "../event-details.css";

type Member={userId:string;name:string;role:string};
type Attendee={userId:string;name:string};
type EventInfo={id:string;title:string;description:string|null;location:string|null;startsAt:string;endsAt:string|null;allDay:boolean;eventType:string;recurrence:string;reminderMinutes:number|null};
type Details={event:EventInfo;members:Member[];attendees:Attendee[];canManage:boolean};

async function getJson<T>(url:string,init?:RequestInit){const response=await fetch(url,{credentials:"include",...init,headers:{"content-type":"application/json",...init?.headers}});const body=await response.json().catch(()=>({})) as any;if(!response.ok)throw new Error(body?.error?.message||"That calendar item could not be loaded.");return body as T}
function mapLinks(location:string){const q=encodeURIComponent(location);return{google:`https://www.google.com/maps/search/?api=1&query=${q}`,waze:`https://www.waze.com/ul?q=${q}&navigate=yes`,apple:`https://maps.apple.com/?q=${q}`}}

export function EventDetailsDock({householdId}:{householdId:string}){
 const[eventId,setEventId]=useState<string|null>(null),[details,setDetails]=useState<Details|null>(null),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{const open=(event:Event)=>{const id=(event as CustomEvent<{eventId?:string}>).detail?.eventId;if(id)setEventId(id)};window.addEventListener("kit-hub-open-calendar-event",open);return()=>window.removeEventListener("kit-hub-open-calendar-event",open)},[]);
 useEffect(()=>{if(!eventId)return;setBusy(true);setError("");void getJson<Details>(`/api/v1/households/${encodeURIComponent(householdId)}/events/${encodeURIComponent(eventId)}/details`).then(data=>{setDetails(data);setSelected(data.attendees.map(x=>x.userId))}).catch(e=>setError(e instanceof Error?e.message:"That event could not be loaded.")).finally(()=>setBusy(false))},[eventId,householdId]);
 const links=useMemo(()=>details?.event.location?mapLinks(details.event.location):null,[details]);
 async function saveAttendees(){if(!details||!eventId)return;setBusy(true);setError("");try{const result=await getJson<{attendees:Attendee[]}>(`/api/v1/households/${encodeURIComponent(householdId)}/events/${encodeURIComponent(eventId)}/attendees`,{method:"PUT",body:JSON.stringify({userIds:selected})});setDetails({...details,attendees:result.attendees})}catch(e){setError(e instanceof Error?e.message:"Attendees could not be saved.")}finally{setBusy(false)}}
 if(!eventId)return null;
 return <div className="event-details-backdrop" onMouseDown={()=>setEventId(null)}><aside className="event-details-panel" role="dialog" aria-modal="true" aria-label="Calendar event details" onMouseDown={e=>e.stopPropagation()}>
  <header><div><small>CALENDAR EVENT</small><h2>{details?.event.title||"Opening event…"}</h2>{details&&<p>{details.event.allDay?new Date(details.event.startsAt).toLocaleDateString():new Date(details.event.startsAt).toLocaleString()}</p>}</div><button className="icon-button" onClick={()=>setEventId(null)} aria-label="Close"><X/></button></header>
  {error&&<p className="module-alert">{error}</p>}
  {details&&<>
   {details.event.description&&<section className="event-details-card"><p>{details.event.description}</p></section>}
   <section className="event-details-card"><div className="event-details-title"><MapPin/><div><small>LOCATION</small><h3>{details.event.location||"No location added"}</h3></div></div>{links?<div className="event-map-actions"><a href={links.waze} target="_blank" rel="noreferrer"><Navigation/>Waze</a><a href={links.google} target="_blank" rel="noreferrer"><ExternalLink/>Google Maps</a><a href={links.apple} target="_blank" rel="noreferrer"><ExternalLink/>Apple Maps</a></div>:<p>Add a location when creating the event to get one-tap navigation.</p>}</section>
   <section className="event-details-card"><div className="event-details-title"><UsersRound/><div><small>PEOPLE</small><h3>Who is included?</h3></div></div><div className="event-attendee-grid">{details.members.map(member=><label key={member.userId} className={selected.includes(member.userId)?"is-selected":""}><input type="checkbox" checked={selected.includes(member.userId)} disabled={!details.canManage||busy} onChange={e=>setSelected(current=>e.target.checked?[...current,member.userId]:current.filter(id=>id!==member.userId))}/><span>{member.name.slice(0,1).toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.role}</small></div></label>)}</div>{details.canManage&&<button className="button button--primary" disabled={busy} onClick={()=>void saveAttendees()}>{busy?"Saving…":"Save people"}</button>}</section>
  </>}
  {!details&&!error&&<p>{busy?"Loading event…":"Opening event…"}</p>}
 </aside></div>
}
