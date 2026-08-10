import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles, X } from "lucide-react";
import type { AppVersionResponse } from "../../shared/contracts";

const CHECK_INTERVAL_MS = 60_000;

export function AppUpdatePrompt() {
  const baselineVersion = useRef<string | null>(null);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const checkForUpdate = useCallback(async () => {
    try {
      const response = await fetch(`/api/version?check=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) return;
      const current = (await response.json()) as AppVersionResponse;
      if (!current.id) return;

      // The first successful check establishes the version this open browser tab
      // is currently associated with. A banner is only shown when the deployed
      // Cloudflare Worker version changes after that point.
      if (!baselineVersion.current) {
        baselineVersion.current = current.id;
        setAvailableVersion(null);
        return;
      }

      if (current.id !== baselineVersion.current) setAvailableVersion(current.id);
      else setAvailableVersion(null);
    } catch {
      // Update checks stay silent while offline or during a transient deploy.
    }
  }, []);

  useEffect(() => {
    void checkForUpdate();
    const interval = window.setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);
    const checkWhenActive = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };
    window.addEventListener("focus", checkWhenActive);
    window.addEventListener("online", checkWhenActive);
    document.addEventListener("visibilitychange", checkWhenActive);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", checkWhenActive);
      window.removeEventListener("online", checkWhenActive);
      document.removeEventListener("visibilitychange", checkWhenActive);
    };
  }, [checkForUpdate]);

  if (!availableVersion || availableVersion === dismissedVersion) return null;

  function updateNow() {
    setUpdating(true);
    window.location.reload();
  }

  return <aside className="update-prompt" role="status" aria-live="polite">
    <span className="update-prompt__icon"><Sparkles /></span>
    <div><strong>A fresh Kit Hub update is ready</strong><small>A new production version was deployed. Update without signing out.</small></div>
    <button className="button update-prompt__action" type="button" onClick={updateNow} disabled={updating}><RefreshCw className={updating ? "is-spinning" : ""} />{updating ? "Updating…" : "Update now"}</button>
    <button className="update-prompt__dismiss" type="button" onClick={() => setDismissedVersion(availableVersion)} aria-label="Update later"><X /></button>
  </aside>;
}
