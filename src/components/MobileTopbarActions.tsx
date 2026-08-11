import { useEffect, useState } from "react";
import { Plus, Settings } from "lucide-react";
import { createPortal } from "react-dom";
import "../mobile-topbar-actions.css";

export function MobileTopbarActions(){
  const[target,setTarget]=useState<HTMLElement|null>(null);
  useEffect(()=>{
    const locate=()=>setTarget(document.querySelector<HTMLElement>(".topbar-actions"));
    locate();
    const observer=new MutationObserver(locate);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);
  if(!target)return null;
  const openSilvi=()=>document.querySelector<HTMLButtonElement>(".silvi-launcher")?.click();
  const openSettings=()=>window.dispatchEvent(new Event("kit-hub-open-personal-settings"));
  const quickAdd=()=>document.querySelector<HTMLButtonElement>(".mobile-quick-add")?.click();
  return createPortal(<div className="mobile-topbar-utilities" aria-label="Quick actions">
    <button type="button" className="mobile-topbar-utility mobile-topbar-utility--silvi" onClick={openSilvi} aria-label="Open Silvi"><img src="/silvi-geometric.svg" alt=""/></button>
    <button type="button" className="mobile-topbar-utility" onClick={openSettings} aria-label="Open personal settings"><Settings/></button>
    <button type="button" className="mobile-topbar-utility mobile-topbar-utility--add" onClick={quickAdd} aria-label="Quick add"><Plus/></button>
  </div>,target);
}
