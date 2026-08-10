import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { translate } from "../lib/i18n";
import { useKitLocale } from "../lib/use-kit-locale";
import "../pull-to-refresh.css";

export function PullToRefresh(){
 const startY=useRef<number|null>(null);const [distance,setDistance]=useState(0);const [refreshing,setRefreshing]=useState(false);const locale=useKitLocale();const t=(key:Parameters<typeof translate>[1])=>translate(locale.language,key);
 useEffect(()=>{function editable(){const el=document.activeElement as HTMLElement|null;return Boolean(el&&(el.tagName==="INPUT"||el.tagName==="TEXTAREA"||el.isContentEditable))}function touchStart(event:TouchEvent){if(window.innerWidth>760||window.scrollY>0||editable()||event.touches.length!==1)return;startY.current=event.touches[0]?.clientY??null}function touchMove(event:TouchEvent){if(startY.current===null||window.scrollY>0)return;const y=event.touches[0]?.clientY??startY.current;const delta=Math.max(0,y-startY.current);if(delta>0){const eased=Math.min(104,Math.round(delta*.48));setDistance(eased);if(eased>10)event.preventDefault()}}function touchEnd(){if(startY.current===null)return;const shouldRefresh=distance>=72;startY.current=null;if(shouldRefresh){setRefreshing(true);setDistance(82);window.setTimeout(()=>window.location.reload(),180)}else setDistance(0)}window.addEventListener("touchstart",touchStart,{passive:true});window.addEventListener("touchmove",touchMove,{passive:false});window.addEventListener("touchend",touchEnd,{passive:true});window.addEventListener("touchcancel",touchEnd,{passive:true});return()=>{window.removeEventListener("touchstart",touchStart);window.removeEventListener("touchmove",touchMove);window.removeEventListener("touchend",touchEnd);window.removeEventListener("touchcancel",touchEnd)}},[distance]);
 if(!distance&&!refreshing)return null;return <div className={`pull-refresh ${distance>=72||refreshing?"is-ready":""}`} style={{transform:`translate(-50%, ${Math.max(-48,distance-52)}px)`}}><RefreshCw className={refreshing?"spin":""}/><span>{refreshing?t("refreshing"):distance>=72?t("releaseRefresh"):t("pullRefresh")}</span></div>
}
