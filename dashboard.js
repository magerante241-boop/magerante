import { auth, db, collection, getDocs, query, orderBy, onAuthStateChanged } from "./firebase-config.js";

const canvas = document.getElementById("chartVentes");
const ctx = canvas.getContext("2d");
let chart = null;

const listeGerantsEl = document.getElementById("listeGerants");
const totalJourEl = document.getElementById("totalJour");
const totalSemaineEl = document.getElementById("totalSemaine");
const totalMoisEl = document.getElementById("totalMois");
const btnRefresh = document.getElementById("btnRefreshDashboard");

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

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  chargerDonnees(user.uid);
  if (btnRefresh) btnRefresh.addEventListener("click", () => chargerDonnees(user.uid));
});
