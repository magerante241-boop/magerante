// auth.js — mode visiteur complet : connexion anonyme automatique ET
// création automatique de l'établissement par défaut, 100% invisible.
// L'utilisateur n'a plus jamais besoin de remplir de formulaire pour
// commencer à utiliser Inventaire / Caisse / Ventes. Il pourra renommer
// son établissement plus tard depuis le menu "Plus" (modale réutilisée
// dans ce cas précis, à la demande de l'utilisateur uniquement).
import {
  auth, db, doc, getDoc, setDoc, serverTimestamp,
  onAuthStateChanged, signInAnonymously,
  EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut
} from "./firebase-config.js";
import { appState } from "./state.js";
import { genererProduitsDemo } from "./demo.js";
import { enregistrerConnexion } from "./connexions.js";

const ADMIN_EMAIL = "magerante241@gmail.com";
const ADMIN_PHONE = "24160141924";
window.ADMIN_PHONE = ADMIN_PHONE;
window.ADMIN_EMAIL = ADMIN_EMAIL;

const authGate = document.getElementById("authGate");
const establishmentView = document.getElementById("authEstablishmentView");
const registerView = document.getElementById("authRegisterView");
const loginView = document.getElementById("authLoginView");
const etablissementNomEl = document.getElementById("etablissementNom");
const accountStatusItem = document.getElementById("accountStatusItem");
const btnAdminAccess = document.getElementById("btnAdminAccess");
const menuDashboardBtn = document.getElementById("menuDashboard");
const menuImportProduitsBtn = document.getElementById("menuImportProduits");
if (menuDashboardBtn) menuDashboardBtn.addEventListener("click", () => { window.location.href = "dashboard.html"; });

window.AuthState = { ready: false, hasEstablishment: false, accountType: "anonyme", validated: false };

const DEFAULT_ESTABLISHMENT = { name: "Mon établissement", type: "bar" };

if (btnAdminAccess) {
  btnAdminAccess.addEventListener("click", () => {
    window.location.href = "admin.html";
  });
}

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
  const npEl = document.getElementById("numpad"); if (npEl) npEl.hidden = true;
  const abcEl = document.getElementById("abcKeyboard"); if (abcEl) abcEl.hidden = true;
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
  const npEl2 = document.getElementById("numpad"); if (npEl2) npEl2.hidden = true;
  const abcEl2 = document.getElementById("abcKeyboard"); if (abcEl2) abcEl2.hidden = true;
  authGate.hidden = false;
}
function closeModal() {
  const npEl4 = document.getElementById("numpad");
  const calcZoneEl = document.getElementById("calcZone");
  if (npEl4 && calcZoneEl && !calcZoneEl.hidden) npEl4.hidden = false;
  authGate.hidden = true;
}
// Conservées pour un usage volontaire futur (menu latéral),
// mais plus jamais appelées pour bloquer l'accès à un module.
window.openAuthModal = openEstablishmentModal;
window.openRegisterModal = openRegisterModal;

function openLoginModal() {
  hideAllViews();
  loginView.hidden = false;
  const npEl3 = document.getElementById("numpad"); if (npEl3) npEl3.hidden = true;
  const abcEl3 = document.getElementById("abcKeyboard"); if (abcEl3) abcEl3.hidden = true;
  authGate.hidden = false;
}
window.openLoginModal = openLoginModal;

document.getElementById("linkGoToLogin")?.addEventListener("click", (e) => { e.preventDefault(); openLoginModal(); });

document.getElementById("btnUtiliserPosition")?.addEventListener("click", () => {
  const gpsAffichageEl = document.getElementById("regGpsAffichage");
  if (!navigator.geolocation) {
    if (gpsAffichageEl) gpsAffichageEl.value = "Géolocalisation non supportée par ce navigateur.";
    return;
  }
  if (gpsAffichageEl) gpsAffichageEl.value = "Localisation en cours...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      window.gpsCaptureLat = position.coords.latitude;
      window.gpsCaptureLng = position.coords.longitude;
      if (gpsAffichageEl) gpsAffichageEl.value = `Position capturée : ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
    },
    (err) => {
      if (gpsAffichageEl) gpsAffichageEl.value = "Impossible de récupérer la position : " + err.message;
    }
  );
});
document.getElementById("linkGoToRegister")?.addEventListener("click", (e) => { e.preventDefault(); openRegisterModal(); });

document.getElementById("btnCloseAuth").addEventListener("click", closeModal);
authGate.addEventListener("click", (e) => {
  if (e.target === authGate) closeModal();
});

// --- Création (manuelle, via modale) ou mise à jour de l'établissement ---
document.getElementById("btnCreateEstablishment").addEventListener("click", async () => {
  const name = document.getElementById("establishmentName").value.trim();
  const type = "bar";
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
    const cred = await signInWithEmailAndPassword(auth, email, password);
    enregistrerConnexion(cred.user, "app");
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

document.getElementById("linkForgotPassword")?.addEventListener("click", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const errorEl = document.getElementById("loginError");
  if (!email) {
    errorEl.textContent = "Indique ton e-mail ci-dessus, puis clique de nouveau sur ce lien.";
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    errorEl.textContent = "E-mail envoye ! Verifie ta boite de reception.";
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      errorEl.textContent = "Aucun compte associe a cet e-mail.";
    } else if (err.code === "auth/invalid-email") {
      errorEl.textContent = "Adresse e-mail invalide.";
    } else {
      errorEl.textContent = "Erreur : " + err.message;
    }
  }
});

const btnToggleGP = document.getElementById("menuToggleGerantProprietaire");
if (btnToggleGP) {
  btnToggleGP.addEventListener("click", async () => {
    const roleActuel = window.AuthState.role;
    const nouveauRole = roleActuel === "GERANT_PROPRIETAIRE" ? "PROPRIETAIRE" : "GERANT_PROPRIETAIRE";
    const confirmMsg = nouveauRole === "GERANT_PROPRIETAIRE"
      ? "Passer en Gérant-Propriétaire : tu gardes toutes tes fonctions propriétaire, avec en plus les outils rapides de gestion de stock au quotidien. Continuer ?"
      : "Revenir au profil Propriétaire classique ?";
    if (!confirm(confirmMsg)) return;
    try {
      await setDoc(doc(db, "users", auth.currentUser.uid), { role: nouveauRole, updatedAt: serverTimestamp() }, { merge: true });
      window.AuthState.role = nouveauRole;
      location.reload();
    } catch (err) {
      alert("Erreur lors du changement de profil : " + err.message);
    }
  });
}

document.getElementById("menuLogout").addEventListener("click", async () => {
  try {
    localStorage.removeItem("magerante_wasGerant");
    await signOut(auth);
    location.reload();
  } catch (err) {
    console.warn("Deconnexion impossible :", err);
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
  const etablissementType = "bar";
  const localisation = document.getElementById("regLocalisation").value.trim();
  const whatsappEtablissement = document.getElementById("regWhatsappEtablissement").value.trim();
  const gpsLat = window.gpsCaptureLat || null;
  const gpsLng = window.gpsCaptureLng || null;
  const lienGoogleMaps = (gpsLat && gpsLng) ? `https://www.google.com/maps?q=${gpsLat},${gpsLng}` : null;
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

    let photoUrl = null;
    const photoFileEl = document.getElementById("regPhotoInput");
    if (photoFileEl && photoFileEl.files[0]) {
      try {
        photoUrl = await uploadPhotoCloudinary(photoFileEl.files[0]);
      } catch (errPhoto) {
        console.warn("Upload photo/logo impossible :", errPhoto);
      }
    }

    const roleChoisi = (document.querySelector('input[name="regRole"]:checked') || {}).value || "PROPRIETAIRE";
    await setDoc(doc(db, "users", uid), {
      nom, prenom, telephone, email,
      role: roleChoisi,
      accountType: "enregistre",
      validated: false,
      establishmentId: uid,
      updatedAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, "establishments", uid), {
      name: etablissementNom,
      type: etablissementType,
      localisation,
      whatsappEtablissement: whatsappEtablissement || null,
      gps: (gpsLat && gpsLng) ? { lat: gpsLat, lng: gpsLng } : null,
      lienGoogleMaps,
      telephone,
      photoUrl,
      status: "en_attente",
      ownerId: uid,
      updatedAt: serverTimestamp()
    }, { merge: true });

    try {
      const texteAdmin = `Nouveau compte MAGERANTE cree :\n${nom} ${prenom} (${roleChoisi})\nEtablissement : ${etablissementNom}\nTelephone : ${telephone}\n\nValider ou refuser depuis le panneau admin.`;
      window.open(`https://wa.me/${ADMIN_PHONE}?text=${encodeURIComponent(texteAdmin)}`, "_blank");
    } catch (errWa) {
      console.warn("Ouverture WhatsApp admin impossible :", errWa);
    }

    localStorage.removeItem("magerante_wasGerant");
    try {
      await genererProduitsDemo();
    } catch (errDemo) {
      console.warn("Génération du catalogue de démarrage impossible :", errDemo);
    }

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
  const menuDashboard = document.getElementById("menuDashboard");
  if (menuDashboard) menuDashboard.hidden = !(window.AuthState.accountType === "enregistre" && window.AuthState.validated);
  const estConnecte = window.AuthState.accountType === "enregistre" || window.AuthState.accountType === "invite";

  const menuRename = document.getElementById("menuRenameEstablishment");
  if (menuRename) {
    menuRename.hidden = !(window.AuthState.accountType === "enregistre" && (window.AuthState.role === "PROPRIETAIRE" || window.AuthState.role === "GERANT_PROPRIETAIRE"));
  }
  const menuToggleGP = document.getElementById("menuToggleGerantProprietaire");
  if (menuToggleGP) {
    const peutBasculer = window.AuthState.accountType === "enregistre" && (window.AuthState.role === "PROPRIETAIRE" || window.AuthState.role === "GERANT_PROPRIETAIRE");
    menuToggleGP.hidden = !peutBasculer;
    menuToggleGP.textContent = window.AuthState.role === "GERANT_PROPRIETAIRE" ? "🔄 Revenir à Propriétaire classique" : "🔄 Devenir Gérant-Propriétaire";
  }

  const navBtnInventaire = document.getElementById("navBtnInventaire");
  if (navBtnInventaire) navBtnInventaire.hidden = false;

  const sideMenuBtnInventaire = document.getElementById("sideMenuBtnInventaire");
  if (sideMenuBtnInventaire) sideMenuBtnInventaire.hidden = false;

  const estProprietaireOuAdmin = (window.AuthState.accountType === "enregistre" && (window.AuthState.role === "PROPRIETAIRE" || window.AuthState.role === "GERANT_PROPRIETAIRE")) || window.AuthState.email === window.ADMIN_EMAIL;
  const menuToggleDemoVisiteur = document.getElementById("menuToggleDemoVisiteur");
  if (menuToggleDemoVisiteur) menuToggleDemoVisiteur.hidden = estProprietaireOuAdmin;
  const menuGenererDemoVisiteur = document.getElementById("menuGenererDemoVisiteur");
  if (menuGenererDemoVisiteur) menuGenererDemoVisiteur.hidden = estProprietaireOuAdmin;
  const menuSupprimerDemoVisiteur = document.getElementById("menuSupprimerDemoVisiteur");
  if (menuSupprimerDemoVisiteur) menuSupprimerDemoVisiteur.hidden = estProprietaireOuAdmin;

  const menuGenererDemoComplet = document.getElementById("menuGenererDemoComplet");
  if (menuGenererDemoComplet) {
    menuGenererDemoComplet.hidden = (window.AuthState.email !== window.ADMIN_EMAIL);
  }

  const menuSupprimerDemo = document.getElementById("menuSupprimerDemo");
  if (menuSupprimerDemo) {
    menuSupprimerDemo.hidden = (window.AuthState.email !== window.ADMIN_EMAIL);
  }

  const menuLogout = document.getElementById("menuLogout");
  if (menuLogout) {
    menuLogout.hidden = !estConnecte;
  }

  const menuLogin = document.getElementById("menuLogin");
  if (menuLogin) {
    menuLogin.hidden = estConnecte;
  }
  const menuLoginGerant = document.getElementById("menuLoginGerant");
  if (menuLoginGerant) {
    menuLoginGerant.hidden = estConnecte;
  }

  const menuCreateAccount = document.getElementById("menuCreateAccount");
  if (menuCreateAccount) {
    menuCreateAccount.hidden = estConnecte;
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
  }, { merge: true });
  await setDoc(doc(db, "users", uid), {
    role: "PROPRIETAIRE",
    establishmentId: uid,
    createdAt: serverTimestamp()
  }, { merge: true });
}

// --- Connexion anonyme automatique, invisible pour l'utilisateur ---
onAuthStateChanged(auth, async (user) => {
  const navPlusBtn = document.querySelector('.nav-btn[data-view="plus"]');
  if (navPlusBtn) navPlusBtn.hidden = user?.email !== ADMIN_EMAIL;
  if (menuImportProduitsBtn) menuImportProduitsBtn.hidden = user?.email !== ADMIN_EMAIL;
  if (!user) {
    if (btnAdminAccess) btnAdminAccess.hidden = true;
    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.warn("Connexion anonyme impossible :", err); window.AuthState.lastAuthError = err && (err.code + " - " + err.message);
    }
    return;
  }

  if (btnAdminAccess) {
    btnAdminAccess.hidden = !(!user.isAnonymous && user.email === ADMIN_EMAIL);
  }

  window.AuthState.ready = true;

  let userSnap;
  try {
    userSnap = await getDoc(doc(db, "users", user.uid));
  } catch (err) {
    if (accountStatusItem) {
      accountStatusItem.hidden = false;
      accountStatusItem.textContent = "Erreur lecture profil : " + (err.code || err.message);
      accountStatusItem.className = "side-menu-status pending";
    }
    console.warn("Erreur getDoc users :", err);
    return;
  }
  if (!userSnap.exists()) {
    const _inviteParams = new URLSearchParams(window.location.search);
    if (_inviteParams.has("invite")) { return; }
    if (localStorage.getItem("magerante_wasGerant") === "1") {
      const authGateEl = document.getElementById("authGate");
      const gerantLoginGateEl = document.getElementById("gerantLoginGate");
      if (authGateEl) authGateEl.hidden = true;
      if (gerantLoginGateEl) gerantLoginGateEl.hidden = false;
      return;
    }
    // Mode visiteur : on crée l'établissement par défaut tout seul,
    // aucune modale, aucune action requise de l'utilisateur.
    window.AuthState.accountType = user.isAnonymous ? "anonyme" : "enregistre";
    window.AuthState.email = user.email || null;
    if (window.AuthState._creationEnCours) { return; }
    window.AuthState._creationEnCours = true;
    try {
      await creerEtablissementParDefaut(user.uid);
      await ouvrirApplication(user.uid);
      updateAccountStatusBadge();
      try {
        await genererProduitsDemo();
      } catch (errDemo) {
        console.warn("Génération auto des produits démo impossible :", errDemo);
      }
    } catch (err) {
      console.warn("Création automatique de l'établissement impossible :", err);
      window.AuthState.hasEstablishment = false;
    } finally {
      window.AuthState._creationEnCours = false;
    }
    return;
  }

  const userData = userSnap.data();
  if (userData.statut === "refuse") {
    alert("Ton compte a ete refuse par l administrateur. Acces impossible.");
    await signOut(auth);
    location.reload();
    return;
  }
  const accountTypeReel = user.isAnonymous ? "anonyme" : "enregistre";
  window.AuthState.accountType = accountTypeReel;
  if (userData.accountType !== accountTypeReel) {
    setDoc(doc(db, "users", user.uid), { accountType: accountTypeReel }, { merge: true }).catch((err) => {
      console.warn("Correction accountType impossible :", err);
    });
  }
  window.AuthState.validated = !!userData.validated;
  window.AuthState.role = userData.role || "PROPRIETAIRE";
  window.AuthState.email = user.email || null;
  window.AuthState.nomGerant = userData.nom || null;
  const gerantNomHeaderEl = document.getElementById("gerantNomHeader");
  if (gerantNomHeaderEl) {
    if (window.AuthState.role === "GERANT" && window.AuthState.nomGerant) {
      gerantNomHeaderEl.textContent = window.AuthState.nomGerant;
      gerantNomHeaderEl.hidden = false;
    } else {
      gerantNomHeaderEl.hidden = true;
    }
  }
  updateAccountStatusBadge();
  await ouvrirApplication(userData.establishmentId);
});

// --- Upload photo/logo optionnel vers Cloudinary (compte propriétaire) ---
async function uploadPhotoCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "magerante_unsigned");
  const res = await fetch("https://api.cloudinary.com/v1_1/hcluijlk/image/upload", {
    method: "POST",
    body: formData
  });
  if (!res.ok) throw new Error("Echec upload Cloudinary");
  const data = await res.json();
  return data.secure_url;
}

const regPhotoInputEl = document.getElementById("regPhotoInput");
if (regPhotoInputEl) {
  regPhotoInputEl.addEventListener("change", (e) => {
    const file = e.target.files[0];
    const preview = document.getElementById("regPhotoPreview");
    if (!file) { preview.style.display = "none"; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.src = ev.target.result;
      preview.style.display = "block";
    };
    reader.readAsDataURL(file);
  });
}

// Garde-fou anti-flash : sur restauration bfcache (retour navigateur mobile),
// masquer immediatement l'icone Admin avant que Firebase Auth ne revalide.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    const btn = document.getElementById("btnAdminAccess");
    if (btn) btn.hidden = true;
  }
});
