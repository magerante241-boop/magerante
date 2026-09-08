// ventes.js — Enregistrement des ventes : montant libre OU produit de l'inventaire
// (deduit automatiquement le stock quand une vente est liee a un produit).
import {
  auth, db, doc, collection, addDoc, getDocs, onSnapshot, query, orderBy, serverTimestamp, increment, runTransaction
} from "./firebase-config.js";
import { appState } from "./state.js";
import { creerNotification } from "./notifications.js";

function ventesRef() {
  return collection(db, "establishments", appState.establishmentId, "ventes");
}

function journalRef() {
  return collection(db, "establishments", appState.establishmentId, "journal");
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
        const auteurId = auth.currentUser ? auth.currentUser.uid : null;
        const auteurNom = (window.AuthState && window.AuthState.nomGerant) || null;
        await addDoc(ventesRef(), { montant, type: "libre", date: serverTimestamp(), auteurId });
        addDoc(journalRef(), { type: "vente", sousType: "libre", montant, date: serverTimestamp(), auteurId, auteurNom, source: "vente" }).catch(() => {});
        creerNotification({ type: "vente", titre: "Nouvelle vente", message: `Vente de ${montant.toLocaleString("fr-FR")} FCFA enregistrée${auteurNom ? " par " + auteurNom : ""}.`, cible: "ventes" });
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
        const auteurId2 = auth.currentUser ? auth.currentUser.uid : null;
        const auteurNom2 = (window.AuthState && window.AuthState.nomGerant) || null;
        const produitDocRef = doc(db, "establishments", appState.establishmentId, "produits", produit.id);
        const venteDocRef = doc(ventesRef());

        // Transaction atomique : on relit le stock réel au moment de l'écriture
        // (pas le cache client, qui peut être périmé si un autre gérant a vendu
        // entre-temps) et on refuse si ce n'est plus suffisant. Vente et
        // décrément de stock réussissent ou échouent ensemble — jamais l'un
        // sans l'autre.
        await runTransaction(db, async (tx) => {
          const produitSnap = await tx.get(produitDocRef);
          const stockActuel = produitSnap.exists() ? Number(produitSnap.data().stock || 0) : 0;
          if (qte > stockActuel) {
            throw new Error("Stock insuffisant (" + stockActuel + " disponible désormais).");
          }
          tx.set(venteDocRef, {
            montant, type: "produit", produitId: produit.id, produitNom: produit.nom,
            quantite: qte, date: serverTimestamp(), auteurId: auteurId2
          });
          tx.update(produitDocRef, { stock: increment(-qte) });
        });

        addDoc(journalRef(), { type: "vente", sousType: "produit", produitNom: produit.nom, quantite: qte, montant, date: serverTimestamp(), auteurId: auteurId2, auteurNom: auteurNom2, source: "vente" }).catch(() => {});
        creerNotification({ type: "vente", titre: "Nouvelle vente", message: `${qte} x ${produit.nom} — ${montant.toLocaleString("fr-FR")} FCFA${auteurNom2 ? " par " + auteurNom2 : ""}.`, cible: "ventes" });
        closeModal();
      } catch (err) {
        errorEl.textContent = "Erreur : " + err.message;
        saveBtn.disabled = false; saveBtn.textContent = "Enregistrer la vente";
      }
    }
  });
}

export async function enregistrerVenteLigne(produitId, quantite) {
  if (!appState.establishmentId) {
    return { success: false, message: "Initialisation en cours, réessaie dans un instant." };
  }
  if (!produitId || !(quantite > 0)) {
    return { success: false, message: "Ligne invalide." };
  }
  try {
    const auteurId = auth.currentUser ? auth.currentUser.uid : null;
    const auteurNom = (window.AuthState && window.AuthState.nomGerant) || null;
    const produitDocRef = doc(db, "establishments", appState.establishmentId, "produits", produitId);
    const venteDocRef = doc(ventesRef());
    let produitNom = "";
    let montant = 0;
    await runTransaction(db, async (tx) => {
      const produitSnap = await tx.get(produitDocRef);
      if (!produitSnap.exists()) {
        throw new Error("Produit introuvable (a peut-être été supprimé).");
      }
      const data = produitSnap.data();
      const stockActuel = Number(data.stock || 0);
      if (quantite > stockActuel) {
        throw new Error("Stock insuffisant pour " + (data.nom || "ce produit") + " (" + stockActuel + " disponible).");
      }
      produitNom = data.nom || "";
      montant = Number(data.prixVente || 0) * quantite;
      tx.set(venteDocRef, {
        montant, type: "produit", produitId, produitNom,
        quantite, date: serverTimestamp(), auteurId
      });
      tx.update(produitDocRef, { stock: increment(-quantite) });
    });
    addDoc(journalRef(), {
      type: "vente", sousType: "produit", produitNom, quantite, montant,
      date: serverTimestamp(), auteurId, auteurNom, source: "facture"
    }).catch(() => {});
    creerNotification({ type: "vente", titre: "Nouvelle vente (facture)", message: `${quantite} x ${produitNom} — ${montant.toLocaleString("fr-FR")} FCFA${auteurNom ? " par " + auteurNom : ""}.` });
    return { success: true, montant, produitNom };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

function closeModal() {
  const backdrop = document.getElementById("venteModalBackdrop");
  if (backdrop) backdrop.remove();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// --- Vue "Historique des ventes" (onglet bas) ---
let unsubscribeVentes = null;
let ventesCache = [];
let filtrePeriodeActuel = "jour";

export function render(container) {
  if (!appState.establishmentId) {
    container.innerHTML = `<p class="placeholder-msg">Chargement de l'établissement...</p>`;
    return;
  }

  container.innerHTML = `
    <div class="inv-toolbar">
      <span class="inv-title">Ventes</span>
      <select id="venteFiltrePeriode" class="filtre-select" style="width:auto; margin:0;">
        <option value="jour">Aujourd'hui</option>
        <option value="semaine">Cette semaine</option>
        <option value="mois">Ce mois</option>
        <option value="tout">Tout</option>
      </select>
    </div>
    <div class="inv-list" id="venteTotalZone" style="padding:10px 14px; font-weight:bold;"></div>
    <div class="inv-list" id="venteListZone"><p class="inv-empty">Chargement...</p></div>
  `;

  const selectEl = document.getElementById("venteFiltrePeriode");
  selectEl.value = filtrePeriodeActuel;
  selectEl.addEventListener("change", () => {
    filtrePeriodeActuel = selectEl.value;
    afficherVentesFiltrees();
  });

  if (unsubscribeVentes) unsubscribeVentes();
  const q = query(ventesRef(), orderBy("date", "desc"));
  unsubscribeVentes = onSnapshot(q, (snap) => {
    ventesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    afficherVentesFiltrees();
  }, (err) => {
    const listEl = document.getElementById("venteListZone");
    if (listEl) listEl.innerHTML = `<p class="inv-empty">Erreur : ${err.message}</p>`;
  });
}

function afficherVentesFiltrees() {
  const listEl = document.getElementById("venteListZone");
  const totalEl = document.getElementById("venteTotalZone");
  if (!listEl || !totalEl) return; // vue quittée entre-temps

  const maintenant = new Date();
  let seuil = null;
  if (filtrePeriodeActuel === "jour") {
    seuil = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  } else if (filtrePeriodeActuel === "semaine") {
    const jour = maintenant.getDay() || 7;
    seuil = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - jour + 1);
  } else if (filtrePeriodeActuel === "mois") {
    seuil = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  }

  const filtrees = ventesCache.filter((v) => {
    if (!seuil) return true;
    if (!v.date || !v.date.toDate) return false;
    return v.date.toDate() >= seuil;
  });

  const total = filtrees.reduce((acc, v) => acc + Number(v.montant || 0), 0);
  totalEl.textContent = `Total : ${total.toLocaleString("fr-FR")} FCFA (${filtrees.length} vente${filtrees.length > 1 ? "s" : ""})`;

  if (filtrees.length === 0) {
    listEl.innerHTML = `<p class="inv-empty">Aucune vente pour cette période.</p>`;
    return;
  }

  listEl.innerHTML = filtrees.map((v) => {
    const d = v.date && v.date.toDate ? v.date.toDate() : null;
    const dateStr = d ? d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";
    const libelle = v.type === "produit" ? `${v.quantite} x ${escapeHtml(v.produitNom || "Produit")}` : "Vente (montant libre)";
    return `
      <div class="inv-row">
        <div>
          <div>${libelle}</div>
          <small style="color:var(--muted);">${dateStr}</small>
        </div>
        <div style="font-weight:bold;">${Number(v.montant || 0).toLocaleString("fr-FR")} FCFA</div>
      </div>
    `;
  }).join("");
}

export function cleanup() {
  if (unsubscribeVentes) { unsubscribeVentes(); unsubscribeVentes = null; }
}

window.VentesModule = { ouvrirModaleVente, enregistrerVenteLigne, render, cleanup };
