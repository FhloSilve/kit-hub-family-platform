import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Monitor, Moon, Sun } from "lucide-react";

type Appearance = "light" | "dark" | "system";

function preferredAppearance(): Appearance {
  const stored = localStorage.getItem("kit-hub-appearance");
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function applyAppearance(mode: Appearance) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.kitAppearance = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  localStorage.setItem("kit-hub-appearance", mode);
}

export function AppearanceControl() {
  const [mode, setMode] = useState<Appearance>(preferredAppearance);
  const [desktopTarget, setDesktopTarget] = useState<Element | null>(null);
  const [mobileTarget, setMobileTarget] = useState<Element | null>(null);

  useEffect(() => {
    applyAppearance(mode);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => mode === "system" && applyAppearance("system");
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [mode]);

  useEffect(() => {
    const locate = () => {
      setDesktopTarget(document.querySelector(".site-theme-picker"));
      setMobileTarget(document.querySelector(".mobile-account-menu"));
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const change = (next: Appearance) => {
    setMode(next);
    applyAppearance(next);
  };
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;

  return <>
    {desktopTarget && createPortal(
      <span className="appearance-inline" title="Appearance">
        <Icon />
        <select aria-label="Appearance" value={mode} onChange={event => change(event.target.value as Appearance)}>
          <option value="system">Follow device</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </span>,
      desktopTarget,
    )}
    {mobileTarget && createPortal(
      <button className="appearance-mobile-button" type="button" onClick={() => change(mode === "system" ? "dark" : mode === "dark" ? "light" : "system") }>
        <Icon /> Appearance: {mode === "system" ? "Device" : mode === "dark" ? "Dark" : "Light"}
      </button>,
      mobileTarget,
    )}
  </>;
}
