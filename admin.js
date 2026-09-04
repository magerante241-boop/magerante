import {
  auth, db, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail,
  collection, collectionGroup, query, where, onSnapshot, getDocs, doc, updateDoc
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
