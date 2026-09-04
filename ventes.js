// ventes.js — Enregistrement des ventes : montant libre OU produit de l'inventaire
// (deduit automatiquement le stock quand une vente est liee a un produit).
import {
  db, doc, collection, addDoc, updateDoc, getDocs, query, orderBy, serverTimestamp, increment
} from "./firebase-config.js";
import { appState } from "./state.js";

function ventesRef() {
  return collection(db, "establishments", appState.establishmentId, "ventes");
}
function produitsRef() {
  return collection(db, "establishments", appState.establishmentId, "produits");
}

export function ouvrirModaleVente(montantInitial) {
  if (!appState.establishmentId) {
    alert("Initialisation en cours, réessaie dans un instant.");
    return;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "inv-modal-backdrop";
  backdrop.id = "venteModalBackdrop";
  backdrop.innerHTML = `
    <div class="inv-modal">
      <h2>Nouvelle vente</h2>
      <p class="inv-error" id="venteModalError"></p>

      <div style="display:flex; gap:8px; margin-bottom:14px;">
        <button type="button" id="venteBtnModeLibre" style="flex:1; padding:10px; border-radius:10px; border:1px solid #2e7d32; background:#2e7d32; color:white; font-weight:bold; font-size:13px;">Montant libre</button>
        <button type="button" id="venteBtnModeProduit" style="flex:1; padding:10px; border-radius:10px; border:1px solid #2e7d32; background:white; color:#2e7d32; font-weight:bold; font-size:13px;">Produit inventaire</button>
      </div>

      <div id="venteLibreZone" class="inv-field">
        <label>Montant de la vente (FCFA)</label>
        <input type="number" id="venteMontantLibre" value="${montantInitial || ""}" placeholder="0" inputmode="decimal">
      </div>

      <div id="venteProduitZone" class="inv-field" hidden>
        <label>Produit</label>
        <select id="venteProduitSelect"><option value="">Chargement...</option></select>
        <label style="margin-top:10px; display:block;">Quantité</label>
        <input type="number" id="venteQuantite" value="1" min="1" inputmode="numeric">
        <p id="venteTotalPreview" style="font-size:13px; color:#555; margin-top:8px;"></p>
      </div>

      <div class="inv-modal-actions">
        <button class="inv-btn-secondary" id="venteCancelBtn">Annuler</button>
        <button class="inv-btn-primary" id="venteSaveBtn">Enregistrer la vente</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  document.getElementById("venteCancelBtn").addEventListener("click", closeModal);

  let mode = "libre";
  let produitsCache = [];

  const btnLibre = document.getElementById("venteBtnModeLibre");
  const btnProduit = document.getElementById("venteBtnModeProduit");
  const libreZone = document.getElementById("venteLibreZone");
  const produitZone = document.getElementById("venteProduitZone");

  function setMode(newMode) {
    mode = newMode;
    const actif = "background:#2e7d32; color:white;";
    const inactif = "background:white; color:#2e7d32;";
    btnLibre.style.cssText = "flex:1; padding:10px; border-radius:10px; border:1px solid #2e7d32; font-weight:bold; font-size:13px;" + (mode === "libre" ? actif : inactif);
    btnProduit.style.cssText = "flex:1; padding:10px; border-radius:10px; border:1px solid #2e7d32; font-weight:bold; font-size:13px;" + (mode === "produit" ? actif : inactif);
    libreZone.hidden = mode !== "libre";
    produitZone.hidden = mode !== "produit";
    if (mode === "produit" && produitsCache.length === 0) chargerProduits();
  }
  btnLibre.addEventListener("click", () => setMode("libre"));
  btnProduit.addEventListener("click", () => setMode("produit"));

  async function chargerProduits() {
    const select = document.getElementById("venteProduitSelect");
    try {
      const snap = await getDocs(query(produitsRef(), orderBy("nom")));
      produitsCache = [];
      snap.forEach((d) => produitsCache.push({ id: d.id, ...d.data() }));
      if (produitsCache.length === 0) {
        select.innerHTML = `<option value="">Aucun produit dans l'inventaire</option>`;
        return;
      }
      select.innerHTML = produitsCache.map((p) =>
        `<option value="${p.id}">${escapeHtml(p.nom)} — ${Number(p.prixVente || 0).toLocaleString("fr-FR")} FCFA (${p.stock} en stock)</option>`
      ).join("");
      updateTotalPreview();
    } catch (err) {
      select.innerHTML = `<option value="">Erreur : ${escapeHtml(err.message)}</option>`;
    }
  }

  function updateTotalPreview() {
    const select = document.getElementById("venteProduitSelect");
    const qteInput = document.getElementById("venteQuantite");
    const preview = document.getElementById("venteTotalPreview");
    const produit = produitsCache.find((p) => p.id === select.value);
    if (!produit) { preview.textContent = ""; return; }
    const qte = parseInt(qteInput.value, 10) || 0;
    const total = Number(produit.prixVente || 0) * qte;
    preview.textContent = "Total : " + total.toLocaleString("fr-FR") + " FCFA" +
      (qte > produit.stock ? " — stock insuffisant (" + produit.stock + " disponible)" : "");
    preview.style.color = qte > produit.stock ? "#b00020" : "#555";
  }
  backdrop.addEventListener("input", (e) => {
    if (e.target.id === "venteQuantite" || e.target.id === "venteProduitSelect") updateTotalPreview();
  });
  backdrop.addEventListener("change", (e) => {
    if (e.target.id === "venteProduitSelect") updateTotalPreview();
  });

  document.getElementById("venteSaveBtn").addEventListener("click", async () => {
    const errorEl = document.getElementById("venteModalError");
    errorEl.textContent = "";
    const saveBtn = document.getElementById("venteSaveBtn");

    if (mode === "libre") {
      const montant = parseFloat(document.getElementById("venteMontantLibre").value);
      if (isNaN(montant) || montant <= 0) { errorEl.textContent = "Montant invalide."; return; }
      saveBtn.disabled = true; saveBtn.textContent = "Enregistrement...";
      try {
        await addDoc(ventesRef(), { montant, type: "libre", date: serverTimestamp() });
        closeModal();
      } catch (err) {
        errorEl.textContent = "Erreur : " + err.message;
        saveBtn.disabled = false; saveBtn.textContent = "Enregistrer la vente";
      }
    } else {
      const select = document.getElementById("venteProduitSelect");
      const produit = produitsCache.find((p) => p.id === select.value);
      const qte = parseInt(document.getElementById("venteQuantite").value, 10);
      if (!produit) { errorEl.textContent = "Choisis un produit."; return; }
      if (isNaN(qte) || qte <= 0) { errorEl.textContent = "Quantité invalide."; return; }
      if (qte > produit.stock) { errorEl.textContent = "Stock insuffisant (" + produit.stock + " disponible)."; return; }
      const montant = Number(produit.prixVente || 0) * qte;
      saveBtn.disabled = true; saveBtn.textContent = "Enregistrement...";
      try {
        await addDoc(ventesRef(), {
          montant, type: "produit", produitId: produit.id, produitNom: produit.nom,
          quantite: qte, date: serverTimestamp()
        });
        await updateDoc(doc(db, "establishments", appState.establishmentId, "produits", produit.id), {
          stock: increment(-qte)
        });
        closeModal();
      } catch (err) {
        errorEl.textContent = "Erreur : " + err.message;
        saveBtn.disabled = false; saveBtn.textContent = "Enregistrer la vente";
      }
    }
  });
}

function closeModal() {
  const backdrop = document.getElementById("venteModalBackdrop");
  if (backdrop) backdrop.remove();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

window.VentesModule = { ouvrirModaleVente };
