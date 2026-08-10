import { useEffect, useMemo, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { CalendarDays, Check, EyeOff, GripVertical, ListTodo, Pencil, Plus, RotateCcw, Save, ShoppingBasket, Sparkles, X } from "lucide-react";
import type { EverydayTask, GroceryItem, HouseholdEvent } from "../../shared/contracts";

type View = "today" | "calendar" | "tasks" | "groceries" | "members";
type AddKind = "task" | "grocery" | "event" | null;
type WidgetId = "events" | "tasks" | "groceries" | "note" | "focus" | "occasions";
type WidgetSize = "small" | "medium" | "wide" | "full";
type WidgetSetting = { id: WidgetId; size: WidgetSize; hidden: boolean };

interface Props {
  first: string;
  userId: string;
  householdId: string;
  tasks: EverydayTask[];
  groceries: GroceryItem[];
  events: HouseholdEvent[];
  onView: (view: View) => void;
  onAdd: (kind: AddKind) => void;
  onToggleTask: (task: EverydayTask) => void;
}

const widgetNames: Record<WidgetId, string> = {
  events: "Upcoming Events",
  tasks: "Tasks / To-do",
  groceries: "Groceries",
  note: "Family note",
  focus: "Household focus",
  occasions: "Special occasions",
};

const widgetDescriptions: Record<WidgetId, string> = {
  events: "See what is coming up next.",
  tasks: "Keep your personal and household to-dos close.",
  groceries: "See what still needs to be picked up.",
  note: "Keep a shared family note on Home.",
  focus: "Surface urgent tasks and important groceries.",
  occasions: "Keep birthdays and holidays visible.",
};

const defaultLayout: WidgetSetting[] = [
  { id: "events", size: "small", hidden: false },
  { id: "tasks", size: "small", hidden: false },
  { id: "groceries", size: "small", hidden: false },
  { id: "note", size: "small", hidden: true },
  { id: "focus", size: "small", hidden: false },
  { id: "occasions", size: "small", hidden: true },
];

const allWidgetIds = defaultLayout.map((item) => item.id);
const validSizes: WidgetSize[] = ["small", "medium", "wide", "full"];

function normalizeLayout(value: unknown): WidgetSetting[] {
  if (!Array.isArray(value)) return defaultLayout.map((item) => ({ ...item }));
  const seen = new Set<WidgetId>();
  const next: WidgetSetting[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<WidgetSetting>;
    if (!allWidgetIds.includes(item.id as WidgetId) || seen.has(item.id as WidgetId)) continue;
    next.push({
      id: item.id as WidgetId,
      size: validSizes.includes(item.size as WidgetSize) ? (item.size as WidgetSize) : "small",
      hidden: item.hidden === true,
    });
    seen.add(item.id as WidgetId);
  }
  for (const item of defaultLayout) if (!seen.has(item.id)) next.push({ ...item });
  return next;
}

function loadLayout(key: string) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? normalizeLayout(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

export function DashboardWidgets({ first, userId, householdId, tasks, groceries, events, onView, onAdd, onToggleTask }: Props) {
  const storageKey = `kit-hub-widgets:${userId}:${householdId}`;
  const [layout, setLayout] = useState<WidgetSetting[]>(() => loadLayout(storageKey) ?? defaultLayout.map((item) => ({ ...item })));
  const [draft, setDraft] = useState<WidgetSetting[]>(layout);
  const [editing, setEditing] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(() => loadLayout(storageKey) === null);
  const [setupSelection, setSetupSelection] = useState<Set<WidgetId>>(() => new Set(defaultLayout.filter((item) => !item.hidden).map((item) => item.id)));
  const [dragged, setDragged] = useState<WidgetId | null>(null);

  useEffect(() => {
    const stored = loadLayout(storageKey);
    const next = stored ?? defaultLayout.map((item) => ({ ...item }));
    setLayout(next);
    setDraft(next);
    setNeedsSetup(stored === null);
  }, [storageKey]);

  const active = editing ? draft : layout;
  const hidden = active.filter((item) => item.hidden);
  const specialOccasions = useMemo(() => events.filter((event) => event.eventType === "birthday" || event.eventType === "holiday"), [events]);

  function patch(id: WidgetId, change: Partial<WidgetSetting>) {
    setDraft((items) => items.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }

  function startEdit() {
    setDraft(layout.map((item) => ({ ...item })));
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(layout.map((item) => ({ ...item })));
    setEditing(false);
  }

  function saveLayout() {
    const next = normalizeLayout(draft);
    localStorage.setItem(storageKey, JSON.stringify(next));
    setLayout(next);
    setDraft(next);
    setEditing(false);
    setNeedsSetup(false);
  }

  function saveSetup() {
    const next = defaultLayout.map((item) => ({ ...item, hidden: !setupSelection.has(item.id) }));
    localStorage.setItem(storageKey, JSON.stringify(next));
    setLayout(next);
    setDraft(next);
    setNeedsSetup(false);
  }

  function useAllWidgets() {
    setSetupSelection(new Set(allWidgetIds));
  }

  function resetDraft() {
    setDraft(defaultLayout.map((item) => ({ ...item })));
  }

  function drop(target: WidgetId) {
    if (!dragged || dragged === target) return;
    setDraft((items) => {
      const from = items.findIndex((item) => item.id === dragged);
      const to = items.findIndex((item) => item.id === target);
      if (from < 0 || to < 0) return items;
      const next = [...items];
      const removed = next.splice(from, 1)[0];
      if (!removed) return items;
      next.splice(to, 0, removed);
      return next;
    });
    setDragged(null);
  }

  const widgetContent: Record<WidgetId, ReactNode> = {
    events: <><WidgetHeading title="Upcoming Events" action="View all" onClick={() => onView("calendar")} />{events.length ? <EventList events={events} /> : <EmptyWidget text="No plans yet." action="Add event" onClick={() => onAdd("event")} />}</>,
    tasks: <><WidgetHeading title="Tasks / To-do" action="View all" onClick={() => onView("tasks")} />{tasks.length ? <div className="task-list">{tasks.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} onToggle={onToggleTask} />)}</div> : <EmptyWidget text="Nothing on the list." action="Add task" onClick={() => onAdd("task")} />}</>,
    groceries: <><WidgetHeading title="Groceries" action="Open list" onClick={() => onView("groceries")} />{groceries.length ? <div className="home-grocery-preview">{groceries.slice(0, 5).map((item) => <button key={item.id} onClick={() => onView("groceries")}><strong>{item.important ? "★ " : ""}{item.name}</strong><small>{item.quantity}</small></button>)}</div> : <EmptyWidget text="The grocery list is empty." action="Add grocery" onClick={() => onAdd("grocery")} />}</>,
    note: <><span className="widget-kicker">Family</span><h2>Family note</h2><p className="handwritten-note">Leave a little note for everyone here soon…</p><small>Shared notes stay visible when this widget is enabled.</small></>,
    focus: <><span className="widget-kicker">Priority</span><h2>Household focus</h2><p>Important things rise to the surface.</p><div className="focus-counts"><strong>{tasks.filter((task) => task.priority === "high").length}</strong> urgent tasks · <strong>{groceries.filter((item) => item.important).length}</strong> important groceries</div></>,
    occasions: <><span className="widget-kicker">Coming up</span><h2>Special occasions</h2>{specialOccasions.length ? <EventList events={specialOccasions.slice(0, 3)} /> : <p>Birthdays and holidays will appear here automatically.</p>}</>,
  };

  return <>
    <header className="today-heading module-heading"><div><span className="today-date">Kit Hub</span><h1>Welcome home, {first}.</h1><p>Your Home can be as simple or as detailed as you want it to be.</p></div>{!needsSetup && !editing && <button className="button button--secondary" onClick={startEdit}><Pencil /> Edit widgets</button>}</header>

    {needsSetup && <section className="widget-onboarding">
      <div className="widget-onboarding__intro"><span><Sparkles /></span><div><strong>Make Home yours</strong><p>Choose the widgets you are most likely to use. You can change this whenever you want.</p></div></div>
      <div className="widget-onboarding__grid">{allWidgetIds.map((id) => {
        const selected = setupSelection.has(id);
        return <button key={id} type="button" className={selected ? "is-selected" : ""} onClick={() => setSetupSelection((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}><span className="widget-onboarding__check">{selected && <Check />}</span><strong>{widgetNames[id]}</strong><small>{widgetDescriptions[id]}</small>{defaultLayout.find((item) => item.id === id)?.hidden === false && <em>Recommended</em>}</button>;
      })}</div>
      <footer><button className="button button--secondary" onClick={useAllWidgets}>Select all</button><button className="button button--primary" onClick={saveSetup}>Use these widgets</button></footer>
    </section>}

    {!needsSetup && <>
      {editing && <section className="widget-edit-toolbar"><div><strong>Edit widgets</strong><small>Drag to move. Resize, hide, or restore widgets without changing anyone else's Home.</small></div><div><button className="button button--secondary" onClick={resetDraft}><RotateCcw /> Reset</button><button className="button button--secondary" onClick={cancelEdit}><X /> Cancel</button><button className="button button--primary" onClick={saveLayout}><Save /> Save layout</button></div></section>}
      {editing && hidden.length > 0 && <section className="widget-add-tray"><span>Add widget</span>{hidden.map((item) => <button key={item.id} onClick={() => patch(item.id, { hidden: false })}><Plus /> {widgetNames[item.id]}</button>)}</section>}
      <div className={`home-restored-grid dashboard-widget-grid ${editing ? "is-editing" : ""}`}>{active.filter((item) => !item.hidden).map((item) => <section key={item.id} className={`dashboard-card dashboard-widget dashboard-widget--${item.size} dashboard-widget--${item.id}`} draggable={editing} onDragStart={() => setDragged(item.id)} onDragEnd={() => setDragged(null)} onDragOver={(event: DragEvent<HTMLElement>) => { if (editing) event.preventDefault(); }} onDrop={() => drop(item.id)}>{editing && <div className="dashboard-widget__editor"><span><GripVertical /> Move</span><label>Size<select value={item.size} onChange={(event) => patch(item.id, { size: event.target.value as WidgetSize })}><option value="small">Small</option><option value="medium">Medium</option><option value="wide">Wide</option><option value="full">Full width</option></select></label><button onClick={() => patch(item.id, { hidden: true })}><EyeOff /> Hide</button></div>}<div className="dashboard-widget__content">{widgetContent[item.id]}</div></section>)}</div>
    </>}
  </>;
}

function WidgetHeading({ title, action, onClick }: { title: string; action: string; onClick: () => void }) {
  return <header className="card-heading"><div><h2>{title}</h2></div><button onClick={onClick}>{action}</button></header>;
}

function EmptyWidget({ text, action, onClick }: { text: string; action: string; onClick: () => void }) {
  return <button className="empty-state empty-state--clickable" onClick={onClick}><Plus /><strong>{text}</strong><span>{action}</span></button>;
}

function TaskRow({ task, onToggle }: { task: EverydayTask; onToggle: (task: EverydayTask) => void }) {
  const urgent = task.priority === "high" && task.status !== "done";
  return <div className={`task-row handwritten-row ${task.status === "done" ? "is-done" : ""} ${urgent ? "is-urgent" : ""}`}><button className="task-check" onClick={() => onToggle(task)}>{task.status === "done" && <Check />}</button><div><strong>{task.title}</strong><small>{task.assigneeName || "Anyone"}{task.dueAt ? ` · ${new Date(task.dueAt).toLocaleString()}` : ""}</small></div>{urgent && <span className="urgent-badge">! Urgent</span>}</div>;
}

function EventList({ events }: { events: HouseholdEvent[] }) {
  return <div className="event-list">{events.map((event) => <article key={event.id} className={`event-row event-type--${event.eventType || "event"}`}><span><strong>{new Date(event.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</strong><small>{event.allDay ? "All day" : new Date(event.startsAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</small></span><div><strong>{event.title}</strong><small>{event.eventType}{event.recurrence && event.recurrence !== "none" ? ` · repeats ${event.recurrence}` : ""}</small></div></article>)}</div>;
}
