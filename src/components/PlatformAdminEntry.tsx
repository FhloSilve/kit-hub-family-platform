import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import "../platform-admin-entry.css";

export function PlatformAdminEntry() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.adminReleaseStatus()
      .then(() => { if (!cancelled) setAllowed(true); })
      .catch(() => { if (!cancelled) setAllowed(false); });
    return () => { cancelled = true; };
  }, []);

  if (!allowed) return null;

  return (
    <a className="platform-admin-entry" href="/admin" aria-label="Open Kit Hub Admin">
      <ShieldCheck aria-hidden="true" />
      <span>Admin</span>
    </a>
  );
}
