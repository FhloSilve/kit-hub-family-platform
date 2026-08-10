import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { translate } from "../lib/i18n";
import { useKitLocale } from "../lib/use-kit-locale";
import "../pull-to-refresh.css";

const RESTORE_KEY="kit-hub-refresh-view";
function rememberView(){const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".mobile-nav button"));const index=buttons.findIndex(button=>button.classList.contains("is-active"));if(index>=0)sessionStorage.setItem(RESTORE_KEY,String(index))}
function restoreView(){const saved=sessionStorage.getItem(RESTORE_KEY);if(saved===null)return;const index=Number(saved);let attempts=0;const timer=window.setInterval(()=>{attempts++;const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".mobile-nav button"));const button=buttons[index];if(button){sessionStorage.removeItem(RESTORE_KEY);window.clearInterval(timer);if(!button.classList.contains("is-active"))button.click()}else if(attempts>30){sessionStorage.removeItem(RESTORE_KEY);window.clearInterval(timer)}},50)}

export function PullToRefresh(){
 const startY=useRef<number|null>(null);const [distance,setDistance]=useState(0);const [refreshing,setRefreshing]=useState(false);const locale=useKitLocale();const t=(key:Parameters<typeof translate>[1])=>translate(locale.language,key);
 useEffect(()=>{restoreView()},[]);
 useEffect(()=>{function editable(){const el=document.activeElement as HTMLElement|null;return Boolean(el&&(el.tagName==="INPUT"||el.tagName==="TEXTAREA"||el.isContentEditable))}function touchStart(event:TouchEvent){if(window.innerWidth>760||window.scrollY>0||editable()||event.touches.length!==1)return;startY.current=event.touches[0]?.clientY??null}function touchMove(event:TouchEvent){if(startY.current===null||window.scrollY>0)return;const y=event.touches[0]?.clientY??startY.current;const delta=Math.max(0,y-startY.current);if(delta>0){const eased=Math.min(104,Math.round(delta*.48));setDistance(eased);if(eased>10)event.preventDefault()}}function touchEnd(){if(startY.current===null)return;const shouldRefresh=distance>=72;startY.current=null;if(shouldRefresh){rememberView();setRefreshing(true);setDistance(82);window.setTimeout(()=>window.location.reload(),180)}else setDistance(0)}window.addEventListener("touchstart",touchStart,{passive:true});window.addEventListener("touchmove",touchMove,{passive:false});window.addEventListener("touchend",touchEnd,{passive:true});window.addEventListener("touchcancel",touchEnd,{passive:true});return()=>{window.removeEventListener("touchstart",touchStart);window.removeEventListener("touchmove",touchMove);window.removeEventListener("touchend",touchEnd);window.removeEventListener("touchcancel",touchEnd)}},[distance]);
 if(!distance&&!refreshing)return null;return <div className={`pull-refresh ${distance>=72||refreshing?"is-ready":""}`} style={{transform:`translate(-50%, ${Math.max(-48,distance-52)}px)`}}><RefreshCw className={refreshing?"spin":""}/><span>{refreshing?t("refreshing"):distance>=72?t("releaseRefresh"):t("pullRefresh")}</span></div>
}
