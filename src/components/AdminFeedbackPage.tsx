import { ArrowLeft, Check, MessageSquareWarning, Palette, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminFeedbackBoard } from "./AdminFeedbackBoard";
import "../admin.css";

type AdminTheme="orchid"|"apricot"|"periwinkle"|"ocean";
const themes:Array<{key:AdminTheme;label:string;hex:string}>=[{key:"orchid",label:"Orchid",hex:"#F2CFF1"},{key:"apricot",label:"Apricot",hex:"#EAB099"},{key:"periwinkle",label:"Periwinkle",hex:"#AFAFDA"},{key:"ocean",label:"Ocean",hex:"#19485F"}];

export function AdminFeedbackPage({onBack}:{onBack:()=>void}){
  const[theme,setTheme]=useState<AdminTheme>(()=>(localStorage.getItem("kit-hub-admin-theme") as AdminTheme)||"ocean");
  useEffect(()=>{localStorage.setItem("kit-hub-admin-theme",theme)},[theme]);
  return <main className={`admin-page admin-feedback-page admin-theme-${theme}`}>
    <header className="admin-header">
      <button className="admin-back" onClick={onBack}><ArrowLeft/> Back to Kit Hub</button>
      <div className="admin-title"><span><MessageSquareWarning/></span><div><small>KIT HUB ADMIN</small><h1>Tester feedback</h1><p>Review issues, suggestions and screenshots without crowding the production release workspace.</p></div></div>
    </header>
    <section className="admin-toolbar">
      <div><Palette/><span><strong>Admin colour</strong><small>Use the same control-room theme across Admin pages.</small></span></div>
      <div className="admin-themes">{themes.map(item=><button key={item.key} type="button" className={theme===item.key?"selected":""} onClick={()=>setTheme(item.key)}><i style={{background:item.hex}}/>{item.label}{theme===item.key&&<Check/>}</button>)}</div>
    </section>
    <AdminFeedbackBoard/>
    <section className="admin-safety"><ShieldCheck/><div><strong>Admin safety boundary</strong><p>Only server-side allowlisted platform administrators can review and manage tester feedback.</p></div></section>
  </main>
}
