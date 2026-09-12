import {
  auth, db, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail,
  collection, collectionGroup, query, where, orderBy, limit, onSnapshot, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, writeBatch
} from "./firebase-config.js";
import { enregistrerConnexion } from "./connexions.js";

const ADMIN_EMAIL = "magerante241@gmail.com";

// Échappe le HTML avant injection via innerHTML — évite l'XSS stocké sur les
// champs contrôlés par le public (nom d'établissement, nom/prénom/email lors
// de l'inscription, nom de produit...).
let _cacheEstablishmentsSnap = null;
async function getEstablishmentsSnap() {
  if (_cacheEstablishmentsSnap) return _cacheEstablishmentsSnap;
  _cacheEstablishmentsSnap = await getDocs(collection(db, "establishments"));
  return _cacheEstablishmentsSnap;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const loginBox = document.getElementById("loginBox");
const adminPanel = document.getElementById("adminPanel");
const adminError = document.getElementById("adminError");
const pendingList = document.getElementById("pendingList");
if (window.ScrollArrows) window.ScrollArrows.attachScrollArrows(pendingList);
const btnSettings = document.getElementById("btnSettings");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsEmail = document.getElementById("settingsEmail");
const ctxCaCourbe = document.getElementById("caCourbeChart")?.getContext("2d");
let caCourbeChart = null;
const ctxCaBar = document.getElementById("caBarChart")?.getContext("2d");
let caBarChart = null;

let loginAttempted = false;

document.getElementById("btnAdminLogin").addEventListener("click", async () => {
  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;
  adminError.textContent = "";
  loginAttempted = true;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    enregistrerConnexion(cred.user, "admin");
  } catch (err) {
    adminError.textContent = "Erreur : " + err.message;
  }
});

btnSettings.addEventListener("click", () => {
  settingsEmail.textContent = auth.currentUser ? auth.currentUser.email : "";
  settingsOverlay.hidden = false;
});
document.getElementById("btnCloseSettings").addEventListener("click", () => {
  settingsOverlay.hidden = true;
});
document.getElementById("btnResetPassword").addEventListener("click", async () => {
  try {
    await sendPasswordResetEmail(auth, ADMIN_EMAIL);
    alert("Email de reinitialisation envoye a " + ADMIN_EMAIL);
  } catch (err) {
    alert("Erreur : " + err.message);
  }
});
document.getElementById("btnVoirApplication").addEventListener("click", () => {
  window.location.href = "index.html";
});

document.getElementById("btnDiffuserNotif").addEventListener("click", async () => {
  const message = prompt("Message a diffuser a tous les etablissements :");
  if (!message || !message.trim()) return;
  try {
    const estSnap = await getEstablishmentsSnap();
    const batch = writeBatch(db);
    let count = 0;
    estSnap.forEach((estDoc) => {
      const notifRef = doc(collection(db, "establishments", estDoc.id, "notifications"));
      batch.set(notifRef, {
        type: "info",
        titre: "Message de l'administration",
        message: message.trim(),
        lu: false,
        createdAt: serverTimestamp()
      });
      count++;
    });
    await batch.commit();
    alert(`Notification envoyee a ${count} etablissement(s).`);
    settingsOverlay.hidden = true;
  } catch (err) {
    alert("Erreur lors de la diffusion : " + err.message);
  }
});

document.getElementById("btnVoirApplication").addEventListener("click", () => {
  window.location.href = "index.html";
});

document.getElementById("btnDiffuserNotif").addEventListener("click", async () => {
  const message = prompt("Message a diffuser a tous les etablissements :");
  if (!message || !message.trim()) return;
  try {
    const estSnap = await getEstablishmentsSnap();
    const batch = writeBatch(db);
    let count = 0;
    estSnap.forEach((estDoc) => {
      const notifRef = doc(collection(db, "establishments", estDoc.id, "notifications"));
      batch.set(notifRef, {
        type: "info",
        titre: "Message de l'administration",
        message: message.trim(),
        lu: false,
        createdAt: serverTimestamp()
      });
      count++;
    });
    await batch.commit();
    alert(`Notification envoyee a ${count} etablissement(s).`);
    settingsOverlay.hidden = true;
  } catch (err) {
    alert("Erreur lors de la diffusion : " + err.message);
  }
});

document.getElementById("btnLogoutAdmin").addEventListener("click", async () => {
  settingsOverlay.hidden = true;
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user && !user.isAnonymous && user.email === ADMIN_EMAIL) {
    loginBox.hidden = true;
    adminPanel.hidden = false;
    btnSettings.hidden = false;
    document.getElementById("adminBottomNav").hidden = false;
    adminError.textContent = "";
    chargerDashboard();
    chargerComptesEnAttente();
    chargerFinanceEtRapports();
    chargerEtablissementsParZone();
    chargerGestionProduits();
    chargerConnexions();
  } else {
    loginBox.hidden = false;
    adminPanel.hidden = true;
    btnSettings.hidden = true;
    settingsOverlay.hidden = true;
    document.getElementById("adminBottomNav").hidden = true;
    if (loginAttempted && user && !user.isAnonymous && user.email !== ADMIN_EMAIL) {
      adminError.textContent = "Ce compte n'a pas les droits admin.";
    }
  }
});

async function chargerDashboard() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    let totalComptes = 0, valides = 0, enAttente = 0;
    usersSnap.forEach((d) => {
      const data = d.data();
      if (data.accountType === "enregistre") {
        totalComptes++;
        if (data.validated) valides++; else enAttente++;
      }
    });
    document.getElementById("statTotalComptes").textContent = totalComptes;
    document.getElementById("statValides").textContent = valides;
    document.getElementById("statEnAttente").textContent = enAttente;
  } catch (err) {
    console.error("Erreur stats comptes:", err);
  }

  try {
    const estSnap = await getEstablishmentsSnap();
    document.getElementById("statEtablissements").textContent = estSnap.size;
  } catch (err) {
    console.error("Erreur stats etablissements:", err);
    document.getElementById("statEtablissements").textContent = "?";
  }

  try {
    const ventesSnap = await getDocs(collectionGroup(db, "ventes"));
    let total = 0;
    ventesSnap.forEach((d) => {
      const data = d.data();
      total += Number(data.montant || 0);
    });
    document.getElementById("statCAGlobal").textContent = total.toLocaleString("fr-FR") + " FCFA";
  } catch (err) {
    console.error("Erreur CA global (normal si module Ventes pas encore actif):", err);
    document.getElementById("statCAGlobal").textContent = "0 FCFA";
  }

  try {
    const produitsSnap = await getDocs(collectionGroup(db, "produits"));
    const produits = produitsSnap.docs.map((d) => d.data());
    renderInventaireGlobal(produits);
  } catch (err) {
    console.error("Erreur inventaire global:", err);
    renderInventaireGlobal([]);
  }
}

function chargerComptesEnAttente() {
  const q = query(
    collection(db, "users"),
    where("accountType", "==", "enregistre")
  );
  onSnapshot(
    q,
    (snap) => {
      const enAttente = snap.docs.filter((docSnap) => docSnap.data().validated !== true);
      if (enAttente.length === 0) {
        pendingList.innerHTML = "<p class='empty-msg'>Aucun compte en attente.</p>";
        return;
      }
      pendingList.innerHTML = "";
      enAttente.forEach((docSnap) => {
        const d = docSnap.data();
        const card = document.createElement("div");
        card.className = "compte-card";
        card.innerHTML =
          "<strong>" + escapeHtml((d.nom || "") + " " + (d.prenom || "")) + "</strong>" +
          "<div class='meta'>Email : " + escapeHtml(d.email || "") + "</div>" +
          "<div class='meta'>Telephone : " + escapeHtml(d.telephone || "") + "</div>" +
          "<button data-uid='" + escapeHtml(docSnap.id) + "'>Valider ce compte</button>";
        card.querySelector("button").addEventListener("click", async (e) => {
          const uid = e.target.getAttribute("data-uid");
          await updateDoc(doc(db, "users", uid), { validated: true });
        });
        pendingList.appendChild(card);
      });
    },
    (err) => {
      pendingList.innerHTML =
        "<p style='color:#b00020; word-break:break-all;'>Erreur de chargement : " + err.message + "</p>";
      console.error("Erreur onSnapshot users:", err);
    }
  );
}

async function chargerFinanceEtRapports() {
  const caTableBody = document.getElementById("caTableBody");
  const rapportList = document.getElementById("rapportList");
  if (window.ScrollArrows) window.ScrollArrows.attachScrollArrows(rapportList);
  const etabMap = {};

  try {
    const estSnap = await getEstablishmentsSnap();
    estSnap.forEach((d) => {
      const data = d.data();
      etabMap[d.id] = {
        nom: data.nom || data.name || ("Etablissement " + d.id.slice(0, 6)),
        count: 0,
        total: 0
      };
    });
  } catch (err) {
    console.error("Erreur chargement etablissements (finance):", err);
  }

  let ventesDocs = [];
  try {
    const ventesSnap = await getDocs(collectionGroup(db, "ventes"));
    ventesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const estId = docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : "inconnu";
      if (!etabMap[estId]) {
        etabMap[estId] = { nom: "Etablissement " + estId.slice(0, 6), count: 0, total: 0 };
      }
      etabMap[estId].count++;
      etabMap[estId].total += Number(data.montant || 0);
      ventesDocs.push({ estId, montant: Number(data.montant || 0), date: data.date || data.createdAt || null });
    });
  } catch (err) {
    console.error("Erreur ventes (normal si module Ventes pas encore actif):", err);
  }

  const rows = Object.values(etabMap).sort((a, b) => b.total - a.total);
  if (rows.length === 0) {
    caTableBody.innerHTML = "<tr><td colspan='3' class='empty-msg'>Aucun etablissement enregistre pour l'instant.</td></tr>";
  } else {
    caTableBody.innerHTML = rows.map((r) =>
      "<tr><td>" + escapeHtml(r.nom) + "</td><td>" + r.count + "</td><td>" + r.total.toLocaleString("fr-FR") + " FCFA</td></tr>"
    ).join("");
  }

  if (ctxCaBar) {
    const top10 = rows.slice(0, 10);
    if (caBarChart) caBarChart.destroy();
    caBarChart = new Chart(ctxCaBar, {
      type: "bar",
      data: { labels: top10.map((r) => r.nom), datasets: [{ label: "CA (FCFA)", data: top10.map((r) => r.total), backgroundColor: "#22c55e" }] },
      options: { responsive: true, indexAxis: "y", plugins: { legend: { display: false } } },
    });
  }

  if (ctxCaCourbe) {
    const parJour = {};
    ventesDocs.forEach((v) => {
      const dateObj = v.date && v.date.toDate ? v.date.toDate() : null;
      if (!dateObj) return;
      const cle = dateObj.toISOString().slice(0, 10);
      parJour[cle] = (parJour[cle] || 0) + v.montant;
    });
    const labelsJour = Object.keys(parJour).sort().slice(-14);
    const dataJour = labelsJour.map((k) => parJour[k]);
    if (caCourbeChart) caCourbeChart.destroy();
    caCourbeChart = new Chart(ctxCaCourbe, {
      type: "line",
      data: { labels: labelsJour, datasets: [{ label: "CA global (FCFA)", data: dataJour, borderColor: "#4a90d9", tension: 0.3 }] },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });
  }

  if (ventesDocs.length === 0) {
    rapportList.innerHTML = "<p class='empty-msg'>Aucune vente enregistree pour l'instant (module Ventes a venir).</p>";
  } else {
    ventesDocs.sort((a, b) => {
      const da = a.date && a.date.toMillis ? a.date.toMillis() : 0;
      const db2 = b.date && b.date.toMillis ? b.date.toMillis() : 0;
      return db2 - da;
    });
    rapportList.innerHTML = ventesDocs.slice(0, 20).map((v) => {
      const nom = etabMap[v.estId] ? etabMap[v.estId].nom : v.estId;
      const dateStr = v.date && v.date.toDate ? v.date.toDate().toLocaleDateString("fr-FR") : "date inconnue";
      return "<div class='vente-item'>" +
        "<div><div class='v-etab'>" + escapeHtml(nom) + "</div><div class='v-date'>" + dateStr + "</div></div>" +
        "<div class='v-montant'>" + v.montant.toLocaleString("fr-FR") + " FCFA</div></div>";
    }).join("");
  }
}


async function chargerEtablissementsParZone() {
  const listeZonesEl = document.getElementById("listeZones");
  if (window.ScrollArrows) window.ScrollArrows.attachScrollArrows(listeZonesEl);
  const filtreZoneEl = document.getElementById("filtreZone");
  if (!listeZonesEl) return;
  let etablissements = [];
  try {
    const estSnap = await getEstablishmentsSnap();
    estSnap.forEach((d) => {
      const data = d.data();
      etablissements.push({
        id: d.id,
        nom: data.name || data.nom || ("Etablissement " + d.id.slice(0, 6)),
        type: data.type || "?",
        zone: data.localisation || "Zone non renseignée",
        whatsapp: data.whatsappEtablissement || null,
        gps: data.gps || null,
        lienGoogleMaps: data.lienGoogleMaps || null
      });
    });
  } catch (err) {
    console.error("Erreur chargement etablissements (zones):", err);
    listeZonesEl.innerHTML = "<p class='empty-msg'>Erreur de chargement.</p>";
    return;
  }

  const parZone = {};
  etablissements.forEach((e) => {
    if (!parZone[e.zone]) parZone[e.zone] = [];
    parZone[e.zone].push(e);
  });

  if (filtreZoneEl) {
    const selectionActuelle = filtreZoneEl.value;
    filtreZoneEl.innerHTML = '<option value="">Toutes les zones</option>';
    Object.keys(parZone).sort().forEach((zone) => {
      const opt = document.createElement("option");
      opt.value = zone;
      opt.textContent = `${zone} (${parZone[zone].length})`;
      filtreZoneEl.appendChild(opt);
    });
    filtreZoneEl.value = selectionActuelle;
  }

  function rendre() {
    const zoneFiltre = filtreZoneEl ? filtreZoneEl.value : "";
    const zonesAAfficher = zoneFiltre ? [zoneFiltre] : Object.keys(parZone).sort();
    if (!zonesAAfficher.length || !zonesAAfficher.some((z) => parZone[z])) {
      listeZonesEl.innerHTML = "<p class='empty-msg'>Aucun établissement.</p>";
      return;
    }
    listeZonesEl.innerHTML = zonesAAfficher.filter((z) => parZone[z]).map((zone) => {
      const items = parZone[zone].map((e) => {
        const mapsLien = (e.lienGoogleMaps && /^https:\/\//.test(e.lienGoogleMaps))
          ? `<a href="${escapeHtml(e.lienGoogleMaps)}" target="_blank">📍 Voir sur Maps</a>`
          : "<span class='empty-msg'>GPS non renseigné</span>";
        const whatsappLien = e.whatsapp
          ? `<a href="https://wa.me/${e.whatsapp.replace(/\D/g, "")}" target="_blank">💬 ${escapeHtml(e.whatsapp)}</a>`
          : "<span class='empty-msg'>WhatsApp non renseigné</span>";
        return `<div class="zone-etab-item" data-id="${escapeHtml(e.id)}">
          <div><strong>${escapeHtml(e.nom)}</strong> (${escapeHtml(e.type)})</div>
          <div>${mapsLien} — ${whatsappLien}</div>
          <button class="btn-edit-etab" data-id="${escapeHtml(e.id)}">✏️ Modifier</button>
        </div>`;
      }).join("");
      return `<div class="zone-groupe"><h3>${escapeHtml(zone)}</h3>${items}</div>`;
    }).join("");

    document.querySelectorAll(".btn-edit-etab").forEach((btn) => {
      btn.addEventListener("click", () => ouvrirEditionEtablissement(btn.dataset.id, etablissements));
    });
  }

  rendre();
  if (filtreZoneEl) filtreZoneEl.addEventListener("change", rendre);
}
async function ouvrirEditionEtablissement(id, etablissements) {
  const etab = etablissements.find((e) => e.id === id);
  if (!etab) return;
  const nouveauNom = prompt("Nom de l'établissement :", etab.nom);
  if (nouveauNom === null) return;
  const nouvelleZone = prompt("Zone / quartier :", etab.zone);
  if (nouvelleZone === null) return;
  const nouveauWhatsapp = prompt("WhatsApp (ex: 24177123456) :", etab.whatsapp || "");
  if (nouveauWhatsapp === null) return;
  try {
    await updateDoc(doc(db, "establishments", id), {
      name: nouveauNom,
      localisation: nouvelleZone,
      whatsappEtablissement: nouveauWhatsapp || null,
      updatedAt: serverTimestamp()
    });
    alert("Établissement mis à jour.");
    chargerEtablissementsParZone();
  } catch (err) {
    console.error("Erreur mise à jour établissement:", err);
    alert("Erreur lors de la mise à jour.");
  }
}

function attendreChart(callback, tentatives = 0) {
  if (window.Chart) {
    callback();
    return;
  }
  if (tentatives > 50) {
    console.error("Chart.js n'a jamais fini de charger (timeout).");
    return;
  }
  setTimeout(() => attendreChart(callback, tentatives + 1), 100);
}

function renderInventaireGlobal(produits) {
  attendreChart(() => renderInventaireGlobalImpl(produits));
}

function renderInventaireGlobalImpl(produits) {
  let valeurTotale = 0;
  const parCategorie = {};
  produits.forEach((p) => {
    const prix = Number(p.prixVente || p.prixAchat || p.prix || 0);
    const qte = Number(p.stock || p.quantite || 0);
    valeurTotale += prix * qte;
    const cat = p.categorie || "Sans categorie";
    parCategorie[cat] = (parCategorie[cat] || 0) + qte;
  });
  document.getElementById("statTotalProduits").textContent = produits.length;
  document.getElementById("statValeurStock").textContent = valeurTotale.toLocaleString("fr-FR") + " FCFA";

  const ctxCat = document.getElementById("stockCategorieChart");
  if (ctxCat) {
    if (window._stockCategorieChart) window._stockCategorieChart.destroy();
    let labels = Object.keys(parCategorie);
    let dataCat = labels.map((l) => parCategorie[l]);
    if (!labels.length) {
      labels = ["Aucune donnee"];
      dataCat = [1];
    }
    window._stockCategorieChart = new Chart(ctxCat, {
      type: "pie",
      data: {
        labels,
        datasets: [{
          data: dataCat,
          backgroundColor: (labels.length === 1 && labels[0] === "Aucune donnee") ? ["#d8d5cc"] : ["#2a78d6","#eb6834","#1baf7a","#eda100","#e87ba4","#008300","#6250d6","#e34948"]
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const top8 = [...produits]
    .map((p) => ({
      nom: p.nom || "?",
      valeur: Number(p.prixVente || p.prixAchat || p.prix || 0) * Number(p.stock || p.quantite || 0)
    }))
    .sort((a, b) => b.valeur - a.valeur)
    .slice(0, 8);
  const ctxTop = document.getElementById("stockTopProduitsChart");
  if (ctxTop) {
    if (window._stockTopProduitsChart) window._stockTopProduitsChart.destroy();
    const top8Affiche = top8.length ? top8 : [{ nom: "Aucun produit", valeur: 0 }];
    window._stockTopProduitsChart = new Chart(ctxTop, {
      type: "bar",
      data: {
        labels: top8Affiche.map((p) => p.nom),
        datasets: [{ data: top8Affiche.map((p) => p.valeur), backgroundColor: "#2a78d6" }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { callback: (v) => Number(v).toLocaleString("fr-FR") } } }
      }
    });
  }
}

// --- Import catalogue CSV vers tous les etablissements ---
function parserCSV(text) {
  const lignes = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const entetes = lignes[0].split(",").map((h) => h.trim());
  return lignes.slice(1).map((ligne) => {
    const valeurs = ligne.split(",");
    const obj = {};
    entetes.forEach((h, i) => { obj[h] = (valeurs[i] || "").trim(); });
    return obj;
  });
}

document.getElementById("btnImporterCatalogue").addEventListener("click", async () => {
  const fileInput = document.getElementById("catalogueFileInput");
  const statusEl = document.getElementById("importStatus");
  const file = fileInput.files[0];
  if (!file) {
    statusEl.textContent = "Choisis d'abord un fichier CSV.";
    return;
  }
  if (!confirm("Importer ce catalogue vers TOUS les etablissements ? Cette action ajoutera des produits a chaque etablissement existant.")) {
    return;
  }
  statusEl.textContent = "Lecture du fichier...";
  try {
    const texte = await file.text();
    const lignes = parserCSV(texte);
    const produits = lignes.map((l) => ({
      nom: l["Nom"] || "",
      categorie: l["Catégorie"] || l["Categorie"] || "",
      prixAchat: Number(l["Prix achat"]) || 0,
      prixVente: Number(l["Prix vente"]) || 0,
      stock: Number(l["Stock"]) || 0,
    })).filter((p) => p.nom);

    if (!produits.length) {
      statusEl.textContent = "Aucun produit valide trouve dans le fichier.";
      return;
    }

    statusEl.textContent = "Lecture des etablissements...";
    const estSnap = await getEstablishmentsSnap();
    const etablissementIds = estSnap.docs.map((d) => d.id);

    if (!etablissementIds.length) {
      statusEl.textContent = "Aucun etablissement trouve.";
      return;
    }

    const progressWrap = document.getElementById("importProgressWrap");
    const progressBar = document.getElementById("importProgressBar");
    const progressPercent = document.getElementById("importProgressPercent");
    const totalAFaire = produits.length * etablissementIds.length;
    progressWrap.hidden = false;
    progressPercent.hidden = false;
    progressWrap.classList.remove("fade-out");
    progressPercent.classList.remove("fade-out");
    progressBar.style.width = "0%";
    progressPercent.textContent = "0%";

    const TAILLE_LOT = 450;
    let total = 0;
    for (const estId of etablissementIds) {
      let batch = writeBatch(db);
      let compteurLot = 0;
      for (const p of produits) {
        const nouveauDocRef = doc(collection(db, "establishments", estId, "produits"));
        batch.set(nouveauDocRef, {
          ...p,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        compteurLot++;
        total++;
        if (compteurLot >= TAILLE_LOT) {
          await batch.commit();
          batch = writeBatch(db);
          compteurLot = 0;
        }
        const pct = Math.round((total / totalAFaire) * 100);
        progressBar.style.width = pct + "%";
        progressPercent.textContent = pct + "%";
      }
      if (compteurLot > 0) {
        await batch.commit();
      }
      statusEl.textContent = `Import en cours... (${total} produits crees)`;
    }
    statusEl.textContent = `Import termine : ${produits.length} produits ajoutes a ${etablissementIds.length} etablissement(s), soit ${total} documents crees.`;
    progressBar.style.width = "100%";
    progressPercent.textContent = "100%";
    setTimeout(() => {
      progressWrap.classList.add("fade-out");
      progressPercent.classList.add("fade-out");
      setTimeout(() => {
        progressWrap.hidden = true;
        progressPercent.hidden = true;
      }, 800);
    }, 1200);
  } catch (err) {
    statusEl.textContent = "Erreur : " + err.message;
    console.error(err);
    const pw = document.getElementById("importProgressWrap");
    const pp = document.getElementById("importProgressPercent");
    if (pw) pw.hidden = true;
    if (pp) pp.hidden = true;
  }
});

document.getElementById("catalogueFileInput").addEventListener("change", (e) => {
  const label = document.getElementById("catalogueFileLabel");
  if (e.target.files.length) {
    label.textContent = "📄 " + e.target.files[0].name;
  } else {
    label.textContent = "📄 Choisir un fichier CSV";
  }
});

// --- Vider l'inventaire de tous les etablissements ---
document.getElementById("btnViderInventaire").addEventListener("click", async () => {
  const statusEl = document.getElementById("importStatus");
  const confirmation1 = confirm("Ceci va SUPPRIMER tous les produits de TOUS les etablissements. Cette action est irreversible. Continuer ?");
  if (!confirmation1) return;
  const confirmation2 = confirm("Es-tu vraiment sur ? Tape OK une derniere fois pour confirmer la suppression definitive.");
  if (!confirmation2) return;

  statusEl.textContent = "Lecture des etablissements...";
  try {
    const estSnap = await getEstablishmentsSnap();
    const etablissementIds = estSnap.docs.map((d) => d.id);
    let totalSupprime = 0;

    for (const estId of etablissementIds) {
      const produitsSnap = await getDocs(collection(db, "establishments", estId, "produits"));
      const docs = produitsSnap.docs;
      const TAILLE_LOT = 450;
      for (let i = 0; i < docs.length; i += TAILLE_LOT) {
        const lot = docs.slice(i, i + TAILLE_LOT);
        const batch = writeBatch(db);
        lot.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        totalSupprime += lot.length;
        statusEl.textContent = `Suppression en cours... (${totalSupprime} produits supprimes)`;
      }
    }
    statusEl.textContent = `Nettoyage termine : ${totalSupprime} produits supprimes sur ${etablissementIds.length} etablissement(s).`;
  } catch (err) {
    statusEl.textContent = "Erreur : " + err.message;
    console.error(err);
  }
});

// --- Tuiles stats cliquables : defilement vers la section correspondante ---
document.querySelectorAll(".stat-card[data-target], .quick-tile[data-target]").forEach((card) => {
  card.addEventListener("click", () => {
    if (typeof afficherOngletAdmin === "function") afficherOngletAdmin(card.dataset.target);
  });
});

// --- Gestion des produits (tous etablissements) ---
let _cacheProduitsGestion = [];
let _cacheEtablissementsNoms = {};

async function chargerGestionProduits() {
  const tbody = document.getElementById("produitsGestionTableBody");
  const select = document.getElementById("filtreEtablissementProduits");
  try {
    const estSnap = await getEstablishmentsSnap();
    _cacheEtablissementsNoms = {};
    const valeurActuelle = select.value;
    select.innerHTML = '<option value="tous">Tous les etablissements</option>';
    estSnap.forEach((d) => {
      const data = d.data();
      const nomAffiche = (data.name || "Etablissement") + " (" + d.id.slice(0, 6) + ")";
      _cacheEtablissementsNoms[d.id] = data.name || "Etablissement";
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = nomAffiche;
      select.appendChild(opt);
    });
    if ([...select.options].some((o) => o.value === valeurActuelle)) {
      select.value = valeurActuelle;
    }

    const prodSnap = await getDocs(collectionGroup(db, "produits"));
    _cacheProduitsGestion = prodSnap.docs.map((d) => ({
      ref: d.ref,
      id: d.id,
      estId: d.ref.parent.parent.id,
      ...d.data(),
    }));
  } catch (err) {
    return;
  }
  try {
    rendreTableauGestionProduits();
  } catch (err) {
  }
  try {
    renderInventaireGlobal(_cacheProduitsGestion);
  } catch (err) {
  }
}

function rendreTableauGestionProduits() {
  const tbody = document.getElementById("produitsGestionTableBody");
  const select = document.getElementById("filtreEtablissementProduits");
  const filtre = select.value;
  const lignes = filtre === "tous"
    ? _cacheProduitsGestion
    : _cacheProduitsGestion.filter((p) => p.estId === filtre);

  if (!lignes.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">Aucun produit.</td></tr>';
    return;
  }

  tbody.innerHTML = lignes.map((p) => {
    const nomEtab = _cacheEtablissementsNoms[p.estId] || p.estId.slice(0, 6);
    return '<tr data-ref-id="' + escapeHtml(p.id) + '" data-est-id="' + escapeHtml(p.estId) + '">' +
      '<td>' + escapeHtml(nomEtab) + '</td>' +
      '<td>' + escapeHtml(p.nom || "") + '</td>' +
      '<td>' + escapeHtml(p.categorie || "") + '</td>' +
      '<td>' + (p.prixVente || 0) + ' FCFA</td>' +
      '<td>' + (p.stock || 0) + '</td>' +
      '<td><button class="btn-supprimer-ligne">Suppr.</button></td>' +
      '</tr>';
  }).join("");
}

document.getElementById("filtreEtablissementProduits").addEventListener("change", rendreTableauGestionProduits);

document.getElementById("produitsGestionTableBody").addEventListener("click", async (e) => {
  if (!e.target.classList.contains("btn-supprimer-ligne")) return;
  const tr = e.target.closest("tr");
  const refId = tr.dataset.refId;
  const estId = tr.dataset.estId;
  const produit = _cacheProduitsGestion.find((p) => p.id === refId && p.estId === estId);
  if (!produit) return;
  if (!confirm('Supprimer "' + (produit.nom || "ce produit") + '" ?')) return;
  try {
    await deleteDoc(produit.ref);
    _cacheProduitsGestion = _cacheProduitsGestion.filter((p) => !(p.id === refId && p.estId === estId));
    rendreTableauGestionProduits();
  } catch (err) {
    alert("Erreur suppression : " + err.message);
  }
});

// ===== Menu latéral admin + nav du bas =====
(function initAdminNav() {
  const menu = document.getElementById("adminSideMenu");
  const overlay = document.getElementById("adminSideMenuOverlay");
  const btnOpen = document.getElementById("btnAdminMenu");
  const btnClose = document.getElementById("btnCloseAdminMenu");
  const btnRetourApp = document.getElementById("menuAdminRetourApp");

  function ouvrirMenu() { if (menu) menu.hidden = false; }
  function fermerMenu() { if (menu) menu.hidden = true; }

  if (btnOpen) btnOpen.addEventListener("click", ouvrirMenu);
  if (btnClose) btnClose.addEventListener("click", fermerMenu);
  if (overlay) overlay.addEventListener("click", fermerMenu);
  if (btnRetourApp) btnRetourApp.addEventListener("click", () => { window.location.href = "index.html"; });

  const TOUTES_SECTIONS_ADMIN = ["secAccueil","secMonEtablissement","secCourbeCA","secComptesAttente","secCA","secZones","secImport","secGestionProduits","secVentes","secConnexions"];

function afficherOngletAdmin(idCible) {
  TOUTES_SECTIONS_ADMIN.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const conteneur = el.closest("details") || el;
    if (id === idCible || id === "secAccueil" && idCible === "secAccueil") {
      conteneur.classList.remove("admin-tab-hidden");
      if (conteneur.tagName === "DETAILS") conteneur.open = true;
    } else {
      conteneur.classList.add("admin-tab-hidden");
    }
  });
  document.querySelectorAll("#adminBottomNav .bottom-nav-item[data-target]").forEach((b) => { b.classList.toggle("active", b.dataset.target === idCible); });
  const backBtn = document.getElementById("btnAdminTabBack");
  if (backBtn) backBtn.classList.toggle("show", idCible !== "secAccueil");
  window.scrollTo({ top: 0, behavior: "instant" });
}

document.querySelectorAll("#adminSideMenu [data-target], #adminBottomNav [data-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      afficherOngletAdmin(btn.dataset.target);
    });
  });

const btnAdminTabBack = document.getElementById("btnAdminTabBack");
if (btnAdminTabBack) {
  btnAdminTabBack.addEventListener("click", () => afficherOngletAdmin("secAccueil"));
}
window.afficherOngletAdmin = afficherOngletAdmin;
})();


async function chargerConnexions() {
  const connexionsTableBody = document.getElementById("connexionsTableBody");
  if (!connexionsTableBody) return;
  try {
    const q = query(collection(db, "connexions"), orderBy("dateConnexion", "desc"), limit(100));
    const snap = await getDocs(q);
    if (snap.empty) {
      connexionsTableBody.innerHTML = '<tr><td colspan="3" class="empty-msg">Aucune connexion enregistree.</td></tr>';
      return;
    }
    let html = "";
    snap.forEach((d) => {
      const data = d.data();
      const date = data.dateConnexion && data.dateConnexion.toDate ? data.dateConnexion.toDate() : null;
      const dateStr = date ? date.toLocaleString("fr-FR") : "\u2014";
      const lieu = [data.ville, data.pays].filter(Boolean).join(", ") || "\u2014";
      const contexte = data.contexte === "admin" ? " (admin)" : "";
      html += "<tr><td>" + escapeHtml(data.email || "inconnu") + contexte + "</td><td>" + dateStr + "</td><td>" + escapeHtml(lieu) + "</td></tr>";
    });
    connexionsTableBody.innerHTML = html;
  } catch (err) {
    console.error("Erreur chargement connexions:", err);
    connexionsTableBody.innerHTML = '<tr><td colspan="3" class="empty-msg">Erreur de chargement.</td></tr>';
  }
}
