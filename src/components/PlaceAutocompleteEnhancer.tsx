import { useEffect } from "react";
import "../search-enhancements.css";

type Place={id:string;label:string;name:string;latitude:number;longitude:number;city:string|null;country:string|null};

export function PlaceAutocompleteEnhancer(){
  useEffect(()=>{
    const cleanups=new Map<HTMLInputElement,()=>void>();
    function attach(input:HTMLInputElement){
      if(cleanups.has(input))return;
      const label=input.closest("label"); if(!label)return;
      label.classList.add("place-autocomplete-host");
      input.autocomplete="off";
      input.placeholder=input.placeholder||"Start typing a place or address…";
      const box=document.createElement("div");box.className="place-autocomplete-results";box.hidden=true;label.appendChild(box);
      let timer=0,controller:AbortController|null=null;
      const hide=()=>{box.hidden=true;box.replaceChildren()};
      const render=(items:Place[])=>{
        box.replaceChildren();
        if(!items.length){hide();return}
        for(const place of items){
          const button=document.createElement("button");button.type="button";button.className="place-autocomplete-option";
          const strong=document.createElement("strong");strong.textContent=place.name||place.label;
          const small=document.createElement("small");small.textContent=place.label;
          button.append(strong,small);button.addEventListener("mousedown",event=>event.preventDefault());
          button.addEventListener("click",()=>{input.value=place.label;input.dataset.placeLat=String(place.latitude);input.dataset.placeLon=String(place.longitude);input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));hide();input.focus()});
          box.appendChild(button);
        }
        box.hidden=false;
      };
      const search=()=>{
        window.clearTimeout(timer);controller?.abort();
        const query=input.value.trim();if(query.length<3){hide();return}
        timer=window.setTimeout(async()=>{controller=new AbortController();box.hidden=false;box.innerHTML='<div class="place-autocomplete-status">Finding places…</div>';try{const response=await fetch(`/api/v1/places/autocomplete?q=${encodeURIComponent(query)}`,{credentials:"include",signal:controller.signal});const body=await response.json().catch(()=>({})) as any;if(!response.ok)throw new Error(body?.error?.message||"Place search unavailable.");render(Array.isArray(body.results)?body.results:[])}catch(error){if((error as Error).name==="AbortError")return;box.innerHTML=`<div class="place-autocomplete-status is-error">${escapeHtml(error instanceof Error?error.message:"Place search unavailable.")}</div>`;box.hidden=false}},350);
      };
      const blur=()=>window.setTimeout(hide,180);
      input.addEventListener("input",search);input.addEventListener("blur",blur);
      cleanups.set(input,()=>{window.clearTimeout(timer);controller?.abort();input.removeEventListener("input",search);input.removeEventListener("blur",blur);box.remove()});
    }
    const scan=()=>document.querySelectorAll<HTMLInputElement>('input[name="location"]').forEach(attach);
    scan();const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect();cleanups.forEach(fn=>fn());cleanups.clear()};
  },[]);
  return null;
}

function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]||char))}
