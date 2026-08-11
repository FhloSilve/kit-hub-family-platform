import { useEffect } from "react";

export function HouseholdDataRefreshBridge({ householdId }: { householdId: string }) {
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ householdId?: string }>).detail;
      if (detail?.householdId && detail.householdId !== householdId) return;
      window.location.reload();
    };
    window.addEventListener("kit-hub-household-data-changed", refresh);
    return () => window.removeEventListener("kit-hub-household-data-changed", refresh);
  }, [householdId]);
  return null;
}
