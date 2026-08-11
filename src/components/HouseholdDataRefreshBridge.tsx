import { useEffect } from "react";

const mutationPath = /\/(tasks|groceries|events|meals|routines|family-home|calendar|coordination|focus|notes)(?:\/|$)/;
const ignoredPath = /\/(product-analytics|silvi\/ask|silvi\/context|silvi\/insights|search)(?:\/|$)/;

export function HouseholdDataRefreshBridge({ householdId }: { householdId: string }) {
  useEffect(() => {
    let reloading = false;
    let timer = 0;
    const scheduleReload = (event?: Event) => {
      const detail = (event as CustomEvent<{ householdId?: string }> | undefined)?.detail;
      if (detail?.householdId && detail.householdId !== householdId) return;
      if (reloading) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      }, 180);
    };
    window.addEventListener("kit-hub-household-data-changed", scheduleReload);

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(input, init);
      try {
        const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (!["POST", "PUT", "PATCH", "DELETE"].includes(method) || !response.ok) return response;
        const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(raw, window.location.origin);
        const prefix = `/api/v1/households/${encodeURIComponent(householdId)}`;
        if (!url.pathname.startsWith(prefix) || ignoredPath.test(url.pathname) || !mutationPath.test(url.pathname)) return response;
        window.dispatchEvent(new CustomEvent("kit-hub-household-data-changed", { detail: { householdId, source: "successful-api-mutation" } }));
      } catch { /* a refresh hint must never break the API response */ }
      return response;
    };

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("kit-hub-household-data-changed", scheduleReload);
      window.fetch = originalFetch;
    };
  }, [householdId]);
  return null;
}
