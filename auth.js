// auth.js — mode visiteur complet : connexion anonyme automatique ET
// création automatique de l'établissement par défaut, 100% invisible.
// L'utilisateur n'a plus jamais besoin de remplir de formulaire pour
// commencer à utiliser Inventaire / Caisse / Ventes. Il pourra renommer
// son établissement plus tard depuis le menu "Plus" (modale réutilisée
// dans ce cas précis, à la demande de l'utilisateur uniquement).
import {
  auth, db, doc, getDoc, setDoc, serverTimestamp,
  onAuthStateChanged, signInAnonymously
} from "./firebase-config.js";
import { appState } from "./state.js";

const authGate = document.getElementById("authGate");
const establishmentView = document.getElementById("authEstablishmentView");
const etablissementNomEl = document.getElementById("etablissementNom");

window.AuthState = { ready: false, hasEstablishment: false };

const DEFAULT_ESTABLISHMENT = { name: "Mon établissement", type: "boutique" };

function openEstablishmentModal() {
  // N'est plus déclenchée automatiquement : uniquement si l'utilisateur
  // choisit explicitement "Personnaliser mon établissement" (ex. menu Plus).
  establishmentView.hidden = false;
  authGate.hidden = false;
}
function closeModal() {
  authGate.hidden = true;
}
// Conservée pour un usage volontaire futur (ex. renommage depuis "Plus"),
// mais plus jamais appelée pour bloquer l'accès à un module.
window.openAuthModal = openEstablishmentModal;

document.getElementById("btnCloseAuth").addEventListener("click", closeModal);
authGate.addEventListener("click", (e) => {
  if (e.target === authGate) closeModal();
});

// --- Création (manuelle, via modale) ou mise à jour de l'établissement ---
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
  btn.textContent = "Enregistrement...";
  try {
    await setDoc(doc(db, "establishments", uid), {
      name,
      type,
      ownerId: uid,
      createdAt: serverTimestamp()
    }, { merge: true });
    await setDoc(doc(db, "users", uid), {
      role: "PROPRIETAIRE",
      establishmentId: uid,
      createdAt: serverTimestamp()
    }, { merge: true });
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
  const name = estSnap.exists() ? estSnap.data().name : DEFAULT_ESTABLISHMENT.name;
  window.AuthState.hasEstablishment = true;
  etablissementNomEl.textContent = name;
  closeModal();
}

// Crée un établissement par défaut en silence, sans aucune interaction utilisateur.
async function creerEtablissementParDefaut(uid) {
  await setDoc(doc(db, "establishments", uid), {
    name: DEFAULT_ESTABLISHMENT.name,
    type: DEFAULT_ESTABLISHMENT.type,
    ownerId: uid,
    createdAt: serverTimestamp()
  });
  await setDoc(doc(db, "users", uid), {
    role: "PROPRIETAIRE",
    establishmentId: uid,
    createdAt: serverTimestamp()
  });
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
    // Mode visiteur : on crée l'établissement par défaut tout seul,
    // aucune modale, aucune action requise de l'utilisateur.
    try {
      await creerEtablissementParDefaut(user.uid);
      await ouvrirApplication(user.uid);
    } catch (err) {
      console.warn("Création automatique de l'établissement impossible :", err);
      window.AuthState.hasEstablishment = false;
    }
    return;
  }

  const userData = userSnap.data();
  await ouvrirApplication(userData.establishmentId);
});
