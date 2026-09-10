import { auth, db, collection, getDocs, getDoc, query, orderBy, where, doc, setDoc, serverTimestamp, onAuthStateChanged } from "./firebase-config.js";

const canvas = document.getElementById("ventesChart");
const ctx = canvas.getContext("2d");
let chart = null;

const canvasCategorie = document.getElementById("categorieChart");
const ctxCategorie = canvasCategorie.getContext("2d");
let chartCategorie = null;

const listeGerantsEl = document.getElementById("listeGerants");
const totalJourEl = document.getElementById("totalJour");
const totalSemaineEl = document.getElementById("totalSemaine");
const totalMoisEl = document.getElementById("totalMois");
const btnRapportJour = document.getElementById("btnRapportJour");
const btnRapportSemaine = document.getElementById("btnRapportSemaine");
const btnRapportMois = document.getElementById("btnRapportMois");
const rapportStatusEl = document.getElementById("rapportStatus");
const listeRapportsEl = document.getElementById("historiqueRapports");
const comparaisonContentEl = document.getElementById("comparaisonContent");
const soldeContentEl = document.getElementById("soldeContent");
const topProduitsContentEl = document.getElementById("topProduitsContent");
const stockAlertBannerEl = document.getElementById("stockAlertBanner");
const deficitAlertBannerEl = document.getElementById("deficitAlertBanner");
const filtreClotureGerantEl = document.getElementById("filtreClotureGerant");
const filtreCloturePeriodeEl = document.getElementById("filtreCloturePeriode");
const btnExportCloturesEl = document.getElementById("btnExportClotures");
let cloturesEnMemoire = [];
let nomsGerantsEnMemoire = {};
const infoEtablissementEl = document.getElementById("infoEtablissement");
const listeCloturesEl = document.getElementById("listeClotures");

function initTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });
}

async function chargerHistoriqueRapports(ownerUid) {
  const rapportsSnap = await getDocs(query(collection(db, "establishments", ownerUid, "rapports"), orderBy("genereLe", "desc")));
  listeRapportsEl.innerHTML = "";
  if (rapportsSnap.empty) {
    listeRapportsEl.innerHTML = "<li>Aucun rapport généré pour le moment.</li>";
    return;
  }
  rapportsSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const li = document.createElement("li");
    const dateDebut = d.periodeDebut && d.periodeDebut.toDate ? d.periodeDebut.toDate() : null;
    const dateStr = dateDebut ? dateDebut.toLocaleDateString("fr-FR") : "?";
    const totalStr = (d.totalVentes || 0).toLocaleString("fr-FR");
    const panierStr = Math.round(d.panierMoyen || 0).toLocaleString("fr-FR");
    li.textContent = `${d.type || "?"} (${dateStr}) — ${totalStr} FCFA, ${d.nombreVentes || 0} ventes, panier moyen ${panierStr} FCFA`;
    listeRapportsEl.appendChild(li);
  });
}

function lundiDe(date) {
  const d = new Date(date);
  const jourSemaine = d.getDay();
  const diff = (jourSemaine === 0 ? -6 : 1) - jourSemaine;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

function calculerPeriode(type, decalage = 0) {
  const maintenant = new Date();
  if (type === "jour") {
    const debut = new Date(maintenant);
    debut.setDate(debut.getDate() + decalage);
    debut.setHours(0, 0, 0, 0);
    const fin = new Date(debut);
    fin.setDate(fin.getDate() + 1);
    return { id: "jour-" + debut.toISOString().slice(0, 10), debut, fin };
  }
  if (type === "semaine") {
    const debut = lundiDe(maintenant);
    debut.setDate(debut.getDate() + decalage * 7);
    const fin = new Date(debut);
    fin.setDate(fin.getDate() + 7);
    return { id: "semaine-" + debut.toISOString().slice(0, 10), debut, fin };
  }
  if (type === "mois") {
    const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() + decalage, 1);
    const fin = new Date(maintenant.getFullYear(), maintenant.getMonth() + decalage + 1, 1);
    return { id: "mois-" + debut.toISOString().slice(0, 7), debut, fin };
  }
  throw new Error("Type de période inconnu : " + type);
}

async function agregerVentes(ownerUid, debut, fin) {
  const ventesSnap = await getDocs(query(
    collection(db, "establishments", ownerUid, "ventes"),
    where("date", ">=", debut),
    where("date", "<", fin)
  ));
  const ventes = ventesSnap.docs.map((d) => d.data());

  const produitsSnap = await getDocs(collection(db, "establishments", ownerUid, "produits"));
  const produitsParId = {};
  produitsSnap.forEach((p) => { produitsParId[p.id] = p.data(); });

  let totalVentes = 0;
  const parCategorie = {};
  const parProduit = {};
  const parGerant = {};

  ventes.forEach((v) => {
    const montant = v.montant || 0;
    totalVentes += montant;

    let categorie = "Vente libre";
    if (v.type === "produit" && v.produitId && produitsParId[v.produitId]) {
      categorie = produitsParId[v.produitId].categorie || "Sans catégorie";
    }
    parCategorie[categorie] = (parCategorie[categorie] || 0) + montant;

    if (v.type === "produit" && v.produitId) {
      if (!parProduit[v.produitId]) {
        parProduit[v.produitId] = {
          produitId: v.produitId,
          nom: v.produitNom || produitsParId[v.produitId]?.nom || "Produit",
          quantite: 0,
          montant: 0,
        };
      }
      parProduit[v.produitId].quantite += v.quantite || 0;
      parProduit[v.produitId].montant += montant;
    }

    if (v.auteurId) {
      if (!parGerant[v.auteurId]) parGerant[v.auteurId] = { montant: 0, nombre: 0 };
      parGerant[v.auteurId].montant += montant;
      parGerant[v.auteurId].nombre += 1;
    }
  });

  const nombreVentes = ventes.length;
  const panierMoyen = nombreVentes > 0 ? totalVentes / nombreVentes : 0;
  const topProduits = Object.values(parProduit).sort((a, b) => b.montant - a.montant).slice(0, 5);

  const produitsEnRupture = [];
  produitsSnap.forEach((p) => {
    const d = p.data();
    if ((d.stock || 0) <= 0) produitsEnRupture.push({ produitId: p.id, nom: d.nom || "Produit" });
  });

  return { totalVentes, nombreVentes, panierMoyen, parCategorie, topProduits, produitsEnRupture, parGerant };
}


async function agregerMouvements(ownerUid, debut, fin) {
  const mouvementsSnap = await getDocs(query(
    collection(db, "establishments", ownerUid, "mouvements"),
    where("date", ">=", debut),
    where("date", "<", fin)
  ));
  let totalAchats = 0, totalDepenses = 0, totalRecettes = 0, totalEntreesStock = 0;
  mouvementsSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const montant = d.montant || 0;
    if (d.type === "achat") totalAchats += montant;
    else if (d.type === "depense") totalDepenses += montant;
    else if (d.type === "recette") totalRecettes += montant;
    else if (d.type === "entree-stock") totalEntreesStock += montant;
  });
  return { totalAchats, totalDepenses, totalRecettes, totalEntreesStock };
}
async function genererRapport(ownerUid, type) {
  const { id, debut, fin } = calculerPeriode(type);
  const { totalVentes, nombreVentes, panierMoyen, parCategorie, topProduits, produitsEnRupture } = await agregerVentes(ownerUid, debut, fin);

  await setDoc(doc(db, "establishments", ownerUid, "rapports", id), {
    type,
    periodeDebut: debut,
    periodeFin: fin,
    totalVentes,
    nombreVentes,
    panierMoyen,
    parCategorie,
    topProduits,
    produitsEnRupture,
    genereParUid: auth.currentUser?.uid || null,
    genereLe: serverTimestamp(),
  });

  return id;
}

function brancherBoutonsRapports(ownerUid) {
  const brancher = (btn, type, label) => {
    if (!btn) return;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      if (rapportStatusEl) rapportStatusEl.textContent = `Génération du rapport (${label})...`;
      try {
        const id = await genererRapport(ownerUid, type);
        if (rapportStatusEl) rapportStatusEl.textContent = `Rapport "${id}" généré avec succès.`;
        chargerHistoriqueRapports(ownerUid);
      } catch (e) {
        console.error(e);
        if (rapportStatusEl) rapportStatusEl.textContent = "Erreur lors de la génération du rapport.";
      } finally {
        btn.disabled = false;
      }
    });
  };
  brancher(btnRapportJour, "jour", "jour");
  brancher(btnRapportSemaine, "semaine", "semaine");
  brancher(btnRapportMois, "mois", "mois");
}

function afficherComparaison(actuel, precedent) {
  const diff = actuel - precedent;
  const pct = precedent > 0 ? Math.round((diff / precedent) * 100) : (actuel > 0 ? 100 : 0);
  const signe = diff >= 0 ? "+" : "";
  const couleur = diff >= 0 ? "#22c55e" : "#e5484d";
  comparaisonContentEl.innerHTML = `
    <div>Mois en cours : <strong>${actuel.toLocaleString("fr-FR")} FCFA</strong></div>
    <div>Mois précédent : ${precedent.toLocaleString("fr-FR")} FCFA</div>
    <div style="color:${couleur};">${signe}${diff.toLocaleString("fr-FR")} FCFA (${signe}${pct}%)</div>
  `;
}

function afficherSolde(totalRecettes, totalDepenses, totalAchats) {
  const solde = totalRecettes - totalDepenses - totalAchats;
  const couleur = solde >= 0 ? "#22c55e" : "#e5484d";
  soldeContentEl.innerHTML = `
    <div>Recettes : ${totalRecettes.toLocaleString("fr-FR")} FCFA</div>
    <div>Dépenses : ${totalDepenses.toLocaleString("fr-FR")} FCFA</div>
    <div>Achats : ${totalAchats.toLocaleString("fr-FR")} FCFA</div>
    <div style="color:${couleur}; font-weight:bold;">Solde net : ${solde.toLocaleString("fr-FR")} FCFA</div>
  `;
}

let topProduitsChart = null;
function afficherTopProduits(topProduits) {
  if (!topProduits.length) {
    topProduitsContentEl.innerHTML = "<p>Aucune vente de produit sur la période.</p>";
    if (topProduitsChart) { topProduitsChart.destroy(); topProduitsChart = null; }
    return;
  }
  topProduitsContentEl.innerHTML = "<ol>" + topProduits.map((p) =>
    `<li>${p.nom} — ${p.quantite} vendu(s), ${p.montant.toLocaleString("fr-FR")} FCFA</li>`
  ).join("") + "</ol>";

  let canvasTop = document.getElementById("topProduitsChart");
  if (!canvasTop) {
    canvasTop = document.createElement("canvas");
    canvasTop.id = "topProduitsChart";
    canvasTop.height = 180;
    topProduitsContentEl.after(canvasTop);
  }
  if (topProduitsChart) topProduitsChart.destroy();
  topProduitsChart = new Chart(canvasTop.getContext("2d"), {
    type: "bar",
    data: { labels: topProduits.map((p) => p.nom), datasets: [{ label: "Ventes (FCFA)", data: topProduits.map((p) => p.montant), backgroundColor: "#f2c94c" }] },
    options: { responsive: true, indexAxis: "y", plugins: { legend: { display: false } } },
  });
}

function afficherAlerteStock(produitsEnRupture) {
  if (!produitsEnRupture.length) {
    stockAlertBannerEl.innerHTML = "";
    return;
  }
  const noms = produitsEnRupture.map((p) => p.nom).join(", ");
  stockAlertBannerEl.innerHTML = `<div class="stock-alert">⚠️ Rupture de stock : ${noms}</div>`;
}

function afficherAlerteDeficit(solde, totalRecettes, totalDepenses, totalAchats) {
  const chargesTotales = totalDepenses + totalAchats;
  if (solde < 0) {
    deficitAlertBannerEl.innerHTML = `<div class="deficit-alert">🔴 Déficit : les dépenses et achats (${chargesTotales.toLocaleString("fr-FR")} FCFA) dépassent les recettes (${totalRecettes.toLocaleString("fr-FR")} FCFA). Solde net : ${solde.toLocaleString("fr-FR")} FCFA.</div>`;
    return;
  }
  if (totalRecettes > 0 && chargesTotales > totalRecettes * 0.8) {
    deficitAlertBannerEl.innerHTML = `<div class="deficit-warning">🟠 Avertissement : les dépenses et achats atteignent ${Math.round((chargesTotales / totalRecettes) * 100)}% des recettes.</div>`;
    return;
  }
  deficitAlertBannerEl.innerHTML = "";
}

function afficherClotures() {
  if (!listeCloturesEl) return;
  const gerantFiltre = filtreClotureGerantEl ? filtreClotureGerantEl.value : "";
  const periodeFiltre = filtreCloturePeriodeEl ? filtreCloturePeriodeEl.value : "tout";
  let bornes = null;
  if (periodeFiltre !== "tout") bornes = calculerPeriode(periodeFiltre);

  const cloturesFiltrees = cloturesEnMemoire.filter((d) => {
    if (gerantFiltre && d.gerantUid !== gerantFiltre) return false;
    if (bornes) {
      const dateObj = d.date && d.date.toDate ? d.date.toDate() : null;
      if (!dateObj || dateObj < bornes.debut || dateObj >= bornes.fin) return false;
    }
    return true;
  });

  listeCloturesEl.innerHTML = "";
  if (!cloturesFiltrees.length) {
    listeCloturesEl.innerHTML = "<li>Aucune clôture pour ces filtres.</li>";
    return;
  }
  cloturesFiltrees.forEach((d) => {
    const dateObj = d.date && d.date.toDate ? d.date.toDate() : null;
    const dateStr = dateObj ? dateObj.toLocaleString("fr-FR") : "?";
    const nomGerant = nomsGerantsEnMemoire[d.gerantUid] || "Gérant";
    const li = document.createElement("li");
    li.textContent = `${nomGerant} — ${dateStr} — ${(d.totalVentes || 0).toLocaleString("fr-FR")} FCFA (${d.nombreVentes || 0} ventes)`;
    listeCloturesEl.appendChild(li);
  });
}

function brancherFiltresClotures() {
  if (filtreClotureGerantEl) filtreClotureGerantEl.addEventListener("change", afficherClotures);
  if (filtreCloturePeriodeEl) filtreCloturePeriodeEl.addEventListener("change", afficherClotures);
}

function cloturesFiltreesActuelles() {
  const gerantFiltre = filtreClotureGerantEl ? filtreClotureGerantEl.value : "";
  const periodeFiltre = filtreCloturePeriodeEl ? filtreCloturePeriodeEl.value : "tout";
  let bornes = null;
  if (periodeFiltre !== "tout") bornes = calculerPeriode(periodeFiltre);
  return cloturesEnMemoire.filter((d) => {
    if (gerantFiltre && d.gerantUid !== gerantFiltre) return false;
    if (bornes) {
      const dateObj = d.date && d.date.toDate ? d.date.toDate() : null;
      if (!dateObj || dateObj < bornes.debut || dateObj >= bornes.fin) return false;
    }
    return true;
  });
}

function genererPdfClotures(liste, titre) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pdf.setFontSize(16);
  pdf.text(titre, 14, 18);
  pdf.setFontSize(11);
  let y = 30;
  let totalGeneral = 0;
  liste.forEach((d) => {
    const dateObj = d.date && d.date.toDate ? d.date.toDate() : null;
    const dateStr = dateObj ? dateObj.toLocaleString("fr-FR") : "?";
    const nomGerant = nomsGerantsEnMemoire[d.gerantUid] || "Gérant";
    const montant = d.totalVentes || 0;
    totalGeneral += montant;
    const ligne = `${nomGerant} — ${dateStr} — ${montant.toLocaleString("fr-FR")} FCFA (${d.nombreVentes || 0} ventes)`;
    pdf.text(ligne, 14, y);
    y += 8;
    if (y > 280) { pdf.addPage(); y = 20; }
  });
  y += 6;
  pdf.setFontSize(13);
  pdf.text(`Total : ${totalGeneral.toLocaleString("fr-FR")} FCFA (${liste.length} clôture(s))`, 14, y);
  pdf.save(titre.replace(/[^a-z0-9]+/gi, "_") + ".pdf");
}

function brancherExportPDF() {
  if (!btnExportCloturesEl) return;
  btnExportCloturesEl.addEventListener("click", () => {
    const liste = cloturesFiltreesActuelles();
    if (!liste.length) { alert("Aucune clôture à exporter avec ces filtres."); return; }
    genererPdfClotures(liste, "Export clôtures MAGERANTE");
  });
}

async function chargerDonnees(ownerUid) {
  const { debut: debutMois, fin: finMois } = calculerPeriode("mois");
  const { debut: debutMoisPrec, fin: finMoisPrec } = calculerPeriode("mois", -1);

  const [donneesMois, donneesMoisPrec, donneesMouvements] = await Promise.all([
    agregerVentes(ownerUid, debutMois, finMois),
    agregerVentes(ownerUid, debutMoisPrec, finMoisPrec),
    agregerMouvements(ownerUid, debutMois, finMois),
  ]);

  afficherComparaison(donneesMois.totalVentes, donneesMoisPrec.totalVentes);
  afficherTopProduits(donneesMois.topProduits);
  afficherAlerteStock(donneesMois.produitsEnRupture);
  afficherSolde(donneesMouvements.totalRecettes, donneesMouvements.totalDepenses, donneesMouvements.totalAchats);
  const soldeNet = donneesMouvements.totalRecettes - donneesMouvements.totalDepenses - donneesMouvements.totalAchats;
  afficherAlerteDeficit(soldeNet, donneesMouvements.totalRecettes, donneesMouvements.totalDepenses, donneesMouvements.totalAchats);

  const labelsCategorie = Object.keys(donneesMois.parCategorie);
  const dataCategorie = labelsCategorie.map((k) => donneesMois.parCategorie[k]);
  if (chartCategorie) chartCategorie.destroy();
  chartCategorie = new Chart(ctxCategorie, {
    type: "pie",
    data: { labels: labelsCategorie, datasets: [{ data: dataCategorie, backgroundColor: ["#22c55e", "#f2c94c", "#4a90d9", "#e5484d", "#9b59b6", "#f39c12"] }] },
    options: { responsive: true },
  });

  const ventesSnap = await getDocs(query(collection(db, "establishments", ownerUid, "ventes"), orderBy("date", "desc")));
  const ventes = ventesSnap.docs.map((d) => d.data()).filter((v) => v.date);
  const maintenant = new Date();
  const parJour = {};
  let totalJour = 0, totalSemaine = 0, totalMoisGlissant = 0;
  ventes.forEach((v) => {
    const d = v.date.toDate();
    const cle = d.toISOString().slice(0, 10);
    parJour[cle] = (parJour[cle] || 0) + (v.montant || 0);
    const diffJours = (maintenant - d) / (1000 * 60 * 60 * 24);
    if (diffJours <= 1) totalJour += v.montant || 0;
    if (diffJours <= 7) totalSemaine += v.montant || 0;
    if (diffJours <= 30) totalMoisGlissant += v.montant || 0;
  });

  totalJourEl.textContent = totalJour.toLocaleString("fr-FR") + " FCFA";
  totalSemaineEl.textContent = totalSemaine.toLocaleString("fr-FR") + " FCFA";
  totalMoisEl.textContent = totalMoisGlissant.toLocaleString("fr-FR") + " FCFA";

  const labels = Object.keys(parJour).sort().slice(-14);
  const data = labels.map((k) => parJour[k]);
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Ventes (FCFA)", data, borderColor: "#22c55e", tension: 0.3 }] },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });

  const gerantsSnap = await getDocs(collection(db, "establishments", ownerUid, "gerants"));
  const nomsGerants = {};
  listeGerantsEl.innerHTML = "";
  if (gerantsSnap.empty) {
    listeGerantsEl.innerHTML = "<li>Aucun gérant actif pour le moment.</li>";
  } else {
    gerantsSnap.forEach((g) => {
      const d = g.data();
      nomsGerants[g.id] = d.nom || "Gérant";
      const stats = donneesMois.parGerant[g.id] || { montant: 0, nombre: 0 };
      const li = document.createElement("li");
      li.textContent = `${d.nom || "Sans nom"} — ${d.actif ? "actif" : "inactif"} — ${stats.montant.toLocaleString("fr-FR")} FCFA (${stats.nombre} ventes) ce mois`;
      listeGerantsEl.appendChild(li);
    });
  }
  nomsGerantsEnMemoire = nomsGerants;

  if (filtreClotureGerantEl) {
    const selectionActuelle = filtreClotureGerantEl.value;
    filtreClotureGerantEl.innerHTML = '<option value="">Tous les gérants</option>';
    Object.keys(nomsGerants).forEach((uid) => {
      const opt = document.createElement("option");
      opt.value = uid;
      opt.textContent = nomsGerants[uid];
      filtreClotureGerantEl.appendChild(opt);
    });
    filtreClotureGerantEl.value = selectionActuelle;
  }

  if (listeCloturesEl) {
    const cloturesSnap = await getDocs(query(collection(db, "establishments", ownerUid, "clotures"), orderBy("date", "desc")));
    cloturesEnMemoire = cloturesSnap.docs.map((c) => c.data());
    afficherClotures();
  }
}

async function chargerInfoEtablissement(ownerUid) {
  const etabSnap = await getDoc(doc(db, "establishments", ownerUid));
  if (!etabSnap.exists()) {
    infoEtablissementEl.innerHTML = "<p>Aucune information disponible.</p>";
    return;
  }
  const d = etabSnap.data();
  infoEtablissementEl.innerHTML = `
    <div><strong>Nom :</strong> ${d.name || "Non renseigné"}</div>
    <div><strong>Type :</strong> ${d.type || "Non renseigné"}</div>
  `;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists() && userSnap.data().role === "GERANT") {
      alert("Le tableau de bord est reserve au proprietaire.");
      window.location.href = "index.html";
      return;
    }
  } catch (e) {
    console.warn("Verification du role impossible :", e);
  }
  initTabs();
  chargerDonnees(user.uid);
  brancherBoutonsRapports(user.uid);
  chargerHistoriqueRapports(user.uid);
  chargerInfoEtablissement(user.uid);
  brancherFiltresClotures();
  brancherExportPDF();
});
