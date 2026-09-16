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

const btnMenuAdminDeconnexion = document.getElementById("menuAdminDeconnexion");
if (btnMenuAdminDeconnexion) {
  btnMenuAdminDeconnexion.addEventListener("click", async () => {
    await signOut(auth);
  });
}

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
    chargerHistoriqueGlobal();
    chargerClotures();
    chargerEtablissementsParZone();
    chargerGestionProduits();
    remplirSelectVidageUnitaire();
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
          "<button class='btn-valider' data-uid='" + escapeHtml(docSnap.id) + "'>Valider ce compte</button>" +
          "<button class='btn-refuser' data-uid='" + escapeHtml(docSnap.id) + "' data-est='" + escapeHtml(docSnap.id) + "'>Refuser</button>";
        card.querySelector(".btn-valider").addEventListener("click", async (e) => {
          const uid = e.target.getAttribute("data-uid");
          await updateDoc(doc(db, "users", uid), { validated: true });
        });
        card.querySelector(".btn-refuser").addEventListener("click", async (e) => {
          const uid = e.target.getAttribute("data-uid");
          const estId = e.target.getAttribute("data-est");
          if (!confirm("Refuser definitivement ce compte ?")) return;
          await updateDoc(doc(db, "users", uid), { statut: "refuse" });
          try {
            await addDoc(collection(db, "establishments", estId, "notifications"), {
              type: "info",
              titre: "Compte refuse",
              message: "Ton compte a ete refuse par l administrateur. Tu ne pourras plus acceder a l application.",
              lu: false,
              createdAt: serverTimestamp(),
              auteurId: null,
              auteurRole: "ADMIN",
              auteurAccountType: null
            });
          } catch (errNotif) {
            console.warn("Notification de refus non creee :", errNotif.message);
          }
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
      data: { labels: top10.map((r) => r.nom), datasets: [{ label: "CA (FCFA)", data: top10.map((r) => r.total), backgroundColor: "#1f6f4a" }] },
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
      data: { labels: labelsJour, datasets: [{ label: "CA global (FCFA)", data: dataJour, borderColor: "#b8902e", tension: 0.3 }] },
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



async function supprimerSousCollection(estId, sousCollection) {
  const snap = await getDocs(collection(db, "establishments", estId, sousCollection));
  if (snap.empty) return;
  const docsArray = snap.docs;
  const TAILLE_LOT = 400;
  for (let i = 0; i < docsArray.length; i += TAILLE_LOT) {
    const lot = docsArray.slice(i, i + TAILLE_LOT);
    const batch = writeBatch(db);
    lot.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function supprimerEtablissement(estId, nom, callbackApresRefresh) {
  const confirmation = prompt(
    "ATTENTION : suppression definitive et irreversible de \"" + nom + "\" et de toutes ses donnees (produits, ventes, factures, mouvements...).\n\nTape le nom exact de l etablissement pour confirmer :"
  );
  if (confirmation !== nom) {
    if (confirmation !== null) alert("Nom incorrect, suppression annulee.");
    return;
  }

  try {
    const sousCollections = ["produits", "ventes", "factures", "mouvements", "gerants", "meta", "journal", "rapports", "clotures", "notifications"];
    for (const sc of sousCollections) {
      await supprimerSousCollection(estId, sc);
    }
    await deleteDoc(doc(db, "establishments", estId));
    alert("Etablissement \"" + nom + "\" supprime avec succes.");
    _cacheEstablishmentsSnap = null;
    if (callbackApresRefresh) callbackApresRefresh();
  } catch (err) {
    console.error("Erreur suppression etablissement:", err);
    alert("Erreur lors de la suppression : " + err.message);
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
          <button class="btn-delete-etab" data-id="${escapeHtml(e.id)}" data-nom="${escapeHtml(e.nom)}">🗑️ Supprimer</button>
        </div>`;
      }).join("");
      return `<div class="zone-groupe"><h3>${escapeHtml(zone)}</h3>${items}</div>`;
    }).join("");

    document.querySelectorAll(".btn-edit-etab").forEach((btn) => {
      btn.addEventListener("click", () => ouvrirEditionEtablissement(btn.dataset.id, etablissements));
    });

    document.querySelectorAll(".btn-delete-etab").forEach((btn) => {
      btn.addEventListener("click", () => supprimerEtablissement(btn.dataset.id, btn.dataset.nom, chargerEtablissementsParZone));
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
          backgroundColor: (labels.length === 1 && labels[0] === "Aucune donnee") ? ["#d8d5cc"] : ["#1f6f4a","#b8902e","#2d8a5c","#d4a94a","#164f35","#8f6b1f","#4a9970","#e0be6e"]
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
        datasets: [{ data: top8Affiche.map((p) => p.valeur), backgroundColor: "#b8902e" }]
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

// --- Vider l'inventaire d'un etablissement en particulier ---
async function remplirSelectVidageUnitaire() {
  const select = document.getElementById("selectEtablissementVidage");
  if (!select) return;
  try {
    const estSnap = await getEstablishmentsSnap();
    const valeurActuelle = select.value;
    select.innerHTML = '<option value="">Choisir un etablissement...</option>';
    estSnap.forEach((d) => {
      const data = d.data();
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = (data.name || "Etablissement") + " (" + d.id.slice(0, 6) + ")";
      select.appendChild(opt);
    });
    if ([...select.options].some((o) => o.value === valeurActuelle)) {
      select.value = valeurActuelle;
    }
  } catch (err) {
    console.error(err);
  }
}

document.getElementById("btnViderInventaireUnitaire").addEventListener("click", async () => {
  const select = document.getElementById("selectEtablissementVidage");
  const statusEl = document.getElementById("importStatus");
  const estId = select.value;
  if (!estId) {
    statusEl.textContent = "Choisis d'abord un etablissement.";
    return;
  }
  const nomEtab = select.options[select.selectedIndex].textContent;
  const confirmation1 = confirm('Ceci va SUPPRIMER tous les produits de "' + nomEtab + '". Cette action est irreversible. Continuer ?');
  if (!confirmation1) return;
  const confirmation2 = confirm("Es-tu vraiment sur ? Tape OK une derniere fois pour confirmer la suppression definitive.");
  if (!confirmation2) return;

  statusEl.textContent = "Suppression en cours...";
  try {
    const produitsSnap = await getDocs(collection(db, "establishments", estId, "produits"));
    const docs = produitsSnap.docs;
    const TAILLE_LOT = 450;
    let totalSupprime = 0;
    for (let i = 0; i < docs.length; i += TAILLE_LOT) {
      const lot = docs.slice(i, i + TAILLE_LOT);
      const batch = writeBatch(db);
      lot.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      totalSupprime += lot.length;
      statusEl.textContent = "Suppression en cours... (" + totalSupprime + " produits supprimes)";
    }
    statusEl.textContent = 'Nettoyage termine : ' + totalSupprime + ' produits supprimes pour "' + nomEtab + '".';
  } catch (err) {
    statusEl.textContent = "Erreur : " + err.message;
    console.error(err);
  }
});


if (window.ScrollArrows) window.ScrollArrows.attachScrollArrows(document.getElementById("caTableBody").parentElement);
if (window.ScrollArrows) window.ScrollArrows.attachScrollArrows(document.getElementById("histTableBody").parentElement);
if (window.ScrollArrows) window.ScrollArrows.attachScrollArrows(document.getElementById("produitsGestionTableBody").parentElement);
if (window.ScrollArrows) window.ScrollArrows.attachScrollArrows(document.getElementById("connexionsTableBody").parentElement);

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

  const TOUTES_SECTIONS_ADMIN = ["secAccueil","secMonEtablissement","secComptesAttente","secCA","secZones","secImport","secGestionProduits","secVentes","secConnexions","secHistorique","secClotures"];

function majHauteurHeader() {
  const h = document.querySelector("header");
  if (h) document.documentElement.style.setProperty("--header-h", h.offsetHeight + "px");
}
window.addEventListener("resize", majHauteurHeader);
majHauteurHeader();

function afficherOngletAdmin(idCible) {
  majHauteurHeader();
  TOUTES_SECTIONS_ADMIN.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const conteneur = el.closest("details") || el;
    if (id === idCible && idCible !== "secAccueil") { conteneur.classList.add("admin-fullscreen-section"); } else { conteneur.classList.remove("admin-fullscreen-section"); }
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
  const activeEl = document.getElementById(idCible);
  const scrollTarget = (activeEl && activeEl.closest(".admin-fullscreen-section")) || document.scrollingElement || document.documentElement;
  scrollTarget.scrollTo ? scrollTarget.scrollTo({ top: 0, behavior: "instant" }) : (scrollTarget.scrollTop = 0);
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

let historiqueCache = [];
let histEtabMapCache = {};

async function chargerHistoriqueGlobal() {
  const etabSelect = document.getElementById("histFiltreEtablissement");
  const periodeSelect = document.getElementById("histFiltrePeriode");
  const gerantInput = document.getElementById("histFiltreGerant");
  const typeSelect = document.getElementById("histFiltreType");
  if (!etabSelect) return;

  try {
    const estSnap = await getEstablishmentsSnap();
    histEtabMapCache = {};
    estSnap.forEach((d) => {
      const data = d.data();
      histEtabMapCache[d.id] = data.nom || data.name || ("Etablissement " + d.id.slice(0, 6));
    });
    if (etabSelect.children.length <= 1) {
      const opts = Object.entries(histEtabMapCache).sort((a, b) => a[1].localeCompare(b[1]));
      etabSelect.innerHTML = '<option value="">Tous les établissements</option>' +
        opts.map(([id, nom]) => `<option value="${id}">${escapeHtml(nom)}</option>`).join("");
    }
  } catch (err) {
    console.error("Erreur chargement etablissements (historique):", err);
  }

  historiqueCache = [];
  try {
    const facturesSnap = await getDocs(query(collectionGroup(db, "factures"), orderBy("date", "desc"), limit(400)));
    facturesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const estId = docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : "inconnu";
      historiqueCache.push({
        date: data.date, estId, gerant: data.auteurNom || "—", type: "facture",
        detail: "Facture n°" + (data.numero || "?"), montant: Number(data.total || 0)
      });
    });
  } catch (err) {
    console.error("Erreur chargement factures (historique):", err);
  }
  try {
    const mouvementsSnap = await getDocs(query(collectionGroup(db, "mouvements"), orderBy("date", "desc"), limit(400)));
    mouvementsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const estId = docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : "inconnu";
      historiqueCache.push({
        date: data.date, estId, gerant: data.auteurNom || "—", type: "mouvement",
        detail: "Mouvement (" + (data.type || "?") + ")", montant: Number(data.montant || 0)
      });
    });
  } catch (err) {
    console.error("Erreur chargement mouvements (historique):", err);
  }

  try {
    const ventesSnap = await getDocs(query(collectionGroup(db, "ventes"), orderBy("date", "desc"), limit(400)));
    ventesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const estId = docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : "inconnu";
      historiqueCache.push({
        date: data.date, estId, gerant: data.auteurNom || "—", type: "vente",
        detail: data.produitNom ? (data.quantite + " x " + data.produitNom) : "Vente libre", montant: Number(data.montant || 0)
      });
    });
  } catch (err) {
    console.error("Erreur chargement ventes (historique):", err);
  }
  afficherHistoriqueFiltre();

  [periodeSelect, etabSelect, typeSelect].forEach((el) => {
    if (el && !el._histBound) { el.addEventListener("change", afficherHistoriqueFiltre); el._histBound = true; }
  });
  if (gerantInput && !gerantInput._histBound) { gerantInput.addEventListener("input", afficherHistoriqueFiltre); gerantInput._histBound = true; }
}

function afficherHistoriqueFiltre() {
  const tbody = document.getElementById("histTableBody");
  if (!tbody) return;
  const periode = (document.getElementById("histFiltrePeriode") || {}).value || "tout";
  const estId = (document.getElementById("histFiltreEtablissement") || {}).value || "";
  const gerantFiltre = ((document.getElementById("histFiltreGerant") || {}).value || "").trim().toLowerCase();
  const type = (document.getElementById("histFiltreType") || {}).value || "tout";

  const maintenant = new Date();
  let seuil = null;
  if (periode === "jour") { seuil = new Date(); seuil.setHours(0, 0, 0, 0); }
  else if (periode === "semaine") { seuil = new Date(maintenant.getTime() - 7 * 24 * 3600 * 1000); }
  else if (periode === "mois") { seuil = new Date(maintenant.getTime() - 30 * 24 * 3600 * 1000); }

  const lignes = historiqueCache.filter((l) => {
    if (estId && l.estId !== estId) return false;
    if (type !== "tout" && l.type !== type) return false;
    if (gerantFiltre && !(l.gerant || "").toLowerCase().includes(gerantFiltre)) return false;
    if (seuil && l.date && l.date.toDate && l.date.toDate() < seuil) return false;
    return true;
  });

  if (lignes.length === 0) {
    tbody.innerHTML = "<tr><td colspan='6' class='empty-msg'>Aucun résultat.</td></tr>";
    return;
  }
  tbody.innerHTML = lignes.map((l) => {
    const dateStr = (l.date && l.date.toDate) ? l.date.toDate().toLocaleDateString("fr-FR") : "—";
    const nomEtab = histEtabMapCache[l.estId] || l.estId;
    return "<tr><td>" + dateStr + "</td><td>" + escapeHtml(nomEtab) + "</td><td>" + escapeHtml(l.gerant) +
      "</td><td>" + l.type + "</td><td>" + escapeHtml(l.detail) + "</td><td>" + l.montant.toLocaleString("fr-FR") + " FCFA</td></tr>";
  }).join("");
}

let cloturesCache = [];
let cloturesEtabMapCache = {};

async function chargerClotures() {
  const etabSelect = document.getElementById("clotFiltreEtablissement");
  const periodeSelect = document.getElementById("clotFiltrePeriode");
  const gerantInput = document.getElementById("clotFiltreGerant");
  if (!etabSelect) return;

  try {
    const estSnap = await getEstablishmentsSnap();
    cloturesEtabMapCache = {};
    estSnap.forEach((d) => {
      const data = d.data();
      cloturesEtabMapCache[d.id] = data.nom || data.name || ("Etablissement " + d.id.slice(0, 6));
    });
    if (etabSelect.children.length <= 1) {
      const opts = Object.entries(cloturesEtabMapCache).sort((a, b) => a[1].localeCompare(b[1]));
      etabSelect.innerHTML = '<option value="">Tous les établissements</option>' +
        opts.map(([id, nom]) => `<option value="${id}">${escapeHtml(nom)}</option>`).join("");
    }
  } catch (err) {
    console.error("Erreur chargement etablissements (clotures):", err);
  }

  cloturesCache = [];
  try {
    const cloturesSnap = await getDocs(query(collectionGroup(db, "clotures"), orderBy("date", "desc"), limit(300)));
    cloturesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const estId = docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : "inconnu";
      cloturesCache.push({ id: docSnap.id, estId, ...data });
    });
  } catch (err) {
    console.error("Erreur chargement clotures:", err);
  }

  afficherCloturesFiltre();

  [periodeSelect, etabSelect].forEach((el) => {
    if (el && !el._clotBound) { el.addEventListener("change", afficherCloturesFiltre); el._clotBound = true; }
  });
  if (gerantInput && !gerantInput._clotBound) { gerantInput.addEventListener("input", afficherCloturesFiltre); gerantInput._clotBound = true; }
}

function afficherCloturesFiltre() {
  const tbody = document.getElementById("clotTableBody");
  if (!tbody) return;
  const periode = (document.getElementById("clotFiltrePeriode") || {}).value || "tout";
  const estId = (document.getElementById("clotFiltreEtablissement") || {}).value || "";
  const gerantFiltre = ((document.getElementById("clotFiltreGerant") || {}).value || "").trim().toLowerCase();

  const maintenant = new Date();
  let seuil = null;
  if (periode === "jour") {
    seuil = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  } else if (periode === "semaine") {
    const jour = maintenant.getDay() || 7;
    seuil = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - jour + 1);
  } else if (periode === "mois") {
    seuil = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  }

  const filtrees = cloturesCache.filter((c) => {
    if (estId && c.estId !== estId) return false;
    if (gerantFiltre && !(c.gerantNom || "").toLowerCase().includes(gerantFiltre)) return false;
    if (seuil) {
      if (!c.date || !c.date.toDate) return false;
      if (c.date.toDate() < seuil) return false;
    }
    return true;
  });

  if (filtrees.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">Aucune clôture pour ces filtres.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrees.map((c, i) => {
    const d = c.date && c.date.toDate ? c.date.toDate() : null;
    const dateStr = d ? d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";
    const nomEtab = c.etablissementNom || cloturesEtabMapCache[c.estId] || "—";
    const ecart = c.caisse ? Number(c.caisse.ecart || 0) : 0;
    const ecartStr = (ecart >= 0 ? "+" : "") + ecart.toLocaleString("fr-FR") + " FCFA";
    const ecartColor = ecart === 0 ? "var(--text)" : (ecart > 0 ? "#1f6f4a" : "var(--danger)");
    return `
      <tr>
        <td>${dateStr}</td>
        <td>${escapeHtml(nomEtab)}</td>
        <td>${escapeHtml(c.gerantNom || "—")}</td>
        <td>${Number(c.totalVentes || 0).toLocaleString("fr-FR")} FCFA</td>
        <td style="color:${ecartColor}; font-weight:600;">${ecartStr}</td>
        <td>${escapeHtml(c.statut || "envoyee")}</td>
        <td><button type="button" class="icon-btn btn-voir-cloture" data-idx="${i}">Voir</button></td>
      </tr>`;
  }).join("");

  tbody.querySelectorAll(".btn-voir-cloture").forEach((btn) => {
    btn.addEventListener("click", () => afficherDetailCloture(filtrees[Number(btn.dataset.idx)]));
  });
}

function ligneVentilation(obj) {
  const entrees = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  if (entrees.length === 0) return "<p class=\"empty-msg\">Aucune donnée.</p>";
  return "<ul>" + entrees.map(([k, v]) => `<li>${escapeHtml(k)} : ${Number(v).toLocaleString("fr-FR")} FCFA</li>`).join("") + "</ul>";
}

function ligneStock(stockParMarque) {
  const entrees = Object.entries(stockParMarque || {});
  if (entrees.length === 0) return "<p class=\"empty-msg\">Aucune donnée.</p>";
  return "<ul>" + entrees.map(([marque, produits]) => {
    const detail = (produits || []).map((p) => `${escapeHtml(p.nom)} : ${p.stock}`).join(", ");
    return `<li><strong>${escapeHtml(marque)}</strong> — ${detail}</li>`;
  }).join("") + "</ul>";
}

function afficherDetailCloture(c) {
  const zone = document.getElementById("clotDetailZone");
  if (!zone) return;
  const d = c.date && c.date.toDate ? c.date.toDate() : new Date();
  const dateStr = d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const nomEtab = c.etablissementNom || cloturesEtabMapCache[c.estId] || "—";
  const caisse = c.caisse || {};
  const facturesManuelles = c.facturesManuelles || [];
  const facturesNumeriques = c.facturesNumeriques || [];

  zone.innerHTML = `
    <div class="cloture-fiche" id="cloture-fiche-impression">
      <h3>Fiche de clôture — ${escapeHtml(nomEtab)}</h3>
      <p><strong>Gérant :</strong> ${escapeHtml(c.gerantNom || "—")} &nbsp;|&nbsp; <strong>Date :</strong> ${dateStr}</p>
      <p><strong>Ventes :</strong> ${Number(c.totalVentes || 0).toLocaleString("fr-FR")} FCFA (${c.nombreVentes || 0} vente(s))</p>

      <h4>Caisse</h4>
      <ul>
        <li>Fond de départ : ${Number(caisse.fondDepart || 0).toLocaleString("fr-FR")} FCFA</li>
        <li>Théorique (fond + ventes + factures manuelles) : ${Number(caisse.theorique || 0).toLocaleString("fr-FR")} FCFA</li>
        <li>Compté réellement : ${Number(caisse.recetteReelle || 0).toLocaleString("fr-FR")} FCFA</li>
        <li><strong>Écart : ${Number(caisse.ecart || 0) >= 0 ? "+" : ""}${Number(caisse.ecart || 0).toLocaleString("fr-FR")} FCFA</strong></li>
      </ul>

      <h4>Ventilation par catégorie</h4>
      ${ligneVentilation(c.parCategorie)}

      <h4>Ventilation par marque</h4>
      ${ligneVentilation(c.parMarque)}

      <h4>Stock restant par marque</h4>
      ${ligneStock(c.stockParMarque)}

      <h4>Factures numériques du jour (${facturesNumeriques.length})</h4>
      ${facturesNumeriques.length ? "<ul>" + facturesNumeriques.map((f) => `<li>Facture n°${escapeHtml(String(f.numero || "?"))} — ${Number(f.total || 0).toLocaleString("fr-FR")} FCFA</li>`).join("") + "</ul>" : "<p class=\"empty-msg\">Aucune.</p>"}

      <h4>Factures manuelles / papier (${facturesManuelles.length})</h4>
      ${facturesManuelles.length ? "<ul>" + facturesManuelles.map((f) => `<li>${escapeHtml(f.description || "—")} — ${Number(f.montant || 0).toLocaleString("fr-FR")} FCFA</li>`).join("") + "</ul>" : "<p class=\"empty-msg\">Aucune.</p>"}

      ${c.commentaire ? `<h4>Commentaire du gérant</h4><p>${escapeHtml(c.commentaire)}</p>` : ""}
    </div>
    <button type="button" class="auth-btn-primary" id="btnImprimerCloture" style="margin-top:12px;">🖨️ Imprimer / Archiver cette fiche</button>
  `;

  const btnImprimer = document.getElementById("btnImprimerCloture");
  if (btnImprimer) btnImprimer.addEventListener("click", () => window.print());

  zone.scrollIntoView({ behavior: "smooth", block: "start" });
}
