import { ArrowLeft, Gauge, MessageSquareText, Rocket } from "lucide-react";
import { AdminAdoptionPanel } from "./AdminAdoptionPanel";
import { AdminBetaReadinessPanel } from "./AdminBetaReadinessPanel";
import { AdminLaunchReadiness } from "./AdminLaunchReadiness";
import { AdminSecurityReadinessPanel } from "./AdminSecurityReadinessPanel";
import "../admin-launch-readiness.css";

export function AdminLaunchPage({onBack}:{onBack:()=>void}){
  return <main className="admin-page admin-theme-ocean admin-launch-page">
    <header className="admin-header admin-launch-page__header">
      <button className="admin-back" onClick={onBack}><ArrowLeft/> Back to Kit Hub</button>
      <div className="admin-title"><span><Rocket/></span><div><small>KIT HUB PRODUCT OPS</small><h1>Pre-launch & private beta</h1><p>A separate command centre for readiness, beta households, security, reliability, adoption, retention and the product roadmap.</p></div></div>
      <nav className="admin-launch-page__nav" aria-label="Admin areas">
        <a className="admin-secondary" href="/admin"><Gauge/> Release control room</a>
        <a className="admin-secondary" href="/admin/feedback"><MessageSquareText/> Tester feedback</a>
      </nav>
    </header>
    <AdminLaunchReadiness/>
    <AdminSecurityReadinessPanel/>
    <AdminAdoptionPanel/>
    <AdminBetaReadinessPanel/>
  </main>
}
