import { auth, db, collection, getDocs, query, orderBy, where, doc, setDoc, serverTimestamp, onAuthStateChanged } from "./firebase-config.js";
const canvas = document.getElementById("chartVentes");
const ctx = canvas.getContext("2d");
let chart = null;
const listeGerantsEl = document.getElementById("listeGerants");
const totalJourEl = document.getElementById("totalJour");
const totalSemaineEl = document.getElementById("totalSemaine");
const totalMoisEl = document.getElementById("totalMois");
const btnRefresh = document.getElementById("btnRefreshDashboard");
const btnRapportJour = document.getElementById("btnRapportJour");
const btnRapportSemaine = document.getElementById("btnRapportSemaine");
const btnRapportMois = document.getElementById("btnRapportMois");
const rapportStatusEl = document.getElementById("rapportStatus");
async function chargerDonnees(ownerUid) {
  const ventesSnap = await getDocs(query(collection(db, "establishments", ownerUid, "ventes"), orderBy("date", "desc")));
  const ventes = ventesSnap.docs.map((d) => d.data()).filter((v) => v.date);
const maintenant = new Date();
  const parJour = {};
  let totalJour = 0, totalSemaine = 0, totalMois = 0;
  ventes.forEach((v) => {
    const d = v.date.toDate();
    const cle = d.toISOString().slice(0, 10);
    parJour[cle] = (parJour[cle] || 0) + (v.montant || 0);
    const diffJours = (maintenant - d) / (1000 * 60 * 60 * 24);
    if (diffJours <= 1) totalJour += v.montant || 0;
    if (diffJours <= 7) totalSemaine += v.montant || 0;
if (diffJours <= 30) totalMois += v.montant || 0;
  });

  totalJourEl.textContent = totalJour.toLocaleString("fr-FR") + " FCFA";
  totalSemaineEl.textContent = totalSemaine.toLocaleString("fr-FR") + " FCFA";
  totalMoisEl.textContent = totalMois.toLocaleString("fr-FR") + " FCFA";

  const labels = Object.keys(parJour).sort().slice(-14);
  const data = labels.map((k) => parJour[k]);
if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Ventes (FCFA)", data, borderColor: "#22c55e", tension: 0.3 }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
const gerantsSnap = await getDocs(collection(db, "establishments", ownerUid, "gerants"));
  listeGerantsEl.innerHTML = "";
  if (gerantsSnap.empty) {
    listeGerantsEl.innerHTML = "<li>Aucun gérant actif pour le moment.</li>";
  } else {
    gerantsSnap.forEach((g) => {
      const d = g.data();
      const li = document.createElement("li");
      li.textContent = `${d.nom || "Sans nom"} — ${d.actif ? "actif" : "inactif"}`;
      listeGerantsEl.appendChild(li);
    });
  }
}

function lundiDe(date) {
  const d = new Date(date);
  const jourSemaine = d.getDay();
  const diff = (jourSemaine === 0 ? -6 : 1) - jourSemaine;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}
function calculerPeriode(type) {
  const maintenant = new Date();
  if (type === "jour") {
    const debut = new Date(maintenant);
    debut.setHours(0, 0, 0, 0);
    const fin = new Date(debut);
    fin.setDate(fin.getDate() + 1);
    return { id: "jour-" + debut.toISOString().slice(0, 10), debut, fin };
  }
  if (type === "semaine") {
    const debut = lundiDe(maintenant);
    const fin = new Date(debut);
    fin.setDate(fin.getDate() + 7);
    return { id: "semaine-" + debut.toISOString().slice(0, 10), debut, fin };
  }
  if (type === "mois") {
    const debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const fin = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
    return { id: "mois-" + debut.toISOString().slice(0, 7), debut, fin };
  }
  throw new Error("Type de période inconnu : " + type);
}
async function genererRapport(ownerUid, type) {
  const { id, debut, fin } = calculerPeriode(type);

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
  });
const nombreVentes = ventes.length;
  const panierMoyen = nombreVentes > 0 ? totalVentes / nombreVentes : 0;

  const topProduits = Object.values(parProduit)
    .sort((a, b) => b.montant - a.montant)
    .slice(0, 5);

  const produitsEnRupture = [];
  produitsSnap.forEach((p) => {
    const d = p.data();
    if ((d.stock || 0) <= 0) {
      produitsEnRupture.push({ produitId: p.id, nom: d.nom || "Produit" });
    }
  });
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
onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  chargerDonnees(user.uid);
  brancherBoutonsRapports(user.uid);
  if (btnRefresh) btnRefresh.addEventListener("click", () => chargerDonnees(user.uid));
});
