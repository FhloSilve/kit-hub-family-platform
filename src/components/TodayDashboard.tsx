import { useEffect, useMemo, useState } from "react";
import type {
  Dispatch,
  DragEvent,
  FormEvent,
  ReactNode,
  SetStateAction,
} from "react";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CookingPot,
  EyeOff,
  GripVertical,
  Home,
  ListTodo,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShoppingBasket,
  Sparkles,
  Star,
  UsersRound,
  X,
} from "lucide-react";
import type {
  BootstrapResponse,
  EverydayCoreResponse,
  EverydayTask,
  FamilyNote,
  GroceryItem,
  HouseholdEvent,
  HouseholdFocus,
  HouseholdHomeResponse,
  MealPlannerResponse,
  EventRecurrence,
  EventType,
} from "../../shared/contracts";
import { ApiError, api } from "../lib/api";
import { Brand } from "./Brand";
import { HouseholdSettingsModal } from "./HouseholdSettingsModal";
import { MealsView } from "./MealsView";
interface Props {
  bootstrap: BootstrapResponse;
  demo?: boolean;
  onSignOut: () => Promise<void>;
}
type View = "today" | "calendar" | "tasks" | "groceries" | "meals" | "members";
type AddKind = "task" | "grocery" | "event" | null;
type CardId = "events" | "tasks" | "groceries" | "meals" | "note" | "focus" | "occasions";
type CardSize = "small" | "medium" | "wide" | "full";
type CardSetting = { id: CardId; size: CardSize; hidden: boolean };
const nav = [
  { key: "today" as View, label: "Home", Icon: Home },
  { key: "calendar" as View, label: "Calendar", Icon: CalendarDays },
  { key: "tasks" as View, label: "Tasks / To-do", Icon: ListTodo },
  { key: "groceries" as View, label: "Groceries", Icon: ShoppingBasket },
  { key: "meals" as View, label: "Meals", Icon: CookingPot },
  { key: "members" as View, label: "Household", Icon: UsersRound },
];
const themes = [
  "meadow",
  "coastal",
  "urban",
  "seashell",
  "rose",
  "sapphire",
  "lapis",
  "amethyst",
] as const;
const themeNames: Record<string, string> = {
  meadow: "Kit Hub Meadow",
  coastal: "Coastal Forest",
  urban: "Urban Slate",
  seashell: "Seashell Afternoon",
  rose: "Rose Quartz",
  sapphire: "Sapphire Nightfall",
  lapis: "Lapis Velvet",
  amethyst: "Amethyst Dawn",
};
const empty: EverydayCoreResponse = {
  members: [],
  tasks: [],
  groceries: [],
  events: [],
};
const emptyHome: HouseholdHomeResponse = {
  notes: [],
  focus: null,
  canManage: false,
};
const emptyMeals: MealPlannerResponse = { plans: [], recipes: [], suggestions: [], dietaryNotes: null, canManage: false };
function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const demoMeals: MealPlannerResponse = {
  plans: [{ id: "demo-dinner", mealDate: localDateKey(), mealType: "dinner", title: "Garden pasta", recipeId: "demo-recipe", recipeName: "Garden pasta", cookUserId: "demo-user", cookName: "Louisa", notes: "With a crunchy green salad", reminderMinutes: 60, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
  recipes: [{ id: "demo-recipe", name: "Garden pasta", description: "A colourful weeknight favourite", ingredients: [{ name: "Pasta", quantity: "500 g" }, { name: "Cherry tomatoes", quantity: "2 boxes" }, { name: "Basil", quantity: "1 bunch" }], instructions: "Cook the pasta, fold through the vegetables, and finish with basil.", favorite: true, createdBy: "demo-user", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
  suggestions: [{ id: "demo-suggestion", title: "Homemade pizza", notes: "Everyone chooses a topping", mealType: "dinner", suggestedByUserId: "demo-user", suggestedByName: "Louisa", votes: 3, votedByMe: true, createdAt: new Date().toISOString() }],
  dietaryNotes: "Keep one portion dairy-free.",
  canManage: true,
};
const demoHome: HouseholdHomeResponse = {
  notes: [
    {
      id: "demo-note",
      body: "Dinner is at seven. Please add anything we still need to groceries!",
      authorUserId: "demo-user",
      authorName: "Louisa",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  focus: {
    title: "A calm start to the school week",
    details: "Pack lunches tonight and keep Tuesday evening free.",
    updatedByUserId: "demo-user",
    updatedByName: "Louisa",
    updatedAt: new Date().toISOString(),
  },
  canManage: true,
};
const defaults: CardSetting[] = (
  ["events", "tasks", "groceries", "meals", "note", "focus", "occasions"] as CardId[]
).map((id) => ({ id, size: "small", hidden: false }));
const names: Record<CardId, string> = {
  events: "Upcoming Events",
  tasks: "Tasks / To-do",
  groceries: "Groceries",
  meals: "Tonight's dinner",
  note: "Family note",
  focus: "Household focus",
  occasions: "Special occasions",
};
function normalize(v: unknown) {
  if (!Array.isArray(v)) return defaults.map((x) => ({ ...x }));
  const out: CardSetting[] = [];
  const seen = new Set<CardId>();
  for (const raw of v) {
    const r = raw as Partial<CardSetting>;
    if (!defaults.some((x) => x.id === r?.id) || seen.has(r.id as CardId))
      continue;
    out.push({
      id: r.id as CardId,
      size: ["small", "medium", "wide", "full"].includes(String(r.size))
        ? (r.size as CardSize)
        : "small",
      hidden: r.hidden === true,
    });
    seen.add(r.id as CardId);
  }
  for (const d of defaults) if (!seen.has(d.id)) out.push({ ...d });
  return out;
}
function readLayout(k: string) {
  try {
    return normalize(JSON.parse(localStorage.getItem(k) || "null"));
  } catch {
    return defaults.map((x) => ({ ...x }));
  }
}
export function TodayDashboard({ bootstrap, demo = false, onSignOut }: Props) {
  const household = bootstrap.activeHousehold!;
  const [view, setView] = useState<View>("today"),
    [core, setCore] = useState<EverydayCoreResponse>(empty),
    [home, setHome] = useState<HouseholdHomeResponse>(
      demo ? demoHome : emptyHome,
    ),
    [meals, setMeals] = useState<MealPlannerResponse>(demo ? demoMeals : emptyMeals),
    [loading, setLoading] = useState(!demo),
    [error, setError] = useState<string | null>(null),
    [add, setAdd] = useState<AddKind>(null),
    [settings, setSettings] = useState(false),
    [profile, setProfile] = useState(false),
    [householdName, setHouseholdName] = useState(household.name),
    [theme, setTheme] = useState(
      () =>
        localStorage.getItem("kit-hub-theme") || household.theme || "meadow",
    );
  useEffect(() => {
    document.documentElement.dataset.kitTheme = theme;
    localStorage.setItem("kit-hub-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (demo) {
      setHome(demoHome);
      setMeals(demoMeals);
      setLoading(false);
      return;
    }
    let dead = false;
    setLoading(true);
    Promise.all([
      api.everydayCore(household.id),
      api.householdHome(household.id),
      api.meals(household.id),
    ])
      .then(([everyday, householdHome, mealPlanner]) => {
        if (!dead) {
          setCore(everyday);
          setHome(householdHome);
          setMeals(mealPlanner);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!dead)
          setError(
            e instanceof ApiError
              ? e.message
              : "Everyday data could not be loaded.",
          );
      })
      .finally(() => {
        if (!dead) setLoading(false);
      });
    return () => {
      dead = true;
    };
  }, [demo, household.id]);
  const first = bootstrap.user.name.split(" ")[0] || bootstrap.user.name,
    openTasks = core.tasks.filter((t) => t.status === "todo"),
    openGroceries = core.groceries.filter((g) => !g.checked),
    upcoming = useMemo(
      () =>
        core.events
          .filter(
            (e) =>
              new Date(e.startsAt) >= new Date(new Date().setHours(0, 0, 0, 0)),
          )
          .slice(0, 6),
      [core.events],
    );
  async function toggleTask(t: EverydayTask) {
    const done = t.status !== "done";
    setCore((c) => ({
      ...c,
      tasks: c.tasks.map((x) =>
        x.id === t.id ? { ...x, status: done ? "done" : "todo" } : x,
      ),
    }));
    if (!demo)
      try {
        await api.setTaskDone(household.id, t.id, done);
      } catch {}
  }
  async function toggleGrocery(g: GroceryItem) {
    const checked = !g.checked;
    setCore((c) => ({
      ...c,
      groceries: c.groceries.map((x) =>
        x.id === g.id ? { ...x, checked } : x,
      ),
    }));
    if (!demo)
      try {
        await api.setGroceryChecked(household.id, g.id, checked);
      } catch {}
  }
  async function toggleImportant(g: GroceryItem) {
    const important = !g.important;
    setCore((c) => ({
      ...c,
      groceries: c.groceries.map((x) =>
        x.id === g.id ? { ...x, important } : x,
      ),
    }));
    if (!demo)
      try {
        await api.setGroceryImportant(household.id, g.id, important);
      } catch {}
  }
  const layoutKey = `kit-hub-home-layout:${bootstrap.user.id}:${household.id}`;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <button
          className="household-switcher"
          onClick={() => setView("members")}
        >
          <span className="household-switcher__avatar">
            <Home />
          </span>
          <span>
            <strong>{householdName}</strong>
            <small>
              {core.members.length || household.memberCount} members
            </small>
          </span>
          <ChevronDown />
        </button>
        <nav className="sidebar-nav">
          {nav.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={view === key ? "is-active" : ""}
              onClick={() => setView(key)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar__spacer" />
        <button className="silvi-card" disabled>
          <span>
            <Sparkles />
          </span>
          <div>
            <strong>Ask Silvi</strong>
            <small>Coming later</small>
          </div>
        </button>
        <button className="sidebar-settings" onClick={() => setSettings(true)}>
          <Settings /> Settings
        </button>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="mobile-brand">
            <Brand compact />
          </div>
          <div className="topbar-search">
            <Search />
            <input placeholder="Search your home" disabled />
          </div>
          <div className="topbar-actions">
            <button className="mobile-search-button icon-button" disabled>
              <Search />
            </button>
            <label className="site-theme-picker">
              <Palette />
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                {themes.map((t) => (
                  <option key={t} value={t}>
                    {themeNames[t]}
                  </option>
                ))}
              </select>
            </label>
            <button className="icon-button" disabled>
              <Bell />
            </button>
            <div className="profile-menu">
              <button
                className="profile-button"
                onClick={() => setProfile((v) => !v)}
              >
                <span>{first[0]?.toUpperCase()}</span>
                <div>
                  <strong>{first}</strong>
                  <small>{household.role}</small>
                </div>
                <ChevronDown />
              </button>
              {profile && (
                <div className="profile-popover">
                  <p>
                    <strong>{bootstrap.user.name}</strong>
                    <small>{bootstrap.user.email}</small>
                  </p>
                  <button onClick={() => void onSignOut()}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="today-page module-page">
          {error && <div className="module-alert">{error}</div>}
          {view === "today" && (
            <HomeView
              first={first}
              tasks={openTasks}
              groceries={openGroceries}
              events={upcoming}
              home={home}
              meals={meals}
              setHome={setHome}
              householdId={household.id}
              demo={demo}
              onView={setView}
              onAdd={setAdd}
              onToggleTask={toggleTask}
              layoutKey={layoutKey}
            />
          )}{" "}
          {view === "tasks" && (
            <TasksView
              tasks={core.tasks}
              loading={loading}
              onAdd={() => setAdd("task")}
              onToggle={toggleTask}
            />
          )}{" "}
          {view === "groceries" && (
            <GroceriesView
              items={core.groceries}
              loading={loading}
              onAdd={() => setAdd("grocery")}
              onToggle={toggleGrocery}
              onImportant={toggleImportant}
            />
          )}{" "}
          {view === "calendar" && (
            <CalendarView
              events={core.events}
              loading={loading}
              onAdd={() => setAdd("event")}
            />
          )}{" "}
          {view === "meals" && (
            <MealsView
              data={meals}
              members={core.members}
              loading={loading}
              householdId={household.id}
              demo={demo}
              onChange={setMeals}
              onGroceriesAdded={(items) => setCore((current) => ({ ...current, groceries: [...items, ...current.groceries] }))}
            />
          )}{" "}
          {view === "members" && (
            <MembersView core={core} householdName={householdName} />
          )}
        </main>
      </div>
      <nav className="mobile-nav">
        {nav.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={view === key ? "is-active" : ""}
            onClick={() => setView(key)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <button className="mobile-quick-add" onClick={() => setAdd("task")}>
        <Plus />
      </button>
      {add && (
        <CreateModal
          kind={add}
          members={core.members}
          onClose={() => setAdd(null)}
          onCreated={(item) => {
            if (add === "task")
              setCore((c) => ({
                ...c,
                tasks: [item as EverydayTask, ...c.tasks],
              }));
            if (add === "grocery")
              setCore((c) => ({
                ...c,
                groceries: [item as GroceryItem, ...c.groceries],
              }));
            if (add === "event")
              setCore((c) => ({
                ...c,
                events: [...c.events, item as HouseholdEvent],
              }));
            setAdd(null);
          }}
          householdId={household.id}
          demo={demo}
        />
      )}{" "}
      {settings && (
        <HouseholdSettingsModal
          currentName={householdName}
          onClose={() => setSettings(false)}
          onSave={async (name) => {
            if (demo) setHouseholdName(name.trim());
            else
              setHouseholdName(
                (await api.updateHousehold(household.id, { name })).name,
              );
          }}
        />
      )}
    </div>
  );
}
function Heading({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <header className="today-heading module-heading">
      <div>
        <span className="today-date">Kit Hub</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action && (
        <button className="button button--primary" onClick={onAction}>
          <Plus /> {action}
        </button>
      )}
    </header>
  );
}
function HomeView({
  first,
  tasks,
  groceries,
  events,
  home,
  meals,
  setHome,
  householdId,
  demo,
  onView,
  onAdd,
  onToggleTask,
  layoutKey,
}: {
  first: string;
  tasks: EverydayTask[];
  groceries: GroceryItem[];
  events: HouseholdEvent[];
  home: HouseholdHomeResponse;
  meals: MealPlannerResponse;
  setHome: Dispatch<SetStateAction<HouseholdHomeResponse>>;
  householdId: string;
  demo: boolean;
  onView: (v: View) => void;
  onAdd: (k: AddKind) => void;
  onToggleTask: (t: EverydayTask) => void;
  layoutKey: string;
}) {
  const [layout, setLayout] = useState(() => readLayout(layoutKey)),
    [draft, setDraft] = useState<CardSetting[]>(layout),
    [editing, setEditing] = useState(false),
    [dragged, setDragged] = useState<CardId | null>(null),
    [editingNote, setEditingNote] = useState<FamilyNote | "new" | null>(null),
    [editingFocus, setEditingFocus] = useState(false),
    [homeError, setHomeError] = useState<string | null>(null);
  useEffect(() => {
    const n = readLayout(layoutKey);
    setLayout(n);
    setDraft(n);
    setEditing(false);
  }, [layoutKey]);
  const active = editing ? draft : layout;
  function patch(id: CardId, c: Partial<CardSetting>) {
    setDraft((a) => a.map((x) => (x.id === id ? { ...x, ...c } : x)));
  }
  function drop(target: CardId) {
    if (!dragged || dragged === target) return;
    setDraft((a) => {
      const f = a.findIndex((x) => x.id === dragged),
        t = a.findIndex((x) => x.id === target);
      if (f < 0 || t < 0) return a;
      const n = [...a],
        [item] = n.splice(f, 1);
      if (!item) return a;
      n.splice(t, 0, item);
      return n;
    });
    setDragged(null);
  }
  const special = events.filter(
    (e) => e.eventType === "birthday" || e.eventType === "holiday",
  );
  const todayKey = localDateKey();
  const tonight = meals.plans.find((plan) => plan.mealDate === todayKey && plan.mealType === "dinner") ?? null;

  async function saveNote(body: string) {
    setHomeError(null);
    try {
      if (editingNote && editingNote !== "new") {
        const updated = demo
          ? { ...editingNote, body, updatedAt: new Date().toISOString() }
          : await api.updateFamilyNote(householdId, editingNote.id, { body });
        setHome((current) => ({
          ...current,
          notes: current.notes.map((note) =>
            note.id === updated.id ? updated : note,
          ),
        }));
      } else {
        const created = demo
          ? {
              id: crypto.randomUUID(),
              body,
              authorUserId: "demo-user",
              authorName: "Louisa",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : await api.createFamilyNote(householdId, { body });
        setHome((current) => ({
          ...current,
          notes: [created, ...current.notes],
        }));
      }
      setEditingNote(null);
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error("The family note could not be saved.");
    }
  }

  async function deleteNote(note: FamilyNote) {
    if (!window.confirm(`Delete the note from ${note.authorName}?`)) return;
    setHomeError(null);
    try {
      if (!demo) await api.deleteFamilyNote(householdId, note.id);
      setHome((current) => ({
        ...current,
        notes: current.notes.filter((item) => item.id !== note.id),
      }));
    } catch (error) {
      setHomeError(
        error instanceof Error
          ? error.message
          : "The family note could not be deleted.",
      );
    }
  }

  async function saveFocus(title: string, details: string) {
    const focus = demo
      ? {
          title,
          details: details || null,
          updatedByUserId: "demo-user",
          updatedByName: "Louisa",
          updatedAt: new Date().toISOString(),
        }
      : await api.saveHouseholdFocus(householdId, { title, details });
    setHome((current) => ({ ...current, focus }));
    setEditingFocus(false);
  }

  const content: Record<CardId, ReactNode> = {
    events: (
      <>
        <CardHead title="Upcoming Events" onClick={() => onView("calendar")} />
        {events.length ? (
          <EventList events={events} />
        ) : (
          <Empty text="No plans yet." onClick={() => onAdd("event")} />
        )}
      </>
    ),
    tasks: (
      <>
        <CardHead title="Tasks / To-do" onClick={() => onView("tasks")} />
        {tasks.length ? (
          <div className="task-list">
            {tasks.slice(0, 5).map((t) => (
              <TaskRow key={t.id} task={t} onToggle={onToggleTask} />
            ))}
          </div>
        ) : (
          <Empty text="Nothing on the list." onClick={() => onAdd("task")} />
        )}
      </>
    ),
    groceries: (
      <>
        <CardHead title="Groceries" onClick={() => onView("groceries")} />
        {groceries.length ? (
          <div className="home-grocery-preview">
            {groceries.slice(0, 5).map((g) => (
              <button key={g.id} onClick={() => onView("groceries")}>
                <strong>
                  {g.important ? "★ " : ""}
                  {g.name}
                </strong>
                <small>{g.quantity}</small>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            text="The grocery list is empty."
            onClick={() => onAdd("grocery")}
          />
        )}
      </>
    ),
    meals: (
      <div className="dashboard-meal-card">
        <header><span><CookingPot /></span><div><small>Tonight&apos;s dinner</small><h2>{tonight?.title || "Nothing planned yet"}</h2></div></header>
        {tonight ? <div className="dashboard-meal-details">{tonight.cookName && <span>Cook: {tonight.cookName}</span>}{tonight.notes && <p>{tonight.notes}</p>}</div> : <p>Choose dinner, assign the cook, and keep the household in sync.</p>}
        <button onClick={() => onView("meals")}>{tonight ? "Open meal planner" : "Plan tonight's dinner"} <span>→</span></button>
      </div>
    ),
    note: (
      <>
        <header className="shared-home-heading">
          <div>
            <span>Shared with the household</span>
            <h2>Family notes</h2>
          </div>
          {home.canManage && (
            <button onClick={() => setEditingNote("new")}>
              <Plus /> Add note
            </button>
          )}
        </header>
        {homeError && <p className="shared-home-error">{homeError}</p>}
        {home.notes.length ? (
          <div className="family-note-list">
            {home.notes.slice(0, 4).map((note) => (
              <article key={note.id}>
                <p className="handwritten-note">{note.body}</p>
                <footer>
                  <small>
                    {note.authorName} · {formatHomeDate(note.updatedAt)}
                  </small>
                  {home.canManage && (
                    <span>
                      <button
                        aria-label="Edit family note"
                        onClick={() => setEditingNote(note)}
                      >
                        <Pencil />
                      </button>
                      <button
                        aria-label="Delete family note"
                        onClick={() => void deleteNote(note)}
                      >
                        <X />
                      </button>
                    </span>
                  )}
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <button
            className="shared-home-empty"
            disabled={!home.canManage}
            onClick={() => setEditingNote("new")}
          >
            <Plus />
            <strong>No family notes yet.</strong>
            <small>
              {home.canManage
                ? "Leave the first note for everyone."
                : "A household member can add one here."}
            </small>
          </button>
        )}
      </>
    ),
    focus: (
      <>
        <header className="shared-home-heading">
          <div>
            <span>What matters right now</span>
            <h2>Household focus</h2>
          </div>
          {home.canManage && (
            <button onClick={() => setEditingFocus(true)}>
              <Pencil /> {home.focus ? "Edit" : "Set focus"}
            </button>
          )}
        </header>
        {home.focus ? (
          <div className="household-focus-content">
            <strong>{home.focus.title}</strong>
            {home.focus.details && <p>{home.focus.details}</p>}
            <small>
              Updated by {home.focus.updatedByName} ·{" "}
              {formatHomeDate(home.focus.updatedAt)}
            </small>
          </div>
        ) : (
          <button
            className="shared-home-empty"
            disabled={!home.canManage}
            onClick={() => setEditingFocus(true)}
          >
            <Plus />
            <strong>No household focus yet.</strong>
            <small>
              {home.canManage
                ? "Highlight the one thing everyone should remember."
                : "A household member can set it here."}
            </small>
          </button>
        )}
      </>
    ),
    occasions: (
      <>
        <h2>Special occasions</h2>
        {special.length ? (
          <EventList events={special.slice(0, 3)} />
        ) : (
          <p>Birthdays and holidays will appear here automatically.</p>
        )}
      </>
    ),
  };
  return (
    <>
      <Heading
        title={`Welcome home, ${first}.`}
        text="Everything your household needs, in one warm little corner."
      />
      <div className={`dashboard-edit-bar ${editing ? "is-editing" : ""}`}>
        <div>
          {editing ? (
            <>
              <strong>Personalise your Home</strong>
              <small>Drag, resize or hide sections.</small>
            </>
          ) : (
            <small>Your dashboard can be personalised just for you.</small>
          )}
        </div>
        <div>
          {editing ? (
            <>
              <button
                className="button button--secondary"
                onClick={() => setDraft(defaults.map((x) => ({ ...x })))}
              >
                <RotateCcw /> Reset
              </button>
              <button
                className="button button--secondary"
                onClick={() => {
                  setDraft(layout);
                  setEditing(false);
                }}
              >
                <X /> Cancel
              </button>
              <button
                className="button button--primary"
                onClick={() => {
                  const n = normalize(draft);
                  localStorage.setItem(layoutKey, JSON.stringify(n));
                  setLayout(n);
                  setDraft(n);
                  setEditing(false);
                }}
              >
                <Save /> Save layout
              </button>
            </>
          ) : (
            <button
              className="button button--secondary"
              onClick={() => {
                setDraft(layout.map((x) => ({ ...x })));
                setEditing(true);
              }}
            >
              <Pencil /> Edit dashboard
            </button>
          )}
        </div>
      </div>
      <section className="daily-glance">
        <button onClick={() => onView("calendar")}>
          <CalendarDays />
          <p>
            <strong>{events.length}</strong>
            <small>upcoming events</small>
          </p>
        </button>
        <button onClick={() => onView("tasks")}>
          <ListTodo />
          <p>
            <strong>{tasks.length}</strong>
            <small>open to-dos</small>
          </p>
        </button>
        <button onClick={() => onView("groceries")}>
          <ShoppingBasket />
          <p>
            <strong>{groceries.length}</strong>
            <small>groceries to pick up</small>
          </p>
        </button>
      </section>
      {editing && active.some((x) => x.hidden) && (
        <section className="dashboard-add-sections">
          <span>Add section</span>
          {active
            .filter((x) => x.hidden)
            .map((x) => (
              <button key={x.id} onClick={() => patch(x.id, { hidden: false })}>
                <Plus /> {names[x.id]}
              </button>
            ))}
        </section>
      )}
      <div
        className={`home-restored-grid dashboard-custom-grid ${editing ? "is-editing" : ""}`}
      >
        {active
          .filter((x) => !x.hidden)
          .map((x) => (
            <section
              key={x.id}
              className={`dashboard-card dashboard-custom-card dashboard-size--${x.size} ${x.id === "note" ? "home-note-card" : ""} ${x.id === "focus" ? "home-focus-card" : ""} ${x.id === "meals" ? "home-meal-card" : ""} ${x.id === "occasions" ? "home-occasion-card" : ""}`}
              draggable={editing}
              onDragStart={() => setDragged(x.id)}
              onDragOver={(e: DragEvent<HTMLElement>) =>
                editing && e.preventDefault()
              }
              onDrop={() => drop(x.id)}
            >
              {editing && (
                <div className="dashboard-card-editor">
                  <span className="dashboard-drag-handle">
                    <GripVertical /> Move
                  </span>
                  <label>
                    Size{" "}
                    <select
                      value={x.size}
                      onChange={(e) =>
                        patch(x.id, { size: e.target.value as CardSize })
                      }
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="wide">Wide</option>
                      <option value="full">Full width</option>
                    </select>
                  </label>
                  <button onClick={() => patch(x.id, { hidden: true })}>
                    <EyeOff /> Hide
                  </button>
                </div>
              )}
              <div className="dashboard-card-content">{content[x.id]}</div>
            </section>
          ))}
      </div>
      {editingNote && (
        <FamilyNoteModal
          note={editingNote === "new" ? null : editingNote}
          onClose={() => setEditingNote(null)}
          onSave={saveNote}
        />
      )}
      {editingFocus && (
        <HouseholdFocusModal
          focus={home.focus}
          onClose={() => setEditingFocus(false)}
          onSave={saveFocus}
        />
      )}
    </>
  );
}

function formatHomeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function FamilyNoteModal({
  note,
  onClose,
  onSave,
}: {
  note: FamilyNote | null;
  onClose: () => void;
  onSave: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState(note?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(body.trim());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The family note could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop shared-home-backdrop">
      <div
        className="shared-home-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="family-note-title"
      >
        <header>
          <div>
            <span>Shared with everyone</span>
            <h2 id="family-note-title">
              {note ? "Edit family note" : "New family note"}
            </h2>
          </div>
          <button aria-label="Close family note editor" onClick={onClose}>
            <X />
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            Note
            <textarea
              autoFocus
              maxLength={500}
              required
              rows={6}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Leave a warm little message for the household…"
            />
          </label>
          <small>{body.length}/500 characters</small>
          {error && <p className="module-alert">{error}</p>}
          <footer>
            <button
              type="button"
              className="button button--secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="button button--primary"
              disabled={busy || !body.trim()}
            >
              {busy ? "Saving…" : "Save note"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function HouseholdFocusModal({
  focus,
  onClose,
  onSave,
}: {
  focus: HouseholdFocus | null;
  onClose: () => void;
  onSave: (title: string, details: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(focus?.title ?? "");
  const [details, setDetails] = useState(focus?.details ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(title.trim(), details.trim());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The household focus could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop shared-home-backdrop">
      <div
        className="shared-home-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="household-focus-title"
      >
        <header>
          <div>
            <span>Visible to the household</span>
            <h2 id="household-focus-title">Household focus</h2>
          </div>
          <button aria-label="Close household focus editor" onClick={onClose}>
            <X />
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            Headline
            <input
              autoFocus
              maxLength={80}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What matters most right now?"
            />
          </label>
          <label>
            Details <small>Optional</small>
            <textarea
              maxLength={400}
              rows={5}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Add a little context for everyone."
            />
          </label>
          {error && <p className="module-alert">{error}</p>}
          <footer>
            <button
              type="button"
              className="button button--secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="button button--primary"
              disabled={busy || !title.trim()}
            >
              {busy ? "Saving…" : "Save focus"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function CardHead({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <header className="card-heading">
      <div>
        <h2>{title}</h2>
      </div>
      <button onClick={onClick}>View all</button>
    </header>
  );
}
function Empty({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button className="empty-state empty-state--clickable" onClick={onClick}>
      <Plus />
      <strong>{text}</strong>
      <span>Add something</span>
    </button>
  );
}
function TaskRow({
  task,
  onToggle,
}: {
  task: EverydayTask;
  onToggle: (t: EverydayTask) => void;
}) {
  return (
    <div
      className={`task-row handwritten-row ${task.status === "done" ? "is-done" : ""} ${task.priority === "high" ? "is-urgent" : ""}`}
    >
      <button className="task-check" onClick={() => onToggle(task)}>
        {task.status === "done" && <Check />}
      </button>
      <div>
        <strong>{task.title}</strong>
        <small>{task.assigneeName || "Anyone"}</small>
      </div>
      {task.priority === "high" && task.status !== "done" && (
        <span className="urgent-badge">! Urgent</span>
      )}
    </div>
  );
}
function TasksView({
  tasks,
  loading,
  onAdd,
  onToggle,
}: {
  tasks: EverydayTask[];
  loading: boolean;
  onAdd: () => void;
  onToggle: (t: EverydayTask) => void;
}) {
  return (
    <>
      <Heading
        title="Tasks / To-do"
        text="A family to-do list that feels more like the note on the fridge."
        action="Add task"
        onAction={onAdd}
      />
      {loading ? (
        <p>Loading…</p>
      ) : (
        <section className="module-card">
          <div className="task-list">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={onToggle} />
            ))}
          </div>
          {!tasks.length && <Empty text="No tasks yet." onClick={onAdd} />}
        </section>
      )}
    </>
  );
}
function GroceriesView({
  items,
  loading,
  onAdd,
  onToggle,
  onImportant,
}: {
  items: GroceryItem[];
  loading: boolean;
  onAdd: () => void;
  onToggle: (g: GroceryItem) => void;
  onImportant: (g: GroceryItem) => void;
}) {
  return (
    <>
      <Heading
        title="Groceries"
        text="Tick it off, scratch it out, and star the things nobody should forget."
        action="Add item"
        onAction={onAdd}
      />
      {loading ? (
        <p>Loading…</p>
      ) : (
        <section className="module-card grocery-paper">
          {items.map((g) => (
            <div
              key={g.id}
              className={`grocery-row handwritten-row ${g.checked ? "is-scratched" : ""} ${g.important ? "is-important" : ""}`}
            >
              <button className="task-check" onClick={() => onToggle(g)}>
                {g.checked && <Check />}
              </button>
              <strong>{g.name}</strong>
              <span>{g.quantity}</span>
              <button className="grocery-star" onClick={() => onImportant(g)}>
                <Star fill={g.important ? "currentColor" : "none"} />
              </button>
            </div>
          ))}
          {!items.length && (
            <Empty text="The grocery list is empty." onClick={onAdd} />
          )}
        </section>
      )}
    </>
  );
}
function EventList({ events }: { events: HouseholdEvent[] }) {
  return (
    <div className="event-list">
      {events.map((e) => (
        <article
          key={e.id}
          className={`event-row event-type--${e.eventType || "event"}`}
        >
          <span>
            <strong>
              {new Date(e.startsAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </strong>
            <small>
              {e.allDay
                ? "All day"
                : new Date(e.startsAt).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
            </small>
          </span>
          <div>
            <strong>{e.title}</strong>
            <small>{e.eventType}</small>
          </div>
        </article>
      ))}
    </div>
  );
}
function CalendarView({
  events,
  loading,
  onAdd,
}: {
  events: HouseholdEvent[];
  loading: boolean;
  onAdd: () => void;
}) {
  return (
    <>
      <Heading
        title="Calendar V2"
        text="Events, birthdays, happenings, reminders and repeating plans in one place."
        action="Add event"
        onAction={onAdd}
      />
      {loading ? (
        <p>Loading…</p>
      ) : (
        <section className="calendar-v2-agenda">
          {events.length ? (
            <EventList events={events} />
          ) : (
            <Empty text="Your calendar is wide open." onClick={onAdd} />
          )}
        </section>
      )}
    </>
  );
}
function MembersView({
  core,
  householdName,
}: {
  core: EverydayCoreResponse;
  householdName: string;
}) {
  return (
    <>
      <Heading
        title={householdName}
        text="The people who make this place home."
      />
      <section className="module-card member-grid">
        {core.members.map((m) => (
          <article key={m.id}>
            <span>{m.name[0]?.toUpperCase()}</span>
            <div>
              <strong>{m.name}</strong>
              <small>
                {m.email} · {m.role}
              </small>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
function CreateModal({
  kind,
  members,
  onClose,
  onCreated,
  householdId,
  demo,
}: {
  kind: Exclude<AddKind, null>;
  members: EverydayCoreResponse["members"];
  onClose: () => void;
  onCreated: (x: EverydayTask | GroceryItem | HouseholdEvent) => void;
  householdId: string;
  demo: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const f = new FormData(e.currentTarget);
    try {
      if (kind === "task") {
        const input = {
          title: String(f.get("title") || ""),
          priority: (f.get("priority") || "normal") as
            | "low"
            | "normal"
            | "high",
          dueAt: null,
          assigneeUserId: null,
        };
        onCreated(
          demo
            ? {
                id: crypto.randomUUID(),
                notes: null,
                status: "todo",
                assigneeName: null,
                createdAt: new Date().toISOString(),
                ...input,
              }
            : await api.createTask(householdId, input),
        );
      } else if (kind === "grocery") {
        const input = {
          name: String(f.get("name") || ""),
          quantity: String(f.get("quantity") || "1"),
          important: f.get("important") === "on",
        };
        onCreated(
          demo
            ? {
                id: crypto.randomUUID(),
                checked: false,
                createdAt: new Date().toISOString(),
                ...input,
              }
            : await api.createGroceryItem(householdId, input),
        );
      } else {
        const start = String(f.get("startsAt") || "");
        const input = {
          title: String(f.get("title") || ""),
          description: String(f.get("description") || ""),
          location: String(f.get("location") || ""),
          startsAt: new Date(start).toISOString(),
          allDay: f.get("allDay") === "on",
          eventType: String(f.get("eventType") || "event") as EventType,
          recurrence: String(f.get("recurrence") || "none") as EventRecurrence,
          reminderMinutes: Number(f.get("reminderMinutes") || 0) || null,
        };
        onCreated(
          demo
            ? {
                id: crypto.randomUUID(),
                endsAt: null,
                createdAt: new Date().toISOString(),
                ...input,
              }
            : await api.createEvent(householdId, input),
        );
      }
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not save this item.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <div className="modal-panel create-v2">
        <header>
          <div>
            <span>Quick add</span>
            <h2>
              {kind === "task"
                ? "New task"
                : kind === "grocery"
                  ? "New grocery item"
                  : "New calendar item"}
            </h2>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        <form onSubmit={submit}>
          {kind === "task" && (
            <>
              <label>
                Task
                <input name="title" required autoFocus />
              </label>
              <label>
                Priority
                <select name="priority">
                  <option value="normal">Normal</option>
                  <option value="high">Urgent / important</option>
                  <option value="low">Low</option>
                </select>
              </label>
            </>
          )}
          {kind === "grocery" && (
            <>
              <label>
                Item
                <input name="name" required autoFocus />
              </label>
              <label>
                Quantity
                <input name="quantity" defaultValue="1" />
              </label>
              <label className="check-label">
                <input name="important" type="checkbox" /> Highlight as
                important
              </label>
            </>
          )}
          {kind === "event" && (
            <>
              <label>
                Title
                <input name="title" required autoFocus />
              </label>
              <label>
                Type
                <select name="eventType">
                  <option value="event">Event</option>
                  <option value="birthday">Birthday</option>
                  <option value="happening">Happening</option>
                  <option value="appointment">Appointment</option>
                  <option value="school">School</option>
                  <option value="pet">Pet</option>
                  <option value="meal">Meal</option>
                  <option value="holiday">Holiday</option>
                </select>
              </label>
              <label>
                Starts
                <input name="startsAt" type="datetime-local" required />
              </label>
              <label>
                Location
                <input name="location" />
              </label>
              <label>
                Notes
                <textarea name="description" rows={3} />
              </label>
              <label>
                Repeat
                <select name="recurrence">
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
              <label>
                Reminder
                <select name="reminderMinutes">
                  <option value="0">No reminder</option>
                  <option value="15">15 minutes before</option>
                  <option value="60">1 hour before</option>
                  <option value="1440">1 day before</option>
                  <option value="10080">1 week before</option>
                </select>
              </label>
              <label className="check-label">
                <input name="allDay" type="checkbox" /> All-day event
              </label>
            </>
          )}
          {err && <div className="module-alert">{err}</div>}
          <footer>
            <button
              type="button"
              className="button button--secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button button--primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
