import { useEffect } from "react";

export function SilviKeyboardEnhancer(){
 useEffect(()=>{const keydown=(event:KeyboardEvent)=>{if(event.key!=="Enter"||event.shiftKey||event.isComposing)return;const target=event.target as HTMLElement|null;if(!target?.matches(".silvi-composer textarea"))return;event.preventDefault();const form=target.closest<HTMLFormElement>(".silvi-composer");const submit=form?.querySelector<HTMLButtonElement>('button[type="submit"]');if(!form||submit?.disabled)return;form.requestSubmit()};document.addEventListener("keydown",keydown,true);return()=>document.removeEventListener("keydown",keydown,true)},[]);
 return null;
}
