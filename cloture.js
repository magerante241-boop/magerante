import { auth, db, doc, getDoc, collection, getDocs, addDoc, query, where, orderBy, limit, serverTimestamp, onAuthStateChanged } from "./firebase-config.js";
import { appState } from "./state.js";
import { creerNotification } from "./notifications.js";
import { getTousLesProduits as getProduitsEphemeres } from "./inventaire-ephemere.js";
import { formaterQuantiteAvecCasiers } from "./casiers.js";

function calculerDebutFinJour() {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);
  return { debut, fin };
}

export async function obtenirDerniereCloture(estId) {
  const uid = auth.currentUser ? auth.currentUser.uid : null;
  const estGerant = !!uid && uid !== estId;
  const q = estGerant
    ? query(collection(db, "establishments", estId, "clotures"), where("gerantUid", "==", uid))
    : query(collection(db, "establishments", estId, "clotures"), orderBy("date", "desc"), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  let docSnap = snap.docs[0];
  if (estGerant) {
    const ms = (d) => { const t = d.data().date; return t && t.toDate ? t.toDate().getTime() : (t ? new Date(t).getTime() : 0); };
    docSnap = snap.docs.reduce((a, b) => (ms(b) > ms(a) ? b : a));
  }
  return { id: docSnap.id, ...docSnap.data() };
}

export async function factureDejaCloturee(estId, dateFacture) {
  const derniere = await obtenirDerniereCloture(estId);
  if (!derniere || !derniere.date) return false;
  const dateCloture = derniere.date.toDate ? derniere.date.toDate() : new Date(derniere.date);
  return dateFacture < dateCloture;
}

function construireMarqueParNom() {
  const marqueParNom = {};
  const table = (typeof window !== "undefined" && window.MARQUES_TAILLES) || {};
  Object.keys(table).forEach((marque) => {
    const { petite, grande } = table[marque];
    if (petite) marqueParNom[petite] = marque;
    if (grande) marqueParNom[grande] = marque;
  });
  const noms = (window.PRODUITS_UNIQUES_DJINO || ["Djino Pamplemousse", "Djino Cocktail", "Djino Ananas", "Djino Tonic"]);
  noms.forEach((n) => { if (!marqueParNom[n]) marqueParNom[n] = "Djino"; });
  return marqueParNom;
}

async function chargerResumeJour(estId, uid) {
  const derniereCloture = await obtenirDerniereCloture(estId);
  const debut = derniereCloture && derniereCloture.date
    ? (derniereCloture.date.toDate ? derniereCloture.date.toDate() : new Date(derniereCloture.date))
    : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const fin = new Date();

  const [ventesSnap, facturesSnap, produitsSnap, produitsSession] = await Promise.all([
    getDocs(query(
      collection(db, "establishments", estId, "ventes"),
      where("date", ">=", debut),
      where("date", "<", fin)
    )),
    getDocs(query(
      collection(db, "establishments", estId, "factures"),
      where("date", ">=", debut),
      where("date", "<", fin)
    )),
    getDocs(collection(db, "establishments", estId, "produits")),
    getProduitsEphemeres().catch(() => []),
  ]);

  const categorieParProduit = {};
  const prixAchatParProduit = {};
  const casierTailleParProduit = {};
  const stockRestant = [];
  produitsSnap.forEach((docSnap) => {
    const p = docSnap.data();
    categorieParProduit[docSnap.id] = p.categorie || "Autres";
    prixAchatParProduit[docSnap.id] = Number(p.prixAchat || 0);
    casierTailleParProduit[docSnap.id] = p.casierTaille;
    stockRestant.push({ nom: p.nom || "(sans nom)", categorie: p.categorie || "Autres", stock: Number(p.stock || 0) });
  });

  // Stock de session (mode visiteur / stock de secours) : catalogue local au
  // navigateur, distinct de l'inventaire Firestore reel ci-dessus. On merge
  // ses prix d'achat/categories (necessaires pour calculer le benefice des
  // ventes eph_) et on l'affiche a part dans "Stock restant" pour ne pas
  // confondre les deux catalogues.
  const stockSession = [];
  (produitsSession || []).forEach((p) => {
    categorieParProduit[p.id] = p.categorie || "Autres";
    prixAchatParProduit[p.id] = Number(p.prixAchat || 0);
    stockSession.push({ nom: p.nom || "(sans nom)", categorie: p.categorie || "Autres", stock: Number(p.stock || 0) });
  });

  const marqueParNom = construireMarqueParNom();

  let total = 0, nombre = 0, totalBenefice = 0;
  const parCategorie = {};
  const parCategorieBenefice = {};
  const parMarque = {};
  const parMarqueBenefice = {};
  const parProduit = {};
  const devisRenouvellement = {};

  ventesSnap.forEach((docSnap) => {
    const v = docSnap.data();
    if (v.auteurId !== uid) return;
    const montant = v.montant || 0;
    const quantite = v.quantite || 0;
    const prixAchat = prixAchatParProduit[v.produitId] || 0;
    const benefice = montant - (prixAchat * quantite);
    total += montant;
    totalBenefice += benefice;
    nombre += 1;

    const categorie = categorieParProduit[v.produitId] || "Autres";
    parCategorie[categorie] = (parCategorie[categorie] || 0) + montant;
    parCategorieBenefice[categorie] = (parCategorieBenefice[categorie] || 0) + benefice;

    const marque = marqueParNom[v.produitNom] || "Autre";
    parMarque[marque] = (parMarque[marque] || 0) + montant;
    parMarqueBenefice[marque] = (parMarqueBenefice[marque] || 0) + benefice;

    const nomProduit = v.produitNom || "Produit inconnu";
    if (!parProduit[nomProduit]) parProduit[nomProduit] = { quantite: 0, montant: 0, benefice: 0 };
    parProduit[nomProduit].quantite += quantite;
    parProduit[nomProduit].montant += montant;
    parProduit[nomProduit].benefice += benefice;

    if (quantite > 0 && v.type === "produit") {
      if (!devisRenouvellement[nomProduit]) devisRenouvellement[nomProduit] = { quantite: 0, coutTotal: 0, casierTaille: casierTailleParProduit[v.produitId] ?? null };
      devisRenouvellement[nomProduit].quantite += quantite;
      devisRenouvellement[nomProduit].coutTotal += prixAchat * quantite;
    }
  });

  const facturesJour = [];
  facturesSnap.forEach((docSnap) => {
    const f = docSnap.data();
    if (f.auteurId !== uid) return;
    facturesJour.push({ numero: f.numero || null, total: Number(f.total || 0) });
  });

  const stockParMarque = {};
  stockRestant.forEach((p) => {
    const marque = marqueParNom[p.nom] || p.categorie;
    if (!stockParMarque[marque]) stockParMarque[marque] = [];
    stockParMarque[marque].push({ nom: p.nom, stock: p.stock });
  });

  const stockSessionParMarque = {};
  stockSession.forEach((p) => {
    const marque = marqueParNom[p.nom] || p.categorie;
    if (!stockSessionParMarque[marque]) stockSessionParMarque[marque] = [];
    stockSessionParMarque[marque].push({ nom: p.nom, stock: p.stock });
  });

  const totalDevisRenouvellement = Object.values(devisRenouvellement).reduce((acc, d) => acc + d.coutTotal, 0);

  return { total, nombre, totalBenefice, parCategorie, parCategorieBenefice, parMarque, parMarqueBenefice, parProduit, facturesJour, stockParMarque, stockSessionParMarque, devisRenouvellement, totalDevisRenouvellement };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function construireTuilesVentilation(obj, beneficeObj) {
  const entrees = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  if (entrees.length === 0) return "";
  return `<div class="cloture-tuiles">${entrees.map(([cle, montant]) => {
    const benefice = beneficeObj ? (beneficeObj[cle] || 0) : null;
    return `
    <div class="cloture-tuile">
      <span>${escapeHtml(cle)}</span>
      <span class="cloture-tuile-val">${montant.toLocaleString("fr-FR")} FCFA${benefice !== null ? `<small class="cloture-tuile-benefice">+${benefice.toLocaleString("fr-FR")} béné.</small>` : ""}</span>
    </div>
  `;
  }).join("")}</div>`;
}


function construireStockHtml(stockParMarque) {
  const entrees = Object.entries(stockParMarque);
  if (entrees.length === 0) return "";
  return entrees.map(([marque, produits]) => `
    <div class="cloture-stock-groupe">
      <div class="cloture-stock-marque">${escapeHtml(marque)}</div>
      <table class="cloture-stock-table"><tbody>
        ${produits.map((p) => `<tr><td>${escapeHtml(p.nom)}</td><td class="${p.stock === 0 ? "stock-zero" : ""}">${formaterQuantiteAvecCasiers(p.stock, p)}</td></tr>`).join("")}
      </tbody></table>
    </div>
  `).join("");
}

function construireDevisHtml(devis, totalDevis) {
  const entrees = Object.entries(devis).sort((a, b) => b[1].coutTotal - a[1].coutTotal);
  if (entrees.length === 0) return "";
  return `
    <table class="cloture-stock-table" style="width:100%; border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left; padding:4px;">Produit</th>
          <th style="text-align:center; padding:4px;">Qté vendue</th>
          <th style="text-align:right; padding:4px;">Coût réappro</th>
        </tr>
      </thead>
      <tbody>
        ${entrees.map(([nom, d]) => `
          <tr>
            <td style="padding:4px;">${escapeHtml(nom)}</td>
            <td style="text-align:center; padding:4px;">${d.quantite}</td>
            <td style="text-align:right; padding:4px;">${d.coutTotal.toLocaleString("fr-FR")} FCFA</td>
          </tr>
        `).join("")}
      </tbody>
      <tfoot>
        <tr style="font-weight:bold; border-top:1px solid #ccc;">
          <td style="padding:4px;">Total</td>
          <td></td>
          <td style="text-align:right; padding:4px;">${totalDevis.toLocaleString("fr-FR")} FCFA</td>
        </tr>
      </tfoot>
    </table>
  `;
}

// --- Gestion des lignes de factures manuelles (ajoutées dynamiquement) ---
let compteurLigneManuelle = 0;

function ajouterLigneFactureManuelle() {
  const zone = document.getElementById("clotureFacturesManuellesListe");
  if (!zone) return;
  const id = "fm-" + (++compteurLigneManuelle);
  const ligne = document.createElement("div");
  ligne.className = "cloture-facture-manuelle-ligne";
  ligne.id = id;
  ligne.style.cssText = "display:flex; gap:6px; margin:6px 0; align-items:center;";
  ligne.innerHTML = `
    <input type="text" class="auth-input fm-desc" placeholder="Description (ex: Facture papier n°12)" style="flex:2;">
    <input type="number" class="auth-input fm-montant" placeholder="Montant" min="0" style="flex:1;">
    <button type="button" class="icon-btn fm-retirer" aria-label="Retirer">✕</button>
  `;
  ligne.querySelector(".fm-retirer").addEventListener("click", () => ligne.remove());
  zone.appendChild(ligne);
}

function collecterFacturesManuelles() {
  const zone = document.getElementById("clotureFacturesManuellesListe");
  if (!zone) return [];
  const lignes = [];
  zone.querySelectorAll(".cloture-facture-manuelle-ligne").forEach((el) => {
    const description = el.querySelector(".fm-desc")?.value.trim() || "";
    const montant = Number(el.querySelector(".fm-montant")?.value || 0);
    if (description || montant > 0) lignes.push({ description, montant });
  });
  return lignes;
}

function viderFacturesManuelles() {
  const zone = document.getElementById("clotureFacturesManuellesListe");
  if (zone) zone.innerHTML = "";
}

document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("menuClotureGerant");
  const clotureGate = document.getElementById("clotureGate");
  const resumeEl = document.getElementById("clotureResume");
  const errorEl = document.getElementById("clotureError");
  const btnConfirmer = document.getElementById("btnConfirmerCloture");
  const lienWhatsapp = document.getElementById("clotureLienWhatsapp");
  const btnClose = document.getElementById("btnCloseCloture");
  const inputFondDepart = document.getElementById("clotureFondDepart");
  const inputRecetteReelle = document.getElementById("clotureRecetteReelle");
  const inputCommentaire = document.getElementById("clotureCommentaire");
  const btnAjouterFm = document.getElementById("btnAjouterFactureManuelle");

  if (!menuBtn || !clotureGate) return;

  if (btnAjouterFm) btnAjouterFm.addEventListener("click", ajouterLigneFactureManuelle);

  let resumeCourant = null;
  let etablissementNomCourant = "";

  function imprimerTicketDevis() {
    if (!resumeCourant) return;
    const { devisRenouvellement, totalDevisRenouvellement } = resumeCourant;
    const entrees = Object.entries(devisRenouvellement || {}).sort((a, b) => b[1].coutTotal - a[1].coutTotal);
    if (entrees.length === 0) return;

    const maintenant = new Date();
    const dateStr = maintenant.toLocaleDateString("fr-FR");
    const heureStr = maintenant.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    let zone = document.getElementById("ticketImpressionDevis");
    if (!zone) {
      zone = document.createElement("div");
      zone.id = "ticketImpressionDevis";
      document.body.appendChild(zone);
    }

    zone.innerHTML = `
      <div class="ticket-entete">
        <div class="ticket-titre">${escapeHtml(etablissementNomCourant || "Etablissement")}</div>
        <div class="ticket-sous-titre">Devis de renouvellement de stock</div>
        <div class="ticket-date">${dateStr} a ${heureStr}</div>
      </div>
      <div class="ticket-separateur"></div>
      <table class="ticket-table"><tbody>
        ${entrees.map(([nom, d]) => `
          <tr><td colspan="2" class="ticket-produit-nom">${escapeHtml(nom)}</td></tr>
          <tr>
            <td class="ticket-produit-qte">${formaterQuantiteAvecCasiers(d.quantite, { nom, casierTaille: d.casierTaille })}</td>
            <td class="ticket-produit-montant">${d.coutTotal.toLocaleString("fr-FR")} FCFA</td>
          </tr>
        `).join("")}
      </tbody></table>
      <div class="ticket-separateur"></div>
      <div class="ticket-total-ligne">
        <span>TOTAL A REAPPROVISIONNER</span>
        <span>${totalDevisRenouvellement.toLocaleString("fr-FR")} FCFA</span>
      </div>
      <div class="ticket-pied">Genere par MAGERANTE</div>
    `;

    const ancienTitre = document.title;
    document.title = "Ticket_cloture_" + new Date().toISOString().slice(0,10).replace(/-/g,"");
    window.onafterprint = () => { document.title = ancienTitre; window.onafterprint = null; };
    window.print();
  }

  let clotureCle = null;
  let clotureEnvoyee = false;
  function reinitialiserCloture() {
    resumeCourant = null;
    resumeEl.innerHTML = "";
    if (inputFondDepart) { inputFondDepart.value = ""; inputFondDepart.removeAttribute("readonly"); }
    if (inputRecetteReelle) { inputRecetteReelle.value = ""; inputRecetteReelle.removeAttribute("readonly"); }
    if (inputCommentaire) { inputCommentaire.value = ""; inputCommentaire.removeAttribute("readonly"); }
    const totEl = document.getElementById("clotureTotalCaisseAttendu");
    if (totEl) { totEl.textContent = ""; totEl.hidden = true; }
    const ficheEl = document.getElementById("clotureFicheFigee");
    if (ficheEl) { ficheEl.hidden = true; ficheEl.innerHTML = ""; }
    const btnAnon = document.getElementById("btnEnregistrerClotureAnonyme");
    if (btnAnon) { btnAnon.hidden = true; btnAnon.disabled = false; btnAnon.textContent = "🔒 Enregistrer la clôture"; }
    viderFacturesManuelles();
  }
  function verifierCleCloture() {
    const cle = (appState.establishmentId || "") + "|" + (auth.currentUser ? auth.currentUser.uid : "") + "|" + ((window.AuthState && window.AuthState.role) || "");
    if (clotureCle !== null && cle !== clotureCle) reinitialiserCloture();
    clotureCle = cle;
  }
  window.reinitialiserCloture = () => { reinitialiserCloture(); clotureCle = null; };

  const btnLancerCloture = document.getElementById("btnLancerCloture");

  async function lancerCalculCloture() {
    if (clotureEnvoyee) { reinitialiserCloture(); clotureEnvoyee = false; }
    resumeEl.textContent = "Chargement du résumé...";

    const estId = appState.establishmentId;
    const uid = auth.currentUser?.uid;
    if (!estId || !uid) {
      resumeEl.textContent = "Impossible de charger le résumé pour le moment.";
      return;
    }

    try {
      const resume = await chargerResumeJour(estId, uid);
      resumeCourant = resume;
      const { total, nombre, parCategorie, parCategorieBenefice, parMarque, parMarqueBenefice, facturesJour, stockParMarque, stockSessionParMarque, devisRenouvellement, totalDevisRenouvellement, totalBenefice } = resume;

      const estSnap = await getDoc(doc(db, "establishments", estId));
      etablissementNomCourant = estSnap.exists() ? (estSnap.data().name || "") : "";
      const telephoneProprietaire = estSnap.exists() ? (estSnap.data().telephone || estSnap.data().whatsappEtablissement) : null;

      let htmlResume = `
        <div class="cloture-summary-card">
          ${etablissementNomCourant ? `<div class="cloture-summary-etab">${escapeHtml(etablissementNomCourant)}</div>` : ""}
          <div class="cloture-summary-row">
            <div><div class="cloture-summary-label">Chiffre d'affaires</div><div class="cloture-summary-total">${total.toLocaleString("fr-FR")} FCFA</div></div>
            <div><div class="cloture-summary-label">Bénéfice</div><div class="cloture-summary-total cloture-summary-benefice">${totalBenefice.toLocaleString("fr-FR")} FCFA</div></div>
          </div>
          <div class="cloture-summary-sub">${nombre} vente(s) · ${facturesJour.length} facture(s) numérique(s)</div>
        </div>
      `;
      if (Object.keys(parCategorie).length) {
        htmlResume += `<div class="cloture-section"><div class="cloture-section-title">Par catégorie</div>${construireTuilesVentilation(parCategorie, parCategorieBenefice)}</div>`;
      }
      if (Object.keys(parMarque).length) {
        htmlResume += `<div class="cloture-section"><div class="cloture-section-title">Par marque</div>${construireTuilesVentilation(parMarque, parMarqueBenefice)}</div>`;
      }
      const estCompteEnregistre = window.AuthState && (window.AuthState.accountType === "enregistre" || window.AuthState.accountType === "invite");
      if (estCompteEnregistre && Object.keys(stockParMarque).length) {
        htmlResume += `<div class="cloture-section"><div class="cloture-section-title">Stock restant</div>${construireStockHtml(stockParMarque)}</div>`;
      }
      if (!estCompteEnregistre && Object.keys(stockSessionParMarque).length) {
        htmlResume += `<div class="cloture-section"><div class="cloture-section-title">Stock restant</div>${construireStockHtml(stockSessionParMarque)}</div>`;
      }
      if (Object.keys(devisRenouvellement).length) {
        htmlResume += `<div class="cloture-section"><div class="cloture-section-title-row"><div class="cloture-section-title">Devis de renouvellement de stock</div><button type="button" id="btnImprimerDevis" class="btn-imprimer-devis">Imprimer</button></div>${construireDevisHtml(devisRenouvellement, totalDevisRenouvellement)}</div>`;
      }
      resumeEl.innerHTML = htmlResume;

      const btnImprimerDevis = document.getElementById("btnImprimerDevis");
      if (btnImprimerDevis) btnImprimerDevis.addEventListener("click", imprimerTicketDevis);

      btnConfirmer.dataset.total = total;
      btnConfirmer.dataset.nombre = nombre;
      btnConfirmer.disabled = false;
      btnConfirmer.textContent = (window.AuthState && window.AuthState.role === "GERANT_PROPRIETAIRE") ? "Enregistrer ma journée" : "Envoyer mes comptes au propriétaire";
      if (typeof errorEl !== "undefined" && errorEl) errorEl.textContent = "";

      const estAnonyme = window.AuthState && window.AuthState.accountType === "anonyme";
      const btnEnregistrerAnonyme = document.getElementById("btnEnregistrerClotureAnonyme");
      const ficheFigeeEl = document.getElementById("clotureFicheFigee");
      if (btnEnregistrerAnonyme) {
        btnEnregistrerAnonyme.hidden = !estAnonyme;
        btnEnregistrerAnonyme.disabled = false;
        btnEnregistrerAnonyme.textContent = "🔒 Enregistrer la clôture";
      }
      if (ficheFigeeEl) ficheFigeeEl.hidden = true;
      if (estAnonyme && btnEnregistrerAnonyme) {
        btnEnregistrerAnonyme.onclick = () => {
          const fond = Number(inputFondDepart?.value) || 0;
          const recette = Number(inputRecetteReelle?.value) || 0;
          const commentaireVal = inputCommentaire ? inputCommentaire.value : "";
          if (inputCommentaire) inputCommentaire.setAttribute("readonly", "readonly");
          if (inputFondDepart) inputFondDepart.setAttribute("readonly", "readonly");
          if (inputRecetteReelle) inputRecetteReelle.setAttribute("readonly", "readonly");
          btnEnregistrerAnonyme.disabled = true;
          btnEnregistrerAnonyme.textContent = "✅ Clôture enregistrée (session)";
          if (ficheFigeeEl) {
            ficheFigeeEl.hidden = false;
            ficheFigeeEl.innerHTML = `
              <div class="cloture-fiche-figee-titre">📋 Fiche de clôture — ${new Date().toLocaleString("fr-FR")}</div>
              <div>Chiffre d'affaires : <strong>${total.toLocaleString("fr-FR")} FCFA</strong></div>
              <div>Bénéfice : <strong>${totalBenefice.toLocaleString("fr-FR")} FCFA</strong></div>
              <div>${nombre} vente(s) · ${facturesJour.length} facture(s) numérique(s)</div>
              <div>Fond de caisse au départ : ${fond.toLocaleString("fr-FR")} FCFA</div>
              <div>Argent compté en caisse : ${recette.toLocaleString("fr-FR")} FCFA</div>
              ${commentaireVal ? `<div>Commentaire : ${escapeHtml(commentaireVal)}</div>` : ""}
              <div class="cloture-fiche-figee-avertissement">
                ⚠️ Cette fiche est temporaire et liée à votre session visiteur. Elle disparaîtra si vous vous déconnectez.
                <strong>Inscrivez-vous</strong> pour conserver l'historique de vos ventes, factures et clôtures.
              </div>
            `;
          }
        };
      }

      const totalCaisseEl = document.getElementById("clotureTotalCaisseAttendu");
      function majTotalCaisseAttendu() {
        if (!totalCaisseEl) return;
        const fond = Number(inputFondDepart?.value) || 0;
        const totalAttendu = fond + total;
        totalCaisseEl.textContent = `Total attendu en caisse (Fond + Factures) : ${totalAttendu.toLocaleString("fr-FR")} FCFA`;
        totalCaisseEl.hidden = false;
      }
      majTotalCaisseAttendu();
      if (inputFondDepart) inputFondDepart.addEventListener("input", majTotalCaisseAttendu);

      if (telephoneProprietaire) {
        const texte = `Bonjour, voici mes comptes du jour (${etablissementNomCourant}) : ${nombre} vente(s), ${total.toLocaleString("fr-FR")} FCFA au total.`;
        lienWhatsapp.href = `https://wa.me/${telephoneProprietaire}?text=${encodeURIComponent(texte)}`;
        lienWhatsapp.dataset.tel = String(telephoneProprietaire);
        lienWhatsapp.hidden = !(window.AuthState && (window.AuthState.accountType === "enregistre" || window.AuthState.accountType === "invite") && window.AuthState.role !== "GERANT_PROPRIETAIRE");
      }
    } catch (e) {
      resumeEl.textContent = "Erreur lors du chargement du résumé (" + (e && (e.code || e.message) || "inconnue") + ").";
      console.warn("Erreur resume cloture :", e);
    }
  }

  if (btnLancerCloture) btnLancerCloture.addEventListener("click", lancerCalculCloture);

  const STOCK_BAS_SEUIL = 5;
  const MAX_LIGNES_WA = 10;
  const fmtFcfa = (n) => Number(n || 0).toLocaleString("fr-FR");

  function construireMessageCloture() {
    const r = resumeCourant;
    if (!r) return "";
    const fm = collecterFacturesManuelles();
    const totalFm = fm.reduce((a, f) => a + f.montant, 0);
    const fond = Number(inputFondDepart?.value || 0);
    const compteSaisi = !!inputRecetteReelle && String(inputRecetteReelle.value).trim() !== "";
    const compte = Number(inputRecetteReelle?.value || 0);
    const theorique = fond + Number(r.total || 0) + totalFm;
    const ecart = compte - theorique;
    const gerant = (window.AuthState && window.AuthState.nomGerant) || "Gérant";
    const commentaire = (inputCommentaire?.value || "").trim();

    const l = [];
    l.push("📋 CLÔTURE - " + (etablissementNomCourant || "Établissement"));
    l.push("Gérant : " + gerant);
    l.push(new Date().toLocaleString("fr-FR"));
    l.push("");
    l.push("💰 Chiffre d'affaires : " + fmtFcfa(r.total) + " FCFA");
    l.push("📈 Bénéfice : " + fmtFcfa(r.totalBenefice) + " FCFA");
    l.push("🧾 " + r.nombre + " vente(s) · " + r.facturesJour.length + " facture(s)");
    if (fm.length) l.push("📄 " + fm.length + " facture(s) manuelle(s) : " + fmtFcfa(totalFm) + " FCFA");

    const marques = Object.entries(r.parMarque || {}).sort((a, b) => b[1] - a[1]).slice(0, MAX_LIGNES_WA);
    if (marques.length) {
      l.push("");
      l.push("🏷️ Par marque");
      marques.forEach(([m, mt]) => {
        const b = r.parMarqueBenefice && r.parMarqueBenefice[m];
        l.push("• " + m + " : " + fmtFcfa(mt) + " FCFA" + (b != null ? " (+" + fmtFcfa(b) + ")" : ""));
      });
    }

    l.push("");
    l.push("💵 Caisse");
    l.push("• Fond de départ : " + fmtFcfa(fond) + " FCFA");
    l.push("• Attendu : " + fmtFcfa(theorique) + " FCFA");
    if (compteSaisi) {
      l.push("• Compté : " + fmtFcfa(compte) + " FCFA");
      l.push((ecart !== 0 ? "⚠️ " : "✅ ") + "Écart : " + (ecart > 0 ? "+" : "") + fmtFcfa(ecart) + " FCFA");
    } else {
      l.push("• Compté : non saisi");
    }

    const devis = Object.entries(r.devisRenouvellement || {}).slice(0, MAX_LIGNES_WA);
    if (devis.length) {
      l.push("");
      l.push("🔄 À racheter (devis : " + fmtFcfa(r.totalDevisRenouvellement) + " FCFA)");
      devis.forEach(([nom, d]) => l.push("• " + nom + " x" + d.quantite));
    }

    const bas = [];
    Object.values(r.stockParMarque || {}).forEach((arr) => arr.forEach((p) => {
      if (Number(p.stock) <= STOCK_BAS_SEUIL) bas.push(p.nom + " : " + p.stock + " u.");
    }));
    l.push("");
    l.push("⚠️ Stock bas (≤ " + STOCK_BAS_SEUIL + " u.)");
    if (bas.length) {
      bas.slice(0, MAX_LIGNES_WA).forEach((t) => l.push("• " + t));
      if (bas.length > MAX_LIGNES_WA) l.push("• … et " + (bas.length - MAX_LIGNES_WA) + " autre(s)");
    } else {
      l.push("• Aucun");
    }

    if (commentaire) { l.push(""); l.push("💬 " + commentaire); }
    return l.join("\n");
  }

  if (lienWhatsapp) {
    lienWhatsapp.addEventListener("click", () => {
      const tel = lienWhatsapp.dataset.tel;
      if (!tel || !resumeCourant) return;
      lienWhatsapp.href = "https://wa.me/" + tel + "?text=" + encodeURIComponent(construireMessageCloture());
    });
  }

  menuBtn.addEventListener("click", () => {
    verifierCleCloture();
    const sideMenu = document.getElementById("sideMenu");
    if (sideMenu) sideMenu.hidden = true;
    errorEl.textContent = "";
    lienWhatsapp.hidden = true;
    btnConfirmer.disabled = false;
    btnConfirmer.textContent = (window.AuthState && window.AuthState.role === "GERANT_PROPRIETAIRE") ? "Enregistrer ma journée" : "Envoyer mes comptes au propriétaire";
    btnConfirmer.hidden = !(window.AuthState && (window.AuthState.accountType === "enregistre" || window.AuthState.accountType === "invite"));
    resumeEl.textContent = 'Clique sur "Lancer la clôture" pour calculer le résumé du jour.';
    if (inputFondDepart) inputFondDepart.value = "0";
    if (inputCommentaire) inputCommentaire.value = "";
    viderFacturesManuelles();
    clotureGate.hidden = false;
  });

  if (btnClose) btnClose.addEventListener("click", () => { clotureGate.hidden = true; });
  const btnCloseX = document.getElementById("btnCloseClotureX");
  if (btnCloseX) btnCloseX.addEventListener("click", () => { clotureGate.hidden = true; });
  clotureGate.addEventListener("click", (e) => {
    if (e.target === clotureGate) clotureGate.hidden = true;
  });

  if (btnConfirmer) {
    btnConfirmer.addEventListener("click", async () => {
      const estId = appState.establishmentId;
      const uid = auth.currentUser?.uid;
      if (!estId || !uid || !resumeCourant) return;
      const facturesManuelles = collecterFacturesManuelles();
      const totalFacturesManuelles = facturesManuelles.reduce((acc, f) => acc + f.montant, 0);
      const totalVentes = Number(btnConfirmer.dataset.total || 0);
      const aucuneActivite = (Number(resumeCourant.nombre) || 0) === 0 && facturesManuelles.length === 0 && totalVentes === 0;
      if (aucuneActivite) {
        errorEl.textContent = "Aucune activité depuis la dernière clôture — impossible de clôturer une session vide.";
        return;
      }
      if (!inputRecetteReelle || String(inputRecetteReelle.value).trim() === "") {
        errorEl.textContent = "Saisis l'argent compté en caisse avant d'envoyer (mets 0 si la caisse est vide).";
        return;
      }
      btnConfirmer.disabled = true;
      btnConfirmer.textContent = "Envoi...";
      const nomGerantCl = (window.AuthState && window.AuthState.nomGerant) || "Un gérant";

      const fondDepart = Number(inputFondDepart?.value || 0);
      const recetteReelle = Number(inputRecetteReelle?.value || 0);
      const commentaire = (inputCommentaire?.value || "").trim();
      const theorique = fondDepart + totalVentes + totalFacturesManuelles;
      const ecart = recetteReelle - theorique;
      try {
        await addDoc(collection(db, "establishments", estId, "clotures"), {
          gerantUid: uid,
          gerantNom: nomGerantCl,
          etablissementNom: etablissementNomCourant,
          totalVentes,
          nombreVentes: Number(btnConfirmer.dataset.nombre || 0),
          parCategorie: resumeCourant.parCategorie,
          parMarque: resumeCourant.parMarque,
          parProduit: resumeCourant.parProduit,
          facturesNumeriques: resumeCourant.facturesJour,
          facturesManuelles,
          stockParMarque: resumeCourant.stockParMarque,
          stockSessionParMarque: resumeCourant.stockSessionParMarque,
          devisRenouvellement: resumeCourant.devisRenouvellement,
          totalDevisRenouvellement: resumeCourant.totalDevisRenouvellement,
          caisse: {
            fondDepart,
            theorique,
            recetteReelle,
            ecart,
          },
          commentaire,
          statut: "envoyee",
          date: serverTimestamp(),
        });
        if (!(window.AuthState && window.AuthState.role === "GERANT_PROPRIETAIRE")) {
          creerNotification({
            type: "cloture",
            titre: "Clôture reçue",
            message: `${nomGerantCl} (${etablissementNomCourant}) a envoyé ses comptes : ${Number(btnConfirmer.dataset.nombre || 0)} vente(s), ${totalVentes.toLocaleString("fr-FR")} FCFA. Écart caisse : ${ecart >= 0 ? "+" : ""}${ecart.toLocaleString("fr-FR")} FCFA.`,
            cible: "cloture_modal"
          });
        }
        btnConfirmer.textContent = (window.AuthState && window.AuthState.role === "GERANT_PROPRIETAIRE") ? "Journée enregistrée ✅" : "Comptes envoyés ✅";
        clotureEnvoyee = true;
      } catch (e) {
        errorEl.textContent = "Erreur lors de l'envoi : " + (e.code || e.message);
        btnConfirmer.disabled = false;
        btnConfirmer.textContent = (window.AuthState && window.AuthState.role === "GERANT_PROPRIETAIRE") ? "Enregistrer ma journée" : "Envoyer mes comptes au propriétaire";
        btnConfirmer.hidden = !(window.AuthState && (window.AuthState.accountType === "enregistre" || window.AuthState.accountType === "invite"));
      }
    });
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) { menuBtn.hidden = true; return; }
    menuBtn.hidden = !(window.AuthState && (window.AuthState.role === "GERANT" || window.AuthState.role === "GERANT_PROPRIETAIRE"));
  });
});
