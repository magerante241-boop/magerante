// inventaire.js — Module Inventaire : liste, ajout, édition, suppression des produits
import {
  db, doc, collection, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, where, getDocs, serverTimestamp, writeBatch
} from "./firebase-config.js";
import { appState } from "./state.js";
import { creerNotification } from "./notifications.js";

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
    <button class="inv-stock-depart-btn" id="invStockDepartBtn">📋 Définir stock de départ</button>
    <div class="inv-list" id="invList"><p class="inv-empty">Chargement...</p></div>
  `;
  document.getElementById("invAddBtn").addEventListener("click", () => openModal(null));
  document.getElementById("invStockDepartBtn").addEventListener("click", () => openStockDepartModal());

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
    const parCategorie = new Map();
    snap.forEach((docSnap) => {
      const p = { id: docSnap.id, ...docSnap.data() };
      const cat = p.categorie || "Autres";
      if (!parCategorie.has(cat)) parCategorie.set(cat, []);
      parCategorie.get(cat).push(p);
    });

    [...parCategorie.keys()].sort().forEach((cat) => {
      const produits = parCategorie.get(cat);
      const groupe = document.createElement("div");
      groupe.className = "inv-groupe";
      groupe.innerHTML = `
        <button class="inv-groupe-header">
          <span>${escapeHtml(cat)} <span class="inv-groupe-count">(${produits.length})</span></span>
          <span class="inv-groupe-chevron">▸</span>
        </button>
        <div class="inv-groupe-body" hidden></div>
      `;
      const header = groupe.querySelector(".inv-groupe-header");
      const body = groupe.querySelector(".inv-groupe-body");
      produits.forEach((p) => {
        const isLow = Number(p.stock) <= 5;
        const ligne = document.createElement("div");
        ligne.className = "inv-ligne-compacte";
        ligne.innerHTML = `
          <span class="inv-ligne-nom">${escapeHtml(p.nom)}</span>
          <span class="inv-ligne-stock${isLow ? " low" : ""}">${p.stock}</span>
        `;
        ligne.addEventListener("click", (e) => { e.stopPropagation(); openModal(p); });
        body.appendChild(ligne);
      });
      header.addEventListener("click", () => {
        const ferme = body.hidden;
        body.hidden = !ferme;
        groupe.querySelector(".inv-groupe-chevron").textContent = ferme ? "▾" : "▸";
      });
      listEl.appendChild(groupe);
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

// --- Tuile "Définir stock de départ" : saisie groupée du stock pour tous les produits ---
// Trouve la marque (clé de MARQUES_TAILLES) correspondant à un nom de produit,
// et affiche/actualise un badge de quantité sur la tuile de marque correspondante
// dans la page Facture (tuiles toujours présentes dans le DOM, juste masquées).
function afficherBadgeSurTuileMarque(nomProduit, quantite) {
  const table = window.MARQUES_TAILLES;
  if (!table) return;
  const marqueKey = Object.keys(table).find(
    (k) => table[k].petite === nomProduit || table[k].grande === nomProduit
  );
  if (!marqueKey) return;
  const tuile = document.querySelector(`.marque-cell[data-marque="${marqueKey}"]`);
  if (!tuile) return;
  let badge = tuile.querySelector(".marque-cell-stock-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "marque-cell-stock-badge";
    tuile.appendChild(badge);
  }
  badge.textContent = quantite;
}

async function openStockDepartModal() {
  if (!appState.establishmentId) return;
  const backdrop = document.createElement("div");
  backdrop.className = "inv-modal-backdrop";
  backdrop.id = "invStockDepartBackdrop";
  backdrop.innerHTML = `
    <div class="inv-modal inv-stock-depart-modal">
      <h2>📋 Définir stock de départ</h2>
      <p class="inv-stock-depart-hint">Remplis la quantité de départ pour chaque produit. Cette valeur remplace immédiatement le stock actuel pour tout le monde, jusqu'à la prochaine saisie.</p>
      <div id="stockDepartListe"><p class="inv-empty">Chargement des produits...</p></div>
      <p class="inv-error" id="stockDepartError"></p>
      <div class="inv-modal-actions">
        <button class="inv-btn-secondary" id="stockDepartCancel">Annuler</button>
        <button class="inv-btn-primary" id="stockDepartSave">Valider le stock de départ</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const fermer = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) fermer(); });
  document.getElementById("stockDepartCancel").addEventListener("click", fermer);

  const q = query(produitsRef(), orderBy("nom"));
  const snap = await getDocs(q);
  const listeEl = document.getElementById("stockDepartListe");
  if (!listeEl) return;

  if (snap.empty) {
    listeEl.innerHTML = `<p class="inv-empty">Aucun produit à configurer.</p>`;
    return;
  }

  const parCategorie = new Map();
  snap.forEach((d) => {
    const p = { id: d.id, ...d.data() };
    const cat = p.categorie || "Autres";
    if (!parCategorie.has(cat)) parCategorie.set(cat, []);
    parCategorie.get(cat).push(p);
  });

  listeEl.innerHTML = [...parCategorie.keys()].sort().map((cat) => `
    <div class="stock-depart-groupe" data-cat="${escapeHtml(cat)}">
      <h4>${escapeHtml(cat)}</h4>
      ${parCategorie.get(cat).map((p) => {
        const benefUnitaire = (Number(p.prixVente) || 0) - (Number(p.prixAchat) || 0);
        return `
        <div class="stock-depart-ligne-detail" data-id="${p.id}" data-benef-unit="${benefUnitaire}">
          <button type="button" class="sdl-header">
            <span class="sdl-nom">${escapeHtml(p.nom)}</span>
            <span class="sdl-header-right">
              <span class="sdl-badge-saved" hidden></span>
              <span class="sdl-header-total">0 bouteille(s)</span>
              <span class="sdl-chevron">▸</span>
            </span>
          </button>
          <div class="sdl-body" hidden>
            <div class="sdl-prix-info">Achat ${(Number(p.prixAchat)||0).toLocaleString("fr-FR")} FCFA · Vente ${(Number(p.prixVente)||0).toLocaleString("fr-FR")} FCFA · Bénéfice/unité ${benefUnitaire.toLocaleString("fr-FR")} FCFA</span>
            <div class="sdl-row">
              <div class="sdl-casier-toggle">
                <button type="button" class="sdl-casier-btn active" data-taille="24">Casier 24</button>
                <button type="button" class="sdl-casier-btn" data-taille="12">Casier 12</button>
                <button type="button" class="sdl-casier-btn" data-taille="autre">Autre</button>
              </div>
              <input type="number" min="0" class="sdl-nb-casiers" placeholder="Nb casiers" value="0">
            </div>
            <div class="sdl-row sdl-row-autre" hidden>
              <input type="number" min="1" class="sdl-taille-autre" placeholder="Bouteilles par casier">
            </div>
            <div class="sdl-resultats">
              <span class="sdl-total-bouteilles">= 0 bouteille(s)</span>
              <span class="sdl-total-benef">Bénéfice : 0 FCFA</span>
            </div>
            <button type="button" class="sdl-btn-save">💾 Enregistrer</button>
          </div>
        </div>
      `;
      }).join("")}
      <div class="stock-depart-total-cat">
        <span class="sdc-bouteilles">Total catégorie : 0 bouteille(s)</span>
        <span class="sdc-benef">Bénéfice catégorie : 0 FCFA</span>
      </div>
    </div>
  `).join("");

  function recalculerLigne(ligneEl) {
    const tailleBtn = ligneEl.querySelector(".sdl-casier-btn.active");
    let taille;
    if (tailleBtn.dataset.taille === "autre") {
      taille = parseInt(ligneEl.querySelector(".sdl-taille-autre").value, 10) || 0;
    } else {
      taille = parseInt(tailleBtn.dataset.taille, 10);
    }
    const nbCasiers = parseInt(ligneEl.querySelector(".sdl-nb-casiers").value, 10) || 0;
    const totalBouteilles = nbCasiers * taille;
    const benefUnit = parseFloat(ligneEl.dataset.benefUnit) || 0;
    const totalBenef = totalBouteilles * benefUnit;
    ligneEl.querySelector(".sdl-total-bouteilles").textContent = `= ${totalBouteilles} bouteille(s)`;
    ligneEl.querySelector(".sdl-total-benef").textContent = `Bénéfice : ${totalBenef.toLocaleString("fr-FR")} FCFA`;
    ligneEl.querySelector(".sdl-header-total").textContent = `${totalBouteilles} bouteille(s)`;
    ligneEl.dataset.totalBouteilles = totalBouteilles;
    ligneEl.dataset.totalBenef = totalBenef;
    recalculerCategorie(ligneEl.closest(".stock-depart-groupe"));
  }

  function recalculerCategorie(groupeEl) {
    let totalBouteilles = 0, totalBenef = 0;
    groupeEl.querySelectorAll(".stock-depart-ligne-detail").forEach((l) => {
      totalBouteilles += Number(l.dataset.totalBouteilles) || 0;
      totalBenef += Number(l.dataset.totalBenef) || 0;
    });
    groupeEl.querySelector(".sdc-bouteilles").textContent = `Total catégorie : ${totalBouteilles} bouteille(s)`;
    groupeEl.querySelector(".sdc-benef").textContent = `Bénéfice catégorie : ${totalBenef.toLocaleString("fr-FR")} FCFA`;
  }

  listeEl.querySelectorAll(".stock-depart-ligne-detail").forEach((ligneEl) => {
    ligneEl.querySelector(".sdl-header").addEventListener("click", () => {
      const body = ligneEl.querySelector(".sdl-body");
      const ouvert = !body.hidden;
      body.hidden = ouvert;
      ligneEl.querySelector(".sdl-chevron").textContent = ouvert ? "▸" : "▾";
    });
    ligneEl.querySelectorAll(".sdl-casier-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        ligneEl.querySelectorAll(".sdl-casier-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const rowAutre = ligneEl.querySelector(".sdl-row-autre");
        rowAutre.hidden = btn.dataset.taille !== "autre";
        ligneEl.querySelector(".sdl-nb-casiers").value = "0";
        ligneEl.querySelector(".sdl-taille-autre").value = "";
        recalculerLigne(ligneEl);
      });
    });
    ligneEl.querySelector(".sdl-nb-casiers").addEventListener("input", () => recalculerLigne(ligneEl));
    ligneEl.querySelector(".sdl-taille-autre").addEventListener("input", () => recalculerLigne(ligneEl));
    ligneEl.querySelector(".sdl-btn-save").addEventListener("click", async () => {
      const btn = ligneEl.querySelector(".sdl-btn-save");
      const badge = ligneEl.querySelector(".sdl-badge-saved");
      const stock = Number(ligneEl.dataset.totalBouteilles) || 0;
      btn.disabled = true;
      btn.textContent = "...";
      try {
        await updateDoc(
          doc(db, "establishments", appState.establishmentId, "produits", ligneEl.dataset.id),
          { stock, updatedAt: serverTimestamp() }
        );
        badge.textContent = `✓ ${stock} en stock`;
        badge.hidden = false;
        btn.textContent = "💾 Enregistrer";
        const nomProduit = ligneEl.querySelector(".sdl-nom").textContent;
        afficherBadgeSurTuileMarque(nomProduit, stock);
      } catch (err) {
        alert("Erreur : " + err.message);
        btn.textContent = "💾 Enregistrer";
      }
      btn.disabled = false;
    });
  });

  document.getElementById("stockDepartSave").addEventListener("click", async () => {
    const saveBtn = document.getElementById("stockDepartSave");
    const errorEl = document.getElementById("stockDepartError");
    saveBtn.disabled = true;
    errorEl.textContent = "";
    try {
      const batch = writeBatch(db);
      listeEl.querySelectorAll(".stock-depart-ligne-detail").forEach((ligneEl) => {
        const stock = Number(ligneEl.dataset.totalBouteilles) || 0;
        batch.update(
          doc(db, "establishments", appState.establishmentId, "produits", ligneEl.dataset.id),
          { stock, updatedAt: serverTimestamp() }
        );
      });
      await batch.commit();
      fermer();
    } catch (err) {
      errorEl.textContent = "Erreur : " + err.message;
      saveBtn.disabled = false;
    }
  });
}

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
    if (stock <= 5) {
      creerNotification({
        type: "stock_bas",
        titre: stock === 0 ? "Rupture de stock" : "Stock bas",
        message: `${nom} : il ne reste que ${stock} en stock.`
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
  { nom: "Régab 33cl", categorie: "Bar", prixAchat: 300, prixVente: 500, stock: 100 },
  { nom: "Régab 65cl", categorie: "Bar", prixAchat: 433, prixVente: 700, stock: 80 },
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
  { nom: "33 Export 65cl", categorie: "Bar", prixAchat: 500, prixVente: 800, stock: 40 },
  { nom: "Beaufort 65cl", categorie: "Bar", prixAchat: 800, prixVente: 1300, stock: 40 },
  { nom: "Guinness 65cl", categorie: "Bar", prixAchat: 1100, prixVente: 1900, stock: 30 },
  { nom: "Heineken 65cl", categorie: "Bar", prixAchat: 1400, prixVente: 2100, stock: 30 },
  { nom: "Coca-Cola 1L", categorie: "Bar", prixAchat: 500, prixVente: 900, stock: 60 },
  { nom: "Booster 24cl", categorie: "Bar", prixAchat: 400, prixVente: 700, stock: 60 },
  { nom: "Booster 50cl", categorie: "Bar", prixAchat: 700, prixVente: 1200, stock: 40 },
  { nom: "Tembo 33cl", categorie: "Bar", prixAchat: 275, prixVente: 400, stock: 60 },
  { nom: "Tembo 65cl", categorie: "Bar", prixAchat: 500, prixVente: 700, stock: 40 },
  { nom: "Malta Guinness 33cl", categorie: "Bar", prixAchat: 400, prixVente: 700, stock: 40 },
  { nom: "Malta Guinness 50cl", categorie: "Bar", prixAchat: 600, prixVente: 1000, stock: 30 },
  { nom: "Martini Rosso 1L", categorie: "Bar", prixAchat: 6000, prixVente: 9000, stock: 15 },
  { nom: "Martini Bianco 1L", categorie: "Bar", prixAchat: 6000, prixVente: 9000, stock: 15 },
  { nom: "Grand Versant Rouge 75cl", categorie: "Bar", prixAchat: 2500, prixVente: 4000, stock: 15 },
  { nom: "Grand Versant Blanc 75cl", categorie: "Bar", prixAchat: 2500, prixVente: 4000, stock: 15 },
  { nom: "Martini 70cl", categorie: "Bar", prixAchat: 4500, prixVente: 7000, stock: 15 },
  { nom: "Martini 1L", categorie: "Bar", prixAchat: 6000, prixVente: 9000, stock: 15 },
  { nom: "Grand Versant 70cl", categorie: "Bar", prixAchat: 2000, prixVente: 3500, stock: 15 },
  { nom: "Grand Versant 1L", categorie: "Bar", prixAchat: 2500, prixVente: 4000, stock: 15 },
  { nom: "Label 5 70cl", categorie: "Bar", prixAchat: 7000, prixVente: 13000, stock: 15 },
  { nom: "Label 5 1L", categorie: "Bar", prixAchat: 9000, prixVente: 17000, stock: 15 },
  { nom: "Ricard 1L", categorie: "Bar", prixAchat: 9000, prixVente: 17000, stock: 15 },
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

window.InventaireModule = { render, cleanup, getProduitsParCategorie, getTousLesProduits, importProduitsDemo, PRODUITS_DEMO };
