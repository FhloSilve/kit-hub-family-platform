import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Sparkles, X } from "lucide-react";

const CHECK_INTERVAL_MS = 60_000;
const BUILD_META_NAME = "kit-hub-build";

function getLoadedBuildId() {
  return document.querySelector<HTMLMetaElement>(`meta[name="${BUILD_META_NAME}"]`)?.content ?? null;
}

function getBuildIdFromHtml(html: string) {
  const documentCopy = new DOMParser().parseFromString(html, "text/html");
  return documentCopy.querySelector<HTMLMetaElement>(`meta[name="${BUILD_META_NAME}"]`)?.content ?? null;
}

export function AppUpdatePrompt() {
  const [availableBuild, setAvailableBuild] = useState<string | null>(null);
  const [dismissedBuild, setDismissedBuild] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const checkForUpdate = useCallback(async () => {
    const loadedBuild = getLoadedBuildId();
    if (!loadedBuild) return;

    try {
      const response = await fetch(`/?build-check=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "text/html" },
      });
      if (!response.ok) return;

      const currentBuild = getBuildIdFromHtml(await response.text());
      if (!currentBuild) return;

      if (currentBuild !== loadedBuild) setAvailableBuild(currentBuild);
      else setAvailableBuild(null);
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

  if (!availableBuild || availableBuild === dismissedBuild) return null;

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
        onClick={() => setDismissedBuild(availableBuild)}
        aria-label="Update later"
      >
        <X />
      </button>
    </aside>
  );
}
