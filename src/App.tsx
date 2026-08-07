import {
  Bell,
  CalendarDays,
  Check,
  CheckSquare2,
  ChevronRight,
  CircleHelp,
  Eye,
  EyeOff,
  Home,
  ListTodo,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  NotebookPen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  UserRoundPlus,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";
import { authClient } from "./lib/auth-client";
import type {
  Bootstrap,
  GroceryItem,
  Household,
  HouseholdEvent,
  Note,
  Task,
} from "./lib/types";

type View =
  | "home"
  | "calendar"
  | "tasks"
  | "groceries"
  | "notes"
  | "messages"
  | "household"
  | "settings";

const navItems: Array<{
  id: View;
  label: string;
  icon: typeof Home;
}> = [
  { id: "home", label: "Home", icon: Home },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "groceries", label: "Groceries", icon: ShoppingBasket },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "messages", label: "Messages", icon: MessageCircle },
];

function App() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <FullPageLoader />;
  if (!session) return <AuthScreen />;
  return <SignedInApp />;
}

function FullPageLoader() {
  return (
    <div className="full-loader" role="status" aria-label="Loading Kit Hub">
      <BrandMark />
      <LoaderCircle className="spin" size={24} />
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              name: String(form.get("name") ?? "").trim(),
              email,
              password,
            })
          : await authClient.signIn.email({ email, password });

      if (result.error) throw new Error(result.error.message ?? "Could not sign in");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in");
      setPending(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-story" aria-label="About Kit Hub">
        <div className="auth-brand">
          <BrandMark />
          <BrandName />
        </div>
        <div className="story-copy">
          <p className="eyebrow light">A calmer home, together</p>
          <h1>Everything your household needs, in one cozy place.</h1>
          <p>
            Keep plans, chores, groceries, notes, and the little things everyone
            forgets in sync—without filling the family chat with reminders.
          </p>
          <div className="story-features">
            <span><CalendarDays size={18} /> One shared rhythm</span>
            <span><ShieldCheck size={18} /> Private by design</span>
            <span><Sparkles size={18} /> Simple for everyone</span>
          </div>
        </div>
        <div className="story-orbit orbit-one" />
        <div className="story-orbit orbit-two" />
        <div className="story-card floating-card one">
          <span className="mini-icon coral"><ShoppingBasket size={17} /></span>
          <span><strong>Groceries updated</strong><small>Milk, apples + 3 more</small></span>
          <Check size={17} />
        </div>
        <div className="story-card floating-card two">
          <span className="mini-icon sage"><CalendarDays size={17} /></span>
          <span><strong>Family dinner</strong><small>Tonight · 18:30</small></span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="mobile-auth-brand">
          <BrandMark />
          <BrandName />
        </div>
        <div className="auth-form-wrap">
          <p className="eyebrow">Welcome to Kit Hub</p>
          <h2>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
          <p className="muted auth-intro">
            {mode === "signup"
              ? "Start your private household space in a minute."
              : "Sign in to see what is happening at home."}
          </p>

          <div className="auth-tabs" role="tablist" aria-label="Account action">
            <button
              type="button"
              className={mode === "signup" ? "active" : ""}
              onClick={() => { setMode("signup"); setError(""); }}
            >
              Create account
            </button>
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => { setMode("login"); setError(""); }}
            >
              Sign in
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "signup" && (
              <label>
                Your name
                <input name="name" autoComplete="name" placeholder="Louisa" required minLength={2} />
              </label>
            )}
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
            </label>
            <label>
              Password
              <span className="password-field">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button auth-submit" disabled={pending}>
              {pending && <LoaderCircle className="spin" size={18} />}
              {mode === "signup" ? "Create my Kit Hub" : "Sign in"}
              {!pending && <ChevronRight size={18} />}
            </button>
          </form>
          <p className="privacy-note"><LockKeyhole size={14} /> Your household data stays private.</p>
        </div>
      </section>
    </main>
  );
}

function SignedInApp() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setData(await api<Bootstrap>("/api/bootstrap"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Kit Hub");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (loading) return <FullPageLoader />;
  if (error || !data) {
    return (
      <div className="error-page">
        <BrandMark />
        <h1>We could not open your hub</h1>
        <p>{error}</p>
        <button className="primary-button" onClick={() => { setLoading(true); void load(); }}>Try again</button>
      </div>
    );
  }
  if (!data.household) return <HouseholdOnboarding userName={data.user.name} onCreated={load} />;

  const household = data.household;
  return (
    <div className="app-shell">
      <Sidebar
        household={household}
        userName={data.user.name}
        view={view}
        onView={(next) => { setView(next); setMenuOpen(false); }}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      <div className="app-content">
        <Topbar
          household={household}
          userName={data.user.name}
          onMenu={() => setMenuOpen(true)}
        />
        <main className="main-content">
          {view === "home" ? (
            <Dashboard
              userName={data.user.name}
              household={household}
              reload={load}
              notify={setToast}
              openView={setView}
            />
          ) : (
            <ModulePage view={view} household={household} onBack={() => setView("home")} />
          )}
        </main>
        <MobileNav view={view} onView={setView} />
      </div>
      {toast && <div className="toast"><Check size={17} /> {toast}</div>}
    </div>
  );
}

function HouseholdOnboarding({ userName, onCreated }: { userName: string; onCreated: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      await api("/api/households", { method: "POST", body: { name: String(form.get("name") ?? "") } });
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the household");
      setPending(false);
    }
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-header"><BrandMark /><BrandName /></header>
      <section className="onboarding-card">
        <div className="onboarding-illustration" aria-hidden="true">
          <div className="home-shape"><Home size={48} /></div>
          <span className="member-dot a">{initials(userName)}</span>
          <span className="member-dot b">+</span>
          <span className="member-dot c">+</span>
        </div>
        <p className="eyebrow">Your household space</p>
        <h1>What should we call your hub?</h1>
        <p className="muted">This is the private home base your family members will join.</p>
        <form onSubmit={submit} className="onboarding-form">
          <label>
            Household name
            <input name="name" placeholder="The Fox Den" minLength={2} maxLength={60} required autoFocus />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={pending}>
            {pending ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
            Create our hub
          </button>
        </form>
        <p className="setup-note"><ShieldCheck size={16} /> You will be the household owner and can invite others next.</p>
      </section>
    </main>
  );
}

function Sidebar({ household, userName, view, onView, open, onClose }: {
  household: Household;
  userName: string;
  view: View;
  onView: (view: View) => void;
  open: boolean;
  onClose: () => void;
}) {
  async function signOut() {
    await authClient.signOut();
    window.location.reload();
  }

  return (
    <>
      {open && <button className="sidebar-scrim" aria-label="Close menu" onClick={onClose} />}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-brand"><BrandMark /><BrandName /><button className="close-menu" onClick={onClose}><X size={20} /></button></div>
        <button className="household-switcher">
          <span className="household-avatar">{initials(household.name)}</span>
          <span><small>Household</small><strong>{household.name}</strong></span>
          <ChevronRight size={16} />
        </button>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <span className="nav-label">Organize</span>
          {navItems.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => onView(item.id)}>
              <item.icon size={19} /><span>{item.label}</span>
              {item.id === "tasks" && household.tasks.filter((task) => task.status === "todo").length > 0 && (
                <small className="nav-count">{household.tasks.filter((task) => task.status === "todo").length}</small>
              )}
            </button>
          ))}
          <span className="nav-label second">Manage</span>
          <button className={view === "household" ? "active" : ""} onClick={() => onView("household")}><Users size={19} /><span>Household</span></button>
          <button className={view === "settings" ? "active" : ""} onClick={() => onView("settings")}><Settings size={19} /><span>Settings</span></button>
        </nav>
        <div className="sidebar-profile">
          <span className="profile-avatar">{initials(userName)}</span>
          <span><strong>{userName}</strong><small>{capitalize(household.role)}</small></span>
          <button title="Sign out" aria-label="Sign out" onClick={() => void signOut()}><LogOut size={17} /></button>
        </div>
      </aside>
    </>
  );
}

function Topbar({ household, userName, onMenu }: { household: Household; userName: string; onMenu: () => void }) {
  return (
    <header className="topbar">
      <button className="menu-button" onClick={onMenu} aria-label="Open menu"><Menu size={21} /></button>
      <div className="mobile-household"><span>{initials(household.name)}</span><strong>{household.name}</strong></div>
      <div className="topbar-actions">
        <label className="search-box"><Search size={17} /><input aria-label="Search" placeholder="Search your hub" /></label>
        <button className="icon-button" aria-label="Help"><CircleHelp size={19} /></button>
        <button className="icon-button notification" aria-label="Notifications"><Bell size={19} /><span /></button>
        <span className="top-avatar">{initials(userName)}</span>
      </div>
    </header>
  );
}

function Dashboard({ userName, household, reload, notify, openView }: {
  userName: string;
  household: Household;
  reload: () => Promise<void>;
  notify: (message: string) => void;
  openView: (view: View) => void;
}) {
  const openTasks = household.tasks.filter((task) => task.status === "todo");
  const doneTasks = household.tasks.filter((task) => task.status === "done");
  const progress = household.tasks.length
    ? Math.round((doneTasks.length / household.tasks.length) * 100)
    : 0;

  return (
    <>
      <section className="welcome-row">
        <div>
          <p className="eyebrow">{formatLongDate(new Date())}</p>
          <h1>Good {timeGreeting()}, {firstName(userName)} <span aria-hidden="true">👋</span></h1>
          <p className="muted">Here is what is happening around {household.name}.</p>
        </div>
        <button className="invite-button" onClick={() => openView("household")}><UserRoundPlus size={18} /> Invite family</button>
      </section>

      <section className="status-banner">
        <div className="status-copy">
          <span className="status-icon"><Sparkles size={22} /></span>
          <div>
            <p className="eyebrow light">Today at a glance</p>
            <h2>{openTasks.length === 0 ? "Your home base is all clear" : `${openTasks.length} ${openTasks.length === 1 ? "task" : "tasks"} left for today`}</h2>
            <p>{household.groceries.filter((item) => !item.checked).length} groceries waiting · {household.events.length} upcoming events</p>
          </div>
        </div>
        <div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>
          <span><strong>{progress}%</strong><small>done</small></span>
        </div>
      </section>

      <div className="dashboard-grid">
        <TaskCard tasks={household.tasks} reload={reload} notify={notify} openAll={() => openView("tasks")} />
        <CalendarCard events={household.events} onOpen={() => openView("calendar")} />
        <GroceryCard groceries={household.groceries} reload={reload} notify={notify} openAll={() => openView("groceries")} />
        <NotesCard notes={household.notes} onOpen={() => openView("notes")} />
      </div>

      <section className="family-strip">
        <div><p className="eyebrow">Your people</p><h2>At home together</h2></div>
        <div className="member-list">
          {household.members.slice(0, 5).map((member, index) => (
            <div className="member-chip" key={member.id}>
              <span className={`member-avatar color-${(index % 4) + 1}`}>{initials(member.displayName)}</span>
              <span><strong>{member.displayName}</strong><small>{capitalize(member.role)}</small></span>
            </div>
          ))}
          <button className="add-person" onClick={() => openView("household")}><Plus size={18} /> Add someone</button>
        </div>
      </section>
    </>
  );
}

function TaskCard({ tasks, reload, notify, openAll }: { tasks: Task[]; reload: () => Promise<void>; notify: (message: string) => void; openAll: () => void }) {
  const [adding, setAdding] = useState(false);
  const visible = tasks.slice(0, 4);

  async function toggle(task: Task) {
    await api(`/api/tasks/${task.id}`, { method: "PATCH", body: { status: task.status === "done" ? "todo" : "done" } });
    notify(task.status === "done" ? "Task reopened" : "Task completed");
    await reload();
  }

  async function add(title: string) {
    await api("/api/tasks", { method: "POST", body: { title, priority: "normal" } });
    setAdding(false); notify("Task added"); await reload();
  }

  return (
    <article className="dashboard-card task-card">
      <CardHeader icon={<CheckSquare2 size={19} />} tone="coral" title="Tasks" meta={`${tasks.filter((task) => task.status === "todo").length} open`} onOpen={openAll} />
      <div className="card-list">
        {visible.length ? visible.map((task) => (
          <button className={`check-row ${task.status === "done" ? "done" : ""}`} key={task.id} onClick={() => void toggle(task)}>
            <span className="check-box">{task.status === "done" && <Check size={14} />}</span>
            <span className="row-main"><strong>{task.title}</strong><small>{task.dueAt ? formatDue(task.dueAt) : capitalize(task.priority)}</small></span>
            {task.priority === "high" && <span className="priority-dot" title="High priority" />}
          </button>
        )) : <EmptyState icon={<CheckSquare2 size={24} />} text="No tasks yet. Enjoy the calm!" />}
      </div>
      {adding ? <QuickAdd placeholder="What needs doing?" buttonLabel="Add task" onAdd={add} onCancel={() => setAdding(false)} /> : <button className="card-add" onClick={() => setAdding(true)}><Plus size={16} /> Add a task</button>}
    </article>
  );
}

function GroceryCard({ groceries, reload, notify, openAll }: { groceries: GroceryItem[]; reload: () => Promise<void>; notify: (message: string) => void; openAll: () => void }) {
  const [adding, setAdding] = useState(false);
  const visible = groceries.slice(0, 5);

  async function toggle(item: GroceryItem) {
    await api(`/api/groceries/${item.id}`, { method: "PATCH", body: { checked: !Boolean(item.checked) } });
    notify(item.checked ? "Item put back" : "Item checked off"); await reload();
  }
  async function add(name: string) {
    await api("/api/groceries", { method: "POST", body: { name, quantity: "1" } });
    setAdding(false); notify("Grocery added"); await reload();
  }

  return (
    <article className="dashboard-card grocery-card">
      <CardHeader icon={<ShoppingBasket size={19} />} tone="sage" title="Groceries" meta={`${groceries.filter((item) => !item.checked).length} to get`} onOpen={openAll} />
      <div className="card-list grocery-list">
        {visible.length ? visible.map((item) => (
          <button className={`check-row ${item.checked ? "done" : ""}`} key={item.id} onClick={() => void toggle(item)}>
            <span className="check-box">{Boolean(item.checked) && <Check size={14} />}</span>
            <span className="row-main"><strong>{item.name}</strong></span>
            <span className="quantity">{item.quantity}</span>
          </button>
        )) : <EmptyState icon={<ShoppingBasket size={24} />} text="Your grocery list is empty." />}
      </div>
      {adding ? <QuickAdd placeholder="Add an item" buttonLabel="Add item" onAdd={add} onCancel={() => setAdding(false)} /> : <button className="card-add" onClick={() => setAdding(true)}><Plus size={16} /> Add an item</button>}
    </article>
  );
}

function CalendarCard({ events, onOpen }: { events: HouseholdEvent[]; onOpen: () => void }) {
  const today = new Date();
  return (
    <article className="dashboard-card calendar-card">
      <CardHeader icon={<CalendarDays size={19} />} tone="blue" title="Coming up" meta="Shared calendar" onOpen={onOpen} />
      <div className="mini-calendar">
        {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
          const date = new Date(today); date.setDate(today.getDate() + offset);
          return <div className={offset === 0 ? "today" : ""} key={offset}><small>{date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)}</small><strong>{date.getDate()}</strong></div>;
        })}
      </div>
      <div className="event-list">
        {events.length ? events.slice(0, 3).map((event) => (
          <button className="event-row" key={event.id} onClick={onOpen}>
            <span className="event-time"><strong>{new Date(event.startsAt).getDate()}</strong><small>{new Date(event.startsAt).toLocaleDateString(undefined, { month: "short" })}</small></span>
            <span><strong>{event.title}</strong><small>{new Date(event.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{event.location ? ` · ${event.location}` : ""}</small></span>
          </button>
        )) : <EmptyState icon={<CalendarDays size={24} />} text="No events planned yet." />}
      </div>
      <button className="card-add" onClick={onOpen}><Plus size={16} /> Add an event</button>
    </article>
  );
}

function NotesCard({ notes, onOpen }: { notes: Note[]; onOpen: () => void }) {
  return (
    <article className="dashboard-card notes-card">
      <CardHeader icon={<NotebookPen size={19} />} tone="yellow" title="Notes" meta="Shared & private" onOpen={onOpen} />
      <div className="notes-grid">
        {notes.length ? notes.slice(0, 4).map((note, index) => (
          <button className={`note-preview note-${(index % 3) + 1}`} key={note.id} onClick={onOpen}>
            <span>{note.visibility === "private" && <LockKeyhole size={13} />}</span>
            <strong>{note.title}</strong>
            <p>{note.body || "Empty note"}</p>
          </button>
        )) : (
          <button className="empty-note" onClick={onOpen}><NotebookPen size={25} /><strong>Capture a thought</strong><small>Shared lists or private notes</small></button>
        )}
      </div>
      <button className="card-add" onClick={onOpen}><Plus size={16} /> New note</button>
    </article>
  );
}

function CardHeader({ icon, tone, title, meta, onOpen }: { icon: React.ReactNode; tone: string; title: string; meta: string; onOpen: () => void }) {
  return (
    <header className="card-header">
      <span className={`card-icon ${tone}`}>{icon}</span>
      <span><h2>{title}</h2><small>{meta}</small></span>
      <button onClick={onOpen}>View all <ChevronRight size={15} /></button>
    </header>
  );
}

function QuickAdd({ placeholder, buttonLabel, onAdd, onCancel }: { placeholder: string; buttonLabel: string; onAdd: (value: string) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    setPending(true);
    try { await onAdd(value.trim()); } finally { setPending(false); }
  }
  return (
    <form className="quick-add" onSubmit={submit}>
      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} autoFocus maxLength={140} />
      <button disabled={pending}>{pending ? <LoaderCircle className="spin" size={15} /> : buttonLabel}</button>
      <button type="button" className="cancel-add" onClick={onCancel} aria-label="Cancel"><X size={16} /></button>
    </form>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="empty-state">{icon}<span>{text}</span></div>;
}

function ModulePage({ view, household, onBack }: { view: Exclude<View, "home">; household: Household; onBack: () => void }) {
  const detail = useMemo(() => ({
    calendar: [CalendarDays, "Family calendar", "Plan appointments, school days, work shifts, and family moments in one shared view."],
    tasks: [ListTodo, "All tasks", "Assign responsibilities, add due dates, and keep the whole home moving."],
    groceries: [ShoppingBasket, "Grocery lists", "Build shared lists everyone can update while shopping."],
    notes: [NotebookPen, "Notes", "Keep household references together while your personal thoughts stay private."],
    messages: [MessageCircle, "Family messages", "A calm space for household conversations and direct messages."],
    household: [Users, "Your household", "Invite family members and manage roles, permissions, and profiles."],
    settings: [Settings, "Settings", "Choose language, appearance, notifications, and household preferences."],
  }[view] as [typeof Home, string, string]), [view]);
  const Icon = detail[0] as typeof Home;

  return (
    <section className="module-page">
      <button className="back-link" onClick={onBack}>← Back to home</button>
      <div className="module-hero">
        <span><Icon size={28} /></span>
        <p className="eyebrow">{household.name}</p>
        <h1>{detail[1]}</h1>
        <p>{detail[2]}</p>
      </div>
      <div className="module-building">
        <div className="building-visual"><Sparkles size={28} /></div>
        <div><p className="eyebrow">Foundation ready</p><h2>This full workspace is next</h2><p>The data model and navigation are already prepared. The focused module experience will be built on top of this starter.</p></div>
      </div>
    </section>
  );
}

function MobileNav({ view, onView }: { view: View; onView: (view: View) => void }) {
  const items = navItems.slice(0, 5);
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {items.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => onView(item.id)}><item.icon size={20} /><span>{item.label}</span></button>)}
    </nav>
  );
}

function BrandMark() { return <span className="brand-mark" aria-hidden="true"><span>K</span></span>; }
function BrandName() { return <span className="brand-name"><strong>Kit Hub</strong><small>Family Organizer</small></span>; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "KH"; }
function firstName(value: string) { return value.trim().split(/\s+/)[0] || value; }
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function timeGreeting() { const hour = new Date().getHours(); return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"; }
function formatLongDate(date: Date) { return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }); }
function formatDue(value: number) { const date = new Date(value); const today = new Date(); return date.toDateString() === today.toDateString() ? "Due today" : `Due ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`; }

export default App;
