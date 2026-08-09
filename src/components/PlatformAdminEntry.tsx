import { useEffect, useState } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import "../platform-admin-entry.css";

export function PlatformAdminEntry() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void api
      .adminReleaseStatus()
      .then(() => {
        if (!cancelled) setAllowed(true);
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!allowed) return null;

  return (
    <a className="platform-admin-entry" href="/admin" aria-label="Open Kit Hub Admin">
      <span className="platform-admin-entry__icon" aria-hidden="true"><ShieldCheck /></span>
      <span className="platform-admin-entry__copy">
        <small>PLATFORM</small>
        <strong>Kit Hub Admin</strong>
        <span>Release control room</span>
      </span>
      <ChevronRight className="platform-admin-entry__chevron" aria-hidden="true" />
    </a>
  );
}
