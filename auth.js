// auth.js — mode visiteur complet : connexion anonyme automatique ET
// création automatique de l'établissement par défaut, 100% invisible.
// L'utilisateur n'a plus jamais besoin de remplir de formulaire pour
// commencer à utiliser Inventaire / Caisse / Ventes. Il pourra renommer
// son établissement plus tard depuis le menu "Plus" (modale réutilisée
// dans ce cas précis, à la demande de l'utilisateur uniquement).
import {
  auth, db, doc, getDoc, setDoc, serverTimestamp,
  onAuthStateChanged, signInAnonymously,
  EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword
} from "./firebase-config.js";
import { appState } from "./state.js";

const authGate = document.getElementById("authGate");
const establishmentView = document.getElementById("authEstablishmentView");
const registerView = document.getElementById("authRegisterView");
const loginView = document.getElementById("authLoginView");
const etablissementNomEl = document.getElementById("etablissementNom");
const accountStatusItem = document.getElementById("accountStatusItem");

window.AuthState = { ready: false, hasEstablishment: false, accountType: "anonyme", validated: false };

const DEFAULT_ESTABLISHMENT = { name: "Mon établissement", type: "boutique" };

function hideAllViews() {
  establishmentView.hidden = true;
  registerView.hidden = true;
  loginView.hidden = true;
}

// Attend jusqu'à 5s que la connexion anonyme se termine, au lieu d'échouer
// immédiatement si le formulaire est rempli et validé très vite après l'ouverture.
function attendreUid() {
  if (auth.currentUser?.uid) return Promise.resolve(auth.currentUser.uid);
  return new Promise((resolve) => {
    let tries = 0;
    const interval = setInterval(() => {
      tries++;
      if (auth.currentUser?.uid) {
        clearInterval(interval);
        resolve(auth.currentUser.uid);
      } else if (tries > 25) {
        clearInterval(interval);
        resolve(null);
      }
    }, 200);
  });
}

function openEstablishmentModal() {
  // N'est plus déclenchée automatiquement : uniquement si l'utilisateur
  // choisit explicitement "Personnaliser mon établissement" (ex. menu Plus).
  hideAllViews();
  const nameInput = document.getElementById("establishmentName");
  const currentName = etablissementNomEl.textContent.trim();
  if (nameInput && currentName && currentName !== "MAGERANTE") {
    nameInput.value = currentName;
  }
  establishmentView.hidden = false;
  authGate.hidden = false;
}
function openRegisterModal() {
  hideAllViews();
  const nomInput = document.getElementById("regEtablissementNom");
  const currentName = etablissementNomEl.textContent.trim();
  if (nomInput && currentName && currentName !== "MAGERANTE") {
    nomInput.value = currentName;
  }
  registerView.hidden = false;
  authGate.hidden = false;
}
function closeModal() {
  authGate.hidden = true;
}
// Conservées pour un usage volontaire futur (menu latéral),
// mais plus jamais appelées pour bloquer l'accès à un module.
window.openAuthModal = openEstablishmentModal;
window.openRegisterModal = openRegisterModal;

function openLoginModal() {
  hideAllViews();
  loginView.hidden = false;
  authGate.hidden = false;
}
window.openLoginModal = openLoginModal;

document.getElementById("linkGoToLogin")?.addEventListener("click", (e) => { e.preventDefault(); openLoginModal(); });
document.getElementById("linkGoToRegister")?.addEventListener("click", (e) => { e.preventDefault(); openRegisterModal(); });

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
  const uid = await attendreUid();
  if (!uid) {
    errorEl.textContent = "Connexion impossible : " + (window.AuthState.lastAuthError || "erreur inconnue (pas de connexion anonyme détectée)");
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

// --- Afficher/masquer le mot de passe dans le formulaire d'inscription ---
document.getElementById("btnToggleRegPassword").addEventListener("click", () => {
  const pwdInput = document.getElementById("regPassword");
  pwdInput.type = pwdInput.type === "password" ? "text" : "password";
});

document.getElementById("btnToggleLoginPassword").addEventListener("click", () => {
  const pwdInput = document.getElementById("loginPassword");
  pwdInput.type = pwdInput.type === "password" ? "text" : "password";
});

document.getElementById("btnLogin").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  const btn = document.getElementById("btnLogin");
  errorEl.textContent = "";
  if (!email || !password) {
    errorEl.textContent = "Merci de remplir ton e-mail et le mot de passe.";
    return;
  }
  btn.disabled = true;
  btn.textContent = "Connexion...";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
      errorEl.textContent = "E-mail ou mot de passe incorrect.";
    } else if (err.code === "auth/invalid-email") {
      errorEl.textContent = "Adresse e-mail invalide.";
    } else if (err.code === "auth/too-many-requests") {
      errorEl.textContent = "Trop de tentatives. Reessaie dans quelques minutes.";
    } else {
      errorEl.textContent = "Erreur : " + err.message;
    }
    btn.disabled = false;
    btn.textContent = "Se connecter";
  }
});

// --- Inscription propriétaire : transforme la session anonyme en compte
// permanent (mêmes uid/établissement/données, rien n'est perdu ni dupliqué) ---
document.getElementById("btnRegister").addEventListener("click", async () => {
  const nom = document.getElementById("regNom").value.trim();
  const prenom = document.getElementById("regPrenom").value.trim();
  const telephone = document.getElementById("regTelephone").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const etablissementNom = document.getElementById("regEtablissementNom").value.trim();
  const etablissementType = document.getElementById("regEtablissementType").value;
  const localisation = document.getElementById("regLocalisation").value.trim();
  const errorEl = document.getElementById("registerError");
  const btn = document.getElementById("btnRegister");
  errorEl.textContent = "";

  if (!nom || !prenom || !telephone || !email || !password || !etablissementNom) {
    errorEl.textContent = "Merci de remplir tous les champs obligatoires.";
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = "Le mot de passe doit contenir au moins 6 caractères.";
    return;
  }
  const uid = await attendreUid();
  if (!uid) {
    errorEl.textContent = "Connexion impossible : " + (window.AuthState.lastAuthError || "erreur inconnue (pas de connexion anonyme détectée)");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Création du compte...";
  try {
    const credential = EmailAuthProvider.credential(email, password);
    await linkWithCredential(auth.currentUser, credential);

    await setDoc(doc(db, "users", uid), {
      nom, prenom, telephone, email,
      role: "PROPRIETAIRE",
      accountType: "enregistre",
      validated: false,
      establishmentId: uid,
      updatedAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, "establishments", uid), {
      name: etablissementNom,
      type: etablissementType,
      localisation,
      status: "en_attente",
      ownerId: uid,
      updatedAt: serverTimestamp()
    }, { merge: true });

    window.AuthState.accountType = "enregistre";
    window.AuthState.validated = false;
    updateAccountStatusBadge();
    await ouvrirApplication(uid);
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      errorEl.textContent = "Cet e-mail est déjà utilisé par un autre compte.";
    } else if (err.code === "auth/invalid-email") {
      errorEl.textContent = "Adresse e-mail invalide.";
    } else if (err.code === "auth/weak-password") {
      errorEl.textContent = "Mot de passe trop faible (6 caractères minimum).";
    } else {
      errorEl.textContent = "Erreur : " + err.message;
    }
    btn.disabled = false;
    btn.textContent = "Créer mon compte";
  }
});

function updateAccountStatusBadge() {
  if (!accountStatusItem) return;
  if (window.AuthState.accountType !== "enregistre") {
    accountStatusItem.hidden = true;
    return;
  }
  accountStatusItem.hidden = false;
  if (window.AuthState.validated) {
    accountStatusItem.textContent = "✅ Compte validé";
    accountStatusItem.className = "side-menu-status validated";
  } else {
    accountStatusItem.textContent = "⏳ Compte en attente de validation";
    accountStatusItem.className = "side-menu-status pending";
  }
  const menuInvite = document.getElementById("menuInviteGerant");
  if (menuInvite) {
    menuInvite.hidden = !(window.AuthState.accountType === "enregistre" && window.AuthState.validated);
  }
}

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
      console.warn("Connexion anonyme impossible :", err); window.AuthState.lastAuthError = err && (err.code + " - " + err.message);
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
  window.AuthState.accountType = userData.accountType || "anonyme";
  window.AuthState.validated = !!userData.validated;
  updateAccountStatusBadge();
  await ouvrirApplication(userData.establishmentId);
});
