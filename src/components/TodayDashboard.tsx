import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Bell, CalendarDays, Check, ChevronDown, CookingPot, Home, ListTodo, MessageCircle, Palette, Plus, Search, Settings, ShoppingBasket, Sparkles, Star, UsersRound, X } from "lucide-react";
import type { BootstrapResponse, EverydayCoreResponse, EverydayTask, GroceryItem, HouseholdEvent, HouseholdHomeResponse, MealPlannerResponse, HouseholdCommunicationResponse, EventRecurrence, EventType } from "../../shared/contracts";
import { ApiError, api } from "../lib/api";
import { Brand } from "./Brand";
import { DashboardWidgets } from "./DashboardWidgets";
import { FamilyHubView } from "./FamilyHubView";
import { HouseholdSettingsModal } from "./HouseholdSettingsModal";
import { MealsView } from "./MealsView";

interface Props { bootstrap: BootstrapResponse; demo?: boolean; onSignOut: () => Promise<void>; }
type View = "today" | "calendar" | "tasks" | "groceries" | "meals" | "family" | "members";
type AddKind = "task" | "grocery" | "event" | null;

const nav = [
  { key: "today" as View, label: "Home", Icon: Home },
  { key: "calendar" as View, label: "Calendar", Icon: CalendarDays },
  { key: "tasks" as View, label: "Tasks / To-do", Icon: ListTodo },
  { key: "groceries" as View, label: "Groceries", Icon: ShoppingBasket },
  { key: "meals" as View, label: "Meals", Icon: CookingPot },
  { key: "family" as View, label: "Family Hub", Icon: MessageCircle },
  { key: "members" as View, label: "Household", Icon: UsersRound },
];
const themes = ["meadow", "coastal", "urban", "seashell", "rose", "sapphire", "lapis", "amethyst"] as const;
const themeNames: Record<string, string> = { meadow: "Kit Hub Meadow", coastal: "Coastal Forest", urban: "Urban Slate", seashell: "Seashell Afternoon", rose: "Rose Quartz", sapphire: "Sapphire Nightfall", lapis: "Lapis Velvet", amethyst: "Amethyst Dawn" };
const empty: EverydayCoreResponse = { members: [], tasks: [], groceries: [], events: [] };
const emptyHome: HouseholdHomeResponse = { notes: [], focus: null, canManage: false };
const emptyMeals: MealPlannerResponse = { plans: [], recipes: [], suggestions: [], dietaryNotes: null, canManage: false };
const emptyCommunication: HouseholdCommunicationResponse = { messages: [], announcements: [], activity: [], unreadCount: 0, canSend: false, canAnnounce: false };

export function TodayDashboard({ bootstrap, demo = false, onSignOut }: Props) {
  const household = bootstrap.activeHousehold!;
  const [view, setView] = useState<View>("today");
  const [core, setCore] = useState<EverydayCoreResponse>(empty);
  const [home, setHome] = useState<HouseholdHomeResponse>(emptyHome);
  const [meals, setMeals] = useState<MealPlannerResponse>(emptyMeals);
  const [communication, setCommunication] = useState<HouseholdCommunicationResponse>(emptyCommunication);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState<string | null>(null);
  const [add, setAdd] = useState<AddKind>(null);
  const [settings, setSettings] = useState(false);
  const [profile, setProfile] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [householdName, setHouseholdName] = useState(household.name);
  const [theme, setTheme] = useState(() => localStorage.getItem("kit-hub-theme") || household.theme || "meadow");

  useEffect(() => {
    document.documentElement.dataset.kitTheme = theme;
    localStorage.setItem("kit-hub-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (demo) { setLoading(false); return; }
    let dead = false;
    setLoading(true);
    Promise.all([api.everydayCore(household.id), api.householdHome(household.id), api.meals(household.id), api.communication(household.id)])
      .then(([everyday, householdHome, mealPlanner, familyCommunication]) => {
        if (dead) return;
        setCore(everyday);
        setHome(householdHome);
        setMeals(mealPlanner);
        setCommunication(familyCommunication);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!dead) setError(caught instanceof ApiError ? caught.message : "Everyday data could not be loaded.");
      })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [demo, household.id]);

  const first = bootstrap.user.name.split(" ")[0] || bootstrap.user.name;
  const openTasks = core.tasks.filter((task) => task.status === "todo");
  const openGroceries = core.groceries.filter((item) => !item.checked);
  const upcoming = useMemo(() => core.events.filter((event) => new Date(event.startsAt) >= new Date(new Date().setHours(0, 0, 0, 0))).slice(0, 6), [core.events]);
  const notificationItems = communication.messages.filter((item) => item.authorUserId !== bootstrap.user.id).slice(0, Math.max(communication.unreadCount, 3));

  async function toggleTask(task: EverydayTask) {
    const done = task.status !== "done";
    setCore((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: done ? "done" : "todo" } : item) }));
    if (!demo) try { await api.setTaskDone(household.id, task.id, done); } catch { setCore((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? task : item) })); }
  }
  async function toggleGrocery(item: GroceryItem) {
    const checked = !item.checked;
    setCore((current) => ({ ...current, groceries: current.groceries.map((candidate) => candidate.id === item.id ? { ...candidate, checked } : candidate) }));
    if (!demo) try { await api.setGroceryChecked(household.id, item.id, checked); } catch { setCore((current) => ({ ...current, groceries: current.groceries.map((candidate) => candidate.id === item.id ? item : candidate) })); }
  }
  async function toggleImportant(item: GroceryItem) {
    const important = !item.important;
    setCore((current) => ({ ...current, groceries: current.groceries.map((candidate) => candidate.id === item.id ? { ...candidate, important } : candidate) }));
    if (!demo) try { await api.setGroceryImportant(household.id, item.id, important); } catch { setCore((current) => ({ ...current, groceries: current.groceries.map((candidate) => candidate.id === item.id ? item : candidate) })); }
  }
  async function openFamilyHub() {
    setNotifications(false); setView("family");
    if (communication.unreadCount && !demo) try { await api.markHouseholdMessagesRead(household.id); setCommunication((current) => ({ ...current, unreadCount: 0 })); } catch { /* keep unread badge */ }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <button className="household-switcher" onClick={() => setView("members")}><span className="household-switcher__avatar"><Home /></span><span><strong>{householdName}</strong><small>{core.members.length || household.memberCount} members</small></span><ChevronDown /></button>
      <nav className="sidebar-nav">{nav.map(({ key, label, Icon }) => <button key={key} className={view === key ? "is-active" : ""} onClick={() => key === "family" ? void openFamilyHub() : setView(key)}><Icon /><span>{label}</span>{key === "family" && communication.unreadCount > 0 && <b className="nav-unread">{communication.unreadCount > 99 ? "99+" : communication.unreadCount}</b>}</button>)}</nav>
      <div className="sidebar__spacer" />
      <button className="silvi-card" disabled><span><Sparkles /></span><div><strong>Ask Silvi</strong><small>Coming later</small></div></button>
      <button className="sidebar-settings" onClick={() => setSettings(true)}><Settings /> Settings</button>
    </aside>

    <div className="app-main">
      <header className="app-topbar">
        <div className="mobile-brand"><Brand compact /></div>
        <div className="topbar-search"><Search /><input placeholder="Search your home" disabled /></div>
        <div className="topbar-actions">
          <button className="mobile-search-button icon-button" aria-label="Search your home" disabled><Search /></button>
          <label className="site-theme-picker"><Palette /><select aria-label="Site theme" value={theme} onChange={(event) => setTheme(event.target.value)}>{themes.map((item) => <option key={item} value={item}>{themeNames[item]}</option>)}</select></label>
          <div className="profile-menu"><button className="icon-button notification-button" aria-label="Notifications" onClick={() => setNotifications((value) => !value)}><Bell />{communication.unreadCount > 0 && <b className="notification-dot">{communication.unreadCount > 9 ? "9+" : communication.unreadCount}</b>}</button>{notifications && <div className="notification-popover"><header><strong>Household notifications</strong><button onClick={() => void openFamilyHub()}>Open Family Hub</button></header>{notificationItems.length ? notificationItems.map((item) => <article key={item.id}><span><MessageCircle /></span><div><strong>{item.authorName}: {item.body.length > 65 ? `${item.body.slice(0, 65)}…` : item.body}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></div></article>) : <div className="notification-popover__empty">You are all caught up.</div>}</div>}</div>
          <div className="profile-menu"><button className="profile-button" onClick={() => setProfile((value) => !value)}><span>{first[0]?.toUpperCase()}</span><div><strong>{first}</strong><small>{household.role}</small></div><ChevronDown /></button>{profile && <div className="profile-popover"><p><strong>{bootstrap.user.name}</strong><small>{bootstrap.user.email}</small></p><button onClick={() => void onSignOut()}>Sign out</button></div>}</div>
        </div>
      </header>

      <main className="today-page module-page">
        {error && <div className="module-alert">{error}</div>}
        {view === "today" && <DashboardWidgets first={first} userId={bootstrap.user.id} householdId={household.id} tasks={openTasks} groceries={openGroceries} events={upcoming} home={home} meals={meals} setHome={setHome} demo={demo} onView={(next) => setView(next)} onAdd={setAdd} onToggleTask={toggleTask} />}
        {view === "tasks" && <TasksView tasks={core.tasks} loading={loading} onAdd={() => setAdd("task")} onToggle={toggleTask} />}
        {view === "groceries" && <GroceriesView items={core.groceries} loading={loading} onAdd={() => setAdd("grocery")} onToggle={toggleGrocery} onImportant={toggleImportant} />}
        {view === "calendar" && <CalendarView events={core.events} loading={loading} onAdd={() => setAdd("event")} />}
        {view === "meals" && <MealsView data={meals} members={core.members} loading={loading} householdId={household.id} demo={demo} onChange={setMeals} onGroceriesAdded={(items) => setCore((current) => ({ ...current, groceries: [...items, ...current.groceries] }))} />}
        {view === "family" && <FamilyHubView householdId={household.id} userId={bootstrap.user.id} householdName={householdName} data={communication} loading={loading} demo={demo} onChange={setCommunication} />}
        {view === "members" && <MembersView core={core} householdName={householdName} />}
      </main>
    </div>

    <nav className="mobile-nav" aria-label="Main navigation">{nav.map(({ key, label, Icon }) => <button key={key} className={view === key ? "is-active" : ""} onClick={() => key === "family" ? void openFamilyHub() : setView(key)}><Icon /><span>{label}</span>{key === "family" && communication.unreadCount > 0 && <b className="nav-unread">{communication.unreadCount > 9 ? "9+" : communication.unreadCount}</b>}</button>)}</nav>
    <button className="mobile-quick-add" aria-label="Quick add" onClick={() => setAdd("task")}><Plus /></button>
    {add && <CreateModal kind={add} members={core.members} onClose={() => setAdd(null)} onCreated={(item) => { if (add === "task") setCore((current) => ({ ...current, tasks: [item as EverydayTask, ...current.tasks] })); if (add === "grocery") setCore((current) => ({ ...current, groceries: [item as GroceryItem, ...current.groceries] })); if (add === "event") setCore((current) => ({ ...current, events: [...current.events, item as HouseholdEvent].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) })); setAdd(null); }} householdId={household.id} demo={demo} />}
    {settings && <HouseholdSettingsModal currentName={householdName} onClose={() => setSettings(false)} onSave={async (name) => { if (demo) setHouseholdName(name.trim()); else setHouseholdName((await api.updateHousehold(household.id, { name })).name); }} />}
  </div>;
}

function Heading({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  return <header className="today-heading module-heading"><div><span className="today-date">Kit Hub</span><h1>{title}</h1><p>{text}</p></div>{action && <button className="button button--primary" onClick={onAction}><Plus /> {action}</button>}</header>;
}
function Empty({ text, action = "Add something", onClick }: { text: string; action?: string; onClick: () => void }) {
  return <button className="empty-state empty-state--clickable" onClick={onClick}><Plus /><strong>{text}</strong><span>{action}</span></button>;
}
function TaskRow({ task, onToggle }: { task: EverydayTask; onToggle: (task: EverydayTask) => void }) {
  const urgent = task.priority === "high" && task.status !== "done";
  return <div className={`task-row handwritten-row ${task.status === "done" ? "is-done" : ""} ${urgent ? "is-urgent" : ""}`}><button className="task-check" onClick={() => onToggle(task)}>{task.status === "done" && <Check />}</button><div><strong>{task.title}</strong><small>{task.assigneeName || "Anyone"}{task.dueAt ? ` · ${new Date(task.dueAt).toLocaleString()}` : ""}</small></div>{urgent && <span className="urgent-badge">! Urgent</span>}</div>;
}
function TasksView({ tasks, loading, onAdd, onToggle }: { tasks: EverydayTask[]; loading: boolean; onAdd: () => void; onToggle: (task: EverydayTask) => void }) {
  const sorted = [...tasks].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1));
  return <><Heading title="Tasks / To-do" text="A family to-do list that feels more like the note on the fridge." action="Add task" onAction={onAdd} />{loading ? <p>Loading…</p> : <section className="module-card"><div className="task-list">{sorted.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} />)}</div>{!tasks.length && <Empty text="No tasks yet." action="Add task" onClick={onAdd} />}</section>}</>;
}
function GroceriesView({ items, loading, onAdd, onToggle, onImportant }: { items: GroceryItem[]; loading: boolean; onAdd: () => void; onToggle: (item: GroceryItem) => void; onImportant: (item: GroceryItem) => void }) {
  const sorted = [...items].sort((a, b) => Number(a.checked) - Number(b.checked) || Number(b.important) - Number(a.important));
  return <><Heading title="Groceries" text="Tick it off, scratch it out, and star the things nobody should forget." action="Add item" onAction={onAdd} />{loading ? <p>Loading…</p> : <section className="module-card grocery-paper">{sorted.map((item) => <div key={item.id} className={`grocery-row handwritten-row ${item.checked ? "is-scratched" : ""} ${item.important ? "is-important" : ""}`}><button className="task-check" onClick={() => onToggle(item)}>{item.checked && <Check />}</button><strong>{item.name}</strong><span>{item.quantity}</span><button className="grocery-star" aria-label={item.important ? "Remove important" : "Mark important"} onClick={() => onImportant(item)}><Star fill={item.important ? "currentColor" : "none"} /></button></div>)}{!items.length && <Empty text="The grocery list is empty." action="Add grocery" onClick={onAdd} />}</section>}</>;
}
function EventList({ events }: { events: HouseholdEvent[] }) {
  return <div className="event-list">{events.map((event) => <article key={event.id} className={`event-row event-type--${event.eventType || "event"}`}><span><strong>{new Date(event.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</strong><small>{event.allDay ? "All day" : new Date(event.startsAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</small></span><div><strong>{event.title}</strong><small>{event.eventType}{event.recurrence && event.recurrence !== "none" ? ` · repeats ${event.recurrence}` : ""}</small></div></article>)}</div>;
}
function CalendarView({ events, loading, onAdd }: { events: HouseholdEvent[]; loading: boolean; onAdd: () => void }) {
  const grouped = events.reduce<Record<string, HouseholdEvent[]>>((groups, event) => { const key = new Date(event.startsAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }); (groups[key] ??= []).push(event); return groups; }, {});
  return <><Heading title="Calendar V2" text="Events, birthdays, happenings, reminders and repeating plans in one place." action="Add event" onAction={onAdd} />{loading ? <p>Loading…</p> : <section className="calendar-v2-agenda">{Object.entries(grouped).map(([day, dayEvents]) => <div className="agenda-day" key={day}><h3>{day}</h3><EventList events={dayEvents} /></div>)}{!events.length && <Empty text="Your calendar is wide open." action="Add event" onClick={onAdd} />}</section>}</>;
}
function MembersView({ core, householdName }: { core: EverydayCoreResponse; householdName: string }) {
  return <><Heading title={householdName} text="The people who make this place home." /><section className="module-card member-grid">{core.members.map((member) => <article key={member.id}><span>{member.name[0]?.toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.email} · {member.role}</small></div></article>)}</section></>;
}

function CreateModal({ kind, members, onClose, onCreated, householdId, demo }: { kind: Exclude<AddKind, null>; members: EverydayCoreResponse["members"]; onClose: () => void; onCreated: (item: EverydayTask | GroceryItem | HouseholdEvent) => void; householdId: string; demo: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setErr(null); const form = new FormData(event.currentTarget);
    try {
      if (kind === "task") {
        const input = { title: String(form.get("title") || ""), priority: (form.get("priority") || "normal") as "low" | "normal" | "high", dueAt: form.get("dueAt") ? new Date(String(form.get("dueAt"))).toISOString() : null, assigneeUserId: String(form.get("assignee") || "") || null };
        onCreated(demo ? { id: crypto.randomUUID(), notes: null, status: "todo", assigneeName: null, createdAt: new Date().toISOString(), ...input } : await api.createTask(householdId, input));
      } else if (kind === "grocery") {
        const input = { name: String(form.get("name") || ""), quantity: String(form.get("quantity") || "1"), important: form.get("important") === "on" };
        onCreated(demo ? { id: crypto.randomUUID(), checked: false, createdAt: new Date().toISOString(), ...input } : await api.createGroceryItem(householdId, input));
      } else {
        const start = String(form.get("startsAt") || "");
        const input = { title: String(form.get("title") || ""), description: String(form.get("description") || ""), location: String(form.get("location") || ""), startsAt: new Date(start).toISOString(), allDay: form.get("allDay") === "on", eventType: String(form.get("eventType") || "event") as EventType, recurrence: String(form.get("recurrence") || "none") as EventRecurrence, reminderMinutes: Number(form.get("reminderMinutes") || 0) || null };
        onCreated(demo ? { id: crypto.randomUUID(), endsAt: null, createdAt: new Date().toISOString(), ...input } : await api.createEvent(householdId, input));
      }
    } catch (caught) { setErr(caught instanceof Error ? caught.message : "Could not save this item."); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><div className="modal-panel create-v2"><header><div><span>Quick add</span><h2>{kind === "task" ? "New task" : kind === "grocery" ? "New grocery item" : "New calendar item"}</h2></div><button aria-label="Close" onClick={onClose}><X /></button></header><form onSubmit={submit}>
    {kind === "task" && <><label>Task<input name="title" required autoFocus /></label><div className="form-grid"><label>Priority<select name="priority"><option value="normal">Normal</option><option value="high">Urgent / important</option><option value="low">Low</option></select></label><label>Due<input name="dueAt" type="datetime-local" /></label></div><label>Assign to<select name="assignee"><option value="">Anyone</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label></>}
    {kind === "grocery" && <><label>Item<input name="name" required autoFocus /></label><label>Quantity<input name="quantity" defaultValue="1" /></label><label className="check-label"><input name="important" type="checkbox" /> Highlight as important</label></>}
    {kind === "event" && <><label>Title<input name="title" required autoFocus /></label><div className="form-grid"><label>Type<select name="eventType"><option value="event">Event</option><option value="birthday">Birthday</option><option value="happening">Happening</option><option value="appointment">Appointment</option><option value="school">School</option><option value="pet">Pet</option><option value="meal">Meal</option><option value="holiday">Holiday</option></select></label><label>Starts<input name="startsAt" type="datetime-local" required /></label></div><label>Location<input name="location" /></label><label>Notes<textarea name="description" rows={3} /></label><div className="form-grid"><label>Repeat<select name="recurrence"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label><label>Reminder<select name="reminderMinutes"><option value="0">No reminder</option><option value="15">15 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option><option value="10080">1 week before</option></select></label></div><label className="check-label"><input name="allDay" type="checkbox" /> All-day event</label></>}
    {err && <div className="module-alert">{err}</div>}<footer><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button></footer>
  </form></div></div>;
}