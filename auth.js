// auth.js — Étape 2 : authentification + création du premier établissement
import {
  auth, db, doc, getDoc, setDoc, serverTimestamp,
  onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "./firebase-config.js";

const authGate = document.getElementById("authGate");
const appRoot = document.getElementById("appRoot");

const loginView = document.getElementById("authLoginView");
const registerView = document.getElementById("authRegisterView");
const establishmentView = document.getElementById("authEstablishmentView");

function showAuthView(view) {
  [loginView, registerView, establishmentView].forEach((v) => (v.hidden = true));
  view.hidden = false;
}

// --- Navigation entre les vues login / inscription ---
document.getElementById("linkToRegister").addEventListener("click", (e) => {
  e.preventDefault();
  showAuthView(registerView);
});
document.getElementById("linkToLogin").addEventListener("click", (e) => {
  e.preventDefault();
  showAuthView(loginView);
});

// --- Connexion ---
document.getElementById("btnLogin").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";
  if (!email || !password) {
    errorEl.textContent = "Renseigne ton e-mail et ton mot de passe.";
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    errorEl.textContent = traduireErreur(err.code);
  }
});

// --- Inscription ---
document.getElementById("btnRegister").addEventListener("click", async () => {
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;
  const errorEl = document.getElementById("registerError");
  errorEl.textContent = "";
  if (!email || !password) {
    errorEl.textContent = "Renseigne un e-mail et un mot de passe.";
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = "Le mot de passe doit faire au moins 6 caractères.";
    return;
  }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Le document "users/{uid}" sera créé une fois l'établissement validé
    // (voir btnCreateEstablishment ci-dessous) — on passe directement à cette étape.
    window.__pendingUid = cred.user.uid;
    window.__pendingEmail = cred.user.email;
    showAuthView(establishmentView);
  } catch (err) {
    errorEl.textContent = traduireErreur(err.code);
  }
});

// --- Ouvrir l'application (affiche appRoot, cache authGate, charge le nom de l'établissement) ---
async function ouvrirApplication(establishmentId) {
  const estSnap = await getDoc(doc(db, "establishments", establishmentId));
  const nomEl = document.getElementById("etablissementNom");
  if (nomEl && estSnap.exists()) nomEl.textContent = estSnap.data().name;
  authGate.hidden = true;
  appRoot.hidden = false;
}

// --- Création du premier établissement (rôle PROPRIETAIRE) ---
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
    errorEl.textContent = "Session expirée, reconnecte-toi.";
    return;
  }
  btn.disabled = true;
  btn.textContent = "Création en cours...";
  try {
    const estRef = doc(db, "establishments", uid); // 1 établissement par propriétaire pour l'instant
    await setDoc(estRef, {
      name,
      type,
      ownerId: uid,
      createdAt: serverTimestamp()
    });
    await setDoc(doc(db, "users", uid), {
      email: auth.currentUser.email,
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

// --- Déconnexion ---
document.addEventListener("DOMContentLoaded", () => {
  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout) btnLogout.addEventListener("click", () => signOut(auth));
});

// --- État de connexion : c'est ici que se joue l'ouverture/fermeture de l'app ---
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    appRoot.hidden = true;
    authGate.hidden = false;
    showAuthView(loginView);
    return;
  }

  const userSnap = await getDoc(doc(db, "users", user.uid));

  if (!userSnap.exists()) {
    // Compte créé mais pas encore d'établissement : on force cette étape
    appRoot.hidden = true;
    authGate.hidden = false;
    showAuthView(establishmentView);
    return;
  }

  // Profil complet : on ouvre l'application
  const userData = userSnap.data();
  await ouvrirApplication(userData.establishmentId);
});

function traduireErreur(code) {
  const messages = {
    "auth/invalid-email": "Adresse e-mail invalide.",
    "auth/user-not-found": "Aucun compte avec cet e-mail.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
    "auth/email-already-in-use": "Cet e-mail est déjà utilisé.",
    "auth/weak-password": "Mot de passe trop faible (6 caractères min.).",
    "auth/network-request-failed": "Problème de connexion internet."
  };
  return messages[code] || "Une erreur est survenue. Réessaie.";
}
