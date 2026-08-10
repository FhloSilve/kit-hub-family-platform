export type KitLanguage="en"|"nl"|"fr"|"de"|"es";
export type KitLocale={language:KitLanguage;region:string;timeZone:string};

export const languageNames:Record<KitLanguage,string>={en:"English",nl:"Nederlands",fr:"Français",de:"Deutsch",es:"Español"};

const dictionaries={
 en:{home:"Home",calendar:"Calendar",tasks:"Tasks / To-do",groceries:"Groceries",meals:"Meals",familyHub:"Family Hub",household:"Household",settings:"Settings",personalSettings:"My personal settings",feedback:"Feedback",signOut:"Sign out",notifications:"Household notifications",openFamilyHub:"Open Family Hub",allCaughtUp:"You are all caught up.",searchHome:"Search your home",members:"members",myAccount:"My account"},
 nl:{home:"Home",calendar:"Kalender",tasks:"Taken / To-do",groceries:"Boodschappen",meals:"Maaltijden",familyHub:"Familiehub",household:"Huishouden",settings:"Instellingen",personalSettings:"Mijn persoonlijke instellingen",feedback:"Feedback",signOut:"Uitloggen",notifications:"Huishoudmeldingen",openFamilyHub:"Open Familiehub",allCaughtUp:"Je bent helemaal bij.",searchHome:"Doorzoek je thuis",members:"leden",myAccount:"Mijn account"},
 fr:{home:"Accueil",calendar:"Calendrier",tasks:"Tâches / À faire",groceries:"Courses",meals:"Repas",familyHub:"Espace famille",household:"Foyer",settings:"Paramètres",personalSettings:"Mes paramètres personnels",feedback:"Commentaires",signOut:"Se déconnecter",notifications:"Notifications du foyer",openFamilyHub:"Ouvrir l’espace famille",allCaughtUp:"Vous êtes à jour.",searchHome:"Rechercher dans votre foyer",members:"membres",myAccount:"Mon compte"},
 de:{home:"Start",calendar:"Kalender",tasks:"Aufgaben / To-do",groceries:"Einkäufe",meals:"Mahlzeiten",familyHub:"Familienbereich",household:"Haushalt",settings:"Einstellungen",personalSettings:"Meine persönlichen Einstellungen",feedback:"Feedback",signOut:"Abmelden",notifications:"Haushaltsbenachrichtigungen",openFamilyHub:"Familienbereich öffnen",allCaughtUp:"Du bist auf dem neuesten Stand.",searchHome:"Zuhause durchsuchen",members:"Mitglieder",myAccount:"Mein Konto"},
 es:{home:"Inicio",calendar:"Calendario",tasks:"Tareas / Pendientes",groceries:"Compras",meals:"Comidas",familyHub:"Espacio familiar",household:"Hogar",settings:"Ajustes",personalSettings:"Mis ajustes personales",feedback:"Comentarios",signOut:"Cerrar sesión",notifications:"Notificaciones del hogar",openFamilyHub:"Abrir espacio familiar",allCaughtUp:"Estás al día.",searchHome:"Buscar en tu hogar",members:"miembros",myAccount:"Mi cuenta"}
} as const;

export type TranslationKey=keyof typeof dictionaries.en;
export function normalizeLanguage(value:string|undefined|null):KitLanguage{return value&&value in dictionaries?value as KitLanguage:"en"}
export function translate(language:KitLanguage,key:TranslationKey){return dictionaries[language][key]??dictionaries.en[key]}
export function localeTag(locale:KitLocale){return locale.region?`${locale.language}-${locale.region.toUpperCase()}`:locale.language}
export function formatDateTime(value:string|Date,locale:KitLocale,options:Intl.DateTimeFormatOptions={dateStyle:"medium",timeStyle:"short"}){return new Intl.DateTimeFormat(localeTag(locale),{...options,timeZone:locale.timeZone||undefined}).format(new Date(value))}
export function announceLocale(locale:KitLocale){localStorage.setItem("kit-hub-language",locale.language);localStorage.setItem("kit-hub-region",locale.region);localStorage.setItem("kit-hub-timezone",locale.timeZone);document.documentElement.lang=locale.language;window.dispatchEvent(new CustomEvent("kit-hub-locale-changed",{detail:locale}))}
