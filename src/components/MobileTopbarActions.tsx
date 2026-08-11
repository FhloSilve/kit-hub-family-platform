import { useEffect, useState } from "react";
import { CalendarRange, Moon, Plus, Repeat2, Sun } from "lucide-react";
import { createPortal } from "react-dom";
import "../mobile-topbar-actions.css";

export function MobileTopbarActions(){
  const[target,setTarget]=useState<HTMLElement|null>(null);
  const[profileTarget,setProfileTarget]=useState<HTMLElement|null>(null);
  const[dark,setDark]=useState(()=>document.documentElement.dataset.kitAppearance==="dark");
  useEffect(()=>{
    const locate=()=>{
      setTarget(document.querySelector<HTMLElement>(".topbar-actions"));
      setProfileTarget(document.querySelector<HTMLElement>(".profile-popover"));
    };
    locate();
    const observer=new MutationObserver(locate);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const sync=(event:Event)=>setDark(Boolean((event as CustomEvent<{dark?:boolean}>).detail?.dark));
    window.addEventListener("kit-hub-appearance-changed",sync);
    return()=>window.removeEventListener("kit-hub-appearance-changed",sync);
  },[]);
  if(!target)return null;
  const toggleAppearance=()=>document.querySelector<HTMLButtonElement>(".appearance-quick-toggle")?.click();
  const openSilvi=()=>document.querySelector<HTMLButtonElement>(".silvi-launcher")?.click();
  const openRoutines=()=>document.querySelector<HTMLButtonElement>(".routines-launcher")?.click();
  const openCoordination=()=>window.dispatchEvent(new Event("kit-hub-open-coordination"));
  const quickAdd=()=>document.querySelector<HTMLButtonElement>(".mobile-quick-add")?.click();
  return <>
    {createPortal(<div className="mobile-topbar-utilities" aria-label="Quick actions">
      <button type="button" className="mobile-topbar-utility" onClick={toggleAppearance} aria-label={dark?"Switch to light mode":"Switch to dark mode"}>{dark?<Sun/>:<Moon/>}</button>
      <button type="button" className="mobile-topbar-utility mobile-topbar-utility--silvi" onClick={openSilvi} aria-label="Open Silvi household assistant" title="Silvi — household assistant"><img src="/silvi-geometric.svg" alt=""/><span className="mobile-topbar-utility__label">Silvi</span></button>
      <button type="button" className="mobile-topbar-utility mobile-topbar-utility--add" onClick={quickAdd} aria-label="Quick add"><Plus/></button>
    </div>,target)}
    {profileTarget&&createPortal(<><button type="button" className="mobile-profile-routines mobile-profile-coordination" onClick={openCoordination} title="See the household week, responsibilities and workload"><CalendarRange/><span>Household plan</span></button><button type="button" className="mobile-profile-routines" onClick={openRoutines} title="Recurring chores, reminders and assignments"><Repeat2/><span>Routines & recurring chores</span></button></>,profileTarget)}
  </>;
}
