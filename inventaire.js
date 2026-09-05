// inventaire.js — Module Inventaire : liste, ajout, édition, suppression des produits
import {
  db, doc, collection, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, where, getDocs, serverTimestamp, writeBatch
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


const PRODUITS_DEMO = [
  { nom: "Régab 33cl", categorie: "Bar", prixAchat: 300, prixVente: 350, stock: 100 },
  { nom: "Régab 65cl", categorie: "Bar", prixAchat: 433, prixVente: 600, stock: 80 },
  { nom: "Castel Beer 33cl", categorie: "Bar", prixAchat: 275, prixVente: 450, stock: 100 },
  { nom: "Castel Beer 65cl", categorie: "Bar", prixAchat: 550, prixVente: 900, stock: 80 },
  { nom: "Beaufort 33cl", categorie: "Bar", prixAchat: 417, prixVente: 700, stock: 60 },
  { nom: "Guinness 33cl", categorie: "Bar", prixAchat: 583, prixVente: 1000, stock: 50 },
  { nom: "33 Export 33cl", categorie: "Bar", prixAchat: 275, prixVente: 450, stock: 60 },
  { nom: "Heineken 33cl", categorie: "Bar", prixAchat: 750, prixVente: 1100, stock: 50 },
  { nom: "Coca-Cola 33cl", categorie: "Bar", prixAchat: 300, prixVente: 500, stock: 120 },
  { nom: "Fanta Orange 33cl", categorie: "Bar", prixAchat: 300, prixVente: 500, stock: 100 },
  { nom: "Sprite 33cl", categorie: "Bar", prixAchat: 300, prixVente: 500, stock: 100 },
  { nom: "Eau minérale Andza 50cl", categorie: "Bar", prixAchat: 200, prixVente: 400, stock: 150 },
  { nom: "Eau minérale Andza 1.5L", categorie: "Bar", prixAchat: 400, prixVente: 550, stock: 80 },
  { nom: "Eau minérale Odzi 50cl", categorie: "Bar", prixAchat: 200, prixVente: 400, stock: 150 },
  { nom: "Jus d'ananas 33cl", categorie: "Bar", prixAchat: 350, prixVente: 600, stock: 60 },
  { nom: "Jus de mangue 33cl", categorie: "Bar", prixAchat: 350, prixVente: 600, stock: 60 },
  { nom: "Vin rouge (bouteille) 75cl", categorie: "Bar", prixAchat: 2500, prixVente: 5000, stock: 30 },
  { nom: "Vin blanc (bouteille) 75cl", categorie: "Bar", prixAchat: 2500, prixVente: 5000, stock: 30 },
  { nom: "Vin rosé (bouteille) 75cl", categorie: "Bar", prixAchat: 2500, prixVente: 5000, stock: 20 },
  { nom: "Whisky Johnnie Walker Red Label 70cl", categorie: "Club", prixAchat: 8000, prixVente: 15000, stock: 20 },
  { nom: "Whisky Jack Daniel's 70cl", categorie: "Club", prixAchat: 10000, prixVente: 18000, stock: 15 },
  { nom: "Pastis 51 70cl", categorie: "Club", prixAchat: 6000, prixVente: 12000, stock: 15 },
  { nom: "Ricard 70cl", categorie: "Club", prixAchat: 6500, prixVente: 12500, stock: 15 },
  { nom: "Gin Gordon's 70cl", categorie: "Club", prixAchat: 5500, prixVente: 11000, stock: 15 },
  { nom: "Vodka Smirnoff 70cl", categorie: "Club", prixAchat: 5500, prixVente: 11000, stock: 15 },
  { nom: "Rhum Negrita 70cl", categorie: "Club", prixAchat: 4500, prixVente: 9000, stock: 15 },
  { nom: "Cognac Hennessy VS 70cl", categorie: "Club", prixAchat: 15000, prixVente: 28000, stock: 10 },
  { nom: "Liqueur Baileys 70cl", categorie: "Club", prixAchat: 9000, prixVente: 16000, stock: 10 },
  { nom: "Champagne Moët & Chandon 75cl", categorie: "Club", prixAchat: 25000, prixVente: 45000, stock: 6 },
  { nom: "Vin mousseux 75cl", categorie: "Club", prixAchat: 3000, prixVente: 6000, stock: 15 },
  { nom: "Chips paquet 45g", categorie: "Snack", prixAchat: 300, prixVente: 500, stock: 50 },
  { nom: "Cacahuètes grillées sachet", categorie: "Snack", prixAchat: 200, prixVente: 400, stock: 50 },
  { nom: "Biscuits paquet", categorie: "Snack", prixAchat: 250, prixVente: 450, stock: 40 },
  { nom: "Chocolat tablette", categorie: "Snack", prixAchat: 400, prixVente: 700, stock: 30 },
  { nom: "Brochettes de bœuf (unité)", categorie: "Snack", prixAchat: 500, prixVente: 1000, stock: 40 },
  { nom: "Poulet braisé (portion)", categorie: "Snack", prixAchat: 1500, prixVente: 3000, stock: 20 },
  { nom: "Cigarettes Rothmans (paquet)", categorie: "Snack", prixAchat: 1000, prixVente: 1500, stock: 40 },
  { nom: "Cigarettes Marlboro (paquet)", categorie: "Snack", prixAchat: 1200, prixVente: 1800, stock: 40 },
  { nom: "Cigarettes Dunhill (paquet)", categorie: "Snack", prixAchat: 1300, prixVente: 2000, stock: 30 },
  { nom: "Cigarettes London (paquet)", categorie: "Snack", prixAchat: 900, prixVente: 1400, stock: 30 },
  { nom: "Glaçons (sachet)", categorie: "Snack", prixAchat: 200, prixVente: 500, stock: 60 },
];

export async function importProduitsDemo() {
  if (!appState.establishmentId) {
    return { success: false, message: "Établissement non initialisé." };
  }
  const batch = writeBatch(db);
  const ref = produitsRef();
  PRODUITS_DEMO.forEach((p) => {
    const newDocRef = doc(ref);
    batch.set(newDocRef, { ...p, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  await batch.commit();
  return { success: true, count: PRODUITS_DEMO.length };
}

window.InventaireModule = { render, cleanup, getProduitsParCategorie, getTousLesProduits, importProduitsDemo };
