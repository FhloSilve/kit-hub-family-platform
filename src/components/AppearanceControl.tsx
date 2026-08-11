import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { House, MessageSquareWarning, Monitor, Moon, Palette, Rocket, Sun } from "lucide-react";
import "../appearance-controls.css";

type Appearance = "light" | "dark" | "system";
type ThemeKey = "meadow" | "coastal" | "urban" | "seashell" | "rose" | "sapphire" | "lapis" | "amethyst";
const STORAGE_KEY = "kit-hub-appearance";
const THEME_STORAGE_KEY = "kit-hub-theme";
const themeOptions: Array<{ key: ThemeKey; label: string; text: string; palette: [string, string, string, string] }> = [
  { key: "meadow", label: "Kit Hub Meadow", text: "Warm cream, forest green and coral.", palette: ["#f6f1e7", "#2f5d4b", "#9db59f", "#dc775e"] },
  { key: "coastal", label: "Coastal Forest", text: "Stone, sea green and burnt orange.", palette: ["#bfb9b5", "#30525c", "#4c848d", "#c35627"] },
  { key: "urban", label: "Urban Slate", text: "Soft concrete, slate and muted blue.", palette: ["#e9e6e7", "#5e5653", "#7b7f8a", "#6b7c98"] },
  { key: "seashell", label: "Seashell Afternoon", text: "Sky blue, shell cream and playful pink.", palette: ["#acc0d3", "#5484a4", "#09a1a1", "#f56880"] },
  { key: "rose", label: "Rose Quartz", text: "Dusty rose, berry and blush.", palette: ["#dfd9d8", "#64242f", "#b44446", "#fc8f8f"] },
  { key: "sapphire", label: "Sapphire Nightfall", text: "Deep navy, sapphire and cool blue.", palette: ["#262b40", "#06457f", "#5379ae", "#0474c4"] },
  { key: "lapis", label: "Lapis Velvet", text: "Lapis, plum and parchment.", palette: ["#cccacc", "#213885", "#5f3475", "#893172"] },
  { key: "amethyst", label: "Amethyst Dawn", text: "Amethyst, lilac and golden lime.", palette: ["#c4aef4", "#472f5b", "#cca4b4", "#8b7a12"] },
];

function preferredAppearance(): Appearance {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}
function preferredTheme(): ThemeKey {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return themeOptions.some(option => option.key === stored) ? stored as ThemeKey : "meadow";
}
function systemIsDark() { return window.matchMedia("(prefers-color-scheme: dark)").matches; }
function resolvedDark(mode: Appearance) { return mode === "dark" || (mode === "system" && systemIsDark()); }
function applyAppearance(mode: Appearance) {
  const dark = resolvedDark(mode);
  document.documentElement.dataset.kitAppearance = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent("kit-hub-appearance-changed", { detail: { appearance: mode, dark } }));
}
function applyTheme(theme: ThemeKey) {
  document.documentElement.dataset.kitTheme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent("kit-hub-theme-changed", { detail: { theme } }));
}

export function AppearanceControl() {
  const [mode, setMode] = useState<Appearance>(preferredAppearance);
  const [theme, setTheme] = useState<ThemeKey>(preferredTheme);
  const [dark, setDark] = useState(() => resolvedDark(preferredAppearance()));
  const [settingsNav, setSettingsNav] = useState<HTMLElement | null>(null);
  const [settingsBody, setSettingsBody] = useState<HTMLElement | null>(null);
  const [topbarActions, setTopbarActions] = useState<HTMLElement | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const isAdmin = window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
  const isFeedback = window.location.pathname.startsWith("/admin/feedback");

  useEffect(() => { applyAppearance(mode); setDark(resolvedDark(mode)); }, [mode]);
  useEffect(() => { if (!isAdmin) applyTheme(theme); }, [theme, isAdmin]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => { if (mode === "system") { applyAppearance("system"); setDark(media.matches); } };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [mode]);
  useEffect(() => {
    const syncTheme = (event: Event) => {
      const next = (event as CustomEvent<{ theme?: string }>).detail?.theme;
      if (themeOptions.some(option => option.key === next)) setTheme(next as ThemeKey);
    };
    window.addEventListener("kit-hub-theme-changed", syncTheme);
    return () => window.removeEventListener("kit-hub-theme-changed", syncTheme);
  }, []);
  useEffect(() => {
    if (isAdmin) return;
    const locate = () => {
      setSettingsNav(document.querySelector<HTMLElement>(".family-tools > nav"));
      setSettingsBody(document.querySelector<HTMLElement>(".family-tools__body"));
      setTopbarActions(document.querySelector<HTMLElement>(".topbar-actions"));
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isAdmin]);
  useEffect(() => {
    if (!settingsNav) return;
    const nativeClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button:not(.appearance-settings-tab)")) setShowPanel(false);
    };
    settingsNav.addEventListener("click", nativeClick);
    return () => settingsNav.removeEventListener("click", nativeClick);
  }, [settingsNav]);
  useEffect(() => {
    if (!settingsBody) return;
    settingsBody.classList.toggle("appearance-settings-active", showPanel);
    return () => settingsBody.classList.remove("appearance-settings-active");
  }, [settingsBody, showPanel]);

  const options = useMemo(() => [
    { value: "system" as const, label: "Follow device", text: "Match your phone, tablet or computer automatically.", Icon: Monitor },
    { value: "light" as const, label: "Light", text: "Always use the bright Kit Hub appearance.", Icon: Sun },
    { value: "dark" as const, label: "Dark", text: "Use Kit Hub's softer charcoal dark appearance.", Icon: Moon },
  ], []);
  const change = (next: Appearance) => { setMode(next); setDark(resolvedDark(next)); };
  const changeTheme = (next: ThemeKey) => { setTheme(next); applyTheme(next); };
  const quickToggle = () => change(dark ? "light" : "dark");
  const toggleAdminColour = () => document.querySelector<HTMLElement>(".admin-toolbar")?.classList.toggle("is-open");
  const appearanceButton = <button className={`appearance-quick-toggle ${isAdmin ? "appearance-admin-toggle" : ""}`} type="button" onClick={quickToggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Switch to light mode" : "Switch to dark mode"}>{dark ? <Sun /> : <Moon />}</button>;

  return <>
    {isAdmin ? appearanceButton : topbarActions ? createPortal(appearanceButton, topbarActions) : appearanceButton}
    {isAdmin && <nav className="admin-mobile-nav" aria-label="Admin navigation">
      <button className={!isFeedback?"is-active":""} type="button" onClick={() => { window.location.href="/admin"; }}><Rocket/><span>Release</span></button>
      <button className={isFeedback?"is-active":""} type="button" onClick={() => { window.location.href="/admin/feedback"; }}><MessageSquareWarning/><span>Feedback</span></button>
      <button className="admin-mobile-colour" type="button" onClick={toggleAdminColour}><Palette/><span>Colour</span></button>
      <button className="admin-mobile-appearance" type="button" onClick={quickToggle}>{dark?<Sun/>:<Moon/>}<span>{dark?"Light":"Dark"}</span></button>
      <button type="button" onClick={() => { window.location.href = "/"; }}><House/><span>Kit Hub</span></button>
    </nav>}
    {settingsNav && createPortal(<button type="button" className={`appearance-settings-tab ${showPanel ? "is-active" : ""}`} onClick={() => setShowPanel(true)}>{dark ? <Moon /> : <Sun />}<span>Appearance</span></button>, settingsNav)}
    {settingsBody && showPanel && createPortal(<section className="appearance-settings-panel">
      <div className="appearance-settings-heading"><small>THEME & APPEARANCE</small><h3>Make Kit Hub feel like yours</h3><p>Choose your colour palette and how bright or dark Kit Hub should be. These choices are personal to this device and do not change another family member&apos;s view.</p></div>
      <div className="appearance-settings-section">
        <div className="appearance-settings-section__heading"><div><strong>Colour theme</strong><small>Real Kit Hub palette previews</small></div><Palette/></div>
        <div className="appearance-theme-grid">{themeOptions.map(item => <button key={item.key} type="button" className={`appearance-theme-card ${theme === item.key ? "is-selected" : ""}`} onClick={() => changeTheme(item.key)}>
          <span className="appearance-theme-preview" style={{ backgroundColor: item.palette[0] }}>
            <i className="appearance-theme-preview__rail" style={{ backgroundColor: item.palette[1] }} />
            <i className="appearance-theme-preview__card" />
            <i className="appearance-theme-preview__pill" style={{ backgroundColor: item.palette[3] }} />
          </span>
          <span className="appearance-theme-copy"><strong>{item.label}</strong><small>{item.text}</small><span className="appearance-theme-swatches" aria-hidden="true">{item.palette.map((colour,index)=><i key={`${item.key}-${index}`} style={{ backgroundColor: colour }}/>)}</span></span>
          <i className="appearance-theme-radio" aria-hidden="true" />
        </button>)}</div>
      </div>
      <div className="appearance-settings-section">
        <div className="appearance-settings-section__heading"><div><strong>Light & dark</strong><small>Choose the surface brightness</small></div>{dark?<Moon/>:<Sun/>}</div>
        <div className="appearance-settings-options">{options.map(({ value, label, text, Icon }) => <button key={value} type="button" className={mode === value ? "is-selected" : ""} onClick={() => change(value)}><span><Icon /></span><div><strong>{label}</strong><small>{text}</small></div><i aria-hidden="true" /></button>)}</div>
      </div>
    </section>, settingsBody)}
  </>;
}
