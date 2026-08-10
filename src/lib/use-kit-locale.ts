import { useEffect, useState } from "react";
import { normalizeLanguage, type KitLocale } from "./i18n";

function readLocale():KitLocale{return{language:normalizeLanguage(localStorage.getItem("kit-hub-language")),region:localStorage.getItem("kit-hub-region")||"BE",timeZone:localStorage.getItem("kit-hub-timezone")||"Europe/Brussels"}}

export function useKitLocale(){const[locale,setLocale]=useState<KitLocale>(readLocale);useEffect(()=>{const changed=(event:Event)=>{const detail=(event as CustomEvent<Partial<KitLocale>>).detail;setLocale(current=>({...current,...detail,language:normalizeLanguage(detail?.language??current.language)}))};window.addEventListener("kit-hub-locale-changed",changed);return()=>window.removeEventListener("kit-hub-locale-changed",changed)},[]);return locale}
