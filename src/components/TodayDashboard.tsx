import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Bell, CalendarDays, Check, CheckCircle2, ChevronDown, CircleUserRound, Clock3, Home,
  ListTodo, MapPin, MessageCircle, PawPrint, Plus, Search, Settings, ShoppingBasket,
  RotateCcw, Sparkles, SunMedium, UserRoundPlus, UsersRound, Utensils, X,
} from "lucide-react";
import type {
  BootstrapResponse, EverydayCoreResponse, EverydayTask, GroceryItem, HouseholdEvent,
} from "../../shared/contracts";
import { ApiError, api } from "../lib/api";
import { Brand } from "./Brand";
import { HouseholdSettingsModal } from "./HouseholdSettingsModal";

interface TodayDashboardProps {
  bootstrap: BootstrapResponse;
  demo?: boolean;
  onSignOut: () => Promise<void>;
}

type ViewKey = "today" | "calendar" | "tasks" | "groceries" | "members";
type AddKind = "task" | "grocery" | "event" | null;
type EventRange = "today" | "tomorrow" | "week" | "month";

const navItems = [
  { key: "today" as const, label: "Home", icon: Home },
  { key: "calendar" as const, label: "Calendar", icon: CalendarDays },
  { key: "tasks" as const, label: "Tasks", icon: ListTodo },
  { key: "groceries" as const, label: "Groceries", icon: ShoppingBasket },
  { key: "members" as const, label: "Household", icon: UsersRound },
];

const demoCore: EverydayCoreResponse = {
  members: [
    { id: "m1", userId: "demo-user", name: "Louisa", email: "louisa@example.com", role: "owner", joinedAt: new Date().toISOString() },
    { id: "m2", userId: "demo-mona", name: "Mona", email: "mona@example.com", role: "adult", joinedAt: new Date().toISOString() },
  ],
  tasks: [
    { id: "t1", title: "Put recycling outside", notes: null, status: "done", priority: "normal", dueAt: null, assigneeUserId: "demo-mona", assigneeName: "Mona", createdAt: new Date().toISOString() },
    { id: "t2", title: "Give Lucy her medicine", notes: null, status: "todo", priority: "high", dueAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), assigneeUserId: null, assigneeName: null, createdAt: new Date().toISOString() },
    { id: "t3", title: "Water the balcony plants", notes: null, status: "todo", priority: "normal", dueAt: null, assigneeUserId: null, assigneeName: null, createdAt: new Date().toISOString() },
  ],
  groceries: [
    { id: "g1", name: "Milk", quantity: "2", checked: false, createdAt: new Date().toISOString() },
    { id: "g2", name: "Cat food", quantity: "1 box", checked: false, createdAt: new Date().toISOString() },
    { id: "g3", name: "Tomatoes", quantity: "6", checked: false, createdAt: new Date().toISOString() },
    { id: "g4", name: "Pasta", quantity: "1", checked: true, createdAt: new Date().toISOString() },
  ],
  events: [
    { id: "e1", title: "Vet appointment — Lucy", description: null, location: "Animal Care Brasschaat", startsAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(), endsAt: null, allDay: false, createdAt: new Date().toISOString() },
    { id: "e2", title: "Dinner at home", description: null, location: null, startsAt: new Date(new Date().setHours(19, 0, 0, 0)).toISOString(), endsAt: null, allDay: false, createdAt: new Date().toISOString() },
  ],
};

export function TodayDashboard({ bootstrap, demo = false, onSignOut }: TodayDashboardProps) {
  const household = bootstrap.activeHousehold;
  const [view, setView] = useState<ViewKey>("today");
  const [core, setCore] = useState<EverydayCoreResponse>(demo ? demoCore : { members: [], tasks: [], groceries: [], events: [] });
  const [coreLoading, setCoreLoading] = useState(!demo);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<AddKind>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [householdName, setHouseholdName] = useState(household?.name ?? "");
  const [undoTask, setUndoTask] = useState<EverydayTask | null>(null);
  const [eventRange, setEventRange] = useState<EventRange>("week");
  const canManageHousehold = household?.role === "owner" || household?.role === "admin";
  const firstName = bootstrap.user.name.split(" ")[0] || bootstrap.user.name;

  useEffect(() => {
    if (!undoTask) return;
    const timer = window.setTimeout(() => setUndoTask(null), 8000);
    return () => window.clearTimeout(timer);
  }, [undoTask]);

  useEffect(() => {
    if (demo || !household) return;
    let cancelled = false;
    setCoreLoading(true);
    api.everydayCore(household.id)
      .then((data) => { if (!cancelled) { setCore(data); setCoreError(null); } })
      .catch((error: unknown) => { if (!cancelled) setCoreError(error instanceof ApiError ? error.message : "Everyday data could not be loaded."); })
      .finally(() => { if (!cancelled) setCoreLoading(false); });
    return () => { cancelled = true; };
  }, [demo, household?.id]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  }, []);
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const openTasks = core.tasks.filter((task) => task.status === "todo");
  const openGroceries = core.groceries.filter((item) => !item.checked);
  const dashboardEvents = useMemo(() => filterEventsByRange(core.events, eventRange), [core.events, eventRange]);

  function openAdd(kind: Exclude<AddKind, null>) {
    setQuickAddOpen(false);
    setAddKind(kind);
  }

  async function createTask(input: { title: string; dueAt: string | null; priority: "low" | "normal" | "high"; assigneeUserId: string | null }) {
    const created: EverydayTask = demo
      ? { id: crypto.randomUUID(), title: input.title, notes: null, status: "todo", priority: input.priority, dueAt: input.dueAt, assigneeUserId: input.assigneeUserId, assigneeName: core.members.find((m) => m.userId === input.assigneeUserId)?.name ?? null, createdAt: new Date().toISOString() }
      : await api.createTask(household!.id, input);
    setCore((current) => ({ ...current, tasks: [created, ...current.tasks] }));
  }

  async function createGrocery(input: { name: string; quantity: string }) {
    const created: GroceryItem = demo
      ? { id: crypto.randomUUID(), name: input.name, quantity: input.quantity, checked: false, createdAt: new Date().toISOString() }
      : await api.createGroceryItem(household!.id, input);
    setCore((current) => ({ ...current, groceries: [created, ...current.groceries] }));
  }

  async function createEvent(input: { title: string; startsAt: string; location: string }) {
    const created: HouseholdEvent = demo
      ? { id: crypto.randomUUID(), title: input.title, description: null, location: input.location || null, startsAt: input.startsAt, endsAt: null, allDay: false, createdAt: new Date().toISOString() }
      : await api.createEvent(household!.id, input);
    setCore((current) => ({ ...current, events: [...current.events, created].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) }));
  }

  async function toggleTask(task: EverydayTask) {
    const done = task.status !== "done";
    setCore((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: done ? "done" : "todo" } : item) }));
    if (done) setUndoTask(task);
    else setUndoTask((current) => current?.id === task.id ? null : current);
    if (!demo) {
      try { await api.setTaskDone(household!.id, task.id, done); }
      catch {
        setCore((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? task : item) }));
        if (done) setUndoTask((current) => current?.id === task.id ? null : current);
      }
    }
  }

  async function undoCompletedTask() {
    if (!undoTask) return;
    const task = undoTask;
    setUndoTask(null);
    setCore((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: "todo" } : item) }));
    if (!demo) {
      try { await api.setTaskDone(household!.id, task.id, false); }
      catch { setCore((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: "done" } : item) })); }
    }
  }

  async function toggleGrocery(item: GroceryItem) {
    const checked = !item.checked;
    setCore((current) => ({ ...current, groceries: current.groceries.map((entry) => entry.id === item.id ? { ...entry, checked } : entry) }));
    if (!demo) {
      try { await api.setGroceryChecked(household!.id, item.id, checked); }
      catch { setCore((current) => ({ ...current, groceries: current.groceries.map((entry) => entry.id === item.id ? item : entry) })); }
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <button className="household-switcher" type="button" onClick={() => setView("members")}>
          <span className="household-switcher__avatar"><Home /></span>
          <span><strong>{householdName}</strong><small>{core.members.length || household?.memberCount} members</small></span><ChevronDown />
        </button>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" className={view === key ? "is-active" : ""} onClick={() => setView(key)}>
              <Icon /><span>{label}</span>
            </button>
          ))}
          <button type="button" disabled><MessageCircle /><span>Chat</span><small>Soon</small></button>
        </nav>
        <div className="sidebar__spacer" />
        <button className="silvi-card" type="button" disabled><span><Sparkles /></span><div><strong>Ask Silvi</strong><small>Coming in a later milestone</small></div></button>
        <button className="sidebar-settings" type="button" onClick={() => setSettingsOpen(true)} disabled={!canManageHousehold}><Settings /> Settings</button>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="mobile-brand"><Brand compact /></div>
          <div className="topbar-search"><Search /><input aria-label="Search Kit Hub" placeholder="Search your home" disabled /><kbd>⌘ K</kbd></div>
          <div className="topbar-actions">
            {demo && <span className="demo-badge">Preview</span>}
            <button className="icon-button" type="button" aria-label="Notifications" disabled><Bell /></button>
            <div className="profile-menu">
              <button className="profile-button" type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
                <span>{firstName.slice(0, 1).toUpperCase()}</span><div><strong>{firstName}</strong><small>{household?.role}</small></div><ChevronDown />
              </button>
              {profileOpen && <div className="profile-popover"><p><strong>{bootstrap.user.name}</strong><small>{bootstrap.user.email}</small></p><button type="button" onClick={() => void onSignOut()}>{demo ? "Leave preview" : "Sign out"}</button></div>}
            </div>
          </div>
        </header>

        <main className="today-page module-page">
          {coreError && <div className="module-alert">{coreError}</div>}
          {view === "today" && <TodayView greeting={greeting} firstName={firstName} dateLabel={dateLabel} tasks={openTasks} groceries={openGroceries} events={dashboardEvents} eventRange={eventRange} members={core.members.length} loading={coreLoading} onNavigate={setView} onQuickAdd={() => setQuickAddOpen(true)} onToggleTask={toggleTask} onEventRangeChange={setEventRange} />}
          {view === "calendar" && <CalendarView events={core.events} loading={coreLoading} onAdd={() => openAdd("event")} />}
          {view === "tasks" && <TasksView tasks={core.tasks} loading={coreLoading} onAdd={() => openAdd("task")} onToggle={toggleTask} />}
          {view === "groceries" && <GroceriesView groceries={core.groceries} loading={coreLoading} onAdd={() => openAdd("grocery")} onToggle={toggleGrocery} />}
          {view === "members" && <MembersView core={core} householdName={householdName} canManage={canManageHousehold} />}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map(({ key, label, icon: Icon }) => <button key={key} type="button" className={view === key ? "is-active" : ""} onClick={() => setView(key)}><Icon /><span>{label === "Household" ? "House" : label}</span></button>)}
      </nav>
      <button className="mobile-quick-add" type="button" onClick={() => setQuickAddOpen(true)} aria-label="Quick add"><Plus /></button>

      {quickAddOpen && <QuickAddModal onClose={() => setQuickAddOpen(false)} onChoose={openAdd} onMembers={() => { setQuickAddOpen(false); setView("members"); }} />}
      {addKind && <CreateModal kind={addKind} members={core.members} onClose={() => setAddKind(null)} onTask={createTask} onGrocery={createGrocery} onEvent={createEvent} />}
      {undoTask && <div className="undo-toast" role="status"><span><strong>Task completed</strong><small>{undoTask.title}</small></span><button type="button" onClick={() => void undoCompletedTask()}><RotateCcw /> Undo</button></div>}
      {settingsOpen && household && <HouseholdSettingsModal currentName={householdName} onClose={() => setSettingsOpen(false)} onSave={async (name) => { if (demo) setHouseholdName(name.trim()); else setHouseholdName((await api.updateHousehold(household.id, { name })).name); }} />}
    </div>
  );
}

function filterEventsByRange(events: HouseholdEvent[], range: EventRange) {
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startTomorrow = new Date(startToday);
  startTomorrow.setDate(startTomorrow.getDate() + 1);
  const startDayAfterTomorrow = new Date(startTomorrow);
  startDayAfterTomorrow.setDate(startDayAfterTomorrow.getDate() + 1);
  const endWeek = new Date(startToday);
  endWeek.setDate(endWeek.getDate() + 7);
  const endMonth = new Date(startToday);
  endMonth.setDate(endMonth.getDate() + 30);

  const [start, end] = range === "today"
    ? [startToday, startTomorrow]
    : range === "tomorrow"
      ? [startTomorrow, startDayAfterTomorrow]
      : range === "week"
        ? [startToday, endWeek]
        : [startToday, endMonth];

  return events
    .filter((event) => {
      const startsAt = new Date(event.startsAt);
      return startsAt >= start && startsAt < end;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function PageHeading({ eyebrow, title, text, action, onAction }: { eyebrow: string; title: string; text: string; action?: string; onAction?: () => void }) {
  return <header className="today-heading module-heading"><div><span className="today-date">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action && <button className="button button--primary" type="button" onClick={onAction}><Plus /> {action}</button>}</header>;
}

function TodayView({ greeting, firstName, dateLabel, tasks, groceries, events, eventRange, members, loading, onNavigate, onQuickAdd, onToggleTask, onEventRangeChange }: {
  greeting: string; firstName: string; dateLabel: string; tasks: EverydayTask[]; groceries: GroceryItem[]; events: HouseholdEvent[]; eventRange: EventRange; members: number; loading: boolean; onNavigate: (view: ViewKey) => void; onQuickAdd: () => void; onToggleTask: (task: EverydayTask) => void; onEventRangeChange: (range: EventRange) => void;
}) {
  const eventRangeLabel = eventRange === "today" ? "today" : eventRange === "tomorrow" ? "tomorrow" : eventRange === "week" ? "this week" : "this month";
  const emptyTitle = eventRange === "today" ? "A quiet day so far" : eventRange === "tomorrow" ? "Nothing planned tomorrow" : eventRange === "week" ? "A quiet week ahead" : "A quiet month ahead";
  return <>
    <header className="today-heading"><div><span className="today-date"><SunMedium /> {dateLabel}</span><h1>{greeting}, {firstName}.</h1><p>Your household at a glance — what is coming up, what needs doing, and what the home needs next.</p></div><button className="button button--primary" type="button" onClick={onQuickAdd}><Plus /> Quick add</button></header>
    <section className="daily-glance" aria-label="At a glance">
      <button type="button" onClick={() => onNavigate("calendar")} aria-label={`Open calendar, ${events.length} events ${eventRangeLabel}`}><span className="glance-icon glance-icon--coral"><CalendarDays /></span><p><strong>{events.length}</strong><small>events {eventRangeLabel}</small></p></button>
      <button type="button" onClick={() => onNavigate("tasks")} aria-label={`Open tasks, ${tasks.length} open`}><span className="glance-icon glance-icon--gold"><ListTodo /></span><p><strong>{tasks.length}</strong><small>open tasks</small></p></button>
      <button type="button" onClick={() => onNavigate("groceries")} aria-label={`Open groceries, ${groceries.length} items`}><span className="glance-icon glance-icon--mint"><ShoppingBasket /></span><p><strong>{groceries.length}</strong><small>grocery items</small></p></button>
      <button type="button" onClick={() => onNavigate("members")} aria-label={`Open household, ${members} members`}><span className="glance-icon glance-icon--blue"><UsersRound /></span><p><strong>{members}</strong><small>household members</small></p></button>
    </section>
    <div className="dashboard-grid">
      <section className="dashboard-card dashboard-card--schedule">
        <header className="card-heading"><div><span className="card-icon card-icon--coral"><CalendarDays /></span><div><h2>Upcoming</h2><p>Choose how far ahead you want to look</p></div></div><button type="button" onClick={() => onNavigate("calendar")}>View calendar</button></header>
        <div role="group" aria-label="Upcoming event range" style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", margin: "0 0 1rem" }}>
          {(["today", "tomorrow", "week", "month"] as EventRange[]).map((range) => <button key={range} type="button" className={eventRange === range ? "button button--primary" : "button button--secondary"} onClick={() => onEventRangeChange(range)} style={{ minHeight: 34, padding: "0.4rem 0.72rem", fontSize: "0.82rem" }}>{range === "today" ? "Today" : range === "tomorrow" ? "Tomorrow" : range === "week" ? "Week" : "Month"}</button>)}
        </div>
        {loading ? <LoadingCard /> : events.length ? <EventList events={events.slice(0, 5)} /> : <EmptyState icon={CalendarDays} title={emptyTitle} text="Add an event or switch the range to look further ahead." />}
      </section>
      <section className="dashboard-card dashboard-card--tasks"><header className="card-heading"><div><span className="card-icon card-icon--gold"><ListTodo /></span><div><h2>Tasks</h2><p>Things to take care of</p></div></div><button type="button" onClick={() => onNavigate("tasks")}>View all</button></header>{loading ? <LoadingCard /> : tasks.length ? <div className="task-list">{tasks.slice(0, 4).map((task) => <TaskRow key={task.id} task={task} onToggle={onToggleTask} />)}</div> : <EmptyState icon={ListTodo} title="Nothing on the list" text="You are all caught up." />}</section>
      <section className="dashboard-card dashboard-card--grocery"><header className="card-heading"><div><span className="card-icon card-icon--mint"><ShoppingBasket /></span><div><h2>Groceries</h2><p>Current shopping list</p></div></div><button type="button" onClick={() => onNavigate("groceries")}>Open list</button></header>{groceries.length ? <><div className="progress-row"><span><strong>{groceries.length} items left</strong><small>Ready for the next shop</small></span></div><div className="grocery-tags">{groceries.slice(0, 3).map((item) => <span key={item.id}>{item.name}</span>)}{groceries.length > 3 && <span>+{groceries.length - 3}</span>}</div></> : <EmptyState compact icon={ShoppingBasket} title="The list is empty" text="Add the first grocery item." />}</section>
      <section className="dashboard-card dashboard-card--dinner"><div className="dinner-copy"><span className="eyebrow">MEAL PLANNING</span><h2>Connected groceries come first.</h2><p>Meals can build on the working grocery list in a later slice.</p><button type="button" disabled>Meals coming later <span>→</span></button></div><div className="dinner-illustration" aria-hidden="true"><span>🍝</span><i /><b /></div></section>
      <section className="dashboard-card dashboard-card--status"><header className="card-heading"><button className="card-heading__link" type="button" onClick={() => onNavigate("members")}><span className="card-icon card-icon--blue"><CircleUserRound /></span><div><h2>Household</h2><p>{members} active {members === 1 ? "member" : "members"}</p></div></button><button type="button" onClick={() => onNavigate("members")}>View</button></header><div className="member-list"><button type="button" onClick={() => onNavigate("members")}><span className="avatar avatar--fox">{firstName[0]?.toUpperCase()}</span><p><strong>{firstName}</strong><small><i className="status-dot status-dot--green" /> Signed in</small></p><time>Now</time></button></div></section>
      <section className="dashboard-card dashboard-card--house"><div className="house-preview" aria-hidden="true"><span className="house-preview__roof" /><span className="house-preview__wall" /><span className="house-preview__door" /><span className="house-preview__window" /><i /><b /></div><div><span className="eyebrow">YOUR DIGITAL HOME</span><h2>The useful rooms are opening.</h2><p>Calendar, tasks, groceries and household data now share the same live foundation.</p><button type="button" disabled>Explore mode stays Milestone 4</button></div></section>
    </div>
  </>;
}

function CalendarView({ events, loading, onAdd }: { events: HouseholdEvent[]; loading: boolean; onAdd: () => void }) {
  const grouped = useMemo(() => {
    const map = new Map<string, HouseholdEvent[]>();
    for (const event of events) {
      const key = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(event.startsAt));
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return [...map.entries()];
  }, [events]);
  return <><PageHeading eyebrow="CALENDAR" title="Shared time, without the clutter." text="Household events live in one calm timeline." action="Add event" onAction={onAdd} />
    <section className="module-surface">{loading ? <LoadingCard /> : grouped.length ? grouped.map(([date, items]) => <div className="calendar-day" key={date}><h2>{date}</h2><EventList events={items} /></div>) : <EmptyState icon={CalendarDays} title="No events yet" text="Add the first household event." />}</section></>;
}

function TasksView({ tasks, loading, onAdd, onToggle }: { tasks: EverydayTask[]; loading: boolean; onAdd: () => void; onToggle: (task: EverydayTask) => void }) {
  const open = tasks.filter((t) => t.status === "todo"); const done = tasks.filter((t) => t.status === "done");
  return <><PageHeading eyebrow="TASKS" title="Keep the house moving." text={`${open.length} open ${open.length === 1 ? "task" : "tasks"}. Assign work, add due times, and tick things off.`} action="Add task" onAction={onAdd} />
    <section className="module-surface">{loading ? <LoadingCard /> : <><div className="module-section-title"><h2>To do</h2><span>{open.length}</span></div>{open.length ? <div className="task-list module-list">{open.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} />)}</div> : <EmptyState compact icon={CheckCircle2} title="All clear" text="No open tasks right now." />}{done.length > 0 && <><div className="module-section-title module-section-title--done"><h2>Done</h2><span>{done.length}</span></div><div className="task-list module-list">{done.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} />)}</div></>}</>}</section></>;
}

function GroceriesView({ groceries, loading, onAdd, onToggle }: { groceries: GroceryItem[]; loading: boolean; onAdd: () => void; onToggle: (item: GroceryItem) => void }) {
  const left = groceries.filter((item) => !item.checked); const done = groceries.filter((item) => item.checked);
  return <><PageHeading eyebrow="GROCERIES" title="One list. Everyone contributes." text={`${left.length} ${left.length === 1 ? "item" : "items"} still to pick up.`} action="Add item" onAction={onAdd} />
    <section className="module-surface">{loading ? <LoadingCard /> : groceries.length ? <div className="grocery-list">{[...left, ...done].map((item) => <button type="button" className={`grocery-row ${item.checked ? "is-checked" : ""}`} key={item.id} onClick={() => void onToggle(item)}><span className="grocery-check">{item.checked && <Check />}</span><span><strong>{item.name}</strong><small>Quantity: {item.quantity}</small></span></button>)}</div> : <EmptyState icon={ShoppingBasket} title="Your list is empty" text="Add milk, cat food, or whatever the house needs next." />}</section></>;
}

function MembersView({ core, householdName, canManage }: { core: EverydayCoreResponse; householdName: string; canManage: boolean }) {
  return <><PageHeading eyebrow="HOUSEHOLD" title={householdName} text="The people who currently share this Kit Hub home." />
    <section className="module-surface"><div className="member-directory">{core.members.map((member, index) => <article key={member.id}><span className={`avatar ${index % 2 ? "avatar--plum" : "avatar--fox"}`}>{member.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.email}</small></div><span className="role-pill">{member.role}</span></article>)}</div>{canManage && <div className="members-next"><UserRoundPlus /><div><strong>Invitations are the next member-management slice.</strong><p>The directory is live now; invite links, role changes, and child controls should be added together so permissions stay coherent.</p></div></div>}</section></>;
}

function EventList({ events }: { events: HouseholdEvent[] }) {
  return <div className="timeline">{events.map((event) => <div className="timeline-item" key={event.id}><time>{event.allDay ? "ALL DAY" : new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(event.startsAt))}</time><span /><div><small>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(event.startsAt)).toUpperCase()}</small><strong>{event.title}</strong>{event.location && <p><MapPin /> {event.location}</p>}</div></div>)}</div>;
}

function TaskRow({ task, onToggle }: { task: EverydayTask; onToggle: (task: EverydayTask) => void }) {
  const meta = task.dueAt ? `Due ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(task.dueAt))}` : task.assigneeName ? `Assigned to ${task.assigneeName}` : "Anyone can claim";
  return <div className={`task ${task.status === "done" ? "task--checked" : ""}`}><button type="button" aria-label={`${task.status === "done" ? "Reopen" : "Complete"}: ${task.title}`} onClick={() => void onToggle(task)}>{task.status === "done" && <Check />}</button><p><strong>{task.title}</strong><small>{task.priority === "high" && <Clock3 />} {meta}</small></p></div>;
}

function QuickAddModal({ onClose, onChoose, onMembers }: { onClose: () => void; onChoose: (kind: Exclude<AddKind, null>) => void; onMembers: () => void }) {
  const actions = [
    { label: "Grocery item", text: "Add to the shared list", icon: ShoppingBasket, color: "mint", run: () => onChoose("grocery") },
    { label: "Task", text: "Create a household to-do", icon: CheckCircle2, color: "gold", run: () => onChoose("task") },
    { label: "Event", text: "Put something on the calendar", icon: CalendarDays, color: "blue", run: () => onChoose("event") },
    { label: "Household", text: "See everyone in this home", icon: UsersRound, color: "coral", run: onMembers },
  ];
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="quick-add-modal" role="dialog" aria-modal="true" aria-labelledby="quick-add-title" onMouseDown={(e) => e.stopPropagation()}><header><div><span className="eyebrow">QUICK ADD</span><h2 id="quick-add-title">What&apos;s happening?</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X /></button></header><div className="quick-action-grid">{actions.map(({ label, text, icon: Icon, color, run }) => <button type="button" key={label} onClick={run}><span className={`quick-action quick-action--${color}`}><Icon /></span><strong>{label}</strong><small>{text}</small></button>)}</div><p>Calendar, tasks and groceries save to your household immediately.</p></section></div>;
}

function CreateModal({ kind, members, onClose, onTask, onGrocery, onEvent }: {
  kind: Exclude<AddKind, null>; members: EverydayCoreResponse["members"]; onClose: () => void;
  onTask: (input: { title: string; dueAt: string | null; priority: "low" | "normal" | "high"; assigneeUserId: string | null }) => Promise<void>;
  onGrocery: (input: { name: string; quantity: string }) => Promise<void>;
  onEvent: (input: { title: string; startsAt: string; location: string }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null); const data = new FormData(event.currentTarget);
    try {
      if (kind === "task") {
        const rawDue = String(data.get("dueAt") ?? "");
        await onTask({ title: String(data.get("title") ?? "").trim(), dueAt: rawDue ? new Date(rawDue).toISOString() : null, priority: String(data.get("priority") ?? "normal") as "low" | "normal" | "high", assigneeUserId: String(data.get("assigneeUserId") ?? "") || null });
      } else if (kind === "grocery") {
        await onGrocery({ name: String(data.get("name") ?? "").trim(), quantity: String(data.get("quantity") ?? "1").trim() || "1" });
      } else {
        const rawStart = String(data.get("startsAt") ?? "");
        if (!rawStart) throw new Error("Choose when the event starts.");
        await onEvent({ title: String(data.get("title") ?? "").trim(), startsAt: new Date(rawStart).toISOString(), location: String(data.get("location") ?? "").trim() });
      }
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save this item."); }
    finally { setSaving(false); }
  }
  const title = kind === "task" ? "Add a task" : kind === "grocery" ? "Add a grocery item" : "Add an event";
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="create-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}><header><div><span className="eyebrow">EVERYDAY CORE</span><h2>{title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X /></button></header><form onSubmit={submit}>
    {kind === "grocery" ? <><label><span>Item</span><input name="name" required maxLength={120} autoFocus placeholder="e.g. Milk" /></label><label><span>Quantity</span><input name="quantity" maxLength={40} defaultValue="1" placeholder="e.g. 2 cartons" /></label></> : <><label><span>{kind === "event" ? "Event" : "Task"}</span><input name="title" required maxLength={160} autoFocus placeholder={kind === "event" ? "e.g. Dentist appointment" : "e.g. Put recycling outside"} /></label>{kind === "task" ? <div className="create-modal__row"><label><span>Due</span><input name="dueAt" type="datetime-local" /></label><label><span>Priority</span><select name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label><label><span>Assign to</span><select name="assigneeUserId" defaultValue=""><option value="">Anyone</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label></div> : <><label><span>Starts</span><input name="startsAt" type="datetime-local" required /></label><label><span>Location</span><input name="location" maxLength={180} placeholder="Optional" /></label></>}</>}
    {error && <p className="form-error">{error}</p>}<div className="create-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Cancel</button><button className="button button--primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button></div>
  </form></section></div>;
}

function LoadingCard() { return <div className="module-loading"><span className="loading-orbit" aria-hidden="true"><i /></span><p>Loading your household…</p></div>; }
function EmptyState({ icon: Icon, title, text, compact = false }: { icon: typeof CalendarDays; title: string; text: string; compact?: boolean }) { return <div className={`empty-state ${compact ? "empty-state--compact" : ""}`}><span><Icon /></span><div><strong>{title}</strong><p>{text}</p></div></div>; }
