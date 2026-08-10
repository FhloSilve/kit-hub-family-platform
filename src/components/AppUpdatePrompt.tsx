import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles, X } from "lucide-react";

const CHECK_INTERVAL_MS = 60_000;
type ReleaseStateResponse = { releaseId: string | null; releasedAt: string | null };

export function AppUpdatePrompt() {
  const baselineRelease = useRef<string | null | undefined>(undefined);
  const [availableRelease, setAvailableRelease] = useState<string | null>(null);
  const [dismissedRelease, setDismissedRelease] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const checkForUpdate = useCallback(async () => {
    try {
      const response = await fetch(`/api/release-state?check=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) return;
      const current = (await response.json()) as ReleaseStateResponse;

      // The first successful check establishes the last fully verified Admin
      // Release Center release seen by this open tab. Git pushes, Worker deploys,
      // failed releases and cancelled releases do not change this marker.
      if (baselineRelease.current === undefined) {
        baselineRelease.current = current.releaseId;
        setAvailableRelease(null);
        return;
      }

      if (current.releaseId && current.releaseId !== baselineRelease.current) setAvailableRelease(current.releaseId);
      else setAvailableRelease(null);
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

  if (!availableRelease || availableRelease === dismissedRelease) return null;

  function updateNow() {
    setUpdating(true);
    window.location.reload();
  }

  return <aside className="update-prompt" role="status" aria-live="polite">
    <span className="update-prompt__icon"><Sparkles /></span>
    <div><strong>A fresh Kit Hub update is ready</strong><small>A production release finished successfully. Update without signing out.</small></div>
    <button className="button update-prompt__action" type="button" onClick={updateNow} disabled={updating}><RefreshCw className={updating ? "is-spinning" : ""} />{updating ? "Updating…" : "Update now"}</button>
    <button className="update-prompt__dismiss" type="button" onClick={() => setDismissedRelease(availableRelease)} aria-label="Update later"><X /></button>
  </aside>;
}
