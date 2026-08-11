import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { House, MessageSquareWarning, Monitor, Moon, Palette, Rocket, Sun } from "lucide-react";
import "../appearance-controls.css";

type Appearance = "light" | "dark" | "system";
const STORAGE_KEY = "kit-hub-appearance";

function preferredAppearance(): Appearance {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
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

export function AppearanceControl() {
  const [mode, setMode] = useState<Appearance>(preferredAppearance);
  const [dark, setDark] = useState(() => resolvedDark(preferredAppearance()));
  const [settingsNav, setSettingsNav] = useState<HTMLElement | null>(null);
  const [settingsBody, setSettingsBody] = useState<HTMLElement | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const isAdmin = window.location.pathname === "/admin" || window.location.pathname === "/admin/";

  useEffect(() => { applyAppearance(mode); setDark(resolvedDark(mode)); }, [mode]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => { if (mode === "system") { applyAppearance("system"); setDark(media.matches); } };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [mode]);
  useEffect(() => {
    if (isAdmin) return;
    const locate = () => {
      setSettingsNav(document.querySelector<HTMLElement>(".family-tools > nav"));
      setSettingsBody(document.querySelector<HTMLElement>(".family-tools__body"));
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
  const quickToggle = () => change(dark ? "light" : "dark");
  const scrollToFeedback = () => document.querySelector<HTMLElement>(".admin-feedback-board")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return <>
    <button className={`appearance-quick-toggle ${isAdmin ? "appearance-admin-toggle" : ""}`} type="button" onClick={quickToggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Switch to light mode" : "Switch to dark mode"}>
      {dark ? <Sun /> : <Moon />}
    </button>
    {isAdmin && <nav className="admin-mobile-nav" aria-label="Admin navigation">
      <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Rocket/><span>Release</span></button>
      <button type="button" onClick={scrollToFeedback}><MessageSquareWarning/><span>Feedback</span></button>
      <button type="button" onClick={() => window.dispatchEvent(new Event("kit-hub-admin-colour"))}><Palette/><span>Colour</span></button>
      <button className="admin-mobile-appearance" type="button" onClick={quickToggle}>{dark?<Sun/>:<Moon/>}<span>{dark?"Light":"Dark"}</span></button>
      <button type="button" onClick={() => { window.location.href = "/"; }}><House/><span>Kit Hub</span></button>
    </nav>}
    {settingsNav && createPortal(
      <button type="button" className={`appearance-settings-tab ${showPanel ? "is-active" : ""}`} onClick={() => setShowPanel(true)}>
        {dark ? <Moon /> : <Sun />}<span>Appearance</span>
      </button>, settingsNav)}
    {settingsBody && showPanel && createPortal(
      <section className="appearance-settings-panel">
        <div className="appearance-settings-heading"><small>APPEARANCE</small><h3>Light, dark or device</h3><p>This choice belongs to you. Your household colour theme stays the same; Kit Hub simply adapts it for light or dark surfaces.</p></div>
        <div className="appearance-settings-options">{options.map(({ value, label, text, Icon }) => <button key={value} type="button" className={mode === value ? "is-selected" : ""} onClick={() => change(value)}><span><Icon /></span><div><strong>{label}</strong><small>{text}</small></div><i aria-hidden="true" /></button>)}</div>
      </section>, settingsBody)}
  </>;
}
