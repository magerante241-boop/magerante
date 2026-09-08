// factures.js — Historique des factures groupées (numérotation séquentielle),
// en plus des ventes individuelles déjà enregistrées par ventes.js pour
// chaque ligne (le comptage CA/stock existant n'est pas modifié).
import {
  db, doc, collection, addDoc, onSnapshot, query, orderBy, runTransaction, serverTimestamp, auth
} from "./firebase-config.js";
import { appState } from "./state.js";

let unsubscribeFactures = null;
let facturesCache = [];
let filtrePeriodeFactureActuel = "jour";

function facturesRef() {
  return collection(db, "establishments", appState.establishmentId, "factures");
}

function compteurRef() {
  return doc(db, "establishments", appState.establishmentId, "meta", "facturesCompteur");
}

// Attribue un numéro de facture séquentiel de façon atomique (résiste aux
// validations simultanées de plusieurs gérants).
async function prochainNumeroFacture() {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(compteurRef());
    const dernier = snap.exists() ? Number(snap.data().dernier || 0) : 0;
    const nouveau = dernier + 1;
    tx.set(compteurRef(), { dernier: nouveau });
    return nouveau;
  });
}

export async function enregistrerFacture(lignes, total) {
  if (!appState.establishmentId || !lignes || lignes.length === 0) {
    return { success: false, message: "Aucune ligne à enregistrer." };
  }
  try {
    const numero = await prochainNumeroFacture();
    const auteurId = auth.currentUser ? auth.currentUser.uid : null;
    const auteurNom = (window.AuthState && window.AuthState.nomGerant) || null;
    await addDoc(facturesRef(), {
      numero, total, auteurId, auteurNom, date: serverTimestamp(),
      lignes: lignes.map((l) => ({
        produitId: l.produitId, nom: l.nom, prixUnitaire: l.prixUnitaire,
        quantite: l.quantite, totalLigne: l.totalLigne
      }))
    });
    return { success: true, numero };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export function render(container) {
  if (!appState.establishmentId) {
    container.innerHTML = `<p class="placeholder-msg">Chargement de l'établissement...</p>`;
    return;
  }

  container.innerHTML = `
    <div class="inv-toolbar">
      <span class="inv-title">Factures</span>
      <select id="factureFiltrePeriode" class="filtre-select" style="width:auto; margin:0;">
        <option value="jour">Aujourd'hui</option>
        <option value="semaine">Cette semaine</option>
        <option value="mois">Ce mois</option>
        <option value="tout">Tout</option>
      </select>
    </div>
    <div class="inv-list" id="factureTotalZone" style="padding:10px 14px; font-weight:bold;"></div>
    <div class="inv-list" id="factureListZone"><p class="inv-empty">Chargement...</p></div>
  `;

  const selectEl = document.getElementById("factureFiltrePeriode");
  selectEl.value = filtrePeriodeFactureActuel;
  selectEl.addEventListener("change", () => {
    filtrePeriodeFactureActuel = selectEl.value;
    afficherFacturesFiltrees();
  });

  if (unsubscribeFactures) unsubscribeFactures();
  const q = query(facturesRef(), orderBy("date", "desc"));
  unsubscribeFactures = onSnapshot(q, (snap) => {
    facturesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    afficherFacturesFiltrees();
  }, (err) => {
    const listEl = document.getElementById("factureListZone");
    if (listEl) listEl.innerHTML = `<p class="inv-empty">Erreur : ${err.message}</p>`;
  });
}

function afficherFacturesFiltrees() {
  const listEl = document.getElementById("factureListZone");
  const totalEl = document.getElementById("factureTotalZone");
  if (!listEl || !totalEl) return; // vue quittée entre-temps

  const maintenant = new Date();
  let seuil = null;
  if (filtrePeriodeFactureActuel === "jour") {
    seuil = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  } else if (filtrePeriodeFactureActuel === "semaine") {
    const jour = maintenant.getDay() || 7;
    seuil = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - jour + 1);
  } else if (filtrePeriodeFactureActuel === "mois") {
    seuil = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  }

  const filtrees = facturesCache.filter((f) => {
    if (!seuil) return true;
    if (!f.date || !f.date.toDate) return false;
    return f.date.toDate() >= seuil;
  });

  const total = filtrees.reduce((acc, f) => acc + Number(f.total || 0), 0);
  totalEl.textContent = `Total : ${total.toLocaleString("fr-FR")} FCFA (${filtrees.length} facture${filtrees.length > 1 ? "s" : ""})`;

  if (filtrees.length === 0) {
    listEl.innerHTML = `<p class="inv-empty">Aucune facture pour cette période.</p>`;
    return;
  }

  listEl.innerHTML = filtrees.map((f) => {
    const d = f.date && f.date.toDate ? f.date.toDate() : null;
    const dateStr = d ? d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";
    const detailLignes = (f.lignes || []).map((l) =>
      `${l.quantite} × ${escapeHtml(l.nom)} — ${Number(l.totalLigne || 0).toLocaleString("fr-FR")} FCFA`
    ).join("<br>");
    return `
      <details class="collapsible-section" id="facture-${f.numero}">
        <summary style="display:flex; justify-content:space-between; padding:10px 14px; cursor:pointer;">
          <span>Facture #${f.numero || "—"} — ${dateStr}</span>
          <strong>${Number(f.total || 0).toLocaleString("fr-FR")} FCFA</strong>
        </summary>
        <div style="padding:6px 14px 12px; font-size:13px; color:var(--muted);">${detailLignes || "Détail indisponible."}</div>
      </details>
    `;
  }).join("");
}

export function ouvrirFacture(numero) {
  filtrePeriodeFactureActuel = "tout";
  afficherFacturesFiltrees();
  requestAnimationFrame(() => {
    setTimeout(() => {
      const el = document.getElementById(`facture-${numero}`);
      if (!el) return;
      el.setAttribute("open", "");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  });
}

export function cleanup() {
  if (unsubscribeFactures) { unsubscribeFactures(); unsubscribeFactures = null; }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

window.FacturesModule = { render, cleanup, enregistrerFacture, ouvrirFacture };
