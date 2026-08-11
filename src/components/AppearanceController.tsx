import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Laptop, Moon, Sun } from "lucide-react";
import "../appearance-controls.css";

type Appearance = "system" | "light" | "dark";
const STORAGE_KEY = "kit-hub-appearance";

function storedAppearance(): Appearance {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}
function systemIsDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function resolvedDark(value: Appearance) {
  return value === "dark" || (value === "system" && systemIsDark());
}
function applyAppearance(value: Appearance) {
  localStorage.setItem(STORAGE_KEY, value);
  const dark = resolvedDark(value);
  document.documentElement.dataset.kitAppearance = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  window.dispatchEvent(new CustomEvent("kit-hub-appearance-changed", { detail: { appearance: value, dark } }));
}

export function AppearanceController() {
  const [appearance, setAppearance] = useState<Appearance>(() => storedAppearance());
  const [dark, setDark] = useState(() => resolvedDark(storedAppearance()));
  const [settingsNav, setSettingsNav] = useState<HTMLElement | null>(null);
  const [settingsBody, setSettingsBody] = useState<HTMLElement | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    applyAppearance(appearance);
    setDark(resolvedDark(appearance));
  }, [appearance]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const changed = () => {
      if (appearance === "system") {
        applyAppearance("system");
        setDark(media.matches);
      }
    };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, [appearance]);

  useEffect(() => {
    const scan = () => {
      setSettingsNav(document.querySelector<HTMLElement>(".family-tools > nav"));
      setSettingsBody(document.querySelector<HTMLElement>(".family-tools__body"));
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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
    { value: "system" as const, label: "Follow device", text: "Match your phone, tablet or computer automatically.", Icon: Laptop },
    { value: "light" as const, label: "Light", text: "Always use the bright Kit Hub appearance.", Icon: Sun },
    { value: "dark" as const, label: "Dark", text: "Use Kit Hub's softer charcoal dark appearance.", Icon: Moon },
  ], []);

  function choose(value: Appearance) {
    setAppearance(value);
    setDark(resolvedDark(value));
  }
  function quickToggle() {
    choose(dark ? "light" : "dark");
  }

  return <>
    <button className="appearance-quick-toggle" type="button" onClick={quickToggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Switch to light mode" : "Switch to dark mode"}>
      {dark ? <Sun /> : <Moon />}
    </button>
    {settingsNav && createPortal(
      <button type="button" className={`appearance-settings-tab ${showPanel ? "is-active" : ""}`} onClick={() => setShowPanel(true)}>
        {dark ? <Moon /> : <Sun />}<span>Appearance</span>
      </button>,
      settingsNav,
    )}
    {settingsBody && showPanel && createPortal(
      <section className="appearance-settings-panel">
        <div className="appearance-settings-heading"><small>APPEARANCE</small><h3>Light, dark or device</h3><p>This is personal to you. Your household colour theme stays the same; only its light/dark treatment changes.</p></div>
        <div className="appearance-settings-options">
          {options.map(({ value, label, text, Icon }) => <button key={value} type="button" className={appearance === value ? "is-selected" : ""} onClick={() => choose(value)}>
            <span><Icon /></span><div><strong>{label}</strong><small>{text}</small></div><i aria-hidden="true" />
          </button>)}
        </div>
      </section>,
      settingsBody,
    )}
  </>;
}
