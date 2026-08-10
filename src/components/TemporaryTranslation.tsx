import { useEffect, useRef, useState } from "react";
import { Languages, X } from "lucide-react";
import { languageNames, normalizeLanguage, type KitLanguage } from "../lib/i18n";
import { useKitLocale } from "../lib/use-kit-locale";
import "../temporary-translation.css";

type Result={translatedText:string;sourceLanguage:string;targetLanguage:string;visibleForMinutes:number;expiresAt:string;viewerOnly:boolean};
const sourceOptions=Object.entries(languageNames) as Array<[KitLanguage,string]>;

export function TemporaryTranslation({householdId,text,label="Translate",compact=false}:{householdId:string;text:string;label?:string;compact?:boolean}){
 const locale=useKitLocale();
 const [open,setOpen]=useState(false),[source,setSource]=useState<KitLanguage>(()=>normalizeLanguage(localStorage.getItem("kit-hub-content-language")||(locale.language==="en"?"nl":"en"))),[result,setResult]=useState<Result|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const timer=useRef<number|null>(null);
 useEffect(()=>()=>{if(timer.current)window.clearTimeout(timer.current)},[]);
 if(!text.trim())return null;
 async function translate(){setLoading(true);setError("");try{localStorage.setItem("kit-hub-content-language",source);const response=await fetch(`/api/v1/households/${encodeURIComponent(householdId)}/translate`,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({text,sourceLanguage:source,targetLanguage:locale.language})});const body=await response.json() as Result&{error?:{message?:string}};if(!response.ok)throw new Error(body.error?.message||"Kit Hub could not translate that yet.");setResult(body);setOpen(false);if(timer.current)window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>setResult(null),Math.max(1,body.visibleForMinutes)*60000)}catch(e){setError(e instanceof Error?e.message:"Kit Hub could not translate that yet.")}finally{setLoading(false)}}
 if(result)return <div className={`temporary-translation ${compact?"is-compact":""}`}><div className="temporary-translation__text"><Languages/><span><strong>{result.translatedText}</strong><small>Translated for you · hides in {result.visibleForMinutes} min</small></span></div><button type="button" onClick={()=>setResult(null)}>Show original</button></div>;
 return <div className={`temporary-translation-control ${compact?"is-compact":""}`}><button type="button" className="temporary-translation-trigger" onClick={()=>setOpen(v=>!v)}><Languages/>{label}</button>{open&&<div className="temporary-translation-menu"><button className="temporary-translation-close" type="button" onClick={()=>setOpen(false)} aria-label="Close translation menu"><X/></button><label>Written in<select value={source} onChange={e=>setSource(normalizeLanguage(e.target.value))}>{sourceOptions.filter(([code])=>code!==locale.language).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label><button type="button" onClick={()=>void translate()} disabled={loading||source===locale.language}>{loading?"Translating…":`Translate to ${languageNames[locale.language]}`}</button>{error&&<small className="temporary-translation-error">{error}</small>}<small>Only you can see this translation.</small></div>}</div>
}
