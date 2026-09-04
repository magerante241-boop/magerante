import {
  auth, db, signInWithEmailAndPassword, onAuthStateChanged,
  collection, collectionGroup, query, where, onSnapshot, getDocs, doc, updateDoc
} from "./firebase-config.js";

const ADMIN_EMAIL = "magerante241@gmail.com";

const loginBox = document.getElementById("loginBox");
const adminPanel = document.getElementById("adminPanel");
const adminError = document.getElementById("adminError");
const pendingList = document.getElementById("pendingList");

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

onAuthStateChanged(auth, (user) => {
  if (user && !user.isAnonymous && user.email === ADMIN_EMAIL) {
    loginBox.hidden = true;
    adminPanel.hidden = false;
    adminError.textContent = "";
    chargerDashboard();
    chargerComptesEnAttente();
  } else {
    loginBox.hidden = false;
    adminPanel.hidden = true;
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
