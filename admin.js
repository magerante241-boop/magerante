import {
  auth, db, signInWithEmailAndPassword, onAuthStateChanged,
  collection, query, where, onSnapshot, doc, updateDoc
} from "./firebase-config.js";

const ADMIN_EMAIL = "magerante241@gmail.com";

const loginBox = document.getElementById("loginBox");
const adminPanel = document.getElementById("adminPanel");
const adminError = document.getElementById("adminError");
const pendingList = document.getElementById("pendingList");

document.getElementById("btnAdminLogin").addEventListener("click", async () => {
  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;
  adminError.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    adminError.textContent = "Erreur : " + err.message;
  }
});

onAuthStateChanged(auth, (user) => {
  if (user && user.email === ADMIN_EMAIL) {
    loginBox.hidden = true;
    adminPanel.hidden = false;
    chargerComptesEnAttente();
  } else {
    loginBox.hidden = false;
    adminPanel.hidden = true;
    if (user && user.email !== ADMIN_EMAIL) {
      adminError.textContent = "Ce compte n'a pas les droits admin.";
    }
  }
});

function chargerComptesEnAttente() {
  const q = query(
    collection(db, "users"),
    where("accountType", "==", "enregistre"),
    where("validated", "==", false)
  );
  onSnapshot(q, (snap) => {
    if (snap.empty) {
      pendingList.innerHTML = "<p>Aucun compte en attente.</p>";
      return;
    }
    pendingList.innerHTML = "";
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const card = document.createElement("div");
      card.className = "compte-card";
      card.innerHTML =
        "<strong>" + (d.nom || "") + " " + (d.prenom || "") + "</strong><br>" +
        "Email : " + (d.email || "") + "<br>" +
        "Telephone : " + (d.telephone || "") + "<br>" +
        "<button data-uid='" + docSnap.id + "'>Valider ce compte</button>";
      card.querySelector("button").addEventListener("click", async (e) => {
        const uid = e.target.getAttribute("data-uid");
        await updateDoc(doc(db, "users", uid), { validated: true });
      });
      pendingList.appendChild(card);
    });
  });
}
