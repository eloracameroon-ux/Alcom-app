// ============================================================
// ALCOM PETROLEUM — Pilotage des projets stations-service
// ============================================================
export const BUILD_ID = "2026-08-24-14h30";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, where, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// -------------------------------------------------------------
// FILET DE SÉCURITÉ — affiche TOUTE erreur à l'écran, sans exception.
// Enregistré avant toute logique Firebase pour ne rien manquer.
// -------------------------------------------------------------
function showFatalError(msg){
  let el = document.getElementById("fatalErrorBanner");
  if(!el){
    el = document.createElement("div");
    el.id = "fatalErrorBanner";
    el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#B01813;color:#fff;padding:14px 16px;font:600 13px/1.4 -apple-system,sans-serif;white-space:pre-wrap;";
    document.body.prepend(el);
  }
  el.textContent = "⚠️ Erreur : " + msg;
  const boot = document.getElementById("boot");
  if(boot) boot.style.display = "none";
}
window.addEventListener("error", e => showFatalError(e.message || String(e.error) || "erreur inconnue"));
window.addEventListener("unhandledrejection", e => showFatalError((e.reason && (e.reason.message||e.reason)) || "erreur asynchrone inconnue"));

// -------------------------------------------------------------
// 1) CONFIGURATION FIREBASE
// -------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyDmJQrHqzR96eW8HUPZeIzEBC8gLEMotIE",
  authDomain: "alcom-petroleum-4518f.firebaseapp.com",
  projectId: "alcom-petroleum-4518f",
  storageBucket: "alcom-petroleum-4518f.firebasestorage.app",
  messagingSenderId: "14449422064",
  appId: "1:14449422064:web:047f368f57eb1b8ad45c35"
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

const PROJECT_STATUTS = ["Préparation","Études","Autorisations","Conception","Achats","Construction","Installation","Tests","Réception","Mise en service"];

const CHECKLIST_TEMPLATE = [
  {cat:"Terrain & implantation", items:["Titre foncier / bail","Plan cadastral","Plan de situation","Coordonnées GPS","Étude géotechnique","Étude topographique"]},
  {cat:"Études environnementales", items:["Étude d'impact environnemental","Autorisations environnementales","Plan de gestion environnementale","Documents relatifs aux déchets"]},
  {cat:"Études techniques", items:["Étude architecturale","Plans électriques","Plans plomberie","Plans incendie","Étude de sécurité"]},
  {cat:"Achats & équipements", items:["Consultation fournisseurs","Devis reçus","Bons de commande signés","Cuves livrées","Pompes livrées"]},
  {cat:"Construction", items:["Installation chantier","Terrassement","Fondations / dalle","Tuyauterie & tests d'étanchéité","Électricité & mise à la terre","Auvent / enseigne / totem"]},
  {cat:"Mise en service", items:["Tests & contrôles","Réception travaux","Autorisation d'exploitation","Ouverture"]}
];

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

function openModal(html){
  $("#modalBody").innerHTML = html;
  $("#modalOverlay").classList.add("open");
}
function closeModal(){ $("#modalOverlay").classList.remove("open"); $("#modalBody").innerHTML=""; }
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
  {id:"fournisseurs", label:"Fournisseurs", ic:"fournisseurs"},
  {id:"alertes", label:"Alertes", ic:"alertes"},
  {id:"rapports", label:"Rapports", ic:"rapports"},
  {id:"parametres", label:"Paramètres", ic:"parametres"}
];
const BOTTOM_NAV = ["dashboard","projects","fournisseurs","alertes","parametres"];

function renderNav(){
  const nav = $("#navScroll");
  nav.innerHTML = `<div class="nav-group-label">Navigation</div>` +
    NAV_ITEMS.map(it => `
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
  bn.innerHTML = BOTTOM_NAV.map(id=>{
    const it = NAV_ITEMS.find(n=>n.id===id);
    return `<div class="bn-item ${STATE.route===id?'active':''}" data-route="${id}">${icon(it.ic)}<span>${it.label.split(' ')[0]}</span></div>`;
  }).join("");
  $$(".bn-item", bn).forEach(el=> el.addEventListener("click", ()=> goTo(el.dataset.route)));
}

function goTo(route, opts={}){
  STATE.route = route;
  STATE.projectId = opts.projectId ?? null;
  STATE.projectTab = opts.projectTab ?? "fiche";
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
  fournisseurs: ["Fournisseurs & prestataires","Base centralisée"],
  alertes: ["Alertes","Retards, échéances et documents manquants"],
  rapports: ["Rapports","Synthèses par projet et par direction"],
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
  else if(STATE.route==="fournisseurs") c.innerHTML = renderFournisseurs();
  else if(STATE.route==="alertes") c.innerHTML = renderAlertes();
  else if(STATE.route==="rapports") c.innerHTML = renderRapports();
  else if(STATE.route==="parametres") c.innerHTML = renderParametres();
  bindContentEvents();
}

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

  return `
    <div class="kpi-grid">
      <div class="kpi"><div class="lbl">Projets totaux</div><div class="val">${total}</div><div class="sub">${enCours} en cours · ${termines} terminés</div></div>
      <div class="kpi"><div class="lbl">Budget total</div><div class="val">${fmt(budgetTotal)}</div><div class="sub">FCFA cumulé</div></div>
      <div class="kpi"><div class="lbl">Montant engagé</div><div class="val">${fmt(engage)}</div><div class="sub">${budgetTotal? Math.round(engage/budgetTotal*100):0}% du budget</div></div>
      <div class="kpi accent"><div class="lbl">Montant payé</div><div class="val">${fmt(paye)}</div><div class="sub">Reste à payer : ${fmt(engage-paye)}</div></div>
      <div class="kpi"><div class="lbl">Alertes actives</div><div class="val" style="color:${alerts.length?'var(--red)':'var(--ok)'}">${alerts.length}</div><div class="sub">documents, retards, paiements</div></div>
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
            <div style="padding:9px 0;border-bottom:1px solid #F0EDE6;font-size:13px;">
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
  if(["Préparation","Études","Autorisations"].includes(statut)) return "neutral";
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
    (pr.checklist||[]).forEach(cat=>{
      cat.items.forEach(it=>{
        if(it.statut==="Bloqué") alerts.push({type:"Étape bloquée", level:"bad", text:`${pr.nom} — ${it.label}`});
      });
    });
  });
  return alerts;
}

function renderAlertes(){
  const alerts = computeAlerts();
  if(alerts.length===0) return emptyState("alertes","Aucune alerte","Tous les projets sont à jour : aucun retard, aucun document manquant détecté.");
  return `<div class="card">${alerts.map(a=>`
    <div style="display:flex;gap:10px;padding:12px 0;border-bottom:1px solid #F0EDE6;align-items:flex-start;">
      <span class="pill ${a.level}" style="flex-shrink:0;">${a.type}</span>
      <div style="font-size:13.5px;">${a.text}</div>
    </div>`).join("")}</div>`;
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
    checklist: CHECKLIST_TEMPLATE.map(c=>({cat:c.cat, items:c.items.map(l=>({label:l, statut:"Non commencé"}))})),
    createdAt: serverTimestamp(), createdBy: STATE.user.uid
  };
  try{
    const ref = await addDoc(collection(db,"projects"), data);
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
  {id:"finance", label:"Finance"},
  {id:"documents", label:"Documents"}
];

function renderProjectDetail(){
  const pr = STATE.projects.find(p=>p.id===STATE.projectId);
  if(!pr) return emptyState("projects","Projet introuvable","");
  const idx = PROJECT_STATUTS.indexOf(pr.statut);

  let body = "";
  if(STATE.projectTab==="fiche") body = renderProjectFiche(pr, idx);
  else if(STATE.projectTab==="checklist") body = renderProjectChecklist(pr);
  else if(STATE.projectTab==="finance") body = renderProjectFinance(pr);
  else if(STATE.projectTab==="documents") body = renderProjectDocuments(pr);

  return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <button class="btn icon sm" onclick="goTo('projects')">${icon('back')}</button>
      <span class="pill ${statutPillClass(pr.statut)}">${pr.statut}</span>
      <span class="mono" style="font-size:12px;color:var(--muted)">${pr.code||''}</span>
    </div>
    <div class="stepper">
      ${PROJECT_STATUTS.map((s,i)=>`<div class="step ${i<idx?'done':i===idx?'current':''}">${s}</div>`).join("")}
    </div>
    <div style="display:flex;gap:6px;margin:16px 0;border-bottom:1px solid #E7E4DC;overflow-x:auto;">
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
  return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F5F2EB;font-size:13.5px;">
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
  await updateDoc(doc(db,"projects",id), {statut:$("#stStatut").value});
  closeModal(); toast("Phase mise à jour ✓");
};

function renderProjectChecklist(pr){
  const cl = pr.checklist || [];
  if(cl.length===0) return emptyState("projects","Checklist vide","");
  return cl.map((cat,ci)=>`
    <div class="card">
      <h3>${cat.cat}</h3>
      ${cat.items.map((it,ii)=>`
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #F5F2EB;">
          <div style="flex:1;font-size:13.5px;">${it.label}</div>
          <select onchange="updateChecklistItem('${pr.id}',${ci},${ii},this.value)" style="font-size:12px;padding:5px 8px;border-radius:7px;border:1px solid #E2DFD6;background:#FBFAF7;">
            ${["Non commencé","En cours","Terminé","Bloqué","Non applicable","En retard"].map(s=>`<option ${s===it.statut?'selected':''}>${s}</option>`).join("")}
          </select>
        </div>`).join("")}
    </div>`).join("");
}
window.updateChecklistItem = async function(projectId, ci, ii, val){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const cl = JSON.parse(JSON.stringify(pr.checklist));
  cl[ci].items[ii].statut = val;
  await updateDoc(doc(db,"projects",projectId), {checklist:cl});
  toast("Checklist mise à jour ✓");
};

function renderProjectFinance(pr){
  const engage = Number(pr.montantEngage||0), paye = Number(pr.montantPaye||0), budget = Number(pr.budgetInitial||0);
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
      <button class="btn sm" onclick="openEditProjectModal('${pr.id}')">Mettre à jour les montants</button>
    </div>
  `;
}

function renderProjectDocuments(pr){
  const docs = pr.documents || [];
  return `
    <div class="section-title"><div></div><button class="btn primary sm" onclick="openAddDocModal('${pr.id}')">${icon('plus')} Ajouter un document</button></div>
    ${docs.length===0 ? emptyState("projects","Aucun document","Ajoutez les documents administratifs, techniques et financiers du projet.") :
    `<div class="card">${docs.map((d,i)=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #F5F2EB;">
        <div><strong style="font-size:13.5px;">${d.nom}</strong><br><span style="font-size:11.5px;color:var(--muted)">${d.type} · ajouté le ${d.date}</span></div>
        <span class="pill ${d.statut==='Validé'?'ok':d.statut==='Expiré'?'bad':'warn'}">${d.statut}</span>
      </div>`).join("")}</div>`}
  `;
}
window.openAddDocModal = function(projectId){
  openModal(`
    <div class="modal-head"><h3>Ajouter un document</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Nom du document</label><input id="dNom" placeholder="Étude d'impact environnemental"></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Type</label>
      <select id="dType"><option>Administratif</option><option>Juridique</option><option>Environnemental</option><option>Technique / Plans</option><option>Devis / Contrat</option><option>Facture</option><option>Autre</option></select>
    </div>
    <div class="f-field"><label>Statut</label>
      <select id="dStatut"><option>En attente</option><option>Validé</option><option>Expiré</option></select>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitAddDoc('${projectId}')">Ajouter</button></div>
  `);
};
window.submitAddDoc = async function(projectId){
  const pr = STATE.projects.find(p=>p.id===projectId);
  const docs = [...(pr.documents||[]), {nom:$("#dNom").value.trim(), type:$("#dType").value, statut:$("#dStatut").value, date:todayISO()}];
  await updateDoc(doc(db,"projects",projectId), {documents:docs});
  closeModal(); toast("Document ajouté ✓");
};

function esc(s){ return (s||"").replace(/"/g,'&quot;'); }

// -------------------------------------------------------------
// FOURNISSEURS
// -------------------------------------------------------------
function renderFournisseurs(){
  const list = STATE.suppliers;
  return `
    <div class="section-title"><div></div><button class="btn primary" onclick="openSupplierModal()">${icon('plus')} Nouveau fournisseur</button></div>
    ${list.length===0 ? emptyState("projects","Aucun fournisseur","Ajoutez vos fournisseurs et prestataires : construction, cuves, pompes, électricité...") :
    `<div class="card"><table><thead><tr><th>Nom</th><th>Catégorie</th><th>Pays</th><th>Contact</th></tr></thead><tbody>
      ${list.map(s=>`<tr><td><strong>${s.nom}</strong></td><td><span class="tag-fournisseur">${s.categorie}</span></td><td>${s.pays||'—'}</td><td>${s.contact||'—'}</td></tr>`).join("")}
    </tbody></table></div>`}
  `;
}
window.openSupplierModal = function(){
  openModal(`
    <div class="modal-head"><h3>Nouveau fournisseur</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="form-grid">
      <div class="f-field full"><label>Nom *</label><input id="sNom" placeholder="Nom du fournisseur"></div>
      <div class="f-field"><label>Catégorie</label>
        <select id="sCat">${["Construction","Électricité","Plomberie","Cuves","Pompes","Génie civil","Architecture","Environnement","Sécurité","Informatique","Mobilier","Transport","Installation","Maintenance","Autres"].map(c=>`<option>${c}</option>`).join("")}</select>
      </div>
      <div class="f-field"><label>Pays</label><input id="sPays" placeholder="Cameroun"></div>
      <div class="f-field full"><label>Contact (téléphone / e-mail)</label><input id="sContact" placeholder="+237 6xx xxx xxx"></div>
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
    contact:$("#sContact").value.trim(), conditions:$("#sCond").value.trim(), createdAt:serverTimestamp()
  });
  closeModal(); toast("Fournisseur ajouté ✓");
};

// -------------------------------------------------------------
// RAPPORTS
// -------------------------------------------------------------
function renderRapports(){
  return `
    <div class="grid-2">
      ${STATE.projects.map(pr=>`
        <div class="card">
          <h3>${pr.nom}</h3>
          ${infoRow("Statut", pr.statut)}
          ${infoRow("Budget", fmtXAF(pr.budgetInitial))}
          ${infoRow("Engagé / Payé", `${fmt(pr.montantEngage)} / ${fmt(pr.montantPaye)}`)}
          <button class="btn sm" style="margin-top:10px;" onclick="window.print()">Imprimer / Exporter PDF</button>
        </div>
      `).join("") || emptyState("projects","Aucun rapport disponible","Créez un projet pour générer des rapports.")}
    </div>
  `;
}

// -------------------------------------------------------------
// PARAMÈTRES (utilisateurs)
// -------------------------------------------------------------
let allUsers = [];
function renderParametres(){
  const isAdmin = STATE.profile?.role === "admin";
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
  return `<table><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th></tr></thead><tbody>
    ${allUsers.map(u=>`<tr><td>${u.nom||'—'}</td><td>${u.email||'—'}</td><td><span class="pill info">${ROLES[u.role]||u.role}</span></td></tr>`).join("")}
  </tbody></table>`;
}
window.openUserModal = function(){
  openModal(`
    <div class="modal-head"><h3>Ajouter un utilisateur</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Nom complet</label><input id="uNom" placeholder="Nom et prénom"></div>
    <div class="f-field" style="margin-bottom:12px;"><label>E-mail</label><input id="uEmail" type="email" placeholder="prenom.nom@alcompetroleum.com"></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Mot de passe temporaire</label><input id="uPass" type="text" placeholder="Min. 6 caractères"></div>
    <div class="f-field"><label>Rôle</label>
      <select id="uRole">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="submitNewUser()">Créer le compte</button></div>
  `);
};
window.submitNewUser = async function(){
  const nom = $("#uNom").value.trim(), email = $("#uEmail").value.trim(), pass = $("#uPass").value, role = $("#uRole").value;
  if(!nom || !email || pass.length<6){ toast("Vérifiez les champs (mot de passe ≥ 6 caractères)", true); return; }
  try{
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    await setDoc(doc(db,"users",cred.user.uid), {nom, email, role, actif:true, createdAt:serverTimestamp()});
    await signOut(secondaryAuth);
    closeModal(); toast("Utilisateur créé ✓");
  }catch(e){ toast("Erreur : "+e.message, true); }
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
}

// PWA service worker
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  });
}
