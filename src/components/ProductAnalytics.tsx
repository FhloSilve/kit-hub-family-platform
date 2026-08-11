import { useEffect } from "react";

type EventKey =
  | "app_open"
  | "dashboard_view"
  | "calendar_view"
  | "tasks_view"
  | "groceries_view"
  | "meals_view"
  | "family_hub_view"
  | "family_plan_view"
  | "routines_view"
  | "search_used"
  | "feedback_opened"
  | "silvi_opened";

const sidebarEvents: Array<[string, EventKey]> = [
  ["calendar", "calendar_view"],
  ["task", "tasks_view"],
  ["grocer", "groceries_view"],
  ["meal", "meals_view"],
  ["family hub", "family_hub_view"],
  ["family plan", "family_plan_view"],
];

export function ProductAnalytics({ householdId }: { householdId: string }) {
  useEffect(() => {
    const endpoint = `/api/v1/households/${encodeURIComponent(householdId)}/product-analytics`;
    const sent = new Set<string>();
    const record = (eventKey: EventKey, dedupeKey?: string) => {
      const key = dedupeKey ?? eventKey;
      if (sent.has(key)) return;
      sent.add(key);
      void fetch(endpoint, {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventKey }),
      }).catch(() => undefined);
    };

    record("app_open", "app-open");
    record("dashboard_view", "dashboard-view");

    const click = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const navButton = target?.closest<HTMLButtonElement>(".sidebar-nav button");
      if (navButton) {
        const label = navButton.textContent?.trim().toLowerCase() ?? "";
        const match = sidebarEvents.find(([term]) => label.includes(term));
        if (match) record(match[1], `${match[1]}-${Date.now()}`);
      }
      if (target?.closest(".routines-launcher")) record("routines_view", `routines-${Date.now()}`);
      if (target?.closest(".search-launcher,.global-search-launcher")) record("search_used", `search-${Date.now()}`);
      if (target?.closest(".feedback-launcher")) record("feedback_opened", `feedback-${Date.now()}`);
    };
    document.addEventListener("click", click);

    const familyPlan = () => record("family_plan_view", `family-plan-${Date.now()}`);
    const search = () => record("search_used", `search-event-${Date.now()}`);
    const silvi = () => record("silvi_opened", `silvi-${Date.now()}`);
    window.addEventListener("kit-hub-open-family-coordination", familyPlan);
    window.addEventListener("kit-hub-open-search", search);
    window.addEventListener("kit-hub-ask-silvi", silvi);

    return () => {
      document.removeEventListener("click", click);
      window.removeEventListener("kit-hub-open-family-coordination", familyPlan);
      window.removeEventListener("kit-hub-open-search", search);
      window.removeEventListener("kit-hub-ask-silvi", silvi);
    };
  }, [householdId]);

  return null;
}
