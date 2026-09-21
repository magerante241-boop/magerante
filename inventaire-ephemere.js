// inventaire-ephemere.js — Stock de secours propre a la session du navigateur, reserve
// aux comptes anonymes (mode visiteur) et aux gerants sans droit d'edition sur
// l'inventaire reel du proprietaire. Regenere a partir du catalogue standard a chaque
// nouvelle session (aucune ecriture Firestore, aucun impact sur les donnees reelles de
// l'etablissement). Permet d'ajouter/completer un produit manquant a la volee pour ne
// jamais bloquer une vente ou une facture faute de produit configure.
import { CATALOGUE_STANDARD } from "./catalogue-standard.js";
import { formaterQuantiteAvecCasiers } from "./casiers.js";

const CLE_SESSION = "mg_inventaire_ephemere_session";
let produitsCache = null;
let editingId = null;

function genererId() {
  return "eph_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function chargerDepuisSession() {
  try {
    const brut = sessionStorage.getItem(CLE_SESSION);
    if (brut) {
      const data = JSON.parse(brut);
      if (Array.isArray(data) && data.length) return data;
    }
  } catch (e) { /* ignore */ }
  return CATALOGUE_STANDARD.map((p) => ({ id: genererId(), ...p }));
}

function sauvegarder() {
  try { sessionStorage.setItem(CLE_SESSION, JSON.stringify(produitsCache)); } catch (e) { /* ignore */ }
}

function getProduits() {
  if (!produitsCache) produitsCache = chargerDepuisSession();
  return produitsCache;
}

export async function getTousLesProduits() {
  return getProduits();
}

export function ajouterOuMajProduit({ id, nom, categorie, prixAchat, prixVente, stock }) {
  const produits = getProduits();
  const nomPropre = String(nom || "").trim();
  if (!nomPropre) return { success: false, message: "Nom du produit requis." };
  let cible = id ? produits.find((p) => p.id === id) : produits.find((p) => p.nom.toLowerCase() === nomPropre.toLowerCase());
  if (cible) {
    cible.nom = nomPropre;
    cible.categorie = categorie || cible.categorie || "Bar";
    cible.prixAchat = Number(prixAchat) || 0;
    cible.prixVente = Number(prixVente) || 0;
    cible.stock = Number(stock) || 0;
  } else {
    cible = { id: genererId(), nom: nomPropre, categorie: categorie || "Bar", prixAchat: Number(prixAchat) || 0, prixVente: Number(prixVente) || 0, stock: Number(stock) || 0 };
    produits.push(cible);
  }
  sauvegarder();
  return { success: true, produit: cible };
}

export function supprimerProduit(id) {
  const produits = getProduits();
  const idx = produits.findIndex((p) => p.id === id);
  if (idx !== -1) { produits.splice(idx, 1); sauvegarder(); }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatFcfa(n) {
  return Number(n || 0).toLocaleString("fr-FR") + " FCFA";
}

function ligneAffichage(p) {
  return `
    <tr data-id="${p.id}" style="border-bottom:1px solid #eee;">
      <td style="padding:6px 4px;">${escapeHtml(p.nom)}</td>
      <td style="padding:6px 4px;">${formaterQuantiteAvecCasiers(p.stock, p)}</td>
      <td style="padding:6px 4px;">${formatFcfa(p.prixVente)}</td>
      <td style="padding:6px 4px;">${formatFcfa((p.prixVente || 0) - (p.prixAchat || 0))}</td>
      <td style="padding:6px 4px; white-space:nowrap;">
        <button class="eph-editer" data-id="${p.id}" style="border:none; background:none; cursor:pointer; font-size:15px;">✏️</button>
        <button class="eph-supprimer" data-id="${p.id}" style="border:none; background:none; cursor:pointer; font-size:15px;">🗑️</button>
      </td>
    </tr>
  `;
}

function ligneEdition(p) {
  return `
    <tr data-id="${p.id}" class="eph-row-active" style="border-bottom:1px solid #eee;">
      <td style="padding:6px 4px;"><input type="text" class="eph-edit-nom" value="${escapeHtml(p.nom)}" style="width:100px; padding:6px; border-radius:6px; border:1px solid #ccc;"></td>
      <td style="padding:6px 4px;"><input type="number" class="eph-edit-stock" value="${p.stock}" style="width:55px; padding:6px; border-radius:6px; border:1px solid #ccc;"></td>
      <td style="padding:6px 4px;"><input type="number" class="eph-edit-prixvente" value="${p.prixVente}" style="width:65px; padding:6px; border-radius:6px; border:1px solid #ccc;"></td>
      <td style="padding:6px 4px;"><input type="number" class="eph-edit-prixachat" value="${p.prixAchat}" placeholder="Achat" style="width:65px; padding:6px; border-radius:6px; border:1px solid #ccc;"></td>
      <td style="padding:6px 4px; white-space:nowrap;">
        <button class="eph-sauver" data-id="${p.id}" style="border:none; background:none; cursor:pointer; font-size:15px;">✅</button>
        <button class="eph-annuler" data-id="${p.id}" style="border:none; background:none; cursor:pointer; font-size:15px;">✖️</button>
      </td>
    </tr>
  `;
}

export function render(container) {
  const focusNom = window._inventaireEphemereFocusNom || "";
  window._inventaireEphemereFocusNom = "";
  const produits = getProduits().slice().sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  container.innerHTML = `
    <div class="guide-page">
      <h3 class="guide-title">📦 Stock de session (temporaire)</h3>
      <p class="placeholder-msg" style="margin-bottom:14px;">
        Ce stock est propre a cet appareil et a cette session : il repart des valeurs
        par defaut a chaque nouvelle connexion. Il permet d'ajouter ou d'ajuster un
        produit manquant sans toucher a l'inventaire reel de l'etablissement.
      </p>
      <p style="font-size:11px; color:var(--muted,#888); margin:-8px 0 8px;">Pour modifier ou supprimer un produit existant, utilise les icones ✏️ / 🗑️ sur sa ligne ci-dessous.</p>
      <div style="overflow-x:auto; -webkit-overflow-scrolling:touch;"><table style="width:100%; min-width:520px; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="text-align:left; border-bottom:1px solid #ccc;">
            <th style="padding:6px 4px;">Produit</th>
            <th style="padding:6px 4px;">Stock</th>
            <th style="padding:6px 4px;">Prix vente</th>
            <th style="padding:6px 4px;" id="ephColBenefice">Benefice/u.</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="ephTbody">
          ${produits.map((p) => p.id === editingId ? ligneEdition(p) : ligneAffichage(p)).join("")}
        </tbody>
      </table>
      <div class="inv-scroll-arrow inv-scroll-arrow-left" id="ephScrollArrowLeft">‹</div>
      <div class="inv-scroll-arrow inv-scroll-arrow-right" id="ephScrollArrowRight">›</div>
      </div>
      <div id="ephAjoutZone" style="background:var(--surface2,#1c1f23); border-radius:10px; padding:12px; margin-bottom:16px;">
        <strong style="display:block; margin-bottom:8px;">➕ Ajouter un nouveau produit</strong>
        <input type="text" id="ephNom" placeholder="Nom du produit (ex: Djino Pamplemousse)" value="${escapeHtml(focusNom)}" style="width:100%; margin-bottom:6px; padding:8px; border-radius:8px; border:1px solid #ccc;">
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <input type="number" id="ephPrixAchat" placeholder="Prix achat" style="flex:1; min-width:90px; padding:8px; border-radius:8px; border:1px solid #ccc;">
          <input type="number" id="ephPrixVente" placeholder="Prix vente" style="flex:1; min-width:90px; padding:8px; border-radius:8px; border:1px solid #ccc;">
          <input type="number" id="ephStock" placeholder="Quantite" value="20" style="flex:1; min-width:90px; padding:8px; border-radius:8px; border:1px solid #ccc;">
        </div>
        <button id="ephBtnAjouter" class="inv-btn-primary" style="margin-top:8px; width:100%;">Enregistrer dans le stock de session</button>
      </div>
    </div>
  `;
  (function initEphScrollArrows() {
    const wrap = document.getElementById("ephScrollWrap");
    const arrowL = document.getElementById("ephScrollArrowLeft");
    const arrowR = document.getElementById("ephScrollArrowRight");
    if (!wrap || !arrowL || !arrowR) return;
    function update() {
      const max = wrap.scrollWidth - wrap.clientWidth;
      const scrollable = max > 4;
      arrowL.style.display = scrollable ? "flex" : "none";
      arrowR.style.display = scrollable ? "flex" : "none";
      arrowL.style.opacity = wrap.scrollLeft > 4 ? "1" : "0";
      arrowR.style.opacity = wrap.scrollLeft < max - 4 ? "1" : "0";
    }
    wrap.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    arrowL.addEventListener("click", () => wrap.scrollBy({ left: -160, behavior: "smooth" }));
    arrowR.addEventListener("click", () => wrap.scrollBy({ left: 160, behavior: "smooth" }));
    update();
  })();

  document.getElementById("ephBtnAjouter").addEventListener("click", () => {
    const nom = document.getElementById("ephNom").value;
    const prixAchat = document.getElementById("ephPrixAchat").value;
    const prixVente = document.getElementById("ephPrixVente").value;
    const stock = document.getElementById("ephStock").value;
    const res = ajouterOuMajProduit({ nom, prixAchat, prixVente, stock });
    if (res.success) {
      document.getElementById("ephNom").value = "";
      document.getElementById("ephPrixAchat").value = "";
      document.getElementById("ephPrixVente").value = "";
      document.getElementById("ephStock").value = "20";
      render(container);
    } else {
      alert(res.message);
    }
  });

  container.querySelectorAll(".eph-editer").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingId = btn.dataset.id;
      render(container);
    });
  });

  container.querySelectorAll(".eph-supprimer").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = produits.find((x) => x.id === btn.dataset.id);
      const nom = p ? p.nom : "ce produit";
      if (confirm(`Supprimer "${nom}" du stock de session ?`)) {
        supprimerProduit(btn.dataset.id);
        if (editingId === btn.dataset.id) editingId = null;
        render(container);
      }
    });
  });

  container.querySelectorAll(".eph-sauver").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const trEl = btn.closest("tr");
      const nom = trEl.querySelector(".eph-edit-nom").value;
      const stock = trEl.querySelector(".eph-edit-stock").value;
      const prixVente = trEl.querySelector(".eph-edit-prixvente").value;
      const prixAchat = trEl.querySelector(".eph-edit-prixachat").value;
      const res = ajouterOuMajProduit({ id, nom, prixAchat, prixVente, stock });
      if (res.success) {
        editingId = null;
        render(container);
      } else {
        alert(res.message);
      }
    });
  });

  container.querySelectorAll(".eph-annuler").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingId = null;
      render(container);
    });
  });

  if (focusNom) {
    setTimeout(() => {
      const inp = document.getElementById("ephNom");
      if (inp) inp.focus();
      const zone = document.getElementById("ephAjoutZone");
      if (zone) zone.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }
}

export function cleanup() { editingId = null; }

window.InventaireEphemereModule = { render, cleanup, getTousLesProduits, ajouterOuMajProduit, supprimerProduit };
