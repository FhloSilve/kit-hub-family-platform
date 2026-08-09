import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import "../platform-admin-entry.css";

type AdminTheme = "orchid" | "apricot" | "periwinkle" | "ocean";
const validThemes: AdminTheme[] = ["orchid", "apricot", "periwinkle", "ocean"];

function readTheme(): AdminTheme {
  const stored = localStorage.getItem("kit-hub-admin-theme");
  return validThemes.includes(stored as AdminTheme) ? (stored as AdminTheme) : "ocean";
}

export function PlatformAdminEntry() {
  const [allowed, setAllowed] = useState(false);
  const [theme, setTheme] = useState<AdminTheme>(readTheme);

  useEffect(() => {
    let cancelled = false;
    void api.adminReleaseStatus()
      .then(() => { if (!cancelled) setAllowed(true); })
      .catch(() => { if (!cancelled) setAllowed(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const syncTheme = () => setTheme(readTheme());
    window.addEventListener("storage", syncTheme);
    window.addEventListener("focus", syncTheme);
    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("focus", syncTheme);
    };
  }, []);

  if (!allowed) return null;

  return (
    <a className={`platform-admin-entry platform-admin-entry--${theme}`} href="/admin" aria-label="Open Kit Hub Admin">
      <ShieldCheck aria-hidden="true" />
      <span>Admin</span>
    </a>
  );
}
