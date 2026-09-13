import { auth, db, doc, getDoc, collection, getDocs, addDoc, query, where, serverTimestamp, onAuthStateChanged } from "./firebase-config.js";
import { appState } from "./state.js";
import { creerNotification } from "./notifications.js";

function calculerDebutFinJour() {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);
  return { debut, fin };
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

  const [ventesSnap, facturesSnap, produitsSnap] = await Promise.all([
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
  ]);

  const categorieParProduit = {};
  const stockRestant = [];
  produitsSnap.forEach((docSnap) => {
    const p = docSnap.data();
    categorieParProduit[docSnap.id] = p.categorie || "Autres";
    stockRestant.push({ nom: p.nom || "(sans nom)", categorie: p.categorie || "Autres", stock: Number(p.stock || 0) });
  });
  const marqueParNom = construireMarqueParNom();

  let total = 0, nombre = 0;
  const parCategorie = {};
  const parMarque = {};
  const parProduit = {};

  ventesSnap.forEach((docSnap) => {
    const v = docSnap.data();
    if (v.auteurId !== uid) return;
    const montant = v.montant || 0;
    const quantite = v.quantite || 0;
    total += montant;
    nombre += 1;

    const categorie = categorieParProduit[v.produitId] || "Autres";
    parCategorie[categorie] = (parCategorie[categorie] || 0) + montant;

    const marque = marqueParNom[v.produitNom] || "Autre";
    parMarque[marque] = (parMarque[marque] || 0) + montant;

    const nomProduit = v.produitNom || "Produit inconnu";
    if (!parProduit[nomProduit]) parProduit[nomProduit] = { quantite: 0, montant: 0 };
    parProduit[nomProduit].quantite += quantite;
    parProduit[nomProduit].montant += montant;
  });

  const facturesJour = [];
  facturesSnap.forEach((docSnap) => {
    const f = docSnap.data();
    if (f.auteurId !== uid) return;
    facturesJour.push({ numero: f.numero || null, total: Number(f.total || 0) });
  });

  // Stock restant regroupe par marque (via MARQUES_TAILLES), le reste par catégorie
  const stockParMarque = {};
  stockRestant.forEach((p) => {
    const marque = marqueParNom[p.nom] || p.categorie;
    if (!stockParMarque[marque]) stockParMarque[marque] = [];
    stockParMarque[marque].push({ nom: p.nom, stock: p.stock });
  });

  return { total, nombre, parCategorie, parMarque, parProduit, facturesJour, stockParMarque };
}

function formaterVentilation(titre, obj) {
  const entrees = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  if (entrees.length === 0) return "";
  const lignes = entrees.map(([cle, montant]) => `  • ${cle} : ${montant.toLocaleString("fr-FR")} FCFA`).join("\n");
  return `\n${titre} :\n${lignes}`;
}

function formaterStock(stockParMarque) {
  const entrees = Object.entries(stockParMarque);
  if (entrees.length === 0) return "";
  const lignes = entrees.map(([marque, produits]) => {
    const detail = produits.map((p) => `${p.nom} : ${p.stock}`).join(", ");
    return `  • ${marque} — ${detail}`;
  }).join("\n");
  return `\nStock restant :\n${lignes}`;
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

  menuBtn.addEventListener("click", async () => {
    const sideMenu = document.getElementById("sideMenu");
    if (sideMenu) sideMenu.hidden = true;
    errorEl.textContent = "";
    lienWhatsapp.hidden = true;
    btnConfirmer.disabled = false;
    btnConfirmer.textContent = "Envoyer mes comptes au propriétaire";
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
      const { total, nombre, parCategorie, parMarque, facturesJour, stockParMarque } = resume;

      const estSnap = await getDoc(doc(db, "establishments", estId));
      etablissementNomCourant = estSnap.exists() ? (estSnap.data().name || "") : "";
      const telephoneProprietaire = estSnap.exists() ? estSnap.data().telephone : null;

      let texteResume = `${etablissementNomCourant ? etablissementNomCourant + " — " : ""}Aujourd'hui : ${nombre} vente(s) pour un total de ${total.toLocaleString("fr-FR")} FCFA.`;
      texteResume += `\n${facturesJour.length} facture(s) numérique(s) émise(s).`;
      texteResume += formaterVentilation("Par catégorie", parCategorie);
      texteResume += formaterVentilation("Par marque", parMarque);
      texteResume += formaterStock(stockParMarque);
      resumeEl.textContent = texteResume;
      resumeEl.style.whiteSpace = "pre-line";

      btnConfirmer.dataset.total = total;
      btnConfirmer.dataset.nombre = nombre;

      if (telephoneProprietaire) {
        const texte = `Bonjour, voici mes comptes du jour (${etablissementNomCourant}) : ${nombre} vente(s), ${total.toLocaleString("fr-FR")} FCFA au total.`;
        lienWhatsapp.href = `https://wa.me/${telephoneProprietaire}?text=${encodeURIComponent(texte)}`;
        lienWhatsapp.hidden = false;
      }
    } catch (e) {
      resumeEl.textContent = "Erreur lors du chargement du résumé.";
      console.warn("Erreur resume cloture :", e);
    }
  });

  if (btnClose) btnClose.addEventListener("click", () => { clotureGate.hidden = true; });
  clotureGate.addEventListener("click", (e) => {
    if (e.target === clotureGate) clotureGate.hidden = true;
  });

  if (btnConfirmer) {
    btnConfirmer.addEventListener("click", async () => {
      const estId = appState.establishmentId;
      const uid = auth.currentUser?.uid;
      if (!estId || !uid || !resumeCourant) return;
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
        creerNotification({
          type: "cloture",
          titre: "Clôture reçue",
          message: `${nomGerantCl} (${etablissementNomCourant}) a envoyé ses comptes : ${Number(btnConfirmer.dataset.nombre || 0)} vente(s), ${totalVentes.toLocaleString("fr-FR")} FCFA. Écart caisse : ${ecart >= 0 ? "+" : ""}${ecart.toLocaleString("fr-FR")} FCFA.`
        });
        btnConfirmer.textContent = "Comptes envoyés ✅";
      } catch (e) {
        errorEl.textContent = "Erreur lors de l'envoi : " + (e.code || e.message);
        btnConfirmer.disabled = false;
        btnConfirmer.textContent = "Envoyer mes comptes au propriétaire";
      }
    });
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) { menuBtn.hidden = true; return; }
    menuBtn.hidden = !(window.AuthState && window.AuthState.role === "GERANT");
  });
});
