import { useEffect } from "react";

const SETUP_MARKER = "kit-hub-widget-onboarding-complete";

function hasExistingWidgetLayout() {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) || "";
    if ((key.startsWith("kit-hub-widgets:") || key.startsWith("kit-hub-home-layout:")) && localStorage.getItem(key)) return true;
  }
  return false;
}

export function UiPersistenceGuard() {
  useEffect(() => {
    if (hasExistingWidgetLayout()) localStorage.setItem(SETUP_MARKER, "1");

    const recordSetup = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest(".widget-onboarding footer .button--primary");
      if (button) localStorage.setItem(SETUP_MARKER, "1");
    };
    document.addEventListener("click", recordSetup, true);

    let autoAccepted = false;
    const reconcile = () => {
      if (autoAccepted || localStorage.getItem(SETUP_MARKER) !== "1") return;
      const onboarding = document.querySelector<HTMLElement>(".widget-onboarding");
      if (!onboarding) return;
      const primary = onboarding.querySelector<HTMLButtonElement>("footer .button--primary");
      if (!primary) return;
      autoAccepted = true;
      window.setTimeout(() => primary.click(), 50);
    };
    reconcile();
    const observer = new MutationObserver(reconcile);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("click", recordSetup, true);
      observer.disconnect();
    };
  }, []);
  return null;
}
