import { ChevronDown, Download, KeyRound, LogOut, RefreshCw, ShieldAlert, ShieldCheck, Smartphone, Trash2, UserRoundCog, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { authClient } from "../lib/auth-client";
import "../account-security.css";

type SessionInfo = { id: string; device: string; createdAt: number; updatedAt: number; expiresAt: number };
type Data = { sessions: SessionInfo[]; note: string };
type Successor = { userId: string; name: string; email: string; role: string };
type OwnedHousehold = { id: string; name: string; successors: Successor[] };
type Membership = { householdId: string; householdName: string; role: string };
type Deletion = {
  canRequest: boolean;
  blockers: Array<{ code: string; householdId: string; label: string }>;
  ownedHouseholds: OwnedHousehold[];
  memberships: Membership[];
  activeMemberships: number;
  request: { status: string; requestedAt: string; earliestDeleteAt: string; cancelledAt: string | null; reasonCode: string | null } | null;
  coolingOffHours: number;
  readyToFinalize: boolean;
  requiresReauth: boolean;
  reauthWindowMinutes: number;
  note: string;
};
type TwoFactorSetup = { totpURI: string; backupCodes: string[]; verified: boolean };

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(body?.error?.message || "Account security could not complete that action.");
  return body as T;
}

function when(value: number | string) {
  if (!value) return "Unknown";
  if (typeof value === "string") return new Date(value).toLocaleString();
  const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
  return new Date(milliseconds).toLocaleString();
}

export function AccountSecurityDock() {
  const session = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [deletion, setDeletion] = useState<Deletion | null>(null);
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const twoFactorEnabled = Boolean((session.data?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled);
  const setupSecret = useMemo(() => {
    if (!twoFactorSetup?.totpURI) return "";
    try { return new URL(twoFactorSetup.totpURI).searchParams.get("secret") || ""; } catch { return ""; }
  }, [twoFactorSetup?.totpURI]);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const [sessions, lifecycle] = await Promise.all([
        request<Data>("/api/v1/security/sessions"),
        request<Deletion>("/api/v1/security/account-deletion"),
      ]);
      setData(sessions);
      setDeletion(lifecycle);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Account security could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const show = () => { setOpen(true); void load(); };
    window.addEventListener("kit-hub-open-account-security", show);
    return () => window.removeEventListener("kit-hub-open-account-security", show);
  }, []);

  async function reauthenticate() {
    const email = session.data?.user?.email || "";
    if (!email) return false;
    const password = prompt(`Confirm the password for ${email}. Kit Hub will treat sensitive actions as recently authenticated for ${deletion?.reauthWindowMinutes ?? 15} minutes.`);
    if (!password) return false;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message || "Your password could not be confirmed.");
        return false;
      }
      const authData = result.data as { twoFactorRedirect?: boolean } | null;
      if (authData?.twoFactorRedirect) {
        const code = prompt("Enter your authenticator code to finish confirming your identity.");
        if (!code) return false;
        const verified = await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice: true });
        if (verified.error) {
          setError(verified.error.message || "Your authenticator code could not be verified.");
          return false;
        }
      }
      await session.refetch();
      const lifecycle = await request<Deletion>("/api/v1/security/account-deletion");
      setDeletion(lifecycle);
      setNotice("Identity confirmed. Sensitive actions are unlocked for a short time.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your password could not be confirmed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function ensureRecentAuth() {
    if (!deletion?.requiresReauth) return true;
    return reauthenticate();
  }

  async function enableTwoFactor() {
    const password = prompt("Enter your Kit Hub password to set up two-factor authentication.");
    if (!password) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await authClient.twoFactor.enable({ password, issuer: "Kit Hub" });
      if (result.error) throw new Error(result.error.message || "Two-factor authentication could not be started.");
      const setup = result.data as { totpURI?: string; backupCodes?: string[] } | null;
      if (!setup?.totpURI || !setup.backupCodes?.length) throw new Error("Kit Hub did not receive the authenticator setup details.");
      setTwoFactorSetup({ totpURI: setup.totpURI, backupCodes: setup.backupCodes, verified: false });
      setTwoFactorCode("");
      setNotice("Add Kit Hub to your authenticator app, then verify one code below.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Two-factor authentication could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyTwoFactor() {
    const code = twoFactorCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code shown in your authenticator app.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await authClient.twoFactor.verifyTotp({ code, trustDevice: true });
      if (result.error) throw new Error(result.error.message || "That authenticator code could not be verified.");
      setTwoFactorSetup(current => current ? { ...current, verified: true } : current);
      await session.refetch();
      setNotice("Two-factor authentication is active. Save the backup codes somewhere private before closing this setup.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That authenticator code could not be verified.");
    } finally {
      setBusy(false);
    }
  }

  async function disableTwoFactor() {
    if (!confirm("Turn off two-factor authentication for this account?")) return;
    const password = prompt("Enter your Kit Hub password to turn off two-factor authentication.");
    if (!password) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await authClient.twoFactor.disable({ password });
      if (result.error) throw new Error(result.error.message || "Two-factor authentication could not be disabled.");
      setTwoFactorSetup(null);
      setTwoFactorCode("");
      await session.refetch();
      setNotice("Two-factor authentication has been turned off.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Two-factor authentication could not be disabled.");
    } finally {
      setBusy(false);
    }
  }

  async function signOutEverywhere() {
    if (!confirm("Sign out every Kit Hub session, including this device? You will need to sign in again.")) return;
    setBusy(true);
    setError("");
    try {
      await request("/api/v1/security/sign-out-everywhere", { method: "POST", body: "{}" });
      await authClient.signOut().catch(() => undefined);
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sessions could not be signed out.");
      setBusy(false);
    }
  }

  async function downloadExport() {
    setBusy(true);
    setError("");
    try {
      const exportData = await request<Record<string, unknown>>("/api/v1/security/account-export");
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `kit-hub-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your account export could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function transferOwnership(household: OwnedHousehold, targetUserId: string) {
    const target = household.successors.find(item => item.userId === targetUserId);
    if (!target || !confirm(`Transfer ownership of ${household.name} to ${target.name}? You will become an Admin and this cannot be undone automatically.`)) return;
    if (!(await ensureRecentAuth())) return;
    setBusy(true); setError("");
    try {
      setDeletion(await request<Deletion>(`/api/v1/security/household-ownership/${household.id}/transfer`, { method: "POST", body: JSON.stringify({ targetUserId }) }));
    } catch (e) { setError(e instanceof Error ? e.message : "Ownership could not be transferred."); }
    finally { setBusy(false); }
  }

  async function leaveHousehold(item: Membership) {
    if (item.role === "owner") return;
    if (!confirm(`Leave ${item.householdName}? Your shared contributions stay in the household, but your membership will end.`)) return;
    if (!(await ensureRecentAuth())) return;
    setBusy(true); setError("");
    try { setDeletion(await request<Deletion>(`/api/v1/security/households/${item.householdId}/leave`, { method: "POST", body: "{}" })); }
    catch (e) { setError(e instanceof Error ? e.message : "You could not leave that household."); }
    finally { setBusy(false); }
  }

  async function requestDeletion() {
    if (!deletion?.canRequest) return;
    if (!(await ensureRecentAuth())) return;
    const phrase = prompt(`Type DELETE MY ACCOUNT to start the ${deletion.coolingOffHours}-hour deletion cooling-off period.`);
    if (phrase !== "DELETE MY ACCOUNT") return;
    const email = session.data?.user?.email || "";
    if (!email) return;
    setBusy(true); setError("");
    try { setDeletion(await request<Deletion>("/api/v1/security/account-deletion", { method: "POST", body: JSON.stringify({ confirmation: phrase, email }) })); }
    catch (e) { setError(e instanceof Error ? e.message : "Account deletion could not be requested."); }
    finally { setBusy(false); }
  }

  async function cancelDeletion() {
    setBusy(true); setError("");
    try { setDeletion(await request<Deletion>("/api/v1/security/account-deletion", { method: "DELETE", body: "{}" })); }
    catch (e) { setError(e instanceof Error ? e.message : "The deletion request could not be cancelled."); }
    finally { setBusy(false); }
  }

  async function finalizeDeletion() {
    if (!deletion?.readyToFinalize) return;
    if (!(await ensureRecentAuth())) return;
    const phrase = prompt("Type ERASE MY ACCOUNT to permanently remove your sign-in identity. Shared household history may retain a non-identifying Deleted member reference.");
    if (phrase !== "ERASE MY ACCOUNT") return;
    const email = session.data?.user?.email || "";
    if (!email) return;
    setBusy(true); setError("");
    try {
      await request("/api/v1/security/account-deletion/finalize", { method: "POST", body: JSON.stringify({ confirmation: phrase, email }) });
      await authClient.signOut().catch(() => undefined);
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permanent deletion could not be completed.");
      setBusy(false);
    }
  }

  return <>
    <button className="account-security-launcher" type="button" onClick={() => { setOpen(true); void load(); }}><ShieldCheck/><span>Security</span></button>
    {open && <div className="account-security-backdrop" onMouseDown={() => setOpen(false)}>
      <section className="account-security-panel" onMouseDown={e => e.stopPropagation()}>
        <header><div><small>ACCOUNT SECURITY</small><h2>Your account security</h2><p>Protect sign-in, review devices, export account data, and control destructive account changes.</p></div><button className="icon-button" onClick={() => setOpen(false)}><X/></button></header>
        {error && <p className="module-alert">{error}</p>}
        {notice && <p className="account-security-success"><ShieldCheck/>{notice}</p>}
        <div className="account-security-toolbar">
          <button className="button button--secondary button--compact" disabled={busy} onClick={() => void load()}><RefreshCw className={busy ? "spin" : ""}/> Refresh</button>
          <button className="button button--secondary button--compact" disabled={busy} onClick={() => void downloadExport()}><Download/> Download my account data</button>
          <button className="button button--secondary button--compact account-security-danger" disabled={busy} onClick={() => void signOutEverywhere()}><LogOut/> Sign out everywhere</button>
        </div>

        <section className="account-security-two-factor">
          <header><KeyRound/><div><strong>Two-factor authentication</strong><small>{twoFactorEnabled ? "Active — password sign-in also requires a code from your authenticator app." : "Add an authenticator app for stronger protection if your password is ever compromised."}</small></div></header>
          {!twoFactorSetup && (twoFactorEnabled
            ? <button className="button button--secondary button--compact account-security-danger" disabled={busy} onClick={() => void disableTwoFactor()}>Turn off two-factor</button>
            : <button className="button button--secondary button--compact" disabled={busy} onClick={() => void enableTwoFactor()}><KeyRound/> Set up authenticator app</button>)}
          {twoFactorSetup && <div className="account-security-2fa-setup">
            <p><strong>1. Add Kit Hub to your authenticator app.</strong></p>
            <a className="button button--secondary button--compact" href={twoFactorSetup.totpURI}>Open authenticator setup</a>
            {setupSecret && <label><span>Manual setup key</span><code>{setupSecret}</code><button type="button" className="button button--secondary button--compact" onClick={() => void navigator.clipboard.writeText(setupSecret)}>Copy key</button></label>}
            {!twoFactorSetup.verified && <label><span>2. Enter the 6-digit code</span><div className="account-security-code-row"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={twoFactorCode} onChange={e => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}/><button className="button button--primary button--compact" disabled={busy || twoFactorCode.length !== 6} onClick={() => void verifyTwoFactor()}>Verify & enable</button></div></label>}
            <div className="account-security-backup-codes"><strong>{twoFactorSetup.verified ? "Save these backup codes before you finish" : "Backup codes"}</strong><small>Each code is single-use. Keep them somewhere private and separate from this device.</small><div>{twoFactorSetup.backupCodes.map(code => <code key={code}>{code}</code>)}</div><button type="button" className="button button--secondary button--compact" onClick={() => void navigator.clipboard.writeText(twoFactorSetup.backupCodes.join("\n"))}>Copy backup codes</button></div>
            {twoFactorSetup.verified && <button className="button button--primary button--compact" onClick={() => setTwoFactorSetup(null)}>I saved my backup codes</button>}
          </div>}
        </section>

        {!data ? <p>Loading sessions…</p> : <>
          <details className="account-security-session-disclosure">
            <summary>
              <span><Smartphone/><strong>Signed-in devices</strong><small>{data.sessions.length} active session{data.sessions.length === 1 ? "" : "s"}</small></span>
              <span className="account-security-session-toggle"><span className="when-closed">Show devices</span><span className="when-open">Hide devices</span><ChevronDown/></span>
            </summary>
            <div className="account-security-sessions">{data.sessions.map(item => <article key={item.id}><Smartphone/><div><strong>{item.device}</strong><small>Last active {when(item.updatedAt)}</small><small>Session expires {when(item.expiresAt)}</small></div></article>)}{!data.sessions.length && <p>No active sessions were found.</p>}</div>
          </details>
          <p className="account-security-note"><ShieldCheck/>{data.note}</p>
          <p className="account-security-note"><ShieldCheck/>The current export contains your account, profile, household memberships, beta-email choices, coarse session details and security events. Shared family content is not duplicated into this personal export.</p>
        </>}

        {deletion && <section className="account-security-delete">
          <header><ShieldAlert/><div><strong>Account deletion protection</strong><small>{deletion.note}</small></div></header>
          {deletion.requiresReauth && <div className="account-security-reauth"><KeyRound/><span><strong>Confirm your identity before sensitive changes</strong><small>Ownership transfers, leaving a household and account deletion require a sign-in from the last {deletion.reauthWindowMinutes} minutes.</small></span><button className="button button--secondary button--compact" disabled={busy} onClick={() => void reauthenticate()}>Confirm password</button></div>}
          {deletion.ownedHouseholds.map(household => <div className="account-security-handoff" key={household.id}><div><UserRoundCog/><span><strong>{household.name}</strong><small>You are the owner. Transfer ownership before deletion.</small></span></div>{household.successors.length ? <select disabled={busy} defaultValue="" onChange={e => { if (e.target.value) void transferOwnership(household, e.target.value); }}><option value="" disabled>Choose new owner…</option>{household.successors.map(person => <option value={person.userId} key={person.userId}>{person.name} · {person.role}</option>)}</select> : <small>Add an Adult or Admin to this household before you can transfer it.</small>}</div>)}
          {deletion.memberships.filter(item => item.role !== "owner").map(item => <div className="account-security-membership" key={item.householdId}><span><strong>{item.householdName}</strong><small>{item.role} · leave before permanent deletion</small></span><button className="button button--secondary button--compact" disabled={busy} onClick={() => void leaveHousehold(item)}>Leave household</button></div>)}
          {deletion.blockers.length > 0 && <div className="account-security-blockers">{deletion.blockers.map(item => <span key={item.householdId}><ShieldAlert/>{item.label}</span>)}</div>}
          {deletion.request?.status === "requested" ? <div className="account-security-pending"><strong>Deletion requested</strong><small>Requested {when(deletion.request.requestedAt)}. Earliest permanent deletion: {when(deletion.request.earliestDeleteAt)}.</small><small>You can cancel at any time during the {deletion.coolingOffHours}-hour cooling-off period.</small>{deletion.readyToFinalize && <button className="button button--secondary button--compact account-security-danger" disabled={busy} onClick={() => void finalizeDeletion()}><Trash2/> Permanently erase account</button>}<button className="button button--secondary button--compact" disabled={busy} onClick={() => void cancelDeletion()}>Cancel deletion request</button></div> : <button className="button button--secondary button--compact account-security-danger" disabled={busy || !deletion.canRequest} onClick={() => void requestDeletion()}><Trash2/> Request account deletion</button>}
        </section>}
      </section>
    </div>}
  </>;
}
