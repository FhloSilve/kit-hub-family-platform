import { useEffect } from "react";

export type SilviContextDetail = { prompt:string; autoSubmit?:boolean };

function setReactTextareaValue(textarea:HTMLTextAreaElement,value:string){
  const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set;
  setter?.call(textarea,value);
  textarea.dispatchEvent(new Event("input",{bubbles:true}));
  textarea.dispatchEvent(new Event("change",{bubbles:true}));
}

export function SilviContextBridge(){
  useEffect(()=>{
    let timer=0;
    const handler=(event:Event)=>{
      const detail=(event as CustomEvent<SilviContextDetail>).detail;
      const prompt=detail?.prompt?.trim();
      if(!prompt)return;
      document.querySelector<HTMLButtonElement>(".silvi-launcher")?.click();
      let tries=0;
      const connect=()=>{
        const textarea=document.querySelector<HTMLTextAreaElement>(".silvi-composer textarea");
        if(!textarea&&tries++<15){timer=window.setTimeout(connect,40);return}
        if(!textarea)return;
        setReactTextareaValue(textarea,prompt);
        textarea.focus({preventScroll:true});
        if(detail.autoSubmit){
          window.setTimeout(()=>document.querySelector<HTMLButtonElement>(".silvi-composer button[type='submit']")?.click(),30);
        }
      };
      connect();
    };
    window.addEventListener("kit-hub-ask-silvi",handler);
    return()=>{window.removeEventListener("kit-hub-ask-silvi",handler);window.clearTimeout(timer)};
  },[]);
  return null;
}
