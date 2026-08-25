// ============================================================
// ALCOM PETROLEUM — Pilotage des projets stations-service
// ============================================================
export const BUILD_ID = "2026-08-24-21h00";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, where, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// Firebase Storage retiré : nécessite le forfait payant Blaze.
// Les fichiers sont désormais encodés et stockés directement dans Firestore (même approche que l'app du syndicat).

// -------------------------------------------------------------
// FILET DE SÉCURITÉ — affiche TOUTE erreur à l'écran, sans exception.
// Enregistré avant toute logique Firebase pour ne rien manquer.
// -------------------------------------------------------------
function showFatalError(msg){
  let el = document.getElementById("fatalErrorBanner");
  if(!el){
    el = document.createElement("div");
    el.id = "fatalErrorBanner";
    el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#B01813;color:#fff;padding:calc(14px + env(safe-area-inset-top)) 44px 14px 16px;font:600 13px/1.4 -apple-system,sans-serif;white-space:pre-wrap;";
    const textSpan = document.createElement("span");
    textSpan.id = "fatalErrorText";
    el.appendChild(textSpan);
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = "position:absolute;top:calc(10px + env(safe-area-inset-top));right:10px;background:rgba(255,255,255,.18);border:none;color:#fff;width:26px;height:26px;border-radius:50%;font-size:14px;cursor:pointer;";
    closeBtn.onclick = () => el.remove();
    el.appendChild(closeBtn);
    document.body.prepend(el);
  }
  document.getElementById("fatalErrorText").textContent = "⚠️ Erreur : " + msg;
  const boot = document.getElementById("boot");
  if(boot) boot.style.display = "none";
}
window.addEventListener("error", e => showFatalError(e.message || String(e.error) || "erreur inconnue"));
window.addEventListener("unhandledrejection", e => showFatalError((e.reason && (e.reason.message||e.reason)) || "erreur asynchrone inconnue"));

// -------------------------------------------------------------
// 1) CONFIGURATION FIREBASE
// -------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyAvUs1Ho5jo5W_BTJWv5mO2xVPsns-D_Do",
  authDomain: "alcom-71d8e.firebaseapp.com",
  projectId: "alcom-71d8e",
  storageBucket: "alcom-71d8e.firebasestorage.app",
  messagingSenderId: "371672323174",
  appId: "1:371672323174:web:d8acaa44c5c5f9a8d089a7"
};

let app, auth, db, secondaryApp, secondaryAuth;
try{
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // experimentalForceLongPolling corrige l'erreur "client is offline" fréquente
  // sur Safari iOS / réseaux mobiles (LTE, Private Relay) qui bloquent le WebChannel par défaut.
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false
  });
  // Seconde instance Firebase, utilisée uniquement pour créer des comptes utilisateurs
  // sans déconnecter l'administrateur en cours (technique standard Firebase multi-app).
  secondaryApp = initializeApp(firebaseConfig, "secondary");
  secondaryAuth = getAuth(secondaryApp);
}catch(e){
  showFatalError("Initialisation Firebase impossible — " + e.message);
  throw e;
}

// -------------------------------------------------------------
// ÉTAT GLOBAL
// -------------------------------------------------------------
const STATE = {
  user: null,
  profile: null,     // doc users/{uid} : {nom, role, actif}
  route: "dashboard",
  projectId: null,
  projectTab: "fiche",
  projects: [],
  suppliers: [],
  activityLogs: [],
  contacts: [],
  unsubscribers: []
};

const ROLES = {
  admin: "Administrateur",
  direction: "Direction",
  daf: "DAF / Finance",
  chef_projet: "Responsable projet",
  achats: "Achats",
  travaux: "Responsable travaux",
  consultation: "Consultation"
};

const PROJECT_STATUTS = ["Études","Travaux préparatoires","Achats de matériels","Construction","Installation","Tests","Réception","Mise en service"];

// Informations légales de l'entreprise pour le papier en-tête des rapports
const COMPANY = {
  nom: "ALCOM PETROLEUM",
  bp: "B.P: 2470",
  rc: "RC: CM/DLA/012024/B15/00002",
  nui: "NUI: M062416842044H"
};

// -------------------------------------------------------------
// CHECKLISTS DÉTAILLÉES PAR PHASE — une interface dédiée par étape.
// Pour éviter toute redondance : les phases qui correspondent déjà à
// un module fonctionnel dédié (Achats de matériels → onglet Achats,
// Construction → onglet Travaux, Installation → onglet Équipements)
// n'ont PAS de checklist séparée : cliquer sur l'étape ouvre
// directement le module concret correspondant.
// Les autres phases ont une checklist :
//  - "Études" (mode document) : fusionne les documents administratifs
//    à obtenir ET les études techniques. Chaque point suit Document
//    requis / disponible / validé / expiré (Oui/Non). Tant que le
//    document n'est pas validé, on peut aussi renseigner un
//    responsable et des dates prévue/réelle (utile en cas de lenteur
//    administrative). Une fois validé, ces champs se masquent.
//  - autres phases (mode tâche) : responsable, statut, % avancement, dates.
// -------------------------------------------------------------
const PHASE_ROUTE_TAB = { "Achats de matériels":"achats", "Construction":"travaux", "Installation":"equipements" };
const PHASE_ITEM_MODE = { "Études":"document" };

const PHASE_CHECKLISTS = {
  "Études": [
    "Titre foncier ou document de propriété","Bail (si applicable)","Certificat d'urbanisme","Permis de bâtir","Plan de masse cadastral","Plan visé par un architecte agréé","Plan de situation","Certificat de propriété","Licence d'exploitation",
    "Études environnementales","Étude Courant Fort","Étude Courant Faible","Étude Photovoltaïque","Étude Plomberie","Étude Climatisation / Ventilation","Étude géotechnique","Étude topographique","Étude hydrologique (si nécessaire)"
  ],
  "Travaux préparatoires": ["Identification du terrain","Coordonnées GPS","Étude de faisabilité","Accord de principe autorité locale / mairie","Installation du chantier","Barrières & signalisation","Base vie","Forage","Clôture du site","Terrassement","Nivellement","Fouille / excavation"],
  "Tests": ["Tests d'étanchéité finaux","Tests électriques","Tests des pompes / débit","Tests de sécurité incendie","Contrôle qualité carburant","Essais de mise en pression"],
  "Réception": ["Réception des travaux (PV)","Levée des réserves","Réception des équipements fournisseurs","Contrôle de conformité réglementaire","Inspection finale des autorités"],
  "Mise en service": ["Recrutement du personnel","EPI du personnel","Formation sécurité incendie","Formation manipulation produits pétroliers","Formation communication","Approvisionnement produits pétroliers & lubrifiants","Approvisionnement produits alimentaires / boutique","Autorisation d'exploitation définitive","Ouverture officielle"]
};
function freshPhaseChecklists(){
  const out = {};
  PROJECT_STATUTS.forEach(phase=>{
    if(PHASE_ROUTE_TAB[phase]) return; // pas de checklist : renvoie vers le module dédié
    const mode = PHASE_ITEM_MODE[phase] || "task";
    out[phase] = (PHASE_CHECKLISTS[phase]||[]).map(label=>
      mode==="document"
        ? {label, requis:"Oui", disponible:"Non", valide:"Non", expire:"Non", responsable:"", dateDebut:"", dateFin:""}
        : {label, responsable:"", statut:"Non commencé", avancement:0, dateDebut:"", dateFin:""}
    );
  });
  return out;
}

// Catalogue standard des équipements d'une station-service (ajout rapide)
const EQUIPEMENT_CATALOG = ["Cuves hydrocarbures","Tuyauteries hydrocarbures (UPP/KPS/NUPI)","Lot de servicing complet","TAG Reader","Borne de recharge électrique","Tampons de piste","Chambres étanches sous pompes","Chambres étanches pour cuves","Forage","Clôture du site","Électricité (CF / CFB / Photovoltaïque)","Installations pétrolières (tuyauterie/servicing/distrib./autom./barémage)","Auvent & Totem","Groupe électrogène","Branding complet + canopy îlots","Peinture","Carrelage","Plomberie","Caméras de surveillance","Sécurité incendie (extincteurs)","Menuiserie bois","Menuiserie aluminium","Pont élévateur","Aménagement intérieur boutique (gondoles)"];


// -------------------------------------------------------------
// UTILITAIRES
// -------------------------------------------------------------
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];
const bt = document.getElementById("buildTag");
if(bt) bt.textContent = "Version " + BUILD_ID;
const fmt = n => (Number(n)||0).toLocaleString('fr-FR');
const fmtXAF = n => fmt(n) + " FCFA";
const todayISO = () => new Date().toISOString().slice(0,10);
const daysBetween = (a,b) => Math.round((new Date(b)-new Date(a))/86400000);

function toast(msg, isErr=false){
  const host = $("#toastHost");
  const t = document.createElement("div");
  t.className = "toast" + (isErr ? " err" : "");
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(()=>t.remove(), 3200);
}

// Journal d'historique / traçabilité (§25 du cahier des charges)
async function logActivity(projectId, categorie, action, ancienneValeur, nouvelleValeur){
  try{
    const pr = STATE.projects.find(p=>p.id===projectId);
    await addDoc(collection(db,"activityLogs"), {
      projectId: projectId||null,
      projectNom: pr ? pr.nom : null,
      categorie, action,
      ancienneValeur: ancienneValeur!=null ? String(ancienneValeur) : "",
      nouvelleValeur: nouvelleValeur!=null ? String(nouvelleValeur) : "",
      user: STATE.profile ? STATE.profile.nom : "—",
      createdAt: serverTimestamp()
    });
  }catch(e){ console.error("logActivity", e); }
}

function openModal(html){
  $("#modalBody").innerHTML = html;
  $("#modalOverlay").classList.add("open");
}
window.openModal = openModal;
function closeModal(){ $("#modalOverlay").classList.remove("open"); $("#modalBody").innerHTML=""; }
window.closeModal = closeModal;
$("#modalOverlay").addEventListener("click", e => { if(e.target.id==="modalOverlay") closeModal(); });

function icon(name){
  const paths = {
    dashboard:'<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
    projects:'<path d="M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4"/>',
    planning:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    travaux:'<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.1-3.1a5 5 0 01-6.7 6.7L4.7 21.3a2 2 0 01-3-3L11 8a5 5 0 016.7-6.7l-3 3z"/>',
    achats:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/>',
    fournisseurs:'<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1"/>',
    equipements:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    documents:'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
    finance:'<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
    alertes:'<path d="M10.3 3.9a2 2 0 013.4 0l8 14A2 2 0 0120 21H4a2 2 0 01-1.7-3.1l8-14z"/><path d="M12 9v4M12 17h.01"/>',
    rapports:'<path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/>',
    parametres:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9 2 2 0 11-2.8 2.8 1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3 2 2 0 11-2.8-2.8 1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9 2 2 0 112.8-2.8 1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3 2 2 0 112.8 2.8 1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    logout:'<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    search:'<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
    back:'<path d="M19 12H5M12 19l-7-7 7-7"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]||''}</svg>`;
}

// -------------------------------------------------------------
// NAVIGATION
// -------------------------------------------------------------
const NAV_ITEMS = [
  {id:"dashboard", label:"Tableau de bord", ic:"dashboard"},
  {id:"projects", label:"Projets", ic:"projects"},
  {id:"recherche", label:"Recherche", ic:"search"},
  {id:"comparaison", label:"Comparaison", ic:"rapports"},
  {id:"budget", label:"Budget", ic:"finance"},
  {id:"depenses", label:"Dépenses", ic:"finance"},
  {id:"responsables", label:"Responsables & travaux", ic:"travaux"},
  {id:"fournisseurs", label:"Fournisseurs", ic:"fournisseurs"},
  {id:"alertes", label:"Alertes", ic:"alertes"},
  {id:"assistant", label:"Assistant", ic:"documents"},
  {id:"rapports", label:"Rapports", ic:"rapports"},
  {id:"historique", label:"Historique", ic:"planning"},
  {id:"importexport", label:"Import / Export", ic:"achats"},
  {id:"parametres", label:"Paramètres", ic:"parametres"}
];
const BOTTOM_NAV = ["dashboard","projects","recherche","alertes","parametres"];

function hasFullAccess(){
  return ["admin","direction","daf"].includes(STATE.profile?.role);
}
function allowedNavItems(){
  if(hasFullAccess() || !STATE.profile) return NAV_ITEMS;
  const allowed = STATE.profile.modulesAutorises && STATE.profile.modulesAutorises.length
    ? STATE.profile.modulesAutorises
    : ["dashboard"]; // par défaut, au minimum le tableau de bord pour éviter un blocage total
  return NAV_ITEMS.filter(it => allowed.includes(it.id));
}
function renderNav(){
  const nav = $("#navScroll");
  const items = allowedNavItems();
  nav.innerHTML = `<div class="nav-group-label">Navigation</div>` +
    items.map(it => `
      <div class="nav-item ${STATE.route===it.id?'active':''}" data-route="${it.id}">
        ${icon(it.ic)} ${it.label}
      </div>`).join("") +
    `<div class="nav-group-label">Session</div>
     <div class="nav-item" id="btnLogout">${icon('logout')} Déconnexion</div>`;
  $$(".nav-item[data-route]", nav).forEach(el=>{
    el.addEventListener("click", ()=>{ goTo(el.dataset.route); $("#sidebar").classList.remove("open"); });
  });
  $("#btnLogout").addEventListener("click", ()=> signOut(auth));

  const bn = $("#bottomNav");
  const bottomIds = BOTTOM_NAV.filter(id => items.some(it=>it.id===id));
  bn.innerHTML = bottomIds.map(id=>{
    const it = NAV_ITEMS.find(n=>n.id===id);
    return `<div class="bn-item ${STATE.route===id?'active':''}" data-route="${id}">${icon(it.ic)}<span>${it.label.split(' ')[0]}</span></div>`;
  }).join("");
  $$(".bn-item", bn).forEach(el=> el.addEventListener("click", ()=> goTo(el.dataset.route)));
}

function goTo(route, opts={}){
  if(!hasFullAccess() && STATE.profile){
    const allowed = allowedNavItems().map(it=>it.id);
    if(!allowed.includes(route)){
      toast("Accès non autorisé à ce module", true);
      route = allowed[0] || "dashboard";
      opts = {};
    }
  }
  STATE.route = route;
  STATE.projectId = opts.projectId ?? null;
  STATE.projectTab = opts.projectTab ?? "fiche";
  if(opts.phase) STATE.activePhase = opts.phase;
  renderNav();
  render();
}
window.goTo = goTo;

// -------------------------------------------------------------
// TITLES
// -------------------------------------------------------------
const TITLES = {
  dashboard: ["Tableau de bord","Vue d'ensemble de tous les projets"],
  projects: ["Projets","Liste des stations en cours et planifiées"],
  recherche: ["Recherche globale","Projets, fournisseurs, bons de commande, documents"],
  comparaison: ["Comparaison des projets","Avancement, budget et retards côte à côte"],
  budget: ["Budget","Budget arrêté et ventilation par catégorie, projet par projet"],
  depenses: ["Dépenses","Tous les mouvements d'argent, projet par projet"],
  responsables: ["Responsables & travaux","Vue transversale sur tous les projets"],
  fournisseurs: ["Fournisseurs & prestataires","Base centralisée"],
  alertes: ["Alertes","Retards, échéances et documents manquants"],
  assistant: ["Assistant documentaire","Questions sur les données du projet, réponses tracées à la source"],
  rapports: ["Rapports","Synthèses par projet et par direction"],
  historique: ["Historique","Traçabilité des actions et modifications"],
  importexport: ["Import / Export","Fournisseurs, équipements et rapports en Excel/CSV"],
  parametres: ["Paramètres","Utilisateurs, rôles et configuration"]
};

// -------------------------------------------------------------
// RENDER ROOT
// -------------------------------------------------------------
function render(){
  const [title, sub] = STATE.route==="projects" && STATE.projectId
    ? [ (STATE.projects.find(p=>p.id===STATE.projectId)?.nom) || "Projet", "Fiche projet" ]
    : (TITLES[STATE.route] || ["",""]);
  $("#pageTitle").textContent = title;
  $("#pageSub").textContent = sub;

  const c = $("#content");
  if(STATE.route==="dashboard") c.innerHTML = renderDashboard();
  else if(STATE.route==="projects") c.innerHTML = STATE.projectId ? renderProjectDetail() : renderProjectsList();
  else if(STATE.route==="recherche") c.innerHTML = renderRecherche();
  else if(STATE.route==="comparaison") c.innerHTML = renderComparaison();
  else if(STATE.route==="budget") c.innerHTML = renderBudgetGlobal();
  else if(STATE.route==="depenses") c.innerHTML = renderDepenses();
  else if(STATE.route==="responsables") c.innerHTML = renderResponsablesGlobal();
  else if(STATE.route==="fournisseurs") c.innerHTML = renderFournisseurs();
  else if(STATE.route==="alertes") c.innerHTML = renderAlertes();
  else if(STATE.route==="assistant") c.innerHTML = renderAssistant();
  else if(STATE.route==="rapports") c.innerHTML = renderRapports();
  else if(STATE.route==="historique") c.innerHTML = renderHistorique();
  else if(STATE.route==="importexport") c.innerHTML = renderImportExport();
  else if(STATE.route==="parametres") c.innerHTML = renderParametres();
  bindContentEvents();
}

// -------------------------------------------------------------
// RECHERCHE GLOBALE
// -------------------------------------------------------------
function renderRecherche(){
  return `
    <div class="search-box">${icon('search')}<input id="globalSearchInput" placeholder="Rechercher un projet, fournisseur, BC, document…" oninput="doGlobalSearch(this.value)"></div>
    <div id="searchResults"></div>
  `;
}
window.doGlobalSearch = function(q){
  const host = $("#searchResults");
  q = (q||"").trim().toLowerCase();
  if(q.length<2){ host.innerHTML = `<p style="font-size:13px;color:var(--muted);">Tape au moins 2 caractères…</p>`; return; }
  const results = [];
  STATE.projects.forEach(pr=>{
    if((pr.nom||"").toLowerCase().includes(q) || (pr.code||"").toLowerCase().includes(q) || (pr.ville||"").toLowerCase().includes(q)){
      results.push({type:"Projet", label:pr.nom, sub:pr.statut, onclick:`goTo('projects',{projectId:'${pr.id}'})`});
    }
    (pr.bonsCommande||[]).forEach(b=>{ if((b.numero||"").toLowerCase().includes(q) || (b.fournisseur||"").toLowerCase().includes(q))
      results.push({type:"Bon de commande", label:b.numero||b.fournisseur, sub:`${pr.nom} · ${fmt(b.montantTTC)} ${b.devise||''}`, onclick:`goTo('projects',{projectId:'${pr.id}',projectTab:'achats'})`}); });
    (pr.documents||[]).forEach(d=>{ if((d.nom||"").toLowerCase().includes(q))
      results.push({type:"Document", label:d.nom, sub:pr.nom, onclick:`goTo('projects',{projectId:'${pr.id}',projectTab:'documents'})`}); });
    (pr.equipements||[]).forEach(e=>{ if((e.nom||"").toLowerCase().includes(q))
      results.push({type:"Équipement", label:e.nom, sub:pr.nom, onclick:`goTo('projects',{projectId:'${pr.id}',projectTab:'equipements'})`}); });
  });
  STATE.suppliers.forEach(s=>{ if((s.nom||"").toLowerCase().includes(q))
    results.push({type:"Fournisseur", label:s.nom, sub:s.categorie, onclick:`goTo('fournisseurs')`}); });

  host.innerHTML = results.length===0 ? `<p style="font-size:13px;color:var(--muted);">Aucun résultat.</p>` :
    `<div class="card">${results.map(r=>`
      <div class="rowlink" onclick="${r.onclick}" style="padding:10px 0;border-bottom:1px solid var(--line);cursor:pointer;">
        <span class="pill info">${r.type}</span> <strong style="font-size:13.5px;">${r.label}</strong>
        <div style="font-size:11.5px;color:var(--muted);margin-top:2px;">${r.sub||''}</div>
      </div>`).join("")}</div>`;
};

// -------------------------------------------------------------
// COMPARAISON ENTRE PROJETS
// -------------------------------------------------------------
function renderComparaison(){
  if(STATE.projects.length===0) return emptyState("projects","Aucun projet à comparer","");
  const f = STATE.comparaisonFilters || {};
  let list = STATE.projects;
  if(f.pays) list = list.filter(p=>p.pays===f.pays);
  if(f.ville) list = list.filter(p=>p.ville===f.ville);
  if(f.statut) list = list.filter(p=>p.statut===f.statut);
  const pays = [...new Set(STATE.projects.map(p=>p.pays).filter(Boolean))];
  const villes = [...new Set(STATE.projects.map(p=>p.ville).filter(Boolean))];

  const filtres = `<div class="card" style="display:flex;gap:8px;flex-wrap:wrap;">
    <select onchange="setComparaisonFilter('pays',this.value)" style="font-size:12.5px;padding:7px 9px;border-radius:8px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
      <option value="">Tous pays</option>${pays.map(p=>`<option ${f.pays===p?'selected':''}>${p}</option>`).join("")}
    </select>
    <select onchange="setComparaisonFilter('ville',this.value)" style="font-size:12.5px;padding:7px 9px;border-radius:8px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
      <option value="">Toutes villes</option>${villes.map(v=>`<option ${f.ville===v?'selected':''}>${v}</option>`).join("")}
    </select>
    <select onchange="setComparaisonFilter('statut',this.value)" style="font-size:12.5px;padding:7px 9px;border-radius:8px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
      <option value="">Toutes phases</option>${PROJECT_STATUTS.map(s=>`<option ${f.statut===s?'selected':''}>${s}</option>`).join("")}
    </select>
    <button class="btn sm" onclick="exportComparaisonExcel()">📊 Exporter en Excel</button>
  </div>`;

  const table = `<div class="card"><table><thead><tr><th>Projet</th><th>Pays</th><th>Ville</th><th>Responsable</th><th>Avancement</th><th>Budget</th><th>Engagé</th><th>Payé</th><th>Reste</th><th>Retard</th></tr></thead><tbody>
    ${list.map(pr=>{
      const idx = PROJECT_STATUTS.indexOf(pr.statut);
      const avance = Math.round(((idx+1)/PROJECT_STATUTS.length)*100);
      const late = pr.dateFinPrevue && pr.statut!=="Mise en service" && new Date(pr.dateFinPrevue) < new Date() ? daysBetween(pr.dateFinPrevue, todayISO()) : 0;
      return `<tr class="rowlink" onclick="goTo('projects',{projectId:'${pr.id}'})">
        <td><strong>${pr.nom}</strong></td>
        <td>${pr.pays||'—'}</td>
        <td>${pr.ville||'—'}</td>
        <td>${pr.responsable||'—'}</td>
        <td>${avance}%</td>
        <td>${fmt(pr.budgetInitial)}</td>
        <td>${fmt(pr.montantEngage)}</td>
        <td>${fmt(pr.montantPaye)}</td>
        <td>${fmt((pr.montantEngage||0)-(pr.montantPaye||0))}</td>
        <td>${late>0?`<span class="pill bad">${late} j.</span>`:`<span class="pill ok">0</span>`}</td>
      </tr>`;
    }).join("")}
  </tbody></table></div>`;

  return filtres + table;
}
window.setComparaisonFilter = function(field, val){
  STATE.comparaisonFilters = {...(STATE.comparaisonFilters||{}), [field]: val};
  render();
};
window.exportComparaisonExcel = function(){
  if(typeof XLSX==="undefined"){ toast("Bibliothèque Excel non chargée — vérifie ta connexion", true); return; }
  const rows = STATE.projects.map(pr=>{
    const idx = PROJECT_STATUTS.indexOf(pr.statut);
    return {
      Projet: pr.nom, Code: pr.code||"", Pays: pr.pays||"", Ville: pr.ville||"", Responsable: pr.responsable||"",
      Statut: pr.statut, "Avancement %": Math.round(((idx+1)/PROJECT_STATUTS.length)*100),
      "Budget initial": pr.budgetInitial||0, "Montant engagé": pr.montantEngage||0, "Montant payé": pr.montantPaye||0,
      "Reste à payer": (pr.montantEngage||0)-(pr.montantPaye||0)
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comparaison");
  XLSX.writeFile(wb, `Alcom_Petroleum_Comparaison_${todayISO()}.xlsx`);
};

// -------------------------------------------------------------
// BUDGET — vue globale + ventilation par catégorie
// -------------------------------------------------------------
const BUDGET_CATEGORIES = ["Études","Administratif","Construction","Cuves","Pompes","Électricité","Génie civil","Transport","Installation","Sécurité","Mobilier","Informatique","Autres"];
function renderBudgetGlobal(){
  if(STATE.projects.length===0) return emptyState("projects","Aucun projet","");
  const totalBudget = STATE.projects.reduce((s,p)=>s+(Number(p.budgetInitial)||0),0);
  const totalEngage = STATE.projects.reduce((s,p)=>s+(Number(p.montantEngage)||0),0);
  const totalPaye = STATE.projects.reduce((s,p)=>s+(Number(p.montantPaye)||0),0);
  return `
    <div class="kpi-grid">
      <div class="kpi"><div class="lbl">Budget total (tous projets)</div><div class="val">${fmt(totalBudget)}</div></div>
      <div class="kpi"><div class="lbl">Engagé total</div><div class="val">${fmt(totalEngage)}</div></div>
      <div class="kpi accent"><div class="lbl">Payé total</div><div class="val">${fmt(totalPaye)}</div></div>
    </div>
    ${STATE.projects.map(pr=>{
      const bl = pr.budgetLines || {};
      const totalVentile = BUDGET_CATEGORIES.reduce((s,c)=>s+(Number(bl[c])||0),0);
      const ecart = (Number(pr.budgetInitial)||0) - (Number(pr.montantEngage)||0);
      return `<div class="card">
        <div class="section-title"><h3 style="margin:0;">${pr.nom}</h3><button class="btn sm" onclick="openBudgetLinesModal('${pr.id}')">Modifier la ventilation</button></div>
        ${infoRow("Budget initial", fmtXAF(pr.budgetInitial))}
        ${infoRow("Budget révisé", fmtXAF(pr.budgetRevise||pr.budgetInitial))}
        ${infoRow("Engagé", fmtXAF(pr.montantEngage))}
        ${infoRow("Payé", fmtXAF(pr.montantPaye))}
        ${infoRow("Écart budgétaire", `${ecart>=0?'':'⚠️ '}${fmtXAF(ecart)}`)}
        <div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px;">
          <div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;margin-bottom:8px;">Ventilation par catégorie ${totalVentile>0?`(${fmt(totalVentile)} ventilé)`:''}</div>
          ${BUDGET_CATEGORIES.filter(c=>Number(bl[c])>0).map(c=>`
            <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12.5px;">
              <span style="color:var(--muted);">${c}</span><span>${fmt(bl[c])}</span>
            </div>`).join("") || `<p style="font-size:12px;color:var(--muted);">Pas encore ventilé.</p>`}
        </div>
      </div>`;
    }).join("")}
  `;
}
window.openBudgetLinesModal = function(projectId){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const bl = pr.budgetLines || {};
  openModal(`<div class="modal-head"><h3>Ventilation du budget</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      ${BUDGET_CATEGORIES.map(c=>`<div class="f-field"><label>${c}</label><input type="number" id="bl_${c.replace(/\s/g,'')}" value="${bl[c]||0}"></div>`).join("")}
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitBudgetLines('${projectId}')">Enregistrer</button></div>`);
};
window.submitBudgetLines = async function(projectId){
  const budgetLines = {};
  BUDGET_CATEGORIES.forEach(c=>{ budgetLines[c] = Number($(`#bl_${c.replace(/\s/g,'')}`).value||0); });
  await updateDoc(doc(db,"projects",projectId), {budgetLines});
  closeModal(); toast("Ventilation budgétaire enregistrée ✓");
};

// -------------------------------------------------------------
// RESPONSABLES & TRAVAUX — vue transversale sur tous les projets
// -------------------------------------------------------------
function renderResponsablesGlobal(){
  const parPersonne = {};
  STATE.projects.forEach(pr=>{
    const addTask = (nom, label, source)=>{
      if(!nom) return;
      if(!parPersonne[nom]) parPersonne[nom] = [];
      parPersonne[nom].push({projet:pr.nom, label, source});
    };
    if(pr.responsable) addTask(pr.responsable, "Responsable du projet", pr.nom);
    Object.entries(pr.phaseChecklists||{}).forEach(([phase, items])=>{
      (items||[]).forEach(it=> addTask(it.responsable, it.label, phase));
    });
    (pr.planning||[]).forEach(t=> addTask(t.responsable, t.nom, "Planning"));
  });
  const personnes = Object.keys(parPersonne).sort();
  const contacts = STATE.contacts || [];
  const findContact = nom => contacts.find(c=>c.nom.toLowerCase()===nom.toLowerCase());

  const responsablesHtml = personnes.length===0 ? emptyState("projects","Aucun responsable assigné","Les responsables assignés dans les checklists et le planning apparaîtront ici.") :
    personnes.map(nom=>{
      const c = findContact(nom);
      return `<div class="card">
      <div class="section-title">
        <h3 style="margin:0;">${nom}</h3>
        <div style="display:flex;gap:6px;align-items:center;">
          ${c && c.telephone ? contactButtons(c.telephone, `Bonjour ${nom}, ici ${COMPANY.nom}.`) : `<button class="btn sm" onclick="openContactModal('${esc(nom)}')">+ Ajouter le numéro</button>`}
        </div>
      </div>
      ${parPersonne[nom].map(t=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);font-size:12.5px;">
        <span>${t.label}</span><span style="color:var(--muted);">${t.projet}${t.source?` · ${t.source}`:''}</span>
      </div>`).join("")}
    </div>`;
    }).join("");

  const fournisseursActifs = {};
  STATE.projects.forEach(pr=>{
    (pr.bonsCommande||[]).forEach(b=>{
      if(!fournisseursActifs[b.fournisseur]) fournisseursActifs[b.fournisseur] = [];
      fournisseursActifs[b.fournisseur].push(pr.nom);
    });
  });
  const fournisseursHtml = Object.keys(fournisseursActifs).length===0 ? "" : `
    <div class="section-title" style="margin-top:20px;"><h2>Fournisseurs actifs (avec BC en cours)</h2></div>
    <div class="card">${Object.entries(fournisseursActifs).map(([f,projets])=>`
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);font-size:12.5px;">
        <span><strong>${f}</strong></span><span style="color:var(--muted);">${[...new Set(projets)].join(", ")}</span>
      </div>`).join("")}</div>`;

  return `<div class="section-title"><h2>Responsables — toutes tâches, tous projets</h2></div>` + responsablesHtml + fournisseursHtml;
}
window.openContactModal = function(nomPrerempli){
  openModal(`<div class="modal-head"><h3>Ajouter un numéro</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Nom</label><input id="ctNom" value="${esc(nomPrerempli||'')}"></div>
    <div class="f-field"><label>Téléphone</label><input id="ctTel" type="tel" placeholder="6XX XXX XXX"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitContact()">Enregistrer</button></div>`);
};
window.submitContact = async function(){
  const nom = $("#ctNom").value.trim();
  const telephone = $("#ctTel").value.trim();
  if(!nom || !telephone){ toast("Nom et téléphone requis", true); return; }
  const existant = (STATE.contacts||[]).find(c=>c.nom.toLowerCase()===nom.toLowerCase());
  if(existant) await updateDoc(doc(db,"contacts",existant.id), {telephone});
  else await addDoc(collection(db,"contacts"), {nom, telephone, createdAt:serverTimestamp()});
  closeModal(); toast("Contact enregistré ✓");
};

// -------------------------------------------------------------
// ASSISTANT — questions sur les données du projet (§9)
// Répond uniquement à partir des données disponibles, source citée.
// Pas d'OCR ni de génération de texte libre : recherche structurée.
// -------------------------------------------------------------
function renderAssistant(){
  return `
    <div class="card">
      <p style="font-size:12.5px;color:var(--muted);margin:0 0 12px;">Pose une question sur un projet, un document, un fournisseur ou une commande. Les réponses s'appuient uniquement sur les données enregistrées dans l'application, jamais sur des informations inventées.</p>
      <div style="display:flex;gap:8px;">
        <input id="assistantQ" placeholder="Ex : Quel document manque pour Station Madagascar ?" style="flex:1;padding:11px 14px;border-radius:10px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);font-size:14px;" onkeydown="if(event.key==='Enter')askAssistant()">
        <button class="btn primary" onclick="askAssistant()">Demander</button>
      </div>
    </div>
    <div id="assistantAnswer"></div>
  `;
}
window.askAssistant = function(){
  const q = $("#assistantQ").value.trim();
  const host = $("#assistantAnswer");
  if(!q){ return; }
  const ql = q.toLowerCase();
  const answers = [];

  // Cherche le projet mentionné dans la question
  const projetCite = STATE.projects.find(pr => ql.includes(pr.nom.toLowerCase()) || (pr.ville && ql.includes(pr.ville.toLowerCase())));
  const projetsAConsiderer = projetCite ? [projetCite] : STATE.projects;

  if(ql.includes("document") && (ql.includes("manque") || ql.includes("manquant"))){
    projetsAConsiderer.forEach(pr=>{
      const manquants = [];
      Object.entries(pr.phaseChecklists||{}).forEach(([phase, items])=>{
        (items||[]).forEach(it=>{ if(it.valide !== undefined && it.valide !== "Oui" && it.requis === "Oui") manquants.push(`${it.label} (${phase})`); });
      });
      answers.push({source:pr.nom, text: manquants.length ? `Documents non encore validés : ${manquants.join(", ")}.` : "Aucun document manquant identifié."});
    });
  } else if(ql.includes("bon de commande") || ql.includes(" bc ") || ql.startsWith("bc")){
    projetsAConsiderer.forEach(pr=>{
      (pr.bonsCommande||[]).forEach(b=>{
        if(!projetCite || ql.includes((b.fournisseur||"").toLowerCase()) || ql.includes((b.numero||"").toLowerCase()) || projetCite){
          answers.push({source:`${pr.nom} — ${b.numero||'BC'}`, text:`${b.fournisseur} : ${fmt(b.montantTTC)} ${b.devise||'FCFA'}, statut ${b.statut}.`});
        }
      });
    });
  } else if(ql.includes("livr")){
    projetsAConsiderer.forEach(pr=>{
      (pr.livraisons||[]).forEach(l=>{
        answers.push({source:pr.nom, text:`${l.equipement} — ${l.fournisseur||'—'} : ${l.qteLivree||0}/${l.qteCommandee||0} livré(s), statut ${l.statut}, prévu le ${l.datePrevue||'?'}.`});
      });
    });
  } else if(ql.includes("budget") || ql.includes("coût") || ql.includes("cout") || ql.includes("montant")){
    projetsAConsiderer.forEach(pr=>{
      answers.push({source:pr.nom, text:`Budget ${fmt(pr.budgetInitial)} FCFA, engagé ${fmt(pr.montantEngage)}, payé ${fmt(pr.montantPaye)}, solde ${fmt((pr.montantEngage||0)-(pr.montantPaye||0))} FCFA.`});
    });
  } else if(ql.includes("avancement") || ql.includes("où en est") || ql.includes("statut") || ql.includes("synthèse") || ql.includes("situation")){
    projetsAConsiderer.forEach(pr=>{
      const idx = PROJECT_STATUTS.indexOf(pr.statut);
      const avance = Math.round(((idx+1)/PROJECT_STATUTS.length)*100);
      const risques = (pr.risques||[]).length;
      answers.push({source:pr.nom, text:`Phase actuelle : ${pr.statut} (${avance}% du parcours). ${fmt(pr.montantEngage)} FCFA engagés, ${fmt(pr.montantPaye)} payés. ${risques} risque(s) signalé(s).`});
    });
  } else {
    // Recherche générique dans les documents
    projetsAConsiderer.forEach(pr=>{
      (pr.documents||[]).forEach(d=>{
        if(ql.split(" ").some(w=>w.length>3 && d.nom.toLowerCase().includes(w))){
          answers.push({source:`${pr.nom} — Documents`, text:`${d.nom} (${d.type}) : statut ${d.statut}, ajouté le ${d.date}.`});
        }
      });
    });
  }

  if(answers.length===0){
    host.innerHTML = `<div class="card"><p style="font-size:13px;color:var(--muted);">Aucune donnée trouvée pour répondre précisément à cette question. Essaie de citer un nom de projet, un fournisseur ou un type de document.</p></div>`;
    return;
  }
  host.innerHTML = `<div class="card">${answers.slice(0,15).map(a=>`
    <div style="padding:9px 0;border-bottom:1px solid var(--line);">
      <div style="font-size:13.5px;">${a.text}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:3px;">Source : ${a.source}</div>
    </div>`).join("")}</div>`;
};

// -------------------------------------------------------------
// HISTORIQUE — traçabilité des actions (§25)
// -------------------------------------------------------------
function renderHistorique(){
  const logs = STATE.activityLogs || [];
  if(logs.length===0) return emptyState("alertes","Aucune activité enregistrée","Les modifications importantes apparaîtront ici au fur et à mesure.");
  return `<div class="card">${logs.map(l=>`
    <div style="padding:10px 0;border-bottom:1px solid var(--line);">
      <div style="display:flex;justify-content:space-between;gap:10px;">
        <strong style="font-size:13px;">${l.action}</strong>
        <span style="font-size:11px;color:var(--muted);">${l.createdAt && l.createdAt.toDate ? l.createdAt.toDate().toLocaleString('fr-FR') : ''}</span>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px;">
        ${l.projectNom?`${l.projectNom} · `:''}${l.categorie} · par ${l.user}
        ${l.ancienneValeur||l.nouvelleValeur ? ` · ${esc(l.ancienneValeur)} → ${esc(l.nouvelleValeur)}` : ''}
      </div>
    </div>`).join("")}</div>`;
}

// -------------------------------------------------------------
// IMPORT / EXPORT — Excel / CSV (§27)
// -------------------------------------------------------------
function renderImportExport(){
  return `
    <div class="card">
      <h3>Export</h3>
      <p style="font-size:12.5px;color:var(--muted);margin:0 0 12px;">Génère un fichier Excel prêt à partager.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn gold sm" onclick="exportComparaisonExcel()">📊 Comparaison des projets</button>
        <button class="btn gold sm" onclick="exportFournisseursExcel()">📊 Fournisseurs</button>
      </div>
    </div>
    <div class="card">
      <h3>Import — Fournisseurs</h3>
      <p style="font-size:12.5px;color:var(--muted);margin:0 0 12px;">Fichier Excel ou CSV avec les colonnes : Nom, Catégorie, Pays, Contact, Conditions.</p>
      <input type="file" id="importFournisseursFile" accept=".csv,.xlsx,.xls" style="margin-bottom:10px;">
      <button class="btn primary sm" onclick="importFournisseursExcel()">Importer</button>
    </div>
    <div class="card">
      <h3>Import — Équipements (dans un projet)</h3>
      <p style="font-size:12.5px;color:var(--muted);margin:0 0 12px;">Sélectionne d'abord le projet, puis un fichier avec les colonnes : Nom, Catégorie, Prévu, Commandé, Livré, Installé, CoûtUnitaire.</p>
      <select id="importEquipProject" style="width:100%;margin-bottom:10px;padding:10px 11px;border-radius:9px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
        ${STATE.projects.map(p=>`<option value="${p.id}">${p.nom}</option>`).join("")}
      </select>
      <input type="file" id="importEquipFile" accept=".csv,.xlsx,.xls" style="margin-bottom:10px;">
      <button class="btn primary sm" onclick="importEquipementsExcel()">Importer</button>
    </div>
  `;
}
window.exportFournisseursExcel = function(){
  if(typeof XLSX==="undefined"){ toast("Bibliothèque Excel non chargée", true); return; }
  const rows = STATE.suppliers.map(s=>({Nom:s.nom, Catégorie:s.categorie, Pays:s.pays||"", Contact:s.contact||"", Conditions:s.conditions||""}));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Fournisseurs");
  XLSX.writeFile(wb, `Alcom_Petroleum_Fournisseurs_${todayISO()}.xlsx`);
};
window.importFournisseursExcel = function(){
  const file = $("#importFournisseursFile").files[0];
  if(!file){ toast("Sélectionne un fichier", true); return; }
  if(typeof XLSX==="undefined"){ toast("Bibliothèque Excel non chargée", true); return; }
  const reader = new FileReader();
  reader.onload = async (e)=>{
    try{
      const wb = XLSX.read(e.target.result, {type:"binary"});
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      let count = 0;
      for(const row of rows){
        const nom = row.Nom || row.nom;
        if(!nom) continue;
        // Vérifie les doublons avant import
        if(STATE.suppliers.some(s=>s.nom.toLowerCase()===String(nom).toLowerCase())) continue;
        await addDoc(collection(db,"suppliers"), {
          nom:String(nom), categorie:row.Catégorie||row.categorie||"Autres", pays:row.Pays||row.pays||"",
          contact:row.Contact||row.contact||"", conditions:row.Conditions||row.conditions||"", createdAt:serverTimestamp()
        });
        count++;
      }
      toast(`${count} fournisseur(s) importé(s) ✓ (doublons ignorés)`);
    }catch(err){ toast("Erreur d'import : "+err.message, true); }
  };
  reader.readAsBinaryString(file);
};
window.importEquipementsExcel = function(){
  const projectId = $("#importEquipProject").value;
  const file = $("#importEquipFile").files[0];
  if(!projectId || !file){ toast("Sélectionne un projet et un fichier", true); return; }
  if(typeof XLSX==="undefined"){ toast("Bibliothèque Excel non chargée", true); return; }
  const reader = new FileReader();
  reader.onload = async (e)=>{
    try{
      const wb = XLSX.read(e.target.result, {type:"binary"});
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const pr = STATE.projects.find(p=>p.id===projectId);
      const nouveaux = rows.filter(r=>r.Nom||r.nom).map(r=>({
        nom:String(r.Nom||r.nom), categorie:r.Catégorie||r.categorie||"", fournisseur:r.Fournisseur||r.fournisseur||"",
        prevu:Number(r.Prévu||r.prevu||0), commande:Number(r.Commandé||r.commande||0),
        livre:Number(r.Livré||r.livre||0), installe:Number(r.Installé||r.installe||0),
        coutUnitaire:Number(r.CoûtUnitaire||r.coutUnitaire||0)
      }));
      const equipements = [...(pr.equipements||[]), ...nouveaux];
      await updateDoc(doc(db,"projects",projectId), {equipements});
      toast(`${nouveaux.length} équipement(s) importé(s) ✓`);
    }catch(err){ toast("Erreur d'import : "+err.message, true); }
  };
  reader.readAsBinaryString(file);
};



// -------------------------------------------------------------
// DASHBOARD
// -------------------------------------------------------------
function renderDashboard(){
  const p = STATE.projects;
  if(p.length===0){
    return emptyState("dashboard","Aucun projet pour l'instant","Créez votre premier projet de station-service pour démarrer le pilotage.","+ Nouveau projet","openProjectModal()");
  }
  const total = p.length;
  const byStatut = {};
  PROJECT_STATUTS.forEach(s=> byStatut[s]=0);
  let budgetTotal=0, engage=0, paye=0;
  p.forEach(pr=>{
    byStatut[pr.statut] = (byStatut[pr.statut]||0)+1;
    budgetTotal += Number(pr.budgetInitial||0);
    engage += Number(pr.montantEngage||0);
    paye += Number(pr.montantPaye||0);
  });
  const enCours = p.filter(pr=>pr.statut!=="Mise en service").length;
  const termines = p.filter(pr=>pr.statut==="Mise en service").length;
  const alerts = computeAlerts();
  let docsManquants=0, commandesAttente=0, livraisonsAttendues=0, livraisonsRetard=0;
  p.forEach(pr=>{
    Object.values(pr.phaseChecklists||{}).forEach(items=>(items||[]).forEach(it=>{ if(it.valide!==undefined && it.valide!=="Oui" && it.requis==="Oui") docsManquants++; }));
    (pr.bonsCommande||[]).forEach(b=>{ if(["Brouillon","En validation","Validé"].includes(b.statut)) commandesAttente++; });
    (pr.livraisons||[]).forEach(l=>{ if(l.statut==="À venir"||l.statut==="En transit") livraisonsAttendues++; if(l.statut==="Retard") livraisonsRetard++; });
  });

  return `
    <div class="kpi-grid">
      <div class="kpi" style="cursor:pointer;" onclick="goTo('projects')"><div class="lbl">Projets totaux</div><div class="val">${total}</div><div class="sub">${enCours} en cours · ${termines} terminés</div></div>
      <div class="kpi" style="cursor:pointer;" onclick="goTo('budget')"><div class="lbl">Budget total</div><div class="val">${fmt(budgetTotal)}</div><div class="sub">FCFA cumulé</div></div>
      <div class="kpi" style="cursor:pointer;" onclick="goTo('depenses')"><div class="lbl">Montant engagé</div><div class="val">${fmt(engage)}</div><div class="sub">${budgetTotal? Math.round(engage/budgetTotal*100):0}% du budget</div></div>
      <div class="kpi accent" style="cursor:pointer;" onclick="goTo('depenses')"><div class="lbl">Montant payé</div><div class="val">${fmt(paye)}</div><div class="sub">Reste à payer : ${fmt(engage-paye)}</div></div>
      <div class="kpi" style="cursor:pointer;" onclick="goTo('alertes')"><div class="lbl">Documents manquants</div><div class="val" style="color:${docsManquants?'var(--gold)':'var(--ok)'}">${docsManquants}</div></div>
      <div class="kpi" style="cursor:pointer;" onclick="goTo('alertes')"><div class="lbl">Commandes en attente</div><div class="val">${commandesAttente}</div></div>
      <div class="kpi" style="cursor:pointer;" onclick="goTo('alertes')"><div class="lbl">Livraisons attendues</div><div class="val">${livraisonsAttendues}</div><div class="sub">${livraisonsRetard} en retard</div></div>
      <div class="kpi" style="cursor:pointer;" onclick="goTo('alertes')"><div class="lbl">Alertes actives</div><div class="val" style="color:${alerts.length?'var(--red)':'var(--ok)'}">${alerts.length}</div><div class="sub">documents, retards, paiements</div></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="section-title"><h3 style="margin:0">Projets par phase</h3></div>
        ${PROJECT_STATUTS.filter(s=>byStatut[s]>0).map(s=>`
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">
            <div style="width:110px;font-size:12px;color:var(--muted);flex-shrink:0;">${s}</div>
            <div class="progress-track" style="flex:1;"><div class="progress-fill" style="width:${byStatut[s]/total*100}%"></div></div>
            <div style="width:18px;font-size:12px;font-weight:700;text-align:right;">${byStatut[s]}</div>
          </div>`).join("")}
      </div>
      <div class="card">
        <div class="section-title"><h3 style="margin:0">Alertes récentes</h3><span class="pill ${alerts.length?'bad':'ok'}">${alerts.length}</span></div>
        ${alerts.length===0 ? `<p style="font-size:13px;color:var(--muted)">Aucune alerte active. 👍</p>` :
          alerts.slice(0,5).map(a=>`
            <div style="padding:9px 0;border-bottom:1px solid var(--line);font-size:13px;">
              <span class="pill ${a.level}">${a.type}</span> ${a.text}
            </div>`).join("")}
        ${alerts.length>5?`<div style="margin-top:10px;"><span class="btn sm ghost" onclick="goTo('alertes')">Voir toutes les alertes (${alerts.length})</span></div>`:""}
      </div>
    </div>

    <div class="card">
      <div class="section-title"><h3 style="margin:0">Projets</h3><button class="btn primary sm" onclick="openProjectModal()">${icon('plus')} Nouveau</button></div>
      ${renderProjectsTable(p.slice(0,8))}
      ${p.length>8?`<div style="margin-top:10px;text-align:center;"><span class="btn sm ghost" onclick="goTo('projects')">Voir tous les projets</span></div>`:""}
    </div>
  `;
}

function statutPillClass(statut){
  if(statut==="Mise en service") return "ok";
  if(["Études","Travaux préparatoires"].includes(statut)) return "neutral";
  if(["Construction","Installation"].includes(statut)) return "warn";
  return "info";
}

function renderProjectsTable(list){
  return `<table><thead><tr><th>Projet</th><th>Pays / Ville</th><th>Statut</th><th>Avancement</th><th>Budget</th><th>Retard</th></tr></thead><tbody>
    ${list.map(pr=>{
      const idx = PROJECT_STATUTS.indexOf(pr.statut);
      const avance = Math.round(((idx+1)/PROJECT_STATUTS.length)*100);
      const late = pr.dateFinPrevue && pr.statut!=="Mise en service" && new Date(pr.dateFinPrevue) < new Date();
      return `<tr class="rowlink" onclick="goTo('projects',{projectId:'${pr.id}'})">
        <td><strong>${pr.nom}</strong><br><span class="mono" style="font-size:11px;color:var(--muted)">${pr.code||''}</span></td>
        <td>${pr.ville||'—'}, ${pr.pays||'—'}</td>
        <td><span class="pill ${statutPillClass(pr.statut)}">${pr.statut}</span></td>
        <td style="min-width:110px;"><div class="progress-track"><div class="progress-fill" style="width:${avance}%"></div></div></td>
        <td>${fmt(pr.budgetInitial)}</td>
        <td>${late?`<span class="pill bad">En retard</span>`:`<span class="pill ok">À jour</span>`}</td>
      </tr>`;
    }).join("")}
  </tbody></table>`;
}

// -------------------------------------------------------------
// ALERTES (calcul automatique)
// -------------------------------------------------------------
function computeAlerts(){
  const alerts = [];
  const now = new Date();
  STATE.projects.forEach(pr=>{
    if(pr.dateFinPrevue && pr.statut!=="Mise en service"){
      const d = new Date(pr.dateFinPrevue);
      if(d < now) alerts.push({type:"Retard projet", level:"bad", text:`${pr.nom} — échéance dépassée de ${daysBetween(pr.dateFinPrevue, todayISO())} j.`});
      else if(daysBetween(todayISO(), pr.dateFinPrevue) <= 7) alerts.push({type:"Échéance proche", level:"warn", text:`${pr.nom} — mise en service prévue dans ${daysBetween(todayISO(), pr.dateFinPrevue)} j.`});
    }
    const engage = Number(pr.montantEngage||0), paye = Number(pr.montantPaye||0);
    if(engage>paye) alerts.push({type:"Paiement", level:"warn", text:`${pr.nom} — solde restant de ${fmt(engage-paye)} FCFA.`});
    if(pr.budgetInitial && engage > Number(pr.budgetInitial)) alerts.push({type:"Dépassement budgétaire", level:"bad", text:`${pr.nom} — engagé (${fmt(engage)}) dépasse le budget initial (${fmt(pr.budgetInitial)}).`});
    const pcl = pr.phaseChecklists || {};
    Object.values(pcl).forEach(items=>{
      (items||[]).forEach(it=>{
        if(it.statut==="Bloqué") alerts.push({type:"Étape bloquée", level:"bad", text:`${pr.nom} — ${it.label}`});
        if(it.expire==="Oui") alerts.push({type:"Document expiré", level:"bad", text:`${pr.nom} — ${it.label}`});
      });
    });
    (pr.documents||[]).forEach(d=>{
      if(!d.dateExpiration) return;
      const j = daysBetween(todayISO(), d.dateExpiration);
      if(j < 0) alerts.push({type:"Document expiré", level:"bad", text:`${pr.nom} — ${d.nom}`});
      else if(j <= 30) alerts.push({type:"Document expirant", level:"warn", text:`${pr.nom} — ${d.nom} expire dans ${j} j.`});
    });
    (pr.bonsCommande||[]).forEach(b=>{
      if(b.statut==="Validé" || b.statut==="En validation") alerts.push({type:"BC non signé", level:"warn", text:`${pr.nom} — ${b.numero||b.fournisseur} en attente de signature.`});
    });
    (pr.factures||[]).forEach(f=>{
      if(f.statut==="À payer" && f.echeance){
        const j = daysBetween(todayISO(), f.echeance);
        if(j < 0) alerts.push({type:"Facture en retard", level:"bad", text:`${pr.nom} — ${f.numero||f.fournisseur} : échéance dépassée de ${-j} j.`});
        else if(j <= 7) alerts.push({type:"Échéance paiement", level:"warn", text:`${pr.nom} — ${f.numero||f.fournisseur} : à payer dans ${j} j.`});
      }
    });
    (pr.livraisons||[]).forEach(l=>{
      if(l.statut==="Livraison partielle") alerts.push({type:"Livraison partielle", level:"warn", text:`${pr.nom} — ${l.equipement} : ${l.qteLivree||0}/${l.qteCommandee||0}.`});
      if(l.statut==="Retard") alerts.push({type:"Livraison en retard", level:"bad", text:`${pr.nom} — ${l.equipement} (${l.fournisseur||'—'}).`});
      else if(l.datePrevue && l.statut!=="Livré"){
        const j = daysBetween(todayISO(), l.datePrevue);
        if(j>=0 && j<=7) alerts.push({type:"Livraison proche", level:"warn", text:`${pr.nom} — ${l.equipement} prévue dans ${j} j.`});
      }
    });
  });
  return alerts.map(a=>{
    const pr = STATE.projects.find(p=>a.text.startsWith(p.nom));
    return {...a, projet: pr?pr.nom:"", responsable: pr?pr.responsable:""};
  });
}

function renderAlertes(){
  const alerts = computeAlerts();
  if(alerts.length===0) return emptyState("alertes","Aucune alerte","Tous les projets sont à jour : aucun retard, aucun document manquant détecté.");
  return `<div class="card">${alerts.map(a=>{
    const contact = a.responsable ? (STATE.contacts||[]).find(c=>c.nom.toLowerCase()===a.responsable.toLowerCase()) : null;
    const phone = contact ? contact.telephone : "";
    const msg = `Bonjour${a.responsable?' '+a.responsable:''}, ${COMPANY.nom} — alerte "${a.type}" sur ${a.projet||'un projet'} : ${a.text.replace((a.projet||'')+' — ','')}. Merci de traiter au plus vite.`;
    return `<div style="display:flex;gap:10px;padding:12px 0;border-bottom:1px solid var(--line);align-items:flex-start;">
      <span class="pill ${a.level}" style="flex-shrink:0;">${a.type}</span>
      <div style="flex:1;font-size:13.5px;">${a.text}${a.responsable?`<br><span style="font-size:11px;color:var(--muted);">Responsable : ${a.responsable}</span>`:''}</div>
      <a href="${waLink(phone, msg)}" target="_blank" class="btn sm icon" style="text-decoration:none;flex-shrink:0;" title="Alerter via WhatsApp">💬</a>
    </div>`;
  }).join("")}</div>`;
}

// -------------------------------------------------------------
// PROJECTS — LIST
// -------------------------------------------------------------
function renderProjectsList(){
  if(STATE.projects.length===0){
    return emptyState("projects","Aucun projet","Créez le premier projet de station-service à piloter.","+ Nouveau projet","openProjectModal()");
  }
  return `
    <div class="section-title"><div></div><button class="btn primary" onclick="openProjectModal()">${icon('plus')} Nouveau projet</button></div>
    <div class="card">${renderProjectsTable(STATE.projects)}</div>
  `;
}

function emptyState(ic,h,p,btnLabel,onclick){
  return `<div class="empty card">
    <div class="ic">${ic==="dashboard"?"📊":ic==="alertes"?"✅":"📁"}</div>
    <h4>${h}</h4><p>${p}</p>
    ${btnLabel? `<div style="margin-top:16px;"><button class="btn primary" onclick="${onclick}">${btnLabel}</button></div>` : ""}
  </div>`;
}

// -------------------------------------------------------------
// PROJECT MODAL — create
// -------------------------------------------------------------
window.openProjectModal = function(){
  openModal(`
    <div class="modal-head"><h3>Nouveau projet</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div class="f-field full"><label>Nom du projet *</label><input id="npNom" placeholder="Station Madagascar"></div>
      <div class="f-field"><label>Code projet</label><input id="npCode" placeholder="ALC-2026-01"></div>
      <div class="f-field"><label>Statut</label>
        <select id="npStatut">${PROJECT_STATUTS.map(s=>`<option>${s}</option>`).join("")}</select>
      </div>
      <div class="f-field"><label>Pays</label><input id="npPays" placeholder="Cameroun"></div>
      <div class="f-field"><label>Ville</label><input id="npVille" placeholder="Douala"></div>
      <div class="f-field"><label>Responsable</label><input id="npResp" placeholder="Nom du responsable"></div>
      <div class="f-field"><label>Date de lancement</label><input type="date" id="npDateDebut"></div>
      <div class="f-field"><label>Date fin prévue</label><input type="date" id="npDateFin"></div>
      <div class="f-field"><label>Budget initial (FCFA)</label><input type="number" id="npBudget" placeholder="0"></div>
      <div class="f-field full"><label>Localisation / adresse</label><input id="npAdresse" placeholder="Adresse, coordonnées GPS"></div>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn primary" onclick="submitNewProject()">Créer le projet</button>
    </div>
  `);
};

window.submitNewProject = async function(){
  const nom = $("#npNom").value.trim();
  if(!nom){ toast("Le nom du projet est requis", true); return; }
  const data = {
    nom, code:$("#npCode").value.trim(), statut:$("#npStatut").value,
    pays:$("#npPays").value.trim(), ville:$("#npVille").value.trim(),
    responsable:$("#npResp").value.trim(), dateDebut:$("#npDateDebut").value,
    dateFinPrevue:$("#npDateFin").value, budgetInitial:Number($("#npBudget").value||0),
    budgetRevise:Number($("#npBudget").value||0), montantEngage:0, montantPaye:0,
    adresse:$("#npAdresse").value.trim(),
    phaseChecklists: freshPhaseChecklists(),
    createdAt: serverTimestamp(), createdBy: STATE.user.uid
  };
  try{
    const ref = await addDoc(collection(db,"projects"), data);
    logActivity(ref.id, "Projet", "Création du projet", "", nom);
    closeModal(); toast("Projet créé ✓");
    goTo("projects",{projectId:ref.id});
  }catch(e){ toast("Erreur : "+e.message, true); }
};

// -------------------------------------------------------------
// PROJECT DETAIL
// -------------------------------------------------------------
const PROJECT_TABS = [
  {id:"fiche", label:"Fiche"},
  {id:"checklist", label:"Checklist"},
  {id:"planning", label:"Planning"},
  {id:"travaux", label:"Travaux"},
  {id:"achats", label:"Achats"},
  {id:"equipements", label:"Équipements"},
  {id:"livraisons", label:"Livraisons"},
  {id:"documents", label:"Documents"},
  {id:"finance", label:"Finance"},
  {id:"risques", label:"Risques"}
];

function renderProjectDetail(){
  const pr = STATE.projects.find(p=>p.id===STATE.projectId);
  if(!pr) return emptyState("projects","Projet introuvable","");
  const idx = PROJECT_STATUTS.indexOf(pr.statut);

  let body = "";
  if(STATE.projectTab==="fiche") body = renderProjectFiche(pr, idx);
  else if(STATE.projectTab==="checklist") body = renderProjectChecklist(pr);
  else if(STATE.projectTab==="planning") body = renderProjectPlanning(pr);
  else if(STATE.projectTab==="travaux") body = renderProjectTravaux(pr);
  else if(STATE.projectTab==="achats") body = renderProjectAchats(pr);
  else if(STATE.projectTab==="equipements") body = renderProjectEquipements(pr);
  else if(STATE.projectTab==="livraisons") body = renderProjectLivraisons(pr);
  else if(STATE.projectTab==="finance") body = renderProjectFinance(pr);
  else if(STATE.projectTab==="documents") body = renderProjectDocuments(pr);
  else if(STATE.projectTab==="risques") body = renderProjectRisques(pr);

  return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <button class="btn icon sm" onclick="goTo('projects')">${icon('back')}</button>
      <span class="pill ${statutPillClass(pr.statut)}">${pr.statut}</span>
      <span class="mono" style="font-size:12px;color:var(--muted)">${pr.code||''}</span>
    </div>
    <div class="stepper">
      ${PROJECT_STATUTS.map((s,i)=>{
        const targetTab = PHASE_ROUTE_TAB[s] || "checklist";
        const opts = PHASE_ROUTE_TAB[s] ? `{projectId:'${pr.id}',projectTab:'${targetTab}'}` : `{projectId:'${pr.id}',projectTab:'checklist',phase:'${s}'}`;
        return `<div class="step ${i<idx?'done':i===idx?'current':''}" onclick="goTo('projects',${opts})" style="cursor:pointer;">${s}</div>`;
      }).join("")}
    </div>
    <div style="display:flex;gap:6px;margin:16px 0;border-bottom:1px solid var(--line);overflow-x:auto;">
      ${PROJECT_TABS.map(t=>`<div onclick="goTo('projects',{projectId:'${pr.id}',projectTab:'${t.id}'})"
        style="padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;
        border-bottom:2px solid ${STATE.projectTab===t.id?'var(--red)':'transparent'};
        color:${STATE.projectTab===t.id?'var(--red)':'var(--muted)'};">${t.label}</div>`).join("")}
    </div>
    ${body}
  `;
}

function renderProjectFiche(pr, idx){
  return `
    <div class="grid-2">
      <div class="card">
        <h3>Informations générales</h3>
        ${infoRow("Nom du projet", pr.nom)}
        ${infoRow("Code projet", pr.code||"—")}
        ${infoRow("Localisation", `${pr.ville||"—"}, ${pr.pays||"—"}`)}
        ${infoRow("Adresse / GPS", pr.adresse||"—")}
        ${infoRow("Responsable", pr.responsable||"—")}
        ${infoRow("Date de lancement", pr.dateDebut||"—")}
        ${infoRow("Date de fin prévue", pr.dateFinPrevue||"—")}
      </div>
      <div class="card">
        <h3>Budget</h3>
        ${infoRow("Budget initial", fmtXAF(pr.budgetInitial))}
        ${infoRow("Budget révisé", fmtXAF(pr.budgetRevise))}
        ${infoRow("Montant engagé", fmtXAF(pr.montantEngage))}
        ${infoRow("Montant payé", fmtXAF(pr.montantPaye))}
        ${infoRow("Solde restant", fmtXAF((pr.montantEngage||0)-(pr.montantPaye||0)))}
      </div>
    </div>
    <div class="card">
      <div class="section-title"><h3 style="margin:0">Actions</h3></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn" onclick="openEditProjectModal('${pr.id}')">Modifier la fiche</button>
        <button class="btn" onclick="openStatutModal('${pr.id}')">Changer de phase</button>
      </div>
    </div>
  `;
}

function infoRow(label,val){
  return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-size:13.5px;">
    <span style="color:var(--muted)">${label}</span><span style="font-weight:600;text-align:right;">${val}</span></div>`;
}

window.openEditProjectModal = function(id){
  const pr = STATE.projects.find(p=>p.id===id);
  openModal(`
    <div class="modal-head"><h3>Modifier le projet</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div class="f-field full"><label>Nom du projet</label><input id="epNom" value="${esc(pr.nom)}"></div>
      <div class="f-field"><label>Code projet</label><input id="epCode" value="${esc(pr.code||'')}"></div>
      <div class="f-field"><label>Responsable</label><input id="epResp" value="${esc(pr.responsable||'')}"></div>
      <div class="f-field"><label>Pays</label><input id="epPays" value="${esc(pr.pays||'')}"></div>
      <div class="f-field"><label>Ville</label><input id="epVille" value="${esc(pr.ville||'')}"></div>
      <div class="f-field"><label>Date fin prévue</label><input type="date" id="epDateFin" value="${pr.dateFinPrevue||''}"></div>
      <div class="f-field"><label>Budget initial</label><input type="number" id="epBudget" value="${pr.budgetInitial||0}"></div>
      <div class="f-field"><label>Montant engagé</label><input type="number" id="epEngage" value="${pr.montantEngage||0}"></div>
      <div class="f-field"><label>Montant payé</label><input type="number" id="epPaye" value="${pr.montantPaye||0}"></div>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn primary" onclick="submitEditProject('${id}')">Enregistrer</button>
    </div>
  `);
};
window.submitEditProject = async function(id){
  try{
    await updateDoc(doc(db,"projects",id), {
      nom:$("#epNom").value.trim(), code:$("#epCode").value.trim(), responsable:$("#epResp").value.trim(),
      pays:$("#epPays").value.trim(), ville:$("#epVille").value.trim(), dateFinPrevue:$("#epDateFin").value,
      budgetInitial:Number($("#epBudget").value||0), montantEngage:Number($("#epEngage").value||0),
      montantPaye:Number($("#epPaye").value||0)
    });
    closeModal(); toast("Projet mis à jour ✓");
  }catch(e){ toast("Erreur : "+e.message, true); }
};

window.jumpToPhase = async function(projectId, statut){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const ancien = pr ? pr.statut : "";
  await updateDoc(doc(db,"projects",projectId), {statut});
  logActivity(projectId, "Projet", "Changement de phase", ancien, statut);
  toast("Phase : " + statut + " ✓");
};

window.openStatutModal = function(id){
  const pr = STATE.projects.find(p=>p.id===id);
  openModal(`
    <div class="modal-head"><h3>Changer de phase</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="f-field"><label>Nouvelle phase</label>
      <select id="stStatut">${PROJECT_STATUTS.map(s=>`<option ${s===pr.statut?'selected':''}>${s}</option>`).join("")}</select>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Annuler</button>
      <button class="btn primary" onclick="submitStatut('${id}')">Valider</button>
    </div>
  `);
};
window.submitStatut = async function(id){
  const pr = STATE.projects.find(p=>p.id===id);
  const ancien = pr ? pr.statut : "";
  const nouveau = $("#stStatut").value;
  await updateDoc(doc(db,"projects",id), {statut:nouveau});
  logActivity(id, "Projet", "Changement de phase", ancien, nouveau);
  closeModal(); toast("Phase mise à jour ✓");
};

function renderProjectChecklist(pr){
  const phase = STATE.activePhase || (PHASE_ROUTE_TAB[pr.statut] ? PROJECT_STATUTS.find(s=>!PHASE_ROUTE_TAB[s]) : pr.statut) || PROJECT_STATUTS[0];
  const mode = PHASE_ITEM_MODE[phase] || "task";
  const phaseChecklists = pr.phaseChecklists || freshPhaseChecklists();
  const items = phaseChecklists[phase] || [];
  const total = items.length;
  const done = mode==="document" ? items.filter(i=>i.valide==="Oui").length : items.filter(i=>i.statut==="Terminé").length;
  const pct = total ? Math.round(done/total*100) : 0;

  const phasePicker = `<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:14px;">
    ${PROJECT_STATUTS.map(s=>{
      const targetTab = PHASE_ROUTE_TAB[s] || "checklist";
      const opts = PHASE_ROUTE_TAB[s] ? `{projectId:'${pr.id}',projectTab:'${targetTab}'}` : `{projectId:'${pr.id}',projectTab:'checklist',phase:'${s}'}`;
      return `<div onclick="goTo('projects',${opts})" class="pill ${s===phase?'bad':'neutral'}" style="cursor:pointer;white-space:nowrap;flex-shrink:0;">${s}${PHASE_ROUTE_TAB[s]?' ↗':''}</div>`;
    }).join("")}
  </div>`;

  const header = `<div class="card">
    <div class="section-title">
      <h3 style="margin:0;">Checklist — ${phase}</h3>
      <button class="btn sm ${pr.statut===phase?'ghost':'primary'}" ${pr.statut===phase?'disabled':''} onclick="jumpToPhase('${pr.id}','${phase}')">
        ${pr.statut===phase?'Phase actuelle du projet':'Définir comme phase actuelle'}
      </button>
    </div>
    <div style="display:flex;align-items:center;gap:10px;">
      <div class="progress-track" style="flex:1;height:9px;"><div class="progress-fill" style="width:${pct}%"></div></div>
      <strong style="font-size:13px;">${done}/${total}</strong>
    </div>
  </div>`;

  let list;
  if(items.length===0){
    list = emptyState("projects","Aucun point pour cette phase","");
  } else if(mode==="document"){
    list = `<div class="card">${items.map((it,ii)=>{
      const showFollowUp = it.valide !== "Oui"; // tant que non validé : responsable + dates utiles (lenteur administrative)
      return `<div style="padding:11px 0;border-bottom:1px solid var(--line);">
        <strong style="font-size:13.5px;">${it.label}</strong>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
          ${docToggle(pr.id, phase, ii, "requis", "Requis", it.requis)}
          ${docToggle(pr.id, phase, ii, "disponible", "Disponible", it.disponible)}
          ${docToggle(pr.id, phase, ii, "valide", "Validé", it.valide)}
          ${docToggle(pr.id, phase, ii, "expire", "Expiré", it.expire, true)}
        </div>
        ${showFollowUp ? `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
          <input placeholder="Responsable du suivi" value="${esc(it.responsable)}" onchange="updatePhaseItem('${pr.id}','${phase}',${ii},'responsable',this.value)" style="flex:1;min-width:120px;font-size:12px;padding:6px 8px;border-radius:7px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
          <input type="date" title="Date prévue" value="${it.dateDebut||''}" onchange="updatePhaseItem('${pr.id}','${phase}',${ii},'dateDebut',this.value)" style="font-size:12px;padding:6px 8px;border-radius:7px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
          <input type="date" title="Date réelle / relance" value="${it.dateFin||''}" onchange="updatePhaseItem('${pr.id}','${phase}',${ii},'dateFin',this.value)" style="font-size:12px;padding:6px 8px;border-radius:7px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
        </div>` : ""}
      </div>`;
    }).join("")}</div>`;
  } else {
    list = `<div class="card">${items.map((it,ii)=>`
      <div style="padding:11px 0;border-bottom:1px solid var(--line);">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <strong style="font-size:13.5px;">${it.label}</strong>
          <select onchange="updatePhaseItem('${pr.id}','${phase}',${ii},'statut',this.value)" style="font-size:11.5px;padding:5px 7px;border-radius:7px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);flex-shrink:0;">
            ${["Non commencé","En cours","Terminé","Bloqué","Non applicable","En retard"].map(s=>`<option ${s===it.statut?'selected':''}>${s}</option>`).join("")}
          </select>
        </div>
        <div style="display:flex;gap:8px;margin-top:7px;flex-wrap:wrap;">
          <input placeholder="Responsable" value="${esc(it.responsable)}" onchange="updatePhaseItem('${pr.id}','${phase}',${ii},'responsable',this.value)" style="flex:1;min-width:120px;font-size:12px;padding:6px 8px;border-radius:7px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
          <input type="date" value="${it.dateDebut||''}" onchange="updatePhaseItem('${pr.id}','${phase}',${ii},'dateDebut',this.value)" style="font-size:12px;padding:6px 8px;border-radius:7px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
          <input type="date" value="${it.dateFin||''}" onchange="updatePhaseItem('${pr.id}','${phase}',${ii},'dateFin',this.value)" style="font-size:12px;padding:6px 8px;border-radius:7px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
          <input type="range" min="0" max="100" value="${it.avancement||0}" oninput="this.nextElementSibling.textContent=this.value+'%'" onchange="updatePhaseItem('${pr.id}','${phase}',${ii},'avancement',Number(this.value))" style="flex:1;">
          <span style="font-size:11px;width:32px;color:var(--muted);">${it.avancement||0}%</span>
        </div>
      </div>`).join("")}
    </div>`;
  }

  return phasePicker + header + list;
}
function docToggle(projectId, phase, ii, field, label, val, invert){
  const isYes = val==="Oui";
  const good = invert ? !isYes : isYes;
  return `<button class="pill ${good?'ok':'neutral'}" style="border:none;cursor:pointer;" onclick="toggleDocField('${projectId}','${phase}',${ii},'${field}')">${label} : ${val||'Non'}</button>`;
}
window.toggleDocField = async function(projectId, phase, ii, field){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const phaseChecklists = JSON.parse(JSON.stringify(pr.phaseChecklists || freshPhaseChecklists()));
  const cur = phaseChecklists[phase][ii][field];
  phaseChecklists[phase][ii][field] = cur==="Oui" ? "Non" : "Oui";
  await updateDoc(doc(db,"projects",projectId), {phaseChecklists});
  logActivity(projectId, "Checklist", `${phase} — ${phaseChecklists[phase][ii].label} : ${field}`, cur, phaseChecklists[phase][ii][field]);
};
window.updatePhaseItem = async function(projectId, phase, ii, field, val){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const phaseChecklists = JSON.parse(JSON.stringify(pr.phaseChecklists || freshPhaseChecklists()));
  if(!phaseChecklists[phase]) phaseChecklists[phase] = [];
  phaseChecklists[phase][ii][field] = val;
  if(field==="avancement" && Number(val)>=100) phaseChecklists[phase][ii].statut = "Terminé";
  if(field==="statut" && val==="Terminé") phaseChecklists[phase][ii].avancement = 100;
  await updateDoc(doc(db,"projects",projectId), {phaseChecklists});
};

function renderProjectFinance(pr){
  const engage = Number(pr.montantEngage||0), paye = Number(pr.montantPaye||0), budget = Number(pr.budgetInitial||0);
  const paiements = (pr.paiements||[]).slice().sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  return `
    <div class="kpi-grid">
      <div class="kpi"><div class="lbl">Budget initial</div><div class="val">${fmt(budget)}</div></div>
      <div class="kpi"><div class="lbl">Engagé</div><div class="val">${fmt(engage)}</div><div class="sub">${budget?Math.round(engage/budget*100):0}% du budget</div></div>
      <div class="kpi accent"><div class="lbl">Payé</div><div class="val">${fmt(paye)}</div></div>
      <div class="kpi"><div class="lbl">Solde restant</div><div class="val">${fmt(engage-paye)}</div></div>
    </div>
    <div class="card">
      <h3>Écart budgétaire</h3>
      <div class="progress-track" style="height:12px;margin-bottom:8px;"><div class="progress-fill" style="width:${budget?Math.min(100,engage/budget*100):0}%"></div></div>
      <p style="font-size:12.5px;color:var(--muted)">${engage>budget?`⚠️ Dépassement de budget de ${fmt(engage-budget)} FCFA`:`Budget disponible : ${fmt(budget-engage)} FCFA`}</p>
      <button class="btn sm" onclick="openEditProjectModal('${pr.id}')">Mettre à jour le budget/engagé</button>
    </div>
    <div class="card">
      <div class="section-title"><h3 style="margin:0;">Mouvements d'argent</h3><button class="btn primary sm" onclick="openPaiementModal('${pr.id}')">${icon('plus')} Enregistrer un paiement</button></div>
      ${paiements.length===0 ? `<p style="font-size:12.5px;color:var(--muted);">Aucun paiement enregistré.</p>` :
        paiements.map(p=>`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-size:12.5px;">
          <span>${p.date} · ${p.moyen}${p.reference?` · ${p.reference}`:''}${p.description?` · ${p.description}`:''}</span>
          <strong>${fmt(p.montant)} FCFA</strong>
        </div>`).join("")}
    </div>
  `;
}
window.openPaiementModal = function(projectId){
  openModal(`<div class="modal-head"><h3>Enregistrer un paiement</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div class="f-field"><label>Montant (FCFA)</label><input type="number" id="pmMontant" value="0"></div>
      <div class="f-field"><label>Date</label><input type="date" id="pmDate" value="${todayISO()}"></div>
      <div class="f-field"><label>Moyen de paiement</label><select id="pmMoyen"><option>Orange Money</option><option>MTN Mobile Money</option><option>Virement bancaire</option><option>Chèque</option><option>Espèces</option></select></div>
      <div class="f-field"><label>Référence</label><input id="pmRef" placeholder="N° transaction"></div>
      <div class="f-field full"><label>Description</label><input id="pmDesc" placeholder="Ex : avance sur BC cuves"></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitPaiement('${projectId}')">Enregistrer</button></div>`);
};
window.submitPaiement = async function(projectId){
  const montant = Number($("#pmMontant").value||0);
  if(montant<=0){ toast("Le montant doit être supérieur à 0", true); return; }
  const pr = STATE.projects.find(p=>p.id===projectId);
  const paiement = {montant, date:$("#pmDate").value||todayISO(), moyen:$("#pmMoyen").value, reference:$("#pmRef").value.trim(), description:$("#pmDesc").value.trim()};
  const paiements = [...(pr.paiements||[]), paiement];
  const montantPaye = (Number(pr.montantPaye)||0) + montant;
  await updateDoc(doc(db,"projects",projectId), {paiements, montantPaye});
  logActivity(projectId, "Finance", "Paiement enregistré", "", `${fmt(montant)} FCFA (${paiement.moyen})`);
  closeModal(); toast("Paiement enregistré ✓");
};

// -------------------------------------------------------------
// DÉPENSES — tous les mouvements d'argent, tous projets confondus
// -------------------------------------------------------------
function renderDepenses(){
  const tous = [];
  STATE.projects.forEach(pr=>{
    (pr.paiements||[]).forEach(p=> tous.push({...p, projet:pr.nom, projectId:pr.id}));
  });
  tous.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const total = tous.reduce((s,p)=>s+(Number(p.montant)||0),0);
  if(tous.length===0) return emptyState("projects","Aucune dépense enregistrée","Enregistre un paiement depuis l'onglet Finance d'un projet pour le voir apparaître ici.");
  return `
    <div class="kpi-grid"><div class="kpi accent"><div class="lbl">Total des mouvements enregistrés</div><div class="val">${fmt(total)}</div><div class="sub">FCFA, tous projets</div></div></div>
    <div class="card">${tous.map(p=>`
      <div class="rowlink" onclick="goTo('projects',{projectId:'${p.projectId}',projectTab:'finance'})" style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);font-size:12.5px;cursor:pointer;">
        <span><strong>${p.projet}</strong><br><span style="color:var(--muted);">${p.date} · ${p.moyen}${p.description?` · ${p.description}`:''}</span></span>
        <strong style="flex-shrink:0;">${fmt(p.montant)} FCFA</strong>
      </div>`).join("")}</div>
  `;
}


function renderProjectDocuments(pr){
  const docs = pr.documents || [];
  const photos = docs.filter(d=>d.type==="Photo" && d.fileUrl);
  return `
    <div class="section-title"><div></div><button class="btn primary sm" onclick="openAddDocModal('${pr.id}')">${icon('plus')} Ajouter un document</button></div>
    ${photos.length>0 ? `<div class="card">
      <h3>Photos (${photos.length})</h3>
      <div class="photo-strip">${photos.map(p=>`<a href="${p.fileUrl}" target="_blank"><img src="${p.fileUrl}" class="photo-thumb" alt="${esc(p.nom)}"></a>`).join("")}</div>
    </div>` : ""}
    ${docs.length===0 ? emptyState("projects","Aucun document","Ajoutez les documents administratifs, techniques et financiers du projet.") :
    `<div class="card">${docs.map((d,i)=>{
      const expBientot = d.dateExpiration && daysBetween(todayISO(), d.dateExpiration) <= 30 && daysBetween(todayISO(), d.dateExpiration) >= 0;
      const expire = d.dateExpiration && new Date(d.dateExpiration) < new Date();
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);gap:10px;">
        <div style="min-width:0;">
          <strong style="font-size:13.5px;">${d.nom}</strong><br>
          <span style="font-size:11.5px;color:var(--muted)">${d.type} · ajouté le ${d.date}${d.importePar?` par ${d.importePar}`:''}${d.dateExpiration?` · expire le ${d.dateExpiration}`:''}</span>
          ${d.fileUrl?`<br><a class="doc-link" href="${d.fileUrl}" download="${esc(d.fileName||d.nom)}" target="_blank" rel="noopener">📎 ${d.fileName||'Ouvrir le fichier'}</a>`:""}
        </div>
        <span class="pill ${expire?'bad':expBientot?'warn':d.statut==='Validé'?'ok':d.statut==='Expiré'?'bad':'warn'}" style="flex-shrink:0;">${expire?'Expiré':expBientot?'Expire bientôt':d.statut}</span>
      </div>`;
    }).join("")}</div>`}
  `;
}
window.openAddDocModal = function(projectId){
  openModal(`
    <div class="modal-head"><h3>Ajouter un document</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Nom du document</label><input id="dNom" placeholder="Étude d'impact environnemental"></div>
    <div class="form-grid" style="margin-bottom:12px;">
      <div class="f-field"><label>Type</label>
        <select id="dType"><option>Administratif</option><option>Juridique</option><option>Environnemental</option><option>Technique / Plans</option><option>Devis / Contrat</option><option>Facture</option><option>Photo</option><option>Autre</option></select>
      </div>
      <div class="f-field"><label>Statut</label>
        <select id="dStatut"><option>En attente</option><option>Validé</option><option>Expiré</option></select>
      </div>
      <div class="f-field full"><label>Date d'expiration (si applicable)</label><input type="date" id="dExpiration"></div>
    </div>
    <div class="f-field"><label>Fichier — PDF, Word, Excel ou photo (max ~700 Ko)</label><input type="file" id="dFile" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" id="dSubmitBtn" onclick="submitAddDoc('${projectId}')">Ajouter</button></div>
  `);
};
// Convertit un fichier en base64 pour le stocker directement dans Firestore
// (pas besoin de Firebase Storage / forfait Blaze — même principe que l'app du syndicat).
function fileToBase64(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
window.submitAddDoc = async function(projectId){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const nom = $("#dNom").value.trim();
  if(!nom){ toast("Le nom du document est requis", true); return; }
  const btn = $("#dSubmitBtn"); btn.disabled = true; btn.textContent = "Ajout…";
  try{
    const file = $("#dFile").files[0];
    let fileUrl = null, fileName = null;
    if(file){
      if(file.size > 720000){
        toast("Fichier trop volumineux (max ~700 Ko). Compresse-le ou réduis la qualité de la photo.", true);
        btn.disabled=false; btn.textContent="Ajouter"; return;
      }
      btn.textContent = "Encodage du fichier…";
      fileUrl = await fileToBase64(file);
      fileName = file.name;
    }
    const docs = [...(pr.documents||[]), {nom, type:$("#dType").value, statut:$("#dStatut").value, date:todayISO(), dateExpiration:$("#dExpiration").value, fileUrl, fileName, importePar:STATE.profile?STATE.profile.nom:"—"}];
    await updateDoc(doc(db,"projects",projectId), {documents:docs});
    logActivity(projectId, "Documents", `Document ajouté — ${nom}`, "", $("#dType").value);
    closeModal(); toast("Document ajouté ✓");
  }catch(e){ toast("Erreur : "+e.message, true); btn.disabled=false; btn.textContent="Ajouter"; }
};

// -------------------------------------------------------------
// PLANNING (calendrier des tâches)
// -------------------------------------------------------------
function renderProjectPlanning(pr){
  const tasks = (pr.planning||[]).slice().sort((a,b)=>(a.dateDebut||"").localeCompare(b.dateDebut||""));
  return `
    <div class="section-title"><div></div><button class="btn primary sm" onclick="openPlanningModal('${pr.id}')">${icon('plus')} Nouvelle tâche</button></div>
    ${tasks.length===0 ? emptyState("projects","Aucune tâche planifiée","Ajoutez les tâches du planning avec leurs échéances.") :
    `<div class="card">${tasks.map((t,i)=>{
      const late = t.statut!=="Terminé" && t.dateFin && new Date(t.dateFin) < new Date();
      return `<div style="padding:10px 0;border-bottom:1px solid var(--line);">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <strong style="font-size:13.5px;">${t.nom}</strong>
          <span class="pill ${late?'bad':t.statut==='Terminé'?'ok':'neutral'}">${late?'En retard':t.statut}</span>
        </div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:3px;">${t.responsable||'—'} · ${t.dateDebut||'?'} → ${t.dateFin||'?'}</div>
      </div>`;
    }).join("")}</div>`}
  `;
}
window.openPlanningModal = function(projectId){
  openModal(`
    <div class="modal-head"><h3>Nouvelle tâche</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Nom de la tâche</label><input id="tkNom" placeholder="Terrassement"></div>
    <div class="form-grid">
      <div class="f-field"><label>Responsable</label><input id="tkResp"></div>
      <div class="f-field"><label>Statut</label><select id="tkStatut"><option>À venir</option><option>En cours</option><option>Terminé</option></select></div>
      <div class="f-field"><label>Date début</label><input type="date" id="tkDebut"></div>
      <div class="f-field"><label>Date fin</label><input type="date" id="tkFin"></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitPlanning('${projectId}')">Ajouter</button></div>
  `);
};
window.submitPlanning = async function(projectId){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const nom = $("#tkNom").value.trim();
  if(!nom){ toast("Le nom de la tâche est requis", true); return; }
  const planning = [...(pr.planning||[]), {nom, responsable:$("#tkResp").value.trim(), statut:$("#tkStatut").value, dateDebut:$("#tkDebut").value, dateFin:$("#tkFin").value}];
  await updateDoc(doc(db,"projects",projectId), {planning});
  closeModal(); toast("Tâche ajoutée ✓");
};

// -------------------------------------------------------------
// TRAVAUX (checklist de construction avec % avancement)
// -------------------------------------------------------------
const TRAVAUX_TEMPLATE = ["Installation chantier","Terrassement","Fondations / dalle","Structure & maçonnerie","Cuves & tuyauterie","Tests d'étanchéité","Électricité & mise à la terre","Sécurité incendie","Auvent / enseigne / totem","Aménagement extérieur & voirie"];
function renderProjectTravaux(pr){
  const travaux = pr.travaux && pr.travaux.length ? pr.travaux : null;
  if(!travaux){
    return `<div class="card"><p style="font-size:13px;color:var(--muted);margin-bottom:12px;">Initialisez la checklist de construction standard pour ce projet.</p>
      <button class="btn primary sm" onclick="initTravaux('${pr.id}')">Initialiser la checklist chantier</button></div>`;
  }
  const avgAvance = Math.round(travaux.reduce((s,t)=>s+(Number(t.avancement)||0),0)/travaux.length);
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0;">Avancement global des travaux</h3><strong>${avgAvance}%</strong>
      </div>
      <div class="progress-track" style="height:10px;"><div class="progress-fill" style="width:${avgAvance}%"></div></div>
    </div>
    <div class="card">${travaux.map((t,i)=>`
      <div style="padding:10px 0;border-bottom:1px solid var(--line);">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <strong style="font-size:13.5px;">${t.nom}</strong>
          <select onchange="updateTravauxStatut('${pr.id}',${i},this.value)" style="font-size:12px;padding:5px 8px;border-radius:7px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
            ${["Non commencé","En cours","Terminé","Bloqué"].map(s=>`<option ${s===t.statut?'selected':''}>${s}</option>`).join("")}
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
          <input type="range" min="0" max="100" value="${t.avancement||0}" oninput="this.nextElementSibling.textContent=this.value+'%'" onchange="updateTravauxAvancement('${pr.id}',${i},this.value)" style="flex:1;">
          <span style="font-size:11.5px;width:34px;color:var(--muted);">${t.avancement||0}%</span>
        </div>
      </div>`).join("")}</div>
  `;
}
window.initTravaux = async function(projectId){
  const travaux = TRAVAUX_TEMPLATE.map(nom=>({nom, statut:"Non commencé", avancement:0}));
  await updateDoc(doc(db,"projects",projectId), {travaux});
  toast("Checklist chantier initialisée ✓");
};
window.updateTravauxStatut = async function(projectId, i, val){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const travaux = JSON.parse(JSON.stringify(pr.travaux));
  travaux[i].statut = val;
  if(val==="Terminé") travaux[i].avancement = 100;
  await updateDoc(doc(db,"projects",projectId), {travaux});
};
window.updateTravauxAvancement = async function(projectId, i, val){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const travaux = JSON.parse(JSON.stringify(pr.travaux));
  travaux[i].avancement = Number(val);
  if(Number(val)>=100) travaux[i].statut = "Terminé";
  await updateDoc(doc(db,"projects",projectId), {travaux});
};

// -------------------------------------------------------------
// ACHATS — cycle complet : Besoins → Devis/Pro forma → BC → Factures → Garanties
// -------------------------------------------------------------
const BC_STATUTS = ["Brouillon","En validation","Validé","Envoyé au fournisseur","Signé","Partiellement exécuté","Exécuté","Annulé"];
const ACHATS_SUBTABS = [
  {id:"besoins", label:"Besoins"},
  {id:"bc", label:"Bons de commande"},
  {id:"proforma", label:"Pro forma"},
  {id:"factures", label:"Factures"},
  {id:"garanties", label:"Garanties"}
];
function renderProjectAchats(pr){
  const sub = STATE.achatsSubtab || "bc";
  const subnav = `<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:14px;">
    ${ACHATS_SUBTABS.map(t=>`<div onclick="setAchatsSubtab('${t.id}')" class="pill ${sub===t.id?'bad':'neutral'}" style="cursor:pointer;white-space:nowrap;flex-shrink:0;">${t.label}</div>`).join("")}
  </div>`;
  let body = "";
  if(sub==="besoins") body = renderBesoins(pr);
  else if(sub==="bc") body = renderBCSection(pr);
  else if(sub==="proforma") body = renderProforma(pr);
  else if(sub==="factures") body = renderFactures(pr);
  else if(sub==="garanties") body = renderGaranties(pr);
  return subnav + body;
}
window.setAchatsSubtab = function(id){ STATE.achatsSubtab = id; render(); };

// -- Demandes de besoin --
function renderBesoins(pr){
  const list = pr.besoins || [];
  return `<div class="section-title"><div></div><button class="btn primary sm" onclick="openBesoinModal('${pr.id}')">${icon('plus')} Nouvelle demande</button></div>
  ${list.length===0 ? emptyState("projects","Aucune demande de besoin","Enregistrez ici ce qui doit être acheté avant de consulter les fournisseurs.") :
  `<div class="card">${list.map((b,i)=>`
    <div style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);">
      <div><strong style="font-size:13.5px;">${b.article}</strong><br><span style="font-size:11.5px;color:var(--muted)">Qté ${b.quantite} · Demandé par ${b.demandeur||'—'} le ${b.date}</span></div>
      <select onchange="updateBesoinStatut('${pr.id}',${i},this.value)" style="font-size:11.5px;padding:4px 6px;border-radius:6px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);height:fit-content;">
        ${["Identifié","Fournisseur contacté","Devis reçu","Validé","Clôturé"].map(s=>`<option ${s===b.statut?'selected':''}>${s}</option>`).join("")}
      </select>
    </div>`).join("")}</div>`}`;
}
window.openBesoinModal = function(projectId){
  openModal(`<div class="modal-head"><h3>Nouvelle demande de besoin</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Article / besoin</label><input id="bsArticle" placeholder="Cuves 20m³"></div>
    <div class="form-grid">
      <div class="f-field"><label>Quantité</label><input type="number" id="bsQte" value="1"></div>
      <div class="f-field"><label>Demandeur</label><input id="bsDemandeur"></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitBesoin('${projectId}')">Enregistrer</button></div>`);
};
window.submitBesoin = async function(projectId){
  const article = $("#bsArticle").value.trim();
  if(!article){ toast("L'article est requis", true); return; }
  const pr = STATE.projects.find(p=>p.id===projectId);
  const besoins = [...(pr.besoins||[]), {article, quantite:Number($("#bsQte").value||1), demandeur:$("#bsDemandeur").value.trim(), date:todayISO(), statut:"Identifié"}];
  await updateDoc(doc(db,"projects",projectId), {besoins});
  closeModal(); toast("Demande enregistrée ✓");
};
window.updateBesoinStatut = async function(projectId, i, val){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const besoins = JSON.parse(JSON.stringify(pr.besoins));
  besoins[i].statut = val;
  await updateDoc(doc(db,"projects",projectId), {besoins});
};

// -- Bons de commande --
function renderBCSection(pr){
  const bcs = pr.bonsCommande || [];
  return `<div class="section-title"><div></div><button class="btn primary sm" onclick="openBCModal('${pr.id}')">${icon('plus')} Nouveau bon de commande</button></div>
    ${bcs.length===0 ? emptyState("projects","Aucun bon de commande","Créez le premier bon de commande de ce projet.") :
    `<div class="card">${renderBCTable(bcs, pr.id)}</div>`}`;
}
function renderBCTable(bcs, projectId){
  return `<table><thead><tr><th>N°</th><th>Fournisseur</th><th>Montant TTC</th><th>Statut</th></tr></thead><tbody>
    ${bcs.map((b,i)=>`<tr>
      <td class="mono">${b.numero||'—'}</td>
      <td>${b.fournisseur}</td>
      <td>${fmt(b.montantTTC)} ${b.devise||'FCFA'}</td>
      <td>
        <select onchange="updateBCStatut('${projectId}',${i},this.value)" style="font-size:11.5px;padding:4px 6px;border-radius:6px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
          ${BC_STATUTS.map(s=>`<option ${s===b.statut?'selected':''}>${s}</option>`).join("")}
        </select>
      </td>
    </tr>`).join("")}
  </tbody></table>`;
}
window.openBCModal = function(projectId){
  const fournisseurOptions = STATE.suppliers.map(s=>`<option>${esc(s.nom)}</option>`).join("");
  openModal(`
    <div class="modal-head"><h3>Nouveau bon de commande</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div class="f-field"><label>Numéro BC</label><input id="bcNum" placeholder="BC-2026-001"></div>
      <div class="f-field"><label>Fournisseur</label><input id="bcFourn" list="bcFournList" placeholder="Nom du fournisseur"><datalist id="bcFournList">${fournisseurOptions}</datalist></div>
      <div class="f-field"><label>Montant HT</label><input type="number" id="bcHT" value="0"></div>
      <div class="f-field"><label>Montant TTC</label><input type="number" id="bcTTC" value="0"></div>
      <div class="f-field"><label>Devise</label><input id="bcDevise" value="FCFA"></div>
      <div class="f-field"><label>Délai de livraison</label><input id="bcDelai" placeholder="30 jours"></div>
      <div class="f-field"><label>Date prévue</label><input type="date" id="bcDate"></div>
      <div class="f-field"><label>Statut</label><select id="bcStatut">${BC_STATUTS.map(s=>`<option>${s}</option>`).join("")}</select></div>
      <div class="f-field full"><label>Articles</label><textarea id="bcArticles" placeholder="Détail des articles, quantités"></textarea></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitBC('${projectId}')">Créer</button></div>
  `);
};
window.submitBC = async function(projectId){
  const fournisseur = $("#bcFourn").value.trim();
  if(!fournisseur){ toast("Le fournisseur est requis", true); return; }
  const pr = STATE.projects.find(p=>p.id===projectId);
  const bc = {
    numero:$("#bcNum").value.trim(), fournisseur, montantHT:Number($("#bcHT").value||0),
    montantTTC:Number($("#bcTTC").value||0), devise:$("#bcDevise").value.trim()||"FCFA",
    delaiLivraison:$("#bcDelai").value.trim(), datePrevue:$("#bcDate").value,
    statut:$("#bcStatut").value, articles:$("#bcArticles").value.trim(), createdAt:todayISO()
  };
  const bonsCommande = [...(pr.bonsCommande||[]), bc];
  // Met aussi à jour le montant engagé du projet
  const montantEngage = (Number(pr.montantEngage)||0) + bc.montantTTC;
  await updateDoc(doc(db,"projects",projectId), {bonsCommande, montantEngage});
  logActivity(projectId, "Achats", `BC créé — ${bc.numero||fournisseur}`, "", `${fmt(bc.montantTTC)} ${bc.devise}`);
  closeModal(); toast("Bon de commande créé ✓");
};
window.updateBCStatut = async function(projectId, i, val){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const bonsCommande = JSON.parse(JSON.stringify(pr.bonsCommande));
  const ancien = bonsCommande[i].statut;
  bonsCommande[i].statut = val;
  await updateDoc(doc(db,"projects",projectId), {bonsCommande});
  logActivity(projectId, "Achats", `BC ${bonsCommande[i].numero||''} — statut`, ancien, val);
};

// -- Pro forma --
function renderProforma(pr){
  const list = pr.proforma || [];
  return `<div class="section-title"><div></div><button class="btn primary sm" onclick="openProformaModal('${pr.id}')">${icon('plus')} Nouvelle pro forma</button></div>
  ${list.length===0 ? emptyState("projects","Aucune pro forma","Enregistrez les factures pro forma reçues des fournisseurs.") :
  `<div class="card"><table><thead><tr><th>N°</th><th>Fournisseur</th><th>Montant</th><th>Validité</th></tr></thead><tbody>
    ${list.map(p=>`<tr><td class="mono">${p.numero||'—'}</td><td>${p.fournisseur}</td><td>${fmt(p.montant)} ${p.devise||'FCFA'}</td><td>${p.validite||'—'}</td></tr>`).join("")}
  </tbody></table></div>`}`;
}
window.openProformaModal = function(projectId){
  const fournisseurOptions = STATE.suppliers.map(s=>`<option>${esc(s.nom)}</option>`).join("");
  openModal(`<div class="modal-head"><h3>Nouvelle pro forma</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div class="f-field"><label>Numéro</label><input id="pfNum"></div>
      <div class="f-field"><label>Fournisseur</label><input id="pfFourn" list="pfFournList"><datalist id="pfFournList">${fournisseurOptions}</datalist></div>
      <div class="f-field"><label>Montant</label><input type="number" id="pfMontant" value="0"></div>
      <div class="f-field"><label>Devise</label><input id="pfDevise" value="FCFA"></div>
      <div class="f-field full"><label>Date de validité</label><input type="date" id="pfValidite"></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitProforma('${projectId}')">Enregistrer</button></div>`);
};
window.submitProforma = async function(projectId){
  const fournisseur = $("#pfFourn").value.trim();
  if(!fournisseur){ toast("Le fournisseur est requis", true); return; }
  const pr = STATE.projects.find(p=>p.id===projectId);
  const proforma = [...(pr.proforma||[]), {numero:$("#pfNum").value.trim(), fournisseur, montant:Number($("#pfMontant").value||0), devise:$("#pfDevise").value.trim()||"FCFA", validite:$("#pfValidite").value}];
  await updateDoc(doc(db,"projects",projectId), {proforma});
  closeModal(); toast("Pro forma enregistrée ✓");
};

// -- Factures --
function renderFactures(pr){
  const list = pr.factures || [];
  return `<div class="section-title"><div></div><button class="btn primary sm" onclick="openFactureModal('${pr.id}')">${icon('plus')} Nouvelle facture</button></div>
  ${list.length===0 ? emptyState("projects","Aucune facture","Enregistrez les factures reçues des fournisseurs.") :
  `<div class="card">${list.map((f,i)=>`
    <div style="padding:9px 0;border-bottom:1px solid var(--line);">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
        <strong style="font-size:13.5px;">${f.numero||'Facture'} — ${f.fournisseur}</strong>
        <select onchange="updateFactureStatut('${pr.id}',${i},this.value)" style="font-size:11.5px;padding:4px 6px;border-radius:6px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
          ${["À payer","Payée partiellement","Payée"].map(s=>`<option ${s===f.statut?'selected':''}>${s}</option>`).join("")}
        </select>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:3px;">${fmt(f.montant)} ${f.devise||'FCFA'} · échéance ${f.echeance||'—'}</div>
    </div>`).join("")}</div>`}`;
}
window.openFactureModal = function(projectId){
  const fournisseurOptions = STATE.suppliers.map(s=>`<option>${esc(s.nom)}</option>`).join("");
  openModal(`<div class="modal-head"><h3>Nouvelle facture</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div class="f-field"><label>Numéro</label><input id="fcNum"></div>
      <div class="f-field"><label>Fournisseur</label><input id="fcFourn" list="fcFournList"><datalist id="fcFournList">${fournisseurOptions}</datalist></div>
      <div class="f-field"><label>Montant</label><input type="number" id="fcMontant" value="0"></div>
      <div class="f-field"><label>Devise</label><input id="fcDevise" value="FCFA"></div>
      <div class="f-field"><label>Échéance</label><input type="date" id="fcEcheance"></div>
      <div class="f-field"><label>Statut</label><select id="fcStatut"><option>À payer</option><option>Payée partiellement</option><option>Payée</option></select></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitFacture('${projectId}')">Enregistrer</button></div>`);
};
window.submitFacture = async function(projectId){
  const fournisseur = $("#fcFourn").value.trim();
  if(!fournisseur){ toast("Le fournisseur est requis", true); return; }
  const pr = STATE.projects.find(p=>p.id===projectId);
  const factures = [...(pr.factures||[]), {numero:$("#fcNum").value.trim(), fournisseur, montant:Number($("#fcMontant").value||0), devise:$("#fcDevise").value.trim()||"FCFA", echeance:$("#fcEcheance").value, statut:$("#fcStatut").value}];
  await updateDoc(doc(db,"projects",projectId), {factures});
  closeModal(); toast("Facture enregistrée ✓");
};
window.updateFactureStatut = async function(projectId, i, val){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const factures = JSON.parse(JSON.stringify(pr.factures));
  factures[i].statut = val;
  await updateDoc(doc(db,"projects",projectId), {factures});
};

// -- Garanties --
function renderGaranties(pr){
  const list = pr.garanties || [];
  return `<div class="section-title"><div></div><button class="btn primary sm" onclick="openGarantieModal('${pr.id}')">${icon('plus')} Nouvelle garantie</button></div>
  ${list.length===0 ? emptyState("projects","Aucune garantie enregistrée","Enregistrez les garanties fournisseurs sur les équipements.") :
  `<div class="card">${list.map(g=>{
    const expiree = g.dateFin && new Date(g.dateFin) < new Date();
    return `<div style="padding:9px 0;border-bottom:1px solid var(--line);">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
        <strong style="font-size:13.5px;">${g.equipement}</strong>
        <span class="pill ${expiree?'bad':'ok'}">${expiree?'Expirée':'Active'}</span>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:3px;">${g.fournisseur||'—'} · du ${g.dateDebut||'?'} au ${g.dateFin||'?'}</div>
      ${g.conditions?`<div style="font-size:12px;margin-top:4px;">${g.conditions}</div>`:""}
    </div>`;
  }).join("")}</div>`}`;
}
window.openGarantieModal = function(projectId){
  openModal(`<div class="modal-head"><h3>Nouvelle garantie</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Équipement</label><input id="grEquip" placeholder="Cuves, pompes…"></div>
    <div class="form-grid">
      <div class="f-field"><label>Fournisseur</label><input id="grFourn"></div>
      <div class="f-field"><label>Début</label><input type="date" id="grDebut"></div>
      <div class="f-field"><label>Fin</label><input type="date" id="grFin"></div>
      <div class="f-field full"><label>Conditions</label><textarea id="grCond"></textarea></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitGarantie('${projectId}')">Enregistrer</button></div>`);
};
window.submitGarantie = async function(projectId){
  const equipement = $("#grEquip").value.trim();
  if(!equipement){ toast("L'équipement est requis", true); return; }
  const pr = STATE.projects.find(p=>p.id===projectId);
  const garanties = [...(pr.garanties||[]), {equipement, fournisseur:$("#grFourn").value.trim(), dateDebut:$("#grDebut").value, dateFin:$("#grFin").value, conditions:$("#grCond").value.trim()}];
  await updateDoc(doc(db,"projects",projectId), {garanties});
  closeModal(); toast("Garantie enregistrée ✓");
};

// -------------------------------------------------------------
// ÉQUIPEMENTS
// -------------------------------------------------------------
function renderProjectEquipements(pr){
  const eqs = pr.equipements || [];
  return `
    <div class="section-title">
      <div></div>
      <div style="display:flex;gap:8px;">
        <button class="btn gold sm" onclick="openEquipCatalogModal('${pr.id}')">${icon('plus')} Depuis le catalogue</button>
        <button class="btn primary sm" onclick="openEquipModal('${pr.id}')">${icon('plus')} Personnalisé</button>
      </div>
    </div>
    ${eqs.length===0 ? emptyState("projects","Aucun équipement","Ajoutez les équipements nécessaires : cuves, pompes, groupe électrogène…") :
    `<div class="card"><table><thead><tr><th>Équipement</th><th>Prévu</th><th>Commandé</th><th>Livré</th><th>Installé</th><th>Coût total</th><th>Statut</th><th></th></tr></thead><tbody>
      ${eqs.map((e,i)=>{
        let statut = "À commander";
        if(e.commande>=e.prevu && e.livre===0) statut="Commandé";
        if(e.livre>0 && e.livre<e.commande) statut="Livraison partielle";
        if(e.livre>=e.commande && e.commande>0) statut="Livré";
        if(e.installe>=e.prevu && e.prevu>0) statut="Installé";
        const cls = statut==="Installé"?"ok":statut==="Livraison partielle"?"warn":statut==="À commander"?"neutral":"info";
        const coutTotal = (Number(e.coutUnitaire)||0) * (Number(e.prevu)||0);
        return `<tr><td><strong>${e.nom}</strong><br><span style="font-size:11px;color:var(--muted)">${e.fournisseur||e.categorie||''}${e.datePrevueLivraison?` · prévu ${e.datePrevueLivraison}`:''}</span></td>
        <td><input type="number" value="${e.prevu}" onchange="updateEquipField('${pr.id}',${i},'prevu',Number(this.value))" style="width:52px;font-size:12px;padding:4px;border-radius:5px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);"></td>
        <td><input type="number" value="${e.commande}" onchange="updateEquipField('${pr.id}',${i},'commande',Number(this.value))" style="width:52px;font-size:12px;padding:4px;border-radius:5px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);"></td>
        <td><input type="number" value="${e.livre}" onchange="updateEquipField('${pr.id}',${i},'livre',Number(this.value))" style="width:52px;font-size:12px;padding:4px;border-radius:5px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);"></td>
        <td><input type="number" value="${e.installe}" onchange="updateEquipField('${pr.id}',${i},'installe',Number(this.value))" style="width:52px;font-size:12px;padding:4px;border-radius:5px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);"></td>
        <td style="white-space:nowrap;">${fmt(coutTotal)}</td>
        <td><span class="pill ${cls}">${statut}</span></td>
        <td><button class="btn icon sm" onclick="openEquipEditModal('${pr.id}',${i})">✎</button></td></tr>`;
      }).join("")}
    </tbody></table></div>`}
  `;
}
window.openEquipEditModal = function(projectId, i){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const e = pr.equipements[i];
  openModal(`
    <div class="modal-head"><h3>Détails — ${esc(e.nom)}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div class="f-field full"><label>Fournisseur</label><input id="eeFourn" value="${esc(e.fournisseur||'')}"></div>
      <div class="f-field"><label>Coût unitaire (FCFA)</label><input type="number" id="eeCout" value="${e.coutUnitaire||0}"></div>
      <div class="f-field"><label>Coût total (auto)</label><input type="text" value="${fmt((Number(e.coutUnitaire)||0)*(Number(e.prevu)||0))}" disabled></div>
      <div class="f-field"><label>Date prévue de livraison</label><input type="date" id="eeDatePrevue" value="${e.datePrevueLivraison||''}"></div>
      <div class="f-field"><label>Date réelle de livraison</label><input type="date" id="eeDateReelle" value="${e.dateReelleLivraison||''}"></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitEquipEdit('${projectId}',${i})">Enregistrer</button></div>
  `);
};
window.submitEquipEdit = async function(projectId, i){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const equipements = JSON.parse(JSON.stringify(pr.equipements));
  equipements[i].fournisseur = $("#eeFourn").value.trim();
  equipements[i].coutUnitaire = Number($("#eeCout").value||0);
  equipements[i].datePrevueLivraison = $("#eeDatePrevue").value;
  equipements[i].dateReelleLivraison = $("#eeDateReelle").value;
  await updateDoc(doc(db,"projects",projectId), {equipements});
  closeModal(); toast("Équipement mis à jour ✓");
};
window.openEquipCatalogModal = function(projectId){
  openModal(`
    <div class="modal-head"><h3>Ajouter depuis le catalogue</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <p style="font-size:12.5px;color:var(--muted);margin:0 0 12px;">Sélectionne les équipements à ajouter (quantité prévue = 1 par défaut, modifiable ensuite).</p>
    <div style="max-height:50vh;overflow-y:auto;">
      ${EQUIPEMENT_CATALOG.map((e,i)=>`
        <label style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13.5px;">
          <input type="checkbox" class="eq-cat-check" value="${esc(e)}" style="width:17px;height:17px;">${e}
        </label>`).join("")}
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitEquipCatalog('${projectId}')">Ajouter la sélection</button></div>
  `);
};
window.submitEquipCatalog = async function(projectId){
  const checked = $$(".eq-cat-check:checked").map(c=>c.value);
  if(checked.length===0){ toast("Sélectionne au moins un équipement", true); return; }
  const pr = STATE.projects.find(p=>p.id===projectId);
  const nouveaux = checked.map(nom=>({nom, categorie:"", fournisseur:"", prevu:1, commande:0, livre:0, installe:0, coutUnitaire:0}));
  const equipements = [...(pr.equipements||[]), ...nouveaux];
  await updateDoc(doc(db,"projects",projectId), {equipements});
  closeModal(); toast(`${checked.length} équipement(s) ajouté(s) ✓`);
};
window.updateEquipField = async function(projectId, i, field, val){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const equipements = JSON.parse(JSON.stringify(pr.equipements));
  equipements[i][field] = val;
  await updateDoc(doc(db,"projects",projectId), {equipements});
};
window.openEquipModal = function(projectId){
  openModal(`
    <div class="modal-head"><h3>Équipement personnalisé</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div class="f-field full"><label>Nom de l'équipement</label><input id="eqNom" placeholder="Cuves 20m³"></div>
      <div class="f-field"><label>Catégorie</label><input id="eqCat" placeholder="Cuves, pompes, électricité…"></div>
      <div class="f-field"><label>Fournisseur</label><input id="eqFourn"></div>
      <div class="f-field"><label>Quantité prévue</label><input type="number" id="eqPrevu" value="1"></div>
      <div class="f-field"><label>Commandée</label><input type="number" id="eqCommande" value="0"></div>
      <div class="f-field"><label>Livrée</label><input type="number" id="eqLivre" value="0"></div>
      <div class="f-field"><label>Installée</label><input type="number" id="eqInstalle" value="0"></div>
      <div class="f-field"><label>Coût unitaire (FCFA)</label><input type="number" id="eqCout" value="0"></div>
      <div class="f-field"><label>Date prévue de livraison</label><input type="date" id="eqDatePrevue"></div>
      <div class="f-field"><label>Date réelle de livraison</label><input type="date" id="eqDateReelle"></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitEquip('${projectId}')">Ajouter</button></div>
  `);
};
window.submitEquip = async function(projectId){
  const nom = $("#eqNom").value.trim();
  if(!nom){ toast("Le nom de l'équipement est requis", true); return; }
  const pr = STATE.projects.find(p=>p.id===projectId);
  const equipements = [...(pr.equipements||[]), {
    nom, categorie:$("#eqCat").value.trim(), fournisseur:$("#eqFourn").value.trim(),
    prevu:Number($("#eqPrevu").value||0), commande:Number($("#eqCommande").value||0),
    livre:Number($("#eqLivre").value||0), installe:Number($("#eqInstalle").value||0),
    coutUnitaire:Number($("#eqCout").value||0),
    datePrevueLivraison:$("#eqDatePrevue").value, dateReelleLivraison:$("#eqDateReelle").value
  }];
  await updateDoc(doc(db,"projects",projectId), {equipements});
  closeModal(); toast("Équipement ajouté ✓");
};

// -------------------------------------------------------------
// LIVRAISONS
// -------------------------------------------------------------
const LIVRAISON_STATUTS = ["À venir","En transit","Livré","Livraison partielle","Retard","Annulé"];
function renderProjectLivraisons(pr){
  const livs = pr.livraisons || [];
  return `
    <div class="section-title"><div></div><button class="btn primary sm" onclick="openLivraisonModal('${pr.id}')">${icon('plus')} Nouvelle livraison</button></div>
    ${livs.length===0 ? emptyState("projects","Aucune livraison enregistrée","Suivez ici les livraisons attendues et reçues.") :
    `<div class="card">${livs.map((l,i)=>`
      <div style="padding:10px 0;border-bottom:1px solid var(--line);">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <strong style="font-size:13.5px;">${l.equipement}</strong>
          <select onchange="updateLivraisonStatut('${pr.id}',${i},this.value)" style="font-size:11.5px;padding:4px 6px;border-radius:6px;border:1px solid var(--line);background:var(--paper-3);color:var(--text);">
            ${LIVRAISON_STATUTS.map(s=>`<option ${s===l.statut?'selected':''}>${s}</option>`).join("")}
          </select>
        </div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:3px;">${l.fournisseur||'—'} · Qté ${l.qteLivree||0}/${l.qteCommandee||0} · prévu ${l.datePrevue||'?'}</div>
      </div>`).join("")}</div>`}
  `;
}
window.openLivraisonModal = function(projectId){
  openModal(`
    <div class="modal-head"><h3>Nouvelle livraison</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div class="f-field full"><label>Équipement / article</label><input id="lvEquip" placeholder="Pompes distributrices"></div>
      <div class="f-field"><label>Fournisseur</label><input id="lvFourn"></div>
      <div class="f-field"><label>N° BL</label><input id="lvBL"></div>
      <div class="f-field"><label>Quantité commandée</label><input type="number" id="lvQteCmd" value="0"></div>
      <div class="f-field"><label>Quantité livrée</label><input type="number" id="lvQteLiv" value="0"></div>
      <div class="f-field"><label>Date prévue</label><input type="date" id="lvDatePrevue"></div>
      <div class="f-field"><label>Statut</label><select id="lvStatut">${LIVRAISON_STATUTS.map(s=>`<option>${s}</option>`).join("")}</select></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitLivraison('${projectId}')">Ajouter</button></div>
  `);
};
window.submitLivraison = async function(projectId){
  const equipement = $("#lvEquip").value.trim();
  if(!equipement){ toast("L'équipement est requis", true); return; }
  const pr = STATE.projects.find(p=>p.id===projectId);
  const livraisons = [...(pr.livraisons||[]), {
    equipement, fournisseur:$("#lvFourn").value.trim(), numeroBL:$("#lvBL").value.trim(),
    qteCommandee:Number($("#lvQteCmd").value||0), qteLivree:Number($("#lvQteLiv").value||0),
    datePrevue:$("#lvDatePrevue").value, statut:$("#lvStatut").value
  }];
  await updateDoc(doc(db,"projects",projectId), {livraisons});
  closeModal(); toast("Livraison ajoutée ✓");
};
window.updateLivraisonStatut = async function(projectId, i, val){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const livraisons = JSON.parse(JSON.stringify(pr.livraisons));
  livraisons[i].statut = val;
  await updateDoc(doc(db,"projects",projectId), {livraisons});
};

// -------------------------------------------------------------
// RISQUES & BLOCAGES
// -------------------------------------------------------------
function renderProjectRisques(pr){
  const risques = pr.risques || [];
  return `
    <div class="section-title"><div></div><button class="btn primary sm" onclick="openRisqueModal('${pr.id}')">${icon('plus')} Signaler un risque</button></div>
    ${risques.length===0 ? emptyState("projects","Aucun risque signalé","Enregistrez ici les blocages et problèmes rencontrés.") :
    `<div class="card">${risques.map((r,i)=>`
      <div style="padding:10px 0;border-bottom:1px solid var(--line);">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <strong style="font-size:13.5px;">${r.probleme}</strong>
          <span class="pill ${r.criticite==='Élevée'?'bad':r.criticite==='Moyenne'?'warn':'neutral'}">${r.criticite}</span>
        </div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:3px;">${r.categorie||''} · Responsable : ${r.responsable||'—'} · Échéance : ${r.dateLimite||'—'}</div>
        ${r.description?`<div style="font-size:12.5px;margin-top:5px;">${r.description}</div>`:""}
      </div>`).join("")}</div>`}
  `;
}
window.openRisqueModal = function(projectId){
  openModal(`
    <div class="modal-head"><h3>Signaler un risque</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Problème</label><input id="rkProbleme" placeholder="Autorisation environnementale non obtenue"></div>
    <div class="form-grid">
      <div class="f-field"><label>Catégorie</label><input id="rkCat" placeholder="Administratif, technique…"></div>
      <div class="f-field"><label>Criticité</label><select id="rkCrit"><option>Faible</option><option>Moyenne</option><option>Élevée</option></select></div>
      <div class="f-field"><label>Responsable</label><input id="rkResp"></div>
      <div class="f-field"><label>Date limite</label><input type="date" id="rkDate"></div>
      <div class="f-field full"><label>Description / action corrective</label><textarea id="rkDesc"></textarea></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitRisque('${projectId}')">Enregistrer</button></div>
  `);
};
window.submitRisque = async function(projectId){
  const probleme = $("#rkProbleme").value.trim();
  if(!probleme){ toast("Le problème est requis", true); return; }
  const pr = STATE.projects.find(p=>p.id===projectId);
  const risques = [...(pr.risques||[]), {
    probleme, categorie:$("#rkCat").value.trim(), criticite:$("#rkCrit").value,
    responsable:$("#rkResp").value.trim(), dateLimite:$("#rkDate").value, description:$("#rkDesc").value.trim(), statut:"Ouvert"
  }];
  await updateDoc(doc(db,"projects",projectId), {risques});
  closeModal(); toast("Risque enregistré ✓");
};

function esc(s){ return (s||"").replace(/"/g,'&quot;'); }

// Normalise un numéro camerounais pour tel:/wa.me (accepte 6XXXXXXXX, 06XX, +237..., 237...)
function normalizePhone(raw){
  if(!raw) return "";
  let n = String(raw).replace(/[\s.\-()]/g,"");
  if(n.startsWith("+")) n = n.slice(1);
  if(n.startsWith("00")) n = n.slice(2);
  if(n.startsWith("0")) n = "237" + n.slice(1);
  if(!n.startsWith("237") && n.length===9) n = "237" + n;
  return n;
}
function telLink(raw){
  const n = normalizePhone(raw);
  return n ? `tel:+${n}` : "";
}
function waLink(raw, message){
  const n = normalizePhone(raw);
  const txt = encodeURIComponent(message||"");
  return n ? `https://wa.me/${n}?text=${txt}` : `https://wa.me/?text=${txt}`;
}
function contactButtons(phone, waMessage){
  if(!phone) return `<span style="font-size:11px;color:var(--muted);">Aucun contact</span>`;
  return `<a href="${telLink(phone)}" class="btn sm icon" style="text-decoration:none;" title="Appeler">📞</a>
    <a href="${waLink(phone, waMessage||'')}" target="_blank" class="btn sm icon" style="text-decoration:none;" title="WhatsApp">💬</a>`;
}


// -------------------------------------------------------------
// FOURNISSEURS
// -------------------------------------------------------------
function renderFournisseurs(){
  const list = STATE.suppliers;
  return `
    <div class="section-title"><div></div><button class="btn primary" onclick="openSupplierModal()">${icon('plus')} Nouveau fournisseur</button></div>
    ${list.length===0 ? emptyState("projects","Aucun fournisseur","Ajoutez vos fournisseurs et prestataires : construction, cuves, pompes, électricité...") :
    `<div class="card">${list.map(s=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid var(--line);gap:10px;">
        <div style="min-width:0;">
          <strong style="font-size:13.5px;">${s.nom}</strong> <span class="tag-fournisseur">${s.categorie}</span><br>
          <span style="font-size:11.5px;color:var(--muted)">${s.personneContact?s.personneContact+' · ':''}${s.pays||''}</span>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">${contactButtons(s.telephone, `Bonjour ${s.personneContact||''}, ici ${COMPANY.nom}.`)}</div>
      </div>`).join("")}</div>`}
  `;
}
window.openSupplierModal = function(){
  openModal(`
    <div class="modal-head"><h3>Nouveau fournisseur</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div class="f-field full"><label>Nom de l'entreprise *</label><input id="sNom" placeholder="Nom du fournisseur"></div>
      <div class="f-field"><label>Catégorie</label>
        <select id="sCat">${["Construction","Électricité","Plomberie","Cuves","Pompes","Génie civil","Architecture","Environnement","Sécurité","Informatique","Mobilier","Transport","Installation","Maintenance","Autres"].map(c=>`<option>${c}</option>`).join("")}</select>
      </div>
      <div class="f-field"><label>Pays</label><input id="sPays" placeholder="Cameroun"></div>
      <div class="f-field"><label>Nom du contact</label><input id="sPersonne" placeholder="Nom et prénom"></div>
      <div class="f-field"><label>Téléphone</label><input id="sTel" placeholder="6XX XXX XXX" type="tel"></div>
      <div class="f-field full"><label>Conditions de paiement</label><input id="sCond" placeholder="30% avance, solde à livraison"></div>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitSupplier()">Créer</button></div>
  `);
};
window.submitSupplier = async function(){
  const nom = $("#sNom").value.trim();
  if(!nom){ toast("Le nom est requis", true); return; }
  await addDoc(collection(db,"suppliers"), {
    nom, categorie:$("#sCat").value, pays:$("#sPays").value.trim(),
    personneContact:$("#sPersonne").value.trim(), telephone:$("#sTel").value.trim(),
    conditions:$("#sCond").value.trim(), createdAt:serverTimestamp()
  });
  closeModal(); toast("Fournisseur ajouté ✓");
};

// -------------------------------------------------------------
// RAPPORTS — papier en-tête, contenu détaillé, export et import
// -------------------------------------------------------------
function renderRapports(){
  if(STATE.projects.length===0) return emptyState("projects","Aucun rapport disponible","Créez un projet pour générer des rapports.");
  return STATE.projects.map(pr=>{
    const rapports = pr.rapportsDocs || [];
    return `<div class="card">
      <div class="section-title"><h3 style="margin:0;">${pr.nom}</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn gold sm" onclick="printProjectReport('${pr.id}')">📄 Générer le rapport</button>
        </div>
      </div>
      ${infoRow("Statut", pr.statut)}
      ${infoRow("Budget", fmtXAF(pr.budgetInitial))}
      ${infoRow("Engagé / Payé", `${fmt(pr.montantEngage)} / ${fmt(pr.montantPaye)}`)}
      <div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px;">
        <div class="section-title"><h4 style="margin:0;font-size:12.5px;color:var(--muted);text-transform:uppercase;">Documents de rapport importés</h4>
          <button class="btn sm ghost" onclick="openImportRapportModal('${pr.id}')">${icon('plus')} Importer</button>
        </div>
        ${rapports.length===0 ? `<p style="font-size:12px;color:var(--muted);">Aucun rapport importé.</p>` :
          rapports.map(r=>`<div style="padding:6px 0;font-size:12.5px;"><a class="doc-link" href="${r.fileUrl}" download="${esc(r.fileName)}" target="_blank">📎 ${r.nom} — ${r.fileName}</a></div>`).join("")}
      </div>
    </div>`;
  }).join("");
}

window.openImportRapportModal = function(projectId){
  openModal(`<div class="modal-head"><h3>Importer un rapport</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Nom du rapport</label><input id="rpNom" placeholder="Rapport mensuel — août 2026"></div>
    <div class="f-field"><label>Fichier — PDF, Word, Excel (max ~700 Ko)</label><input type="file" id="rpFile" accept=".pdf,.doc,.docx,.xls,.xlsx"></div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" id="rpSubmitBtn" onclick="submitImportRapport('${projectId}')">Importer</button></div>`);
};
window.submitImportRapport = async function(projectId){
  const nom = $("#rpNom").value.trim();
  const file = $("#rpFile").files[0];
  if(!nom || !file){ toast("Nom et fichier requis", true); return; }
  if(file.size > 720000){ toast("Fichier trop volumineux (max ~700 Ko)", true); return; }
  const btn = $("#rpSubmitBtn"); btn.disabled = true; btn.textContent = "Import…";
  try{
    const fileUrl = await fileToBase64(file);
    const pr = STATE.projects.find(p=>p.id===projectId);
    const rapportsDocs = [...(pr.rapportsDocs||[]), {nom, fileName:file.name, fileUrl, date:todayISO()}];
    await updateDoc(doc(db,"projects",projectId), {rapportsDocs});
    closeModal(); toast("Rapport importé ✓");
  }catch(e){ toast("Erreur : "+e.message, true); btn.disabled=false; btn.textContent="Importer"; }
};

// Génère un rapport complet avec papier en-tête et lance l'impression / export PDF
window.printProjectReport = function(projectId){
  const pr = STATE.projects.find(p=>p.id===projectId);
  if(!pr) return;
  const idx = PROJECT_STATUTS.indexOf(pr.statut);
  const avance = Math.round(((idx+1)/PROJECT_STATUTS.length)*100);
  const phaseChecklists = pr.phaseChecklists || freshPhaseChecklists();

  const phasesHtml = PROJECT_STATUTS.map(phase=>{
    let done=0, total=0;
    if(PHASE_ROUTE_TAB[phase]==="achats"){ const bcs=pr.bonsCommande||[]; total=bcs.length; done=bcs.filter(b=>b.statut==="Exécuté").length; }
    else if(PHASE_ROUTE_TAB[phase]==="travaux"){ const t=pr.travaux||[]; total=t.length; done=t.filter(x=>x.statut==="Terminé").length; }
    else if(PHASE_ROUTE_TAB[phase]==="equipements"){ const e=pr.equipements||[]; total=e.length; done=e.filter(x=>x.installe>=x.prevu && x.prevu>0).length; }
    else{ const items=phaseChecklists[phase]||[]; total=items.length; done = (PHASE_ITEM_MODE[phase]==="document") ? items.filter(i=>i.valide==="Oui").length : items.filter(i=>i.statut==="Terminé").length; }
    const pct = total ? Math.round(done/total*100) : 0;
    return `<div class="report-row"><span>${phase}${phase===pr.statut?' (phase actuelle)':''}</span><strong>${done}/${total} — ${pct}%</strong></div>`;
  }).join("");

  const bcs = pr.bonsCommande || [];
  const bcHtml = bcs.length===0 ? `<p style="font-size:12px;color:#888;">Aucun bon de commande.</p>` :
    bcs.map(b=>`<div class="report-row"><span>${b.numero||'—'} — ${b.fournisseur}</span><strong>${fmt(b.montantTTC)} ${b.devise||'FCFA'} · ${b.statut}</strong></div>`).join("");

  const fournisseursProjet = [...new Set(bcs.map(b=>b.fournisseur).filter(Boolean))];
  const fournisseursHtml = fournisseursProjet.length===0 ? `<p style="font-size:12px;color:#888;">Aucun fournisseur engagé.</p>` :
    fournisseursProjet.map(f=>`<div class="report-row"><span>${f}</span><strong>${bcs.filter(b=>b.fournisseur===f).length} BC</strong></div>`).join("");

  const livraisons = pr.livraisons || [];
  const livraisonsHtml = livraisons.length===0 ? `<p style="font-size:12px;color:#888;">Aucune livraison enregistrée.</p>` :
    livraisons.map(l=>`<div class="report-row"><span>${l.equipement} — ${l.fournisseur||'—'}</span><strong>${l.qteLivree||0}/${l.qteCommandee||0} · ${l.statut}</strong></div>`).join("");

  const planning = pr.planning || [];
  const planningHtml = planning.length===0 ? `<p style="font-size:12px;color:#888;">Aucune tâche planifiée.</p>` :
    planning.map(t=>`<div class="report-row"><span>${t.nom} — ${t.responsable||'—'}</span><strong>${t.dateDebut||'?'} → ${t.dateFin||'?'} · ${t.statut}</strong></div>`).join("");

  const travaux = pr.travaux || [];
  const travauxHtml = travaux.length===0 ? `<p style="font-size:12px;color:#888;">Checklist chantier non initialisée.</p>` :
    travaux.map(t=>`<div class="report-row"><span>${t.nom}</span><strong>${t.avancement||0}% · ${t.statut}</strong></div>`).join("");

  const risques = pr.risques || [];
  const risquesHtml = risques.length===0 ? `<p style="font-size:12px;color:#888;">Aucun risque signalé.</p>` :
    risques.map(r=>`<div class="report-row"><span>${r.probleme} (${r.categorie||'—'})</span><strong>${r.criticite}</strong></div>`).join("");

  const docs = pr.documents || [];
  const docsManquants = [];
  Object.entries(phaseChecklists).forEach(([phase, items])=> (items||[]).forEach(it=>{ if(it.valide!==undefined && it.valide!=="Oui" && it.requis==="Oui") docsManquants.push(`${it.label} (${phase})`); }));
  const docsHtml = docs.length===0 ? `<p style="font-size:12px;color:#888;">Aucun document.</p>` :
    docs.filter(d=>d.type!=="Photo").map(d=>`<div class="report-row"><span>${d.nom} (${d.type})</span><strong>${d.statut}</strong></div>`).join("");
  const docsManquantsHtml = docsManquants.length===0 ? `<p style="font-size:12px;color:#2E7D32;">Aucun document manquant.</p>` :
    `<p style="font-size:12px;color:#B01813;">${docsManquants.join(", ")}</p>`;

  const photos = docs.filter(d=>d.type==="Photo" && d.fileUrl);
  const photosHtml = photos.length===0 ? "" : `<div class="report-section"><h4>Photos (${photos.length})</h4>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">${photos.map(p=>`<img src="${p.fileUrl}" style="width:110px;height:110px;object-fit:cover;border-radius:6px;border:1px solid #ddd;">`).join("")}</div>
  </div>`;

  const alertsProjet = computeAlerts().filter(a=>a.text.startsWith(pr.nom));
  const alertsHtml = alertsProjet.length===0 ? `<p style="font-size:12px;color:#2E7D32;">Aucune alerte active.</p>` :
    alertsProjet.map(a=>`<div class="report-row"><span>${a.type}</span><strong>${a.text.replace(pr.nom+' — ','')}</strong></div>`).join("");

  const now = new Date();
  document.getElementById("printReportArea").innerHTML = `
    <div class="letterhead">
      <img src="assets/logo.jpeg" alt="logo">
      <div class="lh-info">
        <strong>${COMPANY.nom}</strong>
        ${COMPANY.bp} · ${COMPANY.rc} · ${COMPANY.nui}
      </div>
    </div>
    <h2 style="margin:0 0 4px;">Rapport de projet — ${pr.nom}</h2>
    <p style="font-size:11.5px;color:#666;margin:0 0 20px;">Généré le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')} · Code projet : ${pr.code||'—'}</p>

    <div class="report-section">
      <h4>Informations générales</h4>
      <div class="report-row"><span>Localisation</span><strong>${pr.ville||'—'}, ${pr.pays||'—'}</strong></div>
      <div class="report-row"><span>Responsable</span><strong>${pr.responsable||'—'}</strong></div>
      <div class="report-row"><span>Statut actuel</span><strong>${pr.statut} (${avance}% du parcours)</strong></div>
      <div class="report-row"><span>Date de lancement</span><strong>${pr.dateDebut||'—'}</strong></div>
      <div class="report-row"><span>Date de fin prévue</span><strong>${pr.dateFinPrevue||'—'}</strong></div>
    </div>

    <div class="report-section"><h4>Avancement par phase</h4>${phasesHtml}</div>
    <div class="report-section"><h4>Planning</h4>${planningHtml}</div>
    <div class="report-section"><h4>Travaux</h4>${travauxHtml}</div>

    <div class="report-section">
      <h4>Finance</h4>
      <div class="report-row"><span>Budget initial</span><strong>${fmtXAF(pr.budgetInitial)}</strong></div>
      <div class="report-row"><span>Montant engagé</span><strong>${fmtXAF(pr.montantEngage)}</strong></div>
      <div class="report-row"><span>Montant payé</span><strong>${fmtXAF(pr.montantPaye)}</strong></div>
      <div class="report-row"><span>Solde restant</span><strong>${fmtXAF((pr.montantEngage||0)-(pr.montantPaye||0))}</strong></div>
    </div>

    <div class="report-section"><h4>Fournisseurs</h4>${fournisseursHtml}</div>
    <div class="report-section"><h4>Bons de commande</h4>${bcHtml}</div>
    <div class="report-section"><h4>Livraisons</h4>${livraisonsHtml}</div>
    <div class="report-section"><h4>Documents manquants</h4>${docsManquantsHtml}</div>
    <div class="report-section"><h4>Documents</h4>${docsHtml}</div>
    ${photosHtml}
    <div class="report-section"><h4>Alertes</h4>${alertsHtml}</div>
    <div class="report-section"><h4>Risques & blocages</h4>${risquesHtml}</div>

    <div class="report-footer">${COMPANY.nom} — Document généré automatiquement par l'application de pilotage des projets.</div>
  `;
  document.getElementById("printReportArea").style.display = "block";
  setTimeout(()=>{ window.print(); document.getElementById("printReportArea").style.display = "none"; }, 100);
};

// -------------------------------------------------------------
// PARAMÈTRES (utilisateurs)
// -------------------------------------------------------------
let allUsers = [];
function renderParametres(){
  const isAdmin = ["admin","direction","daf"].includes(STATE.profile?.role);
  return `
    <div class="card">
      <h3>Mon profil</h3>
      ${infoRow("Nom", STATE.profile?.nom || "—")}
      ${infoRow("E-mail", STATE.user?.email || "—")}
      ${infoRow("Rôle", ROLES[STATE.profile?.role] || "—")}
    </div>
    ${isAdmin ? `
    <div class="card">
      <div class="section-title"><h3 style="margin:0">Utilisateurs</h3><button class="btn primary sm" onclick="openUserModal()">${icon('plus')} Ajouter</button></div>
      <div id="usersTableWrap">${renderUsersTable()}</div>
    </div>` : `<div class="card"><p style="font-size:13px;color:var(--muted)">Seul un administrateur peut gérer les utilisateurs.</p></div>`}
    <div class="card">
      <h3>À propos</h3>
      <p style="font-size:13px;color:var(--muted);">Alcom Petroleum — Application de pilotage des projets de construction et de mise en service de stations-service. Version MVP.</p>
    </div>
  `;
}
function renderUsersTable(){
  if(allUsers.length===0) return `<p style="font-size:13px;color:var(--muted)">Chargement…</p>`;
  return `<table><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Accès</th></tr></thead><tbody>
    ${allUsers.map(u=>{
      const full = ["admin","direction","daf"].includes(u.role);
      const acces = full ? "Tous les modules" : (u.modulesAutorises||[]).length ? `${u.modulesAutorises.length} module(s)` : "Tableau de bord seulement";
      return `<tr><td>${u.nom||'—'}</td><td>${u.email||'—'}</td><td><span class="pill info">${ROLES[u.role]||u.role}</span></td><td style="font-size:11.5px;color:var(--muted);">${acces} <button class="btn sm ghost" onclick="openEditUserModal('${u.id}')" style="margin-left:6px;">✎</button></td></tr>`;
    }).join("")}
  </tbody></table>`;
}
function moduleCheckboxes(selected){
  const modules = NAV_ITEMS.filter(it=>it.id!=="parametres");
  selected = selected || [];
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;max-height:200px;overflow-y:auto;padding:4px 0;">
    ${modules.map(it=>`<label style="display:flex;align-items:center;gap:5px;font-size:12px;background:var(--paper-3);padding:6px 9px;border-radius:8px;border:1px solid var(--line);cursor:pointer;">
      <input type="checkbox" value="${it.id}" ${selected.includes(it.id)?'checked':''} class="modChk"> ${it.label}
    </label>`).join("")}
  </div>`;
}
window.openUserModal = function(){
  openModal(`
    <div class="modal-head"><h3>Ajouter un utilisateur</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Nom complet</label><input id="uNom" placeholder="Nom et prénom"></div>
    <div class="f-field" style="margin-bottom:12px;"><label>E-mail</label><input id="uEmail" type="email" placeholder="prenom.nom@alcompetroleum.com"></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Mot de passe temporaire</label><input id="uPass" type="text" placeholder="Min. 6 caractères"></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Rôle</label>
      <select id="uRole" onchange="document.getElementById('uModulesWrap').style.display=(this.value==='admin'||this.value==='direction'||this.value==='daf')?'none':'block'">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${k==='consultation'?'selected':''}>${v}</option>`).join("")}</select>
    </div>
    <div id="uModulesWrap">
      <label style="display:block;font-size:11.5px;font-weight:600;color:var(--muted);margin-bottom:6px;">Modules accessibles (Administrateur, Direction et DAF ont automatiquement accès à tout)</label>
      ${moduleCheckboxes(["dashboard"])}
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitNewUser()">Créer le compte</button></div>
  `);
};
window.submitNewUser = async function(){
  const nom = $("#uNom").value.trim(), email = $("#uEmail").value.trim(), pass = $("#uPass").value, role = $("#uRole").value;
  if(!nom || !email || pass.length<6){ toast("Vérifiez les champs (mot de passe ≥ 6 caractères)", true); return; }
  const modulesAutorises = $$(".modChk").filter(c=>c.checked).map(c=>c.value);
  try{
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    await setDoc(doc(db,"users",cred.user.uid), {nom, email, role, actif:true, modulesAutorises, createdAt:serverTimestamp()});
    await signOut(secondaryAuth);
    closeModal(); toast("Utilisateur créé ✓");
  }catch(e){ toast("Erreur : "+e.message, true); }
};
window.openEditUserModal = function(userId){
  const u = allUsers.find(x=>x.id===userId);
  if(!u) return;
  const full = ["admin","direction","daf"].includes(u.role);
  openModal(`
    <div class="modal-head"><h3>Modifier l'accès — ${esc(u.nom)}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Rôle</label>
      <select id="euRole" onchange="document.getElementById('euModulesWrap').style.display=(this.value==='admin'||this.value==='direction'||this.value==='daf')?'none':'block'">
        ${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${k===u.role?'selected':''}>${v}</option>`).join("")}
      </select>
    </div>
    <div id="euModulesWrap" style="${full?'display:none;':''}">
      <label style="display:block;font-size:11.5px;font-weight:600;color:var(--muted);margin-bottom:6px;">Modules accessibles</label>
      ${moduleCheckboxes(u.modulesAutorises||["dashboard"])}
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitEditUser('${userId}')">Enregistrer</button></div>
  `);
};
window.submitEditUser = async function(userId){
  const role = $("#euRole").value;
  const modulesAutorises = $$(".modChk").filter(c=>c.checked).map(c=>c.value);
  await updateDoc(doc(db,"users",userId), {role, modulesAutorises});
  closeModal(); toast("Accès mis à jour ✓");
};

// -------------------------------------------------------------
// EVENTS communs après chaque render
// -------------------------------------------------------------
function bindContentEvents(){}

// -------------------------------------------------------------
// AUTH
// -------------------------------------------------------------
$("#btnLogin").addEventListener("click", doLogin);
$("#loginPassword").addEventListener("keydown", e=>{ if(e.key==="Enter") doLogin(); });
async function doLogin(){
  const email = $("#loginEmail").value.trim();
  const pass = $("#loginPassword").value;
  const btn = $("#btnLogin");
  $("#loginError").style.display="none";
  if(!email || !pass){ showLoginError("Veuillez renseigner l'e-mail et le mot de passe."); return; }
  btn.disabled = true; btn.textContent = "Connexion…";
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    showLoginError("Erreur (" + (e.code||"inconnue") + ") : " + e.message);
  }finally{
    btn.disabled = false; btn.textContent = "Se connecter";
  }
}
function showLoginError(msg){
  const el = $("#loginError"); el.textContent = msg; el.style.display = "block";
}

$("#hamburger").addEventListener("click", ()=> $("#sidebar").classList.toggle("open"));

// Affiche toute erreur JS non prévue directement à l'écran (utile sur mobile, sans console)
window.addEventListener("error", e=>{
  $("#boot").style.display="none";
  toast("Erreur technique : " + (e.message||"inconnue"), true);
});
window.addEventListener("unhandledrejection", e=>{
  $("#boot").style.display="none";
  toast("Erreur : " + (e.reason?.message || e.reason || "inconnue"), true);
});

onAuthStateChanged(auth, async (user) => {
  try{
  clearListeners();
  if(user){
    STATE.user = user;
    const profileSnap = await getDoc(doc(db,"users",user.uid));
    if(profileSnap.exists()){
      STATE.profile = profileSnap.data();
    } else {
      // Premier utilisateur = administrateur par défaut
      const usersCount = await getDocs(collection(db,"users"));
      const role = usersCount.empty ? "admin" : "consultation";
      STATE.profile = {nom:user.email.split("@")[0], email:user.email, role, actif:true};
      await setDoc(doc(db,"users",user.uid), {...STATE.profile, createdAt:serverTimestamp()});
    }
    $("#userAvatar").textContent = (STATE.profile.nom||"?").slice(0,2).toUpperCase();
    $("#userName").textContent = STATE.profile.nom || user.email;
    $("#userRole").textContent = ROLES[STATE.profile.role] || "";

    $("#loginScreen").style.display = "none";
    $("#app").style.display = "block";
    subscribeData();
    renderNav();
    render();
  } else {
    STATE.user = null; STATE.profile = null;
    $("#app").style.display = "none";
    $("#loginScreen").style.display = "flex";
    $("#loginEmail").value=""; $("#loginPassword").value="";
  }
  $("#boot").style.display = "none";
  }catch(e){
    $("#boot").style.display = "none";
    toast("Erreur au chargement : " + e.message, true);
    console.error(e);
  }
});

function clearListeners(){
  STATE.unsubscribers.forEach(u=>u());
  STATE.unsubscribers = [];
}

function subscribeData(){
  const qProjects = query(collection(db,"projects"), orderBy("createdAt","desc"));
  const unsub1 = onSnapshot(qProjects, snap=>{
    STATE.projects = snap.docs.map(d=>({id:d.id, ...d.data()}));
    render();
  }, err=> console.error(err));
  STATE.unsubscribers.push(unsub1);

  const qSuppliers = query(collection(db,"suppliers"), orderBy("createdAt","desc"));
  const unsub2 = onSnapshot(qSuppliers, snap=>{
    STATE.suppliers = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(STATE.route==="fournisseurs") render();
  });
  STATE.unsubscribers.push(unsub2);

  const unsub3 = onSnapshot(collection(db,"users"), snap=>{
    allUsers = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(STATE.route==="parametres") render();
  });
  STATE.unsubscribers.push(unsub3);

  const qLogs = query(collection(db,"activityLogs"), orderBy("createdAt","desc"));
  const unsub4 = onSnapshot(qLogs, snap=>{
    STATE.activityLogs = snap.docs.map(d=>({id:d.id, ...d.data()})).slice(0,200);
    if(STATE.route==="historique") render();
  }, err=>console.error(err));
  STATE.unsubscribers.push(unsub4);

  const unsub5 = onSnapshot(collection(db,"contacts"), snap=>{
    STATE.contacts = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(STATE.route==="responsables") render();
  }, err=>console.error(err));
  STATE.unsubscribers.push(unsub5);
}

// PWA service worker
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  });
}
