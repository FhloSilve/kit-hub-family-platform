import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Rocket } from "lucide-react";

export function AdminLaunchEntry(){
 const[host,setHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{const locate=()=>setHost(document.querySelector<HTMLElement>(".admin-header"));locate();const observer=new MutationObserver(locate);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()},[]);
 if(!host)return null;
 return createPortal(<button type="button" className="admin-secondary admin-launch-entry" onClick={()=>{window.location.href="/admin/launch"}}><Rocket/>Pre-launch & beta</button>,host);
}
