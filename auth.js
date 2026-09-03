// auth.js — plus aucun écran de connexion : une session anonyme est ouverte
// automatiquement dès l'arrivée, invisible pour l'utilisateur. Seule une
// fenêtre "Nom de ton établissement" apparaît, une seule fois, quand on
// utilise Inventaire / Caisse / Ventes pour la première fois.
import {
  auth, db, doc, getDoc, setDoc, serverTimestamp,
  onAuthStateChanged, signInAnonymously
} from "./firebase-config.js";
import { appState } from "./state.js";

const authGate = document.getElementById("authGate");
const establishmentView = document.getElementById("authEstablishmentView");
const etablissementNomEl = document.getElementById("etablissementNom");

window.AuthState = { ready: false, hasEstablishment: false };

function openEstablishmentModal() {
  establishmentView.hidden = false;
  authGate.hidden = false;
}
function closeModal() {
  authGate.hidden = true;
}
// Appelé par app.js quand Inventaire/Caisse/Ventes est ouvert sans établissement configuré
window.openAuthModal = openEstablishmentModal;

document.getElementById("btnCloseAuth").addEventListener("click", closeModal);
authGate.addEventListener("click", (e) => {
  if (e.target === authGate) closeModal();
});

// --- Configuration du premier établissement (rôle PROPRIETAIRE) ---
document.getElementById("btnCreateEstablishment").addEventListener("click", async () => {
  const name = document.getElementById("establishmentName").value.trim();
  const type = document.getElementById("establishmentType").value;
  const errorEl = document.getElementById("establishmentError");
  const btn = document.getElementById("btnCreateEstablishment");
  errorEl.textContent = "";
  if (!name) {
    errorEl.textContent = "Donne un nom à ton établissement.";
    return;
  }
  const uid = auth.currentUser?.uid;
  if (!uid) {
    errorEl.textContent = "Connexion en cours, réessaie dans un instant.";
    return;
  }
  btn.disabled = true;
  btn.textContent = "Création en cours...";
  try {
    await setDoc(doc(db, "establishments", uid), {
      name,
      type,
      ownerId: uid,
      createdAt: serverTimestamp()
    });
    await setDoc(doc(db, "users", uid), {
      role: "PROPRIETAIRE",
      establishmentId: uid,
      createdAt: serverTimestamp()
    });
    await ouvrirApplication(uid);
  } catch (err) {
    errorEl.textContent = "Erreur : " + err.message;
    btn.disabled = false;
    btn.textContent = "Valider et démarrer";
  }
});

async function ouvrirApplication(establishmentId) {
  appState.establishmentId = establishmentId;
  const estSnap = await getDoc(doc(db, "establishments", establishmentId));
  const name = estSnap.exists() ? estSnap.data().name : "Mon établissement";
  window.AuthState.hasEstablishment = true;
  etablissementNomEl.textContent = name;
  closeModal();
}

// --- Connexion anonyme automatique, invisible pour l'utilisateur ---
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.warn("Connexion anonyme impossible :", err);
    }
    return;
  }

  window.AuthState.ready = true;

  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) {
    // Pas encore d'établissement configuré : on attendra qu'un module en ait besoin
    window.AuthState.hasEstablishment = false;
    return;
  }

  const userData = userSnap.data();
  await ouvrirApplication(userData.establishmentId);
});
