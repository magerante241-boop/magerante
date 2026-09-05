import {
  auth, db, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail,
  collection, collectionGroup, query, where, onSnapshot, getDocs, doc, updateDoc, addDoc, serverTimestamp
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

    let total = 0;
    for (const estId of etablissementIds) {
      for (const p of produits) {
        await addDoc(collection(db, "establishments", estId, "produits"), {
          ...p,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        total++;
      }
      statusEl.textContent = `Import en cours... (${total} produits crees)`;
    }
    statusEl.textContent = `Import termine : ${produits.length} produits ajoutes a ${etablissementIds.length} etablissement(s), soit ${total} documents crees.`;
  } catch (err) {
    statusEl.textContent = "Erreur : " + err.message;
    console.error(err);
  }
});
