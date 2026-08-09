import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles, X } from "lucide-react";
import type { AppVersionResponse } from "../../shared/contracts";

const CHECK_INTERVAL_MS = 60_000;

export function AppUpdatePrompt() {
  const loadedVersion = useRef<string | null>(null);
  const [availableVersion, setAvailableVersion] = useState<AppVersionResponse | null>(null);
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

      const version = (await response.json()) as AppVersionResponse;
      if (!loadedVersion.current) {
        loadedVersion.current = version.id;
        return;
      }
      if (version.id !== loadedVersion.current) setAvailableVersion(version);
    } catch {
      // Update checks are intentionally silent while offline.
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

  if (!availableVersion || availableVersion.id === dismissedVersion) return null;

  function updateNow() {
    setUpdating(true);
    window.location.reload();
  }

  return (
    <aside className="update-prompt" role="status" aria-live="polite">
      <span className="update-prompt__icon"><Sparkles /></span>
      <div>
        <strong>A fresh Kit Hub update is ready</strong>
        <small>Update without closing your browser. Your account and household stay signed in.</small>
      </div>
      <button className="button update-prompt__action" type="button" onClick={updateNow} disabled={updating}>
        <RefreshCw className={updating ? "is-spinning" : ""} />
        {updating ? "Updating…" : "Update now"}
      </button>
      <button
        className="update-prompt__dismiss"
        type="button"
        onClick={() => setDismissedVersion(availableVersion.id)}
        aria-label="Update later"
      >
        <X />
      </button>
    </aside>
  );
}
