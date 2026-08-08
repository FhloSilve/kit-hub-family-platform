import { useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  Clock3,
  Home,
  ListTodo,
  MessageCircle,
  MoreHorizontal,
  PawPrint,
  Plus,
  Search,
  Settings,
  ShoppingBasket,
  Sparkles,
  SunMedium,
  Utensils,
  X,
} from "lucide-react";
import type { BootstrapResponse } from "../../shared/contracts";
import { Brand } from "./Brand";

interface TodayDashboardProps {
  bootstrap: BootstrapResponse;
  demo?: boolean;
  onSignOut: () => Promise<void>;
}

const navItems = [
  { label: "Today", icon: Home, active: true },
  { label: "Calendar", icon: CalendarDays },
  { label: "Tasks", icon: ListTodo },
  { label: "Groceries", icon: ShoppingBasket },
  { label: "Chat", icon: MessageCircle },
];

const quickActions = [
  { label: "Grocery item", icon: ShoppingBasket, color: "mint" },
  { label: "Task", icon: CheckCircle2, color: "gold" },
  { label: "Event", icon: CalendarDays, color: "blue" },
  { label: "Status", icon: CircleUserRound, color: "coral" },
];

export function TodayDashboard({ bootstrap, demo = false, onSignOut }: TodayDashboardProps) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const household = bootstrap.activeHousehold;
  const firstName = bootstrap.user.name.split(" ")[0] || bootstrap.user.name;
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <button className="household-switcher" type="button">
          <span className="household-switcher__avatar"><Home /></span>
          <span><strong>{household?.name}</strong><small>{household?.memberCount} members</small></span>
          <ChevronDown />
        </button>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon, active }) => (
            <button key={label} type="button" className={active ? "is-active" : ""} disabled={!active}>
              <Icon /><span>{label}</span>{!active && <small>Soon</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar__spacer" />
        <button className="silvi-card" type="button" disabled>
          <span><Sparkles /></span>
          <div><strong>Ask Silvi</strong><small>Coming in a later milestone</small></div>
        </button>
        <button className="sidebar-settings" type="button" disabled><Settings /> Settings</button>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="mobile-brand"><Brand compact /></div>
          <div className="topbar-search">
            <Search />
            <input aria-label="Search Kit Hub" placeholder="Search your home" disabled />
            <kbd>⌘ K</kbd>
          </div>
          <div className="topbar-actions">
            {demo && <span className="demo-badge">Preview</span>}
            <button className="icon-button" type="button" aria-label="Notifications" disabled><Bell /></button>
            <div className="profile-menu">
              <button
                className="profile-button"
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-expanded={profileOpen}
              >
                <span>{firstName.slice(0, 1).toUpperCase()}</span>
                <div><strong>{firstName}</strong><small>{household?.role}</small></div>
                <ChevronDown />
              </button>
              {profileOpen && (
                <div className="profile-popover">
                  <p><strong>{bootstrap.user.name}</strong><small>{bootstrap.user.email}</small></p>
                  <button type="button" onClick={() => void onSignOut()}>{demo ? "Leave preview" : "Sign out"}</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="today-page">
          <header className="today-heading">
            <div>
              <span className="today-date"><SunMedium /> {dateLabel}</span>
              <h1>{greeting}, {firstName}.</h1>
              <p>{demo ? "Here’s what’s happening around The Fox Den today." : "Your household is ready. Add the first pieces of your everyday routine."}</p>
            </div>
            <button className="button button--primary" type="button" onClick={() => setQuickAddOpen(true)}><Plus /> Quick add</button>
          </header>

          <section className="daily-glance" aria-label="At a glance">
            <div><span className="glance-icon glance-icon--coral"><CalendarDays /></span><p><strong>{demo ? "2" : "0"}</strong><small>events today</small></p></div>
            <div><span className="glance-icon glance-icon--gold"><ListTodo /></span><p><strong>{demo ? "4" : "0"}</strong><small>open tasks</small></p></div>
            <div><span className="glance-icon glance-icon--mint"><ShoppingBasket /></span><p><strong>{demo ? "7" : "0"}</strong><small>grocery items</small></p></div>
            <div><span className="glance-icon glance-icon--blue"><MessageCircle /></span><p><strong>{demo ? "1" : "0"}</strong><small>new message</small></p></div>
          </section>

          <div className="dashboard-grid">
            <section className="dashboard-card dashboard-card--schedule">
              <header className="card-heading"><div><span className="card-icon card-icon--coral"><CalendarDays /></span><div><h2>Next up</h2><p>Your household schedule</p></div></div><button type="button" disabled>View calendar</button></header>
              {demo ? (
                <div className="timeline">
                  <div className="timeline-item timeline-item--now"><time>15:30</time><span /><div><small>IN 45 MINUTES</small><strong>Vet appointment — Lucy</strong><p><PawPrint /> Animal Care Brasschaat</p></div></div>
                  <div className="timeline-item"><time>19:00</time><span /><div><small>THIS EVENING</small><strong>Dinner at home</strong><p><Utensils /> Pasta primavera</p></div></div>
                </div>
              ) : (
                <EmptyState icon={CalendarDays} title="A quiet day so far" text="Calendar V1 will let your household add shared and personal events here." />
              )}
            </section>

            <section className="dashboard-card dashboard-card--tasks">
              <header className="card-heading"><div><span className="card-icon card-icon--gold"><ListTodo /></span><div><h2>Tasks</h2><p>Things to take care of</p></div></div><button type="button" disabled>View all</button></header>
              {demo ? (
                <div className="task-list">
                  <Task checked label="Put recycling outside" meta="Done by Mona" />
                  <Task label="Give Lucy her medicine" meta="Due 18:00" important />
                  <Task label="Water the balcony plants" meta="Anyone can claim" />
                  <Task label="Order cat litter" meta="This week" />
                </div>
              ) : (
                <EmptyState icon={ListTodo} title="Nothing on the list" text="Tasks V1 will add shared chores, assignments and claimable work." />
              )}
            </section>

            <section className="dashboard-card dashboard-card--grocery">
              <header className="card-heading"><div><span className="card-icon card-icon--mint"><ShoppingBasket /></span><div><h2>Groceries</h2><p>{demo ? "Weekly shop" : "Your first list"}</p></div></div><button type="button" disabled><MoreHorizontal /></button></header>
              {demo ? (
                <>
                  <div className="progress-row"><span><strong>7 items left</strong><small>3 of 10 picked up</small></span><b>30%</b></div>
                  <div className="progress"><span style={{ width: "30%" }} /></div>
                  <div className="grocery-tags"><span>Milk</span><span>Cat food</span><span>Tomatoes</span><span>+4</span></div>
                </>
              ) : (
                <EmptyState compact icon={ShoppingBasket} title="The list is empty" text="Groceries V1 is next in the Everyday Core." />
              )}
            </section>

            <section className="dashboard-card dashboard-card--dinner">
              <div className="dinner-copy">
                <span className="eyebrow">TONIGHT&apos;S DINNER</span>
                <h2>{demo ? "Pasta primavera" : "Nothing planned yet"}</h2>
                <p>{demo ? "Fresh, quick and already in the weekly plan." : "Meals and recipe planning will connect directly to groceries."}</p>
                <button type="button" disabled>{demo ? "View recipe" : "Meals coming later"} <span>→</span></button>
              </div>
              <div className="dinner-illustration" aria-hidden="true"><span>🍝</span><i /><b /></div>
            </section>

            <section className="dashboard-card dashboard-card--status">
              <header className="card-heading"><div><span className="card-icon card-icon--blue"><CircleUserRound /></span><div><h2>At home</h2><p>Household status</p></div></div></header>
              <div className="member-list">
                <div><span className="avatar avatar--fox">L</span><p><strong>{firstName}</strong><small><i className="status-dot status-dot--green" /> Available</small></p><time>Now</time></div>
                {demo && <div><span className="avatar avatar--plum">M</span><p><strong>Mona</strong><small><i className="status-dot status-dot--gold" /> Working</small></p><time>Until 17:00</time></div>}
              </div>
            </section>

            <section className="dashboard-card dashboard-card--house">
              <div className="house-preview" aria-hidden="true"><span className="house-preview__roof" /><span className="house-preview__wall" /><span className="house-preview__door" /><span className="house-preview__window" /><i /><b /></div>
              <div><span className="eyebrow">YOUR DIGITAL HOME</span><h2>The house is taking shape.</h2><p>The same household data will later power rooms, objects and an optional explore mode.</p><button type="button" disabled>House arrives in Milestone 4</button></div>
            </section>
          </div>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 4).map(({ label, icon: Icon, active }) => <button key={label} type="button" className={active ? "is-active" : ""} disabled={!active}><Icon /><span>{label}</span></button>)}
        <button type="button" disabled><MoreHorizontal /><span>More</span></button>
      </nav>
      <button className="mobile-quick-add" type="button" onClick={() => setQuickAddOpen(true)} aria-label="Quick add"><Plus /></button>

      {quickAddOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setQuickAddOpen(false)}>
          <section className="quick-add-modal" role="dialog" aria-modal="true" aria-labelledby="quick-add-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span className="eyebrow">QUICK ADD</span><h2 id="quick-add-title">What&apos;s happening?</h2></div><button className="icon-button" type="button" onClick={() => setQuickAddOpen(false)} aria-label="Close"><X /></button></header>
            <div className="quick-action-grid">
              {quickActions.map(({ label, icon: Icon, color }) => <button type="button" key={label} disabled><span className={`quick-action quick-action--${color}`}><Icon /></span><strong>{label}</strong><small>Available in Everyday Core</small></button>)}
            </div>
            <p>These actions are already placed in the product shell and will become active module by module.</p>
          </section>
        </div>
      )}
    </div>
  );
}

function Task({ label, meta, checked = false, important = false }: { label: string; meta: string; checked?: boolean; important?: boolean }) {
  return <div className={`task ${checked ? "task--checked" : ""}`}><button type="button" aria-label={`${checked ? "Completed" : "Complete"}: ${label}`} disabled>{checked && <Check />}</button><p><strong>{label}</strong><small>{important && <Clock3 />} {meta}</small></p></div>;
}

function EmptyState({ icon: Icon, title, text, compact = false }: { icon: typeof CalendarDays; title: string; text: string; compact?: boolean }) {
  return <div className={`empty-state ${compact ? "empty-state--compact" : ""}`}><span><Icon /></span><div><strong>{title}</strong><p>{text}</p></div></div>;
}
