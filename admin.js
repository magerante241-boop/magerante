import {
  auth, db, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail,
  collection, collectionGroup, query, where, onSnapshot, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, writeBatch
} from "./firebase-config.js";

const ADMIN_EMAIL = "magerante241@gmail.com";

const loginBox = document.getElementById("loginBox");
const adminPanel = document.getElementById("adminPanel");
const adminError = document.getElementById("adminError");
const pendingList = document.getElementById("pendingList");
const btnSettings = document.getElementById("btnSettings");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsEmail = document.getElementById("settingsEmail");

let loginAttempted = false;

document.getElementById("btnAdminLogin").addEventListener("click", async () => {
  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;
  adminError.textContent = "";
  loginAttempted = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
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
document.getElementById("btnLogoutAdmin").addEventListener("click", async () => {
  settingsOverlay.hidden = true;
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user && !user.isAnonymous && user.email === ADMIN_EMAIL) {
    loginBox.hidden = true;
    adminPanel.hidden = false;
    btnSettings.hidden = false;
    adminError.textContent = "";
    chargerDashboard();
    chargerComptesEnAttente();
    chargerFinanceEtRapports();
    chargerInventaireGlobal();
    chargerGestionProduits();
  } else {
    loginBox.hidden = false;
    adminPanel.hidden = true;
    btnSettings.hidden = true;
    settingsOverlay.hidden = true;
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
    const estSnap = await getDocs(collection(db, "establishments"));
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
}

function chargerComptesEnAttente() {
  const q = query(
    collection(db, "users"),
    where("accountType", "==", "enregistre"),
    where("validated", "==", false)
  );
  onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        pendingList.innerHTML = "<p class='empty-msg'>Aucun compte en attente.</p>";
        return;
      }
      pendingList.innerHTML = "";
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        const card = document.createElement("div");
        card.className = "compte-card";
        card.innerHTML =
          "<strong>" + (d.nom || "") + " " + (d.prenom || "") + "</strong>" +
          "<div class='meta'>Email : " + (d.email || "") + "</div>" +
          "<div class='meta'>Telephone : " + (d.telephone || "") + "</div>" +
          "<button data-uid='" + docSnap.id + "'>Valider ce compte</button>";
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
  const etabMap = {};

  try {
    const estSnap = await getDocs(collection(db, "establishments"));
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
      "<tr><td>" + r.nom + "</td><td>" + r.count + "</td><td>" + r.total.toLocaleString("fr-FR") + " FCFA</td></tr>"
    ).join("");
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
        "<div><div class='v-etab'>" + nom + "</div><div class='v-date'>" + dateStr + "</div></div>" +
        "<div class='v-montant'>" + v.montant.toLocaleString("fr-FR") + " FCFA</div></div>";
    }).join("");
  }
}

async function chargerInventaireGlobal() {
  try {
    const prodSnap = await getDocs(collectionGroup(db, "produits"));
    let valeurTotale = 0;
    prodSnap.forEach((d) => {
      const data = d.data();
      const prix = Number(data.prix || data.prixAchat || data.prixVente || 0);
      const qte = Number(data.quantite || data.stock || 0);
      valeurTotale += prix * qte;
    });
    document.getElementById("statTotalProduits").textContent = prodSnap.size;
    document.getElementById("statValeurStock").textContent = valeurTotale.toLocaleString("fr-FR") + " FCFA";
  } catch (err) {
    console.error("Erreur inventaire global (normal si module Inventaire pas encore synchronise):", err);
    document.getElementById("statTotalProduits").textContent = "0";
    document.getElementById("statValeurStock").textContent = "0 FCFA";
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
    const estSnap = await getDocs(collection(db, "establishments"));
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
    const estSnap = await getDocs(collection(db, "establishments"));
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
document.querySelectorAll(".stat-card[data-target]").forEach((card) => {
  card.addEventListener("click", () => {
    const cible = document.getElementById(card.dataset.target);
    if (cible) cible.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// --- Gestion des produits (tous etablissements) ---
let _cacheProduitsGestion = [];
let _cacheEtablissementsNoms = {};

async function chargerGestionProduits() {
  const tbody = document.getElementById("produitsGestionTableBody");
  const select = document.getElementById("filtreEtablissementProduits");
  try {
    const estSnap = await getDocs(collection(db, "establishments"));
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
    rendreTableauGestionProduits();
  } catch (err) {
    console.error("Erreur chargement gestion produits:", err);
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">Erreur : ' + err.message + '</td></tr>';
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
    return '<tr data-ref-id="' + p.id + '" data-est-id="' + p.estId + '">' +
      '<td>' + nomEtab + '</td>' +
      '<td>' + (p.nom || "") + '</td>' +
      '<td>' + (p.categorie || "") + '</td>' +
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
