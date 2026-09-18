import { auth, db, doc, getDoc, collection, getDocs, addDoc, query, where, limit, serverTimestamp, onAuthStateChanged } from "./firebase-config.js";
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

export async function clotureExisteAujourdhui(estId) {
  const { debut, fin } = calculerDebutFinJour();
  const q = query(
    collection(db, "establishments", estId, "clotures"),
    where("date", ">=", debut),
    where("date", "<", fin),
    limit(1)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

function construireMarqueParNom() {
  const marqueParNom = {};
  const table = (typeof window !== "undefined" && window.MARQUES_TAILLES) || {};
  Object.keys(table).forEach((marque) => {
    const { petite, grande } = table[marque];
    if (petite) marqueParNom[petite] = marque;
    if (grande) marqueParNom[grande] = marque;
  });
  return marqueParNom;
}

async function chargerResumeJour(estId, uid) {
  const { debut, fin } = calculerDebutFinJour();

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
      if (!devisRenouvellement[nomProduit]) devisRenouvellement[nomProduit] = { quantite: 0, coutTotal: 0, casierTaille: casierTailleParProduit[v.produitId] };
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
        ${produits.map((p) => `<tr><td>${escapeHtml(p.nom)}</td><td class="${p.stock === 0 ? "stock-zero" : ""}">${p.stock}</td></tr>`).join("")}
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

  menuBtn.addEventListener("click", async () => {
    const sideMenu = document.getElementById("sideMenu");
    if (sideMenu) sideMenu.hidden = true;
    errorEl.textContent = "";
    lienWhatsapp.hidden = true;
    btnConfirmer.disabled = false;
    btnConfirmer.textContent = (window.AuthState && window.AuthState.role === "GERANT_PROPRIETAIRE") ? "Enregistrer ma journée" : "Envoyer mes comptes au propriétaire";
    btnConfirmer.hidden = !(window.AuthState && (window.AuthState.accountType === "enregistre" || window.AuthState.accountType === "invite"));
    resumeEl.textContent = "Chargement du résumé...";
    if (inputFondDepart) inputFondDepart.value = "0";
    if (inputRecetteReelle) inputRecetteReelle.value = "0";
    if (inputCommentaire) inputCommentaire.value = "";
    viderFacturesManuelles();
    clotureGate.hidden = false;

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

      if (telephoneProprietaire) {
        const texte = `Bonjour, voici mes comptes du jour (${etablissementNomCourant}) : ${nombre} vente(s), ${total.toLocaleString("fr-FR")} FCFA au total.`;
        lienWhatsapp.href = `https://wa.me/${telephoneProprietaire}?text=${encodeURIComponent(texte)}`;
        lienWhatsapp.hidden = !(window.AuthState && (window.AuthState.accountType === "enregistre" || window.AuthState.accountType === "invite") && window.AuthState.role !== "GERANT_PROPRIETAIRE");
      }
    } catch (e) {
      resumeEl.textContent = "Erreur lors du chargement du résumé.";
      console.warn("Erreur resume cloture :", e);
    }
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
      if (await clotureExisteAujourdhui(estId)) {
        errorEl.textContent = "Une clôture a déjà été envoyée aujourd'hui pour cet établissement.";
        return;
      }
      btnConfirmer.disabled = true;
      btnConfirmer.textContent = "Envoi...";
      const nomGerantCl = (window.AuthState && window.AuthState.nomGerant) || "Un gérant";

      const fondDepart = Number(inputFondDepart?.value || 0);
      const recetteReelle = Number(inputRecetteReelle?.value || 0);
      const commentaire = (inputCommentaire?.value || "").trim();
      const facturesManuelles = collecterFacturesManuelles();
      const totalFacturesManuelles = facturesManuelles.reduce((acc, f) => acc + f.montant, 0);
      const totalVentes = Number(btnConfirmer.dataset.total || 0);
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
