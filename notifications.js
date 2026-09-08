// notifications.js — Système de notifications temps réel
import {
  auth, db, doc, getDoc, collection, addDoc, onSnapshot, query, orderBy, where, getDocs, serverTimestamp, writeBatch
} from "./firebase-config.js";
import { appState } from "./state.js";

let unsubscribeNotifs = null;
let notifsCache = [];
let premierChargement = true;
const nomAuteurCache = new Map();

function notifsRef() {
  return collection(db, "establishments", appState.establishmentId, "notifications");
}

// Appelée depuis n'importe quel module pour créer une notification
export async function creerNotification({ type, titre, message, factureNumero, cible }) {
  if (!appState.establishmentId) return;
  try {
    const auteurId = auth.currentUser ? auth.currentUser.uid : null;
    const payload = { type, titre, message, lu: false, createdAt: serverTimestamp(), auteurId };
    if (factureNumero) payload.factureNumero = factureNumero;
    if (cible) payload.cible = cible;
    await addDoc(notifsRef(), payload);
  } catch (err) {
    console.warn("Notification non créée :", err.message);
  }
}

function iconePourType(type) {
  const icones = { stock_bas: "📦", vente: "🛒", gerant: "👤", cloture: "🧾", invitation: "📨", info: "ℹ️" };
  return icones[type] || "🔔";
}

function formatDate(ts) {
  if (!ts || !ts.toDate) return "à l'instant";
  const d = ts.toDate();
  const diffMin = Math.floor((Date.now() - d) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  if (diffMin < 1440) return `il y a ${Math.floor(diffMin / 60)} h`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function renderPanel() {
  const listEl = document.getElementById("notifList");
  if (!listEl) return;
  if (notifsCache.length === 0) {
    listEl.innerHTML = `<p class="notif-empty">Aucune notification pour l'instant.</p>`;
    return;
  }
  listEl.innerHTML = notifsCache.map(n => `
    <div class="notif-item${n.lu ? "" : " non-lu"}${n.cible ? " notif-item-cliquable" : ""}"
         data-notif-id="${n.id}"
         ${n.cible ? `data-cible="${n.cible}"` : ""}
         ${n.factureNumero ? `data-facture-numero="${n.factureNumero}"` : ""}>
      <span class="notif-icone">${iconePourType(n.type)}</span>
      <div class="notif-texte">
        <span class="notif-titre">${escapeHtml(n.titre)}</span>
        <span class="notif-msg">${escapeHtml(n.message)}</span>
        <span class="notif-date">${formatDate(n.createdAt)}${n.auteurNom ? ` · par ${escapeHtml(n.auteurNom)}` : ""}</span>
      </div>
    </div>
  `).join("");
}

function updateBadge() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  const nonLus = notifsCache.filter(n => !n.lu).length;
  if (nonLus > 0) { badge.textContent = nonLus > 9 ? "9+" : String(nonLus); badge.hidden = false; }
  else { badge.hidden = true; }
}

function notifierSysteme(n) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification(n.titre, { body: n.message, icon: "logo.png" }); } catch (e) {}
}

const CLEANUP_KEY = "magerante_notif_cleanup_last";
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // une fois par jour max
const RETENTION_JOURS = 30;

async function nettoyerVieillesNotifications() {
  try {
    const dernier = localStorage.getItem(CLEANUP_KEY);
    if (dernier && (Date.now() - parseInt(dernier, 10)) < CLEANUP_INTERVAL_MS) return;
    localStorage.setItem(CLEANUP_KEY, String(Date.now()));

    const seuil = new Date(Date.now() - RETENTION_JOURS * 24 * 60 * 60 * 1000);
    const q = query(notifsRef(), where("createdAt", "<", seuil));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(`Notifications : ${snap.size} ancienne(s) supprimée(s).`);
  } catch (err) {
    console.warn("Nettoyage notifications échoué :", err.message);
  }
}

export function initNotifications() {
  if (!appState.establishmentId || unsubscribeNotifs) return;
  const uid = auth.currentUser ? auth.currentUser.uid : null;
  const estProprietaire = !!uid && uid === appState.establishmentId;
  if (estProprietaire) nettoyerVieillesNotifications();
  const q = estProprietaire
    ? query(notifsRef(), orderBy("createdAt", "desc"))
    : query(notifsRef(), where("auteurId", "==", uid), orderBy("createdAt", "desc"));
  unsubscribeNotifs = onSnapshot(q, (snap) => {
    notifsCache = snap.docs.slice(0, 30).map(d => ({ id: d.id, ...d.data() }));
    renderPanel();
    updateBadge();
    resolverAuteurs();
    if (!premierChargement) {
      snap.docChanges().forEach(c => { if (c.type === "added") notifierSysteme({ id: c.doc.id, ...c.doc.data() }); });
    }
    premierChargement = false;
  }, (err) => console.warn("Notifications :", err.message));
}

async function resolverAuteurs() {
  const aResoudre = notifsCache.filter(n => n.auteurId && !nomAuteurCache.has(n.auteurId));
  if (aResoudre.length > 0) {
    await Promise.all(aResoudre.map(async n => {
      if (n.auteurId === appState.establishmentId) {
        nomAuteurCache.set(n.auteurId, "Propriétaire");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "establishments", appState.establishmentId, "gerants", n.auteurId));
        nomAuteurCache.set(n.auteurId, snap.exists() ? (snap.data().nom || "Gérant") : "Gérant");
      } catch (e) {
        nomAuteurCache.set(n.auteurId, "Gérant");
      }
    }));
  }
  let changement = false;
  notifsCache.forEach(n => {
    if (n.auteurId && nomAuteurCache.has(n.auteurId) && n.auteurNom !== nomAuteurCache.get(n.auteurId)) {
      n.auteurNom = nomAuteurCache.get(n.auteurId);
      changement = true;
    }
  });
  if (changement) renderPanel();
}

export async function marquerToutLu() {
  const nonLus = notifsCache.filter(n => !n.lu);
  if (nonLus.length === 0) return;
  const batch = writeBatch(db);
  nonLus.forEach(n => batch.update(doc(db, "establishments", appState.establishmentId, "notifications", n.id), { lu: true }));
  await batch.commit();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnNotifications");
  const panel = document.getElementById("notifPanel");
  const listEl2 = document.getElementById("notifList");
  const overlay = document.getElementById("notifPanelOverlay");
  const closeBtn = document.getElementById("btnCloseNotifPanel");
  const markBtn = document.getElementById("btnMarquerToutLu");
  const permBtn = document.getElementById("btnActiverNotifsSysteme");

  if (btn && panel) btn.addEventListener("click", () => {
    panel.hidden = false;
    if ("Notification" in window && Notification.permission === "default" && permBtn) permBtn.hidden = false;
  });
  if (overlay) overlay.addEventListener("click", () => { panel.hidden = true; });
  if (listEl2) listEl2.addEventListener("click", (e) => {
    const item = e.target.closest(".notif-item[data-cible]");
    if (!item) return;
    const cible = item.dataset.cible;
    const factureNumero = item.dataset.factureNumero;
    panel.hidden = true;
    if (window.switchView) window.switchView(cible);
    if (factureNumero && window.FacturesModule && window.FacturesModule.ouvrirFacture) {
      setTimeout(() => window.FacturesModule.ouvrirFacture(factureNumero), 300);
    }
  });
  if (closeBtn) closeBtn.addEventListener("click", () => { panel.hidden = true; });
  if (markBtn) markBtn.addEventListener("click", marquerToutLu);
  if (permBtn) permBtn.addEventListener("click", async () => {
    const res = await Notification.requestPermission();
    if (res === "granted") permBtn.hidden = true;
  });

  const attendre = setInterval(() => {
    if (appState.establishmentId) { clearInterval(attendre); initNotifications(); }
  }, 500);
});

window.NotificationsModule = { creerNotification };
