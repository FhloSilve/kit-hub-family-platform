import { useEffect } from "react";
import { localeTag } from "../lib/i18n";
import { useKitLocale } from "../lib/use-kit-locale";

const common:Record<string,Record<string,string>>={
 nl:{"Home":"Home","Calendar":"Kalender","Tasks / To-do":"Taken / To-do","Groceries":"Boodschappen","Meals":"Maaltijden","Family Hub":"Familiehub","Household":"Huishouden","Add task":"Taak toevoegen","Add item":"Item toevoegen","Add event":"Evenement toevoegen","Plan a meal":"Maaltijd plannen","Add recipe":"Recept toevoegen","Direct messages":"Directe berichten","Announcements":"Aankondigingen","Activity":"Activiteit","Household chat":"Huishoudchat","No messages yet.":"Nog geen berichten.","Write to the household…":"Schrijf naar het huishouden…","Notifications":"Meldingen","New announcement":"Nieuwe aankondiging","Send":"Versturen","Sending…":"Versturen…","Search":"Zoeken","Edit":"Bewerken","Save":"Opslaan","Cancel":"Annuleren","Delete":"Verwijderen","Done":"Klaar","Loading…":"Laden…","No tasks yet.":"Nog geen taken.","The grocery list is empty.":"De boodschappenlijst is leeg.","Meal ideas":"Maaltijdideeën","No meal ideas yet.":"Nog geen maaltijdideeën.","Your notifications":"Jouw meldingen","Choose what deserves your attention.":"Kies wat jouw aandacht verdient.","Household announcement":"Huishoudaankondiging","Message":"Bericht","Post & pin":"Plaatsen & vastzetten"},
 fr:{"Home":"Accueil","Calendar":"Calendrier","Tasks / To-do":"Tâches / À faire","Groceries":"Courses","Meals":"Repas","Family Hub":"Espace famille","Household":"Foyer","Add task":"Ajouter une tâche","Add item":"Ajouter un article","Add event":"Ajouter un événement","Plan a meal":"Planifier un repas","Add recipe":"Ajouter une recette","Direct messages":"Messages directs","Announcements":"Annonces","Activity":"Activité","Household chat":"Discussion du foyer","No messages yet.":"Aucun message.","Write to the household…":"Écrire au foyer…","Notifications":"Notifications","New announcement":"Nouvelle annonce","Send":"Envoyer","Sending…":"Envoi…","Search":"Rechercher","Edit":"Modifier","Save":"Enregistrer","Cancel":"Annuler","Delete":"Supprimer","Done":"Terminé","Loading…":"Chargement…","No tasks yet.":"Aucune tâche.","The grocery list is empty.":"La liste de courses est vide.","Meal ideas":"Idées de repas","No meal ideas yet.":"Aucune idée de repas.","Your notifications":"Vos notifications","Choose what deserves your attention.":"Choisissez ce qui mérite votre attention.","Household announcement":"Annonce du foyer","Message":"Message","Post & pin":"Publier et épingler"},
 de:{"Home":"Start","Calendar":"Kalender","Tasks / To-do":"Aufgaben / To-do","Groceries":"Einkäufe","Meals":"Mahlzeiten","Family Hub":"Familienbereich","Household":"Haushalt","Add task":"Aufgabe hinzufügen","Add item":"Artikel hinzufügen","Add event":"Termin hinzufügen","Plan a meal":"Mahlzeit planen","Add recipe":"Rezept hinzufügen","Direct messages":"Direktnachrichten","Announcements":"Ankündigungen","Activity":"Aktivität","Household chat":"Haushaltschat","No messages yet.":"Noch keine Nachrichten.","Write to the household…":"An den Haushalt schreiben…","Notifications":"Benachrichtigungen","New announcement":"Neue Ankündigung","Send":"Senden","Sending…":"Wird gesendet…","Search":"Suchen","Edit":"Bearbeiten","Save":"Speichern","Cancel":"Abbrechen","Delete":"Löschen","Done":"Fertig","Loading…":"Laden…","No tasks yet.":"Noch keine Aufgaben.","The grocery list is empty.":"Die Einkaufsliste ist leer.","Meal ideas":"Essensideen","No meal ideas yet.":"Noch keine Essensideen.","Your notifications":"Deine Benachrichtigungen","Choose what deserves your attention.":"Wähle, was deine Aufmerksamkeit verdient.","Household announcement":"Haushaltsankündigung","Message":"Nachricht","Post & pin":"Posten & anheften"},
 es:{"Home":"Inicio","Calendar":"Calendario","Tasks / To-do":"Tareas / Pendientes","Groceries":"Compras","Meals":"Comidas","Family Hub":"Espacio familiar","Household":"Hogar","Add task":"Añadir tarea","Add item":"Añadir artículo","Add event":"Añadir evento","Plan a meal":"Planificar una comida","Add recipe":"Añadir receta","Direct messages":"Mensajes directos","Announcements":"Anuncios","Activity":"Actividad","Household chat":"Chat del hogar","No messages yet.":"Aún no hay mensajes.","Write to the household…":"Escribe al hogar…","Notifications":"Notificaciones","New announcement":"Nuevo anuncio","Send":"Enviar","Sending…":"Enviando…","Search":"Buscar","Edit":"Editar","Save":"Guardar","Cancel":"Cancelar","Delete":"Eliminar","Done":"Listo","Loading…":"Cargando…","No tasks yet.":"Aún no hay tareas.","The grocery list is empty.":"La lista de compras está vacía.","Meal ideas":"Ideas de comidas","No meal ideas yet.":"Aún no hay ideas de comidas.","Your notifications":"Tus notificaciones","Choose what deserves your attention.":"Elige qué merece tu atención.","Household announcement":"Anuncio del hogar","Message":"Mensaje","Post & pin":"Publicar y fijar"}
};

const originalText=new WeakMap<Text,string>();
const originalAttrs=new WeakMap<Element,Record<string,string>>();

function translateRoot(language:string){
 const root=document.querySelector(".app-shell");
 if(!root)return;
 const map=common[language]??{};
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 let node:Node|null;
 while((node=walker.nextNode())){
  const text=node as Text;
  const parent=text.parentElement;
  if(!parent||["SCRIPT","STYLE","TEXTAREA","INPUT","OPTION"].includes(parent.tagName))continue;
  const source=originalText.get(text)??text.data;
  if(!originalText.has(text))originalText.set(text,source);
  const raw=source.trim();
  if(!raw)continue;
  const translated=map[raw];
  const next=translated?source.replace(raw,translated):source;
  if(text.data!==next)text.data=next;
 }
 for(const element of Array.from(root.querySelectorAll<HTMLElement>("input,textarea,button,[aria-label],[title],option"))){
  const saved=originalAttrs.get(element)??{};
  for(const attr of ["placeholder","aria-label","title"]){
   const current=element.getAttribute(attr);
   if(current&&saved[attr]===undefined)saved[attr]=current;
   const source=saved[attr];
   if(!source)continue;
   const next=map[source]??source;
   if(current!==next)element.setAttribute(attr,next);
  }
  if(element instanceof HTMLOptionElement){
   if(saved.text===undefined)saved.text=element.textContent||"";
   const next=map[saved.text]??saved.text;
   if(element.textContent!==next)element.textContent=next;
  }
  originalAttrs.set(element,saved);
 }
}

export function StableLocalizedSurface(){
 const locale=useKitLocale();
 useEffect(()=>{
  document.documentElement.lang=locale.language;
  document.documentElement.dataset.kitLocale=localeTag(locale);
  let queued=false;
  const run=()=>{queued=false;translateRoot(locale.language)};
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(run)};
  schedule();
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{subtree:true,childList:true});
  return()=>observer.disconnect();
 },[locale]);
 return null;
}
