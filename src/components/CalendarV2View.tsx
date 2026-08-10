import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { HouseholdEvent } from "../../shared/contracts";

interface Props { events: HouseholdEvent[]; loading: boolean; onAdd: () => void; }
type Mode = "month" | "week" | "agenda";

const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeek(date: Date) { const d = new Date(date); const offset = (d.getDay() + 6) % 7; d.setDate(d.getDate() - offset); d.setHours(0,0,0,0); return d; }
function addDays(date: Date, n: number) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function sameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function eventDate(event: HouseholdEvent) { return new Date(event.startsAt); }

export function CalendarV2View({ events, loading, onAdd }: Props) {
  const [cursor, setCursor] = useState(() => new Date());
  const [mode, setMode] = useState<Mode>("month");
  const today = new Date();
  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({length:42},(_,i)=>addDays(gridStart,i));
  }, [cursor]);
  const weekDays = useMemo(() => Array.from({length:7},(_,i)=>addDays(startOfWeek(cursor),i)), [cursor]);
  const grouped = useMemo(() => events.reduce<Record<string,HouseholdEvent[]>>((map,event)=>{(map[dateKey(eventDate(event))]??=[]).push(event);return map},{}),[events]);
  function move(amount:number){ if(mode==="month") setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+amount,1)); else setCursor(addDays(cursor,amount*7)); }
  const title = mode==="month" ? cursor.toLocaleDateString(undefined,{month:"long",year:"numeric"}) : `${weekDays[0]?.toLocaleDateString(undefined,{month:"short",day:"numeric"})} – ${weekDays[6]?.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}`;
  return <>
    <header className="today-heading module-heading calendar-v2-heading"><div><span className="today-date">Kit Hub</span><h1>Calendar V2</h1><p>Events, birthdays, happenings, reminders and repeating plans in one place.</p></div><button className="button button--primary" onClick={onAdd}><Plus/> Add event</button></header>
    <section className="calendar-v2-shell">
      <header className="calendar-v2-toolbar"><div className="calendar-v2-nav"><button aria-label="Previous" onClick={()=>move(-1)}><ChevronLeft/></button><button className="calendar-v2-today" onClick={()=>setCursor(new Date())}>Today</button><button aria-label="Next" onClick={()=>move(1)}><ChevronRight/></button><strong>{title}</strong></div><div className="calendar-v2-modes"><button className={mode==="month"?"is-active":""} onClick={()=>setMode("month")}>Month</button><button className={mode==="week"?"is-active":""} onClick={()=>setMode("week")}>Week</button><button className={mode==="agenda"?"is-active":""} onClick={()=>setMode("agenda")}>Agenda</button></div></header>
      {loading ? <div className="calendar-v2-loading">Opening your calendar…</div> : mode==="month" ? <div className="calendar-month"><div className="calendar-weekdays">{weekdayNames.map(day=><span key={day}>{day}</span>)}</div><div className="calendar-month-grid">{monthDays.map(day=>{const key=dateKey(day),items=grouped[key]??[],outside=day.getMonth()!==cursor.getMonth();return <button key={key} className={`calendar-day ${outside?"is-outside":""} ${sameDay(day,today)?"is-today":""}`} onClick={items.length?undefined:onAdd}><span className="calendar-day-number">{day.getDate()}</span><div>{items.slice(0,3).map(event=><span key={event.id} className={`calendar-event-chip event-type--${event.eventType}`}><b>{event.title}</b>{!event.allDay&&<small>{eventDate(event).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}</small>}</span>)}{items.length>3&&<small className="calendar-more">+{items.length-3} more</small>}</div></button>})}</div></div> : mode==="week" ? <div className="calendar-week">{weekDays.map(day=>{const items=grouped[dateKey(day)]??[];return <article key={dateKey(day)} className={sameDay(day,today)?"is-today":""}><header><small>{day.toLocaleDateString(undefined,{weekday:"short"})}</small><strong>{day.getDate()}</strong></header><div>{items.map(event=><button key={event.id} className={`calendar-week-event event-type--${event.eventType}`}><strong>{event.title}</strong><small>{event.allDay?"All day":eventDate(event).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}</small></button>)}{!items.length&&<button className="calendar-day-add" onClick={onAdd}><Plus/> Add event</button>}</div></article>})}</div> : <div className="calendar-agenda">{events.length?[...events].sort((a,b)=>a.startsAt.localeCompare(b.startsAt)).map(event=><article key={event.id}><div><strong>{eventDate(event).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}</strong><small>{event.allDay?"All day":eventDate(event).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}</small></div><span><b>{event.title}</b><small>{event.eventType}{event.location?` · ${event.location}`:""}</small></span></article>):<CalendarEmpty onAdd={onAdd}/>}</div>}
    </section>
  </>;
}

function CalendarEmpty({onAdd}:{onAdd:()=>void}) { return <div className="calendar-empty"><span><CalendarDays/></span><strong>Your calendar is wide open.</strong><p>Add the first event, birthday, appointment or household happening.</p><button className="button button--secondary" onClick={onAdd}><Plus/> Add event</button></div>; }
