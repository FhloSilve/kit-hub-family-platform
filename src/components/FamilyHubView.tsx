import { useEffect, useMemo, useState } from "react";
import { Activity, BellRing, Megaphone, MessageCircle, Pin, PinOff, Send, Sparkles } from "lucide-react";
import type { FormEvent } from "react";
import type { HouseholdCommunicationResponse } from "../../shared/contracts";
import { ApiError, api } from "../lib/api";
import "../family-hub.css";

interface Props {
  householdId: string;
  userId: string;
  householdName: string;
  data: HouseholdCommunicationResponse;
  loading: boolean;
  demo?: boolean;
  onChange: (data: HouseholdCommunicationResponse) => void;
}

type Tab = "chat" | "announcements" | "activity";

export function FamilyHubView({ householdId, userId, householdName, data, loading, demo = false, onChange }: Props) {
  const [tab, setTab] = useState<Tab>("chat");
  const [message, setMessage] = useState("");
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messages = useMemo(() => [...data.messages].reverse(), [data.messages]);
  const pinned = data.announcements.filter((item) => item.pinned);

  useEffect(() => {
    if (tab !== "chat" || !data.unreadCount || demo) return;
    void api.markHouseholdMessagesRead(householdId).then(() => onChange({ ...data, unreadCount: 0 })).catch(() => undefined);
  }, [tab, data.unreadCount, demo, householdId]);

  async function send(event: FormEvent) {
    event.preventDefault(); const body = message.trim(); if (!body || saving || !data.canSend) return;
    setSaving(true); setError(null);
    try {
      if (demo) { setMessage(""); return; }
      const created = await api.sendHouseholdMessage(householdId, { body });
      onChange({ ...data, messages: [created, ...data.messages] }); setMessage("");
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "The message could not be sent."); }
    finally { setSaving(false); }
  }

  async function postAnnouncement(event: FormEvent) {
    event.preventDefault(); if (saving || !data.canAnnounce) return;
    setSaving(true); setError(null);
    try {
      if (demo) { setAnnouncementOpen(false); return; }
      const created = await api.createHouseholdAnnouncement(householdId, { title: announcementTitle.trim(), body: announcementBody.trim() });
      onChange({ ...data, announcements: [created, ...data.announcements] }); setAnnouncementTitle(""); setAnnouncementBody(""); setAnnouncementOpen(false);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "The announcement could not be posted."); }
    finally { setSaving(false); }
  }

  async function togglePin(id: string, value: boolean) {
    onChange({ ...data, announcements: data.announcements.map((item) => item.id === id ? { ...item, pinned: value } : item) });
    if (!demo) try { await api.setHouseholdAnnouncementPinned(householdId, id, value); } catch { onChange(data); }
  }

  return <div className="family-hub">
    <header className="module-heading family-hub__heading">
      <div><span className="today-date">Family Hub</span><h1>Stay close, without the noise.</h1><p>Messages, household announcements and the little updates that keep {householdName} moving together.</p></div>
      {data.canAnnounce && <button className="button button--primary" onClick={() => setAnnouncementOpen(true)}><Megaphone /> New announcement</button>}
    </header>

    {pinned.length > 0 && <section className="family-hub__pinned"><div className="family-hub__section-label"><Pin /> Pinned for everyone</div><div className="family-hub__pinned-grid">{pinned.slice(0, 3).map((item) => <article key={item.id}><span><Megaphone /></span><div><strong>{item.title}</strong><p>{item.body}</p><small>{item.createdByName}</small></div></article>)}</div></section>}
    {error && <div className="module-alert">{error}</div>}

    <div className="family-hub__tabs" role="tablist">
      <button className={tab === "chat" ? "is-active" : ""} onClick={() => setTab("chat")}><MessageCircle /> Chat {data.unreadCount > 0 && <b>{data.unreadCount > 99 ? "99+" : data.unreadCount}</b>}</button>
      <button className={tab === "announcements" ? "is-active" : ""} onClick={() => setTab("announcements")}><Megaphone /> Announcements {pinned.length > 0 && <small>{pinned.length}</small>}</button>
      <button className={tab === "activity" ? "is-active" : ""} onClick={() => setTab("activity")}><Activity /> Activity</button>
    </div>

    {loading ? <section className="module-card family-hub__loading">Opening the Family Hub…</section> : tab === "chat" ? <section className="family-hub__chat module-card">
      <div className="family-hub__chat-top"><div><MessageCircle /><span><strong>Household chat</strong><small>A shared room for everyone at home.</small></span></div><span className="family-hub__calm"><Sparkles /> Calm by design</span></div>
      <div className="family-hub__messages">{messages.length ? messages.map((item) => <article key={item.id} className={item.authorUserId === userId ? "is-mine" : ""}><span className="family-hub__avatar">{item.authorName.slice(0,1).toUpperCase()}</span><div><header><strong>{item.authorUserId === userId ? "You" : item.authorName}</strong><time>{new Date(item.createdAt).toLocaleString(undefined,{weekday:"short",hour:"2-digit",minute:"2-digit"})}</time></header><p>{item.body}</p></div></article>) : <div className="family-hub__empty"><MessageCircle /><strong>Start the family conversation.</strong><p>A quick hello, a reminder, or something funny from the day can live here.</p></div>}</div>
      {data.canSend ? <form className="family-hub__composer" onSubmit={send}><textarea value={message} maxLength={1000} rows={2} onChange={(event) => setMessage(event.target.value)} placeholder="Write to the household…" /><div><small>{message.length}/1000</small><button className="button button--primary" disabled={!message.trim() || saving}><Send /> Send</button></div></form> : <div className="family-hub__readonly">You can read this household chat, but your role cannot send messages.</div>}
    </section> : tab === "announcements" ? <section className="family-hub__announcements">{data.announcements.length ? data.announcements.map((item) => <article key={item.id} className={`module-card ${item.pinned ? "is-pinned" : ""}`}><div className="family-hub__announcement-icon"><Megaphone /></div><div><header><span>{item.pinned && <b><Pin /> Pinned</b>}<strong>{item.title}</strong></span>{data.canAnnounce && <button onClick={() => void togglePin(item.id, !item.pinned)} aria-label={item.pinned ? "Unpin announcement" : "Pin announcement"}>{item.pinned ? <PinOff /> : <Pin />}</button>}</header><p>{item.body}</p><small>Posted by {item.createdByName} · {new Date(item.createdAt).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</small></div></article>) : <div className="module-card family-hub__empty"><Megaphone /><strong>No household announcements yet.</strong><p>Important family-wide messages can be pinned here so they do not disappear in chat.</p></div>}</section> : <section className="family-hub__activity module-card"><div className="family-hub__activity-head"><Activity /><div><strong>Around the house</strong><small>A simple history of shared household updates.</small></div></div>{data.activity.length ? <div className="family-hub__timeline">{data.activity.map((item) => <article key={item.id}><span><BellRing /></span><div><strong>{item.summary}</strong><small>{new Date(item.createdAt).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</small></div></article>)}</div> : <div className="family-hub__empty"><Activity /><strong>It is quiet here for now.</strong><p>Shared activity will appear as the household starts using Family Hub.</p></div>}</section>}

    {announcementOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAnnouncementOpen(false); }}><form className="modal-card family-hub__announcement-modal" onSubmit={postAnnouncement}><span className="today-date">Household announcement</span><h2>Pin something everyone should see.</h2><label>Title<input autoFocus value={announcementTitle} maxLength={120} onChange={(event) => setAnnouncementTitle(event.target.value)} placeholder="School closes early Friday" /></label><label>Message<textarea rows={5} value={announcementBody} maxLength={1200} onChange={(event) => setAnnouncementBody(event.target.value)} placeholder="Add the details here…" /></label><div className="modal-actions"><button type="button" className="button" onClick={() => setAnnouncementOpen(false)}>Cancel</button><button className="button button--primary" disabled={!announcementTitle.trim() || !announcementBody.trim() || saving}><Pin /> Post & pin</button></div></form></div>}
  </div>;
}
