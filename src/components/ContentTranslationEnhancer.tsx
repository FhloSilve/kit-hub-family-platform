import { useEffect } from "react";
import { languageNames, normalizeLanguage, type KitLanguage } from "../lib/i18n";

const targets=[
 ".family-hub__messages article>div",
 ".family-hub__announcements article>div:last-child",
 ".family-note-list article",
 ".household-focus-content",
 ".task-row>div",
 ".calendar-v2-agenda-event>div:last-child",
 ".calendar-v2-event",
 ".dashboard-meal-details",
 ".meal-recipe-list article>div",
 ".meal-suggestion-list article>div",
 ".meal-dietary-card>div",
];
const languages=Object.entries(languageNames) as Array<[KitLanguage,string]>;
const owned=new WeakSet<Element>();

function contentText(element:Element){
 const clone=element.cloneNode(true) as HTMLElement;
 clone.querySelectorAll(".kit-content-translate,.temporary-translation,.temporary-translation-control,button,small,time").forEach(node=>node.remove());
 return (clone.textContent||"").replace(/\s+/g," ").trim().slice(0,5000);
}

export function ContentTranslationEnhancer({householdId}:{householdId:string}){
 useEffect(()=>{
  let queued=false;
  function enhance(){
   queued=false;
   if(localStorage.getItem("kit-hub-offer-translations")==="0")return;
   const targetLanguage=normalizeLanguage(localStorage.getItem("kit-hub-language"));
   for(const selector of targets)for(const element of Array.from(document.querySelectorAll<HTMLElement>(selector))){
    if(owned.has(element)||element.closest("[data-no-content-translation]"))continue;
    const text=contentText(element);if(!text||text.length<2)continue;
    owned.add(element);
    const wrap=document.createElement("span");wrap.className="kit-content-translate";
    const trigger=document.createElement("button");trigger.type="button";trigger.className="kit-content-translate__trigger";trigger.textContent="🌐 Translate";wrap.appendChild(trigger);element.appendChild(wrap);
    trigger.addEventListener("click",()=>{
     const existing=wrap.querySelector(".kit-content-translate__menu");if(existing){existing.remove();return}
     const menu=document.createElement("span");menu.className="kit-content-translate__menu";
     const label=document.createElement("label");label.textContent="Written in";
     const select=document.createElement("select");const remembered=normalizeLanguage(localStorage.getItem("kit-hub-content-language")||(targetLanguage==="en"?"nl":"en"));
     for(const [code,name] of languages){if(code===targetLanguage)continue;const option=document.createElement("option");option.value=code;option.textContent=name;option.selected=code===remembered;select.appendChild(option)}label.appendChild(select);menu.appendChild(label);
     const go=document.createElement("button");go.type="button";go.textContent=`Translate to ${languageNames[targetLanguage]}`;menu.appendChild(go);
     const note=document.createElement("small");note.textContent="Only you can see this translation.";menu.appendChild(note);wrap.appendChild(menu);
     go.addEventListener("click",async()=>{
      const source=normalizeLanguage(select.value);localStorage.setItem("kit-hub-content-language",source);go.disabled=true;go.textContent="Translating…";
      try{const response=await fetch(`/api/v1/households/${encodeURIComponent(householdId)}/translate`,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({text,sourceLanguage:source,targetLanguage})});const body=await response.json() as {translatedText?:string;visibleForMinutes?:number;error?:{message?:string}};if(!response.ok||!body.translatedText)throw new Error(body.error?.message||"Kit Hub could not translate that yet.");menu.remove();trigger.hidden=true;const result=document.createElement("span");result.className="kit-content-translate__result";const translated=document.createElement("strong");translated.textContent=body.translatedText;const meta=document.createElement("small");const ttl=Number(body.visibleForMinutes||localStorage.getItem("kit-hub-translation-ttl")||5);meta.textContent=`Translated for you · hides in ${ttl} min`;const original=document.createElement("button");original.type="button";original.textContent="Show original";result.append(translated,meta,original);wrap.appendChild(result);let timer=window.setTimeout(clear,Math.max(1,ttl)*60000);function clear(){window.clearTimeout(timer);result.remove();trigger.hidden=false}original.addEventListener("click",clear)}catch(error){note.textContent=error instanceof Error?error.message:"Kit Hub could not translate that yet.";note.className="is-error";go.disabled=false;go.textContent=`Translate to ${languageNames[targetLanguage]}`}
     });
    });
   }
  }
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(enhance)};schedule();const observer=new MutationObserver(schedule);observer.observe(document.body,{subtree:true,childList:true});const localeChanged=()=>schedule();window.addEventListener("kit-hub-locale-changed",localeChanged);return()=>{observer.disconnect();window.removeEventListener("kit-hub-locale-changed",localeChanged)};
 },[householdId]);
 return null;
}
