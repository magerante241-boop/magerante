// inventaire.js — Module Inventaire : liste, ajout, édition, suppression des produits
import {
  db, doc, collection, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, where, getDocs, serverTimestamp
} from "./firebase-config.js";
import { appState } from "./state.js";

let unsubscribe = null;
let produitEnEdition = null;

function produitsRef() {
  return collection(db, "establishments", appState.establishmentId, "produits");
}

// --- Point d'entrée appelé par app.js quand l'onglet Inventaire est ouvert ---
export function render(container) {
  if (!appState.establishmentId) {
    container.innerHTML = `<p class="placeholder-msg">Chargement de l'établissement...</p>`;
    return;
  }

  container.innerHTML = `
    <div class="inv-toolbar">
      <span class="inv-title">Produits</span>
      <button class="inv-add-btn" id="invAddBtn">+ Ajouter</button>
    </div>
    <div class="inv-list" id="invList"><p class="inv-empty">Chargement...</p></div>
  `;
  document.getElementById("invAddBtn").addEventListener("click", () => openModal(null));

  if (unsubscribe) unsubscribe();
  const q = query(produitsRef(), orderBy("nom"));
  unsubscribe = onSnapshot(q, (snap) => {
    const listEl = document.getElementById("invList");
    if (!listEl) return; // vue quittée entre-temps

    if (snap.empty) {
      listEl.innerHTML = `<p class="inv-empty">Aucun produit pour l'instant.<br>Ajoute ton premier produit pour démarrer l'inventaire.</p>`;
      return;
    }

    listEl.innerHTML = "";
    snap.forEach((docSnap) => {
      const p = docSnap.data();
      const isLow = Number(p.stock) <= 5;
      const card = document.createElement("div");
      card.className = "inv-card";
      card.innerHTML = `
        <div class="inv-card-info">
          <span class="inv-card-nom">${escapeHtml(p.nom)}</span>
          <span class="inv-card-meta">Achat ${formatFcfa(p.prixAchat)} · Vente ${formatFcfa(p.prixVente)}${p.categorie ? " · " + escapeHtml(p.categorie) : ""}</span>
        </div>
        <span class="inv-card-stock${isLow ? " low" : ""}">${p.stock} en stock</span>
      `;
      card.addEventListener("click", () => openModal({ id: docSnap.id, ...p }));
      listEl.appendChild(card);
    });
  }, (err) => {
    const listEl = document.getElementById("invList");
    if (listEl) listEl.innerHTML = `<p class="inv-empty">Erreur de chargement : ${escapeHtml(err.message)}</p>`;
  });
}

// --- Appelé par app.js quand on quitte l'onglet Inventaire ---
export function cleanup() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  closeModal();
}

// --- Appelé par app.js (tuiles Bar/Snack/Club) pour récupérer les produits d'une catégorie ---
export async function getProduitsParCategorie(categorie) {
  if (!appState.establishmentId) return [];
  const q = query(produitsRef(), where("categorie", "==", categorie), orderBy("nom"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// --- Appelé par app.js (recherche texte via clavier alphabétique) ---
export async function getTousLesProduits() {
  if (!appState.establishmentId) return [];
  const q = query(produitsRef(), orderBy("nom"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const CATEGORIES = ["Bar", "Snack", "Club"];

function openModal(produit) {
  produitEnEdition = produit;
  const backdrop = document.createElement("div");
  backdrop.className = "inv-modal-backdrop";
  backdrop.id = "invModalBackdrop";
  backdrop.innerHTML = `
    <div class="inv-modal">
      <h2>${produit ? "Modifier le produit" : "Nouveau produit"}</h2>
      <p class="inv-error" id="invModalError"></p>
      <div class="inv-field">
        <label>Nom du produit</label>
        <input type="text" id="invNom" value="${produit ? escapeAttr(produit.nom) : ""}" placeholder="Ex : Bière Régab 65cl">
      </div>
      <div class="inv-field">
        <label>Catégorie</label>
        <select id="invCategorie">
          <option value="">— Choisir —</option>
          ${CATEGORIES.map((c) => `<option value="${c}" ${produit && produit.categorie === c ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </div>
      <div class="inv-field">
        <label>Prix d'achat (FCFA)</label>
        <input type="number" id="invPrixAchat" value="${produit ? produit.prixAchat : ""}" placeholder="0" inputmode="decimal">
      </div>
      <div class="inv-field">
        <label>Prix de vente (FCFA)</label>
        <input type="number" id="invPrixVente" value="${produit ? produit.prixVente : ""}" placeholder="0" inputmode="decimal">
      </div>
      <div class="inv-field">
        <label>Stock actuel</label>
        <input type="number" id="invStock" value="${produit ? produit.stock : ""}" placeholder="0" inputmode="numeric">
      </div>
      <div class="inv-modal-actions">
        <button class="inv-btn-secondary" id="invCancelBtn">Annuler</button>
        <button class="inv-btn-primary" id="invSaveBtn">Enregistrer</button>
      </div>
      ${produit ? '<button class="inv-btn-danger" id="invDeleteBtn">Supprimer ce produit</button>' : ""}
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  document.getElementById("invCancelBtn").addEventListener("click", closeModal);
  document.getElementById("invSaveBtn").addEventListener("click", saveProduit);
  const delBtn = document.getElementById("invDeleteBtn");
  if (delBtn) delBtn.addEventListener("click", supprimerProduit);
}

function closeModal() {
  const backdrop = document.getElementById("invModalBackdrop");
  if (backdrop) backdrop.remove();
  produitEnEdition = null;
}

async function saveProduit() {
  const errorEl = document.getElementById("invModalError");
  const nom = document.getElementById("invNom").value.trim();
  const categorie = document.getElementById("invCategorie").value;
  const prixAchat = parseFloat(document.getElementById("invPrixAchat").value);
  const prixVente = parseFloat(document.getElementById("invPrixVente").value);
  const stock = parseInt(document.getElementById("invStock").value, 10);
  errorEl.textContent = "";

  if (!nom) { errorEl.textContent = "Donne un nom au produit."; return; }
  if (!categorie) { errorEl.textContent = "Choisis une catégorie."; return; }
  if (isNaN(prixAchat) || prixAchat < 0) { errorEl.textContent = "Prix d'achat invalide."; return; }
  if (isNaN(prixVente) || prixVente < 0) { errorEl.textContent = "Prix de vente invalide."; return; }
  if (isNaN(stock) || stock < 0) { errorEl.textContent = "Stock invalide."; return; }

  const saveBtn = document.getElementById("invSaveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Enregistrement...";

  try {
    if (produitEnEdition) {
      await updateDoc(
        doc(db, "establishments", appState.establishmentId, "produits", produitEnEdition.id),
        { nom, categorie, prixAchat, prixVente, stock, updatedAt: serverTimestamp() }
      );
    } else {
      await addDoc(produitsRef(), {
        nom, categorie, prixAchat, prixVente, stock,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
    }
    closeModal();
  } catch (err) {
    errorEl.textContent = "Erreur : " + err.message;
    saveBtn.disabled = false;
    saveBtn.textContent = "Enregistrer";
  }
}

async function supprimerProduit() {
  if (!produitEnEdition) return;
  if (!confirm(`Supprimer "${produitEnEdition.nom}" ?`)) return;
  try {
    await deleteDoc(doc(db, "establishments", appState.establishmentId, "produits", produitEnEdition.id));
    closeModal();
  } catch (err) {
    const errorEl = document.getElementById("invModalError");
    if (errorEl) errorEl.textContent = "Erreur : " + err.message;
  }
}

function formatFcfa(n) {
  return Number(n || 0).toLocaleString("fr-FR") + " FCFA";
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

// Exposé pour que app.js (script classique, non-module) puisse l'appeler
window.InventaireModule = { render, cleanup, getProduitsParCategorie };
