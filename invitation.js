import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db, auth } from "./firebase-config.js";
import { appState } from "./state.js";

function genererToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

// Cree l'invitation (comme avant) ET enregistre immediatement le couple
// telephone + code comme identifiant de connexion permanent du gerant,
// independant de toute session technique.
async function creerInvitationGerant(estId, nomGerant, telephone, code) {
  const token = genererToken();
  const telClean = (telephone || "").replace(/\D/g, "");
  const codeClean = (code || "").replace(/\D/g, "");

  await setDoc(doc(db, "invitations", token), {
    estId, nomGerant, telephone: telClean, createdAt: new Date().toISOString()
  });

  await setDoc(doc(db, "gerant_logins", telClean), {
    estId, nom: nomGerant, code: codeClean, actif: true,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  const lien = `${window.location.origin}${window.location.pathname}?invite=${token}`;
  const texteWhatsapp = `Bonjour ${nomGerant}, voici ton acces MAGERANTE : ${lien}\n\nPour te reconnecter plus tard, utilise ton numero et le code ${codeClean} depuis l'ecran de connexion gerant.`;
  const lienWhatsapp = telClean
    ? `https://wa.me/${telClean}?text=${encodeURIComponent(texteWhatsapp)}`
    : `https://wa.me/?text=${encodeURIComponent(texteWhatsapp)}`;
  const sujet = "Ton acces MAGERANTE";
  const corps = `Bonjour ${nomGerant},\n\nVoici ton lien d'acces a ton interface de gestion MAGERANTE :\n${lien}\n\nTon code de reconnexion : ${codeClean}\n\nClique sur le lien pour acceder directement a ton espace.`;
  const lienEmail = `mailto:?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  return { token, lien, lienWhatsapp, lienEmail };
}

function afficherEcranBienvenue(nomGerant, nomEtablissement) {
  const splash = document.getElementById("splashScreen");
  const authGate = document.getElementById("authGate");
  const gerantGate = document.getElementById("gerantGate");
  const gerantLoginGate = document.getElementById("gerantLoginGate");
  const texte = document.getElementById("gerantWelcomeText");
  const etablissementNomEl = document.getElementById("etablissementNom");
  if (splash) splash.hidden = true;
  if (authGate) authGate.hidden = true;
  if (gerantLoginGate) gerantLoginGate.hidden = true;
  if (texte) texte.textContent = nomGerant + ", tu es maintenant connecte(e) a " + (nomEtablissement || "ton etablissement") + ".";
  if (etablissementNomEl) etablissementNomEl.textContent = nomEtablissement || "";
  if (gerantGate) gerantGate.hidden = false;
  const btn = document.getElementById("gerantContinueBtn");
  if (btn) {
    btn.onclick = () => {
      gerantGate.hidden = true;
      const appRoot = document.getElementById("appRoot");
      if (appRoot) appRoot.hidden = false;
      if (window.switchView) window.switchView("vente");
    };
  }
}

async function traiterInvitationDepuisUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("invite");
  if (!token) return null;

  const invSnap = await getDoc(doc(db, "invitations", token));
  if (!invSnap.exists()) {
    alert("Lien d'invitation invalide ou expire.");
    return null;
  }
  const data = invSnap.data();
  const estId = data.estId;
  const nomGerant = data.nomGerant;
  const telephone = data.telephone;

  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) { await signInAnonymously(auth); return; }

      appState.establishmentId = estId;

      await setDoc(doc(db, "establishments", estId, "gerants", user.uid), {
        nom: nomGerant, telephone: telephone || null, actif: true, dateActivation: new Date().toISOString()
      }, { merge: true });

      await setDoc(doc(db, "users", user.uid), {
        nom: nomGerant, telephone: telephone || null, role: "GERANT",
        accountType: "invite", validated: true, establishmentId: estId,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      window.AuthState = window.AuthState || {};
      window.AuthState.ready = true;
      window.AuthState.role = "GERANT";
      window.AuthState.accountType = "invite";
      window.AuthState.validated = true;

      localStorage.setItem("magerante_wasGerant", "1");

      let nomEtablissement = "";
      try {
        const estSnap = await getDoc(doc(db, "establishments", estId));
        if (estSnap.exists()) nomEtablissement = estSnap.data().name || "";
      } catch (e) { console.warn("Lecture etablissement impossible :", e); }

      afficherEcranBienvenue(nomGerant, nomEtablissement);
      resolve({ estId, nomGerant, uid: user.uid });
    });
  });
}

// Reconnexion permanente d'un gerant deja invite, depuis n'importe quel
// appareil : numero WhatsApp + code a 4 chiffres fournis par le proprietaire.
async function connecterGerantParCode(telephone, code) {
  const telClean = (telephone || "").replace(/\D/g, "");
  const codeClean = (code || "").replace(/\D/g, "");
  if (!telClean || !codeClean) {
    return { success: false, message: "Merci de remplir ton numero et ton code." };
  }

  let loginSnap;
  try {
    loginSnap = await getDoc(doc(db, "gerant_logins", telClean));
  } catch (e) {
    return { success: false, message: "Erreur de connexion : " + (e.code || e.message) };
  }
  if (!loginSnap.exists()) {
    return { success: false, message: "Aucun acces trouve pour ce numero." };
  }
  const loginData = loginSnap.data();
  if (loginData.actif === false) {
    return { success: false, message: "Cet acces a ete desactive. Contacte ton responsable." };
  }
  if (String(loginData.code || "") !== codeClean) {
    return { success: false, message: "Code incorrect." };
  }

  const estId = loginData.estId;
  const nomGerant = loginData.nom || "Gerant";

  const uid = await new Promise((resolve) => {
    if (auth.currentUser?.uid) { resolve(auth.currentUser.uid); return; }
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { unsub(); resolve(user.uid); }
    });
  });

  appState.establishmentId = estId;

  await setDoc(doc(db, "establishments", estId, "gerants", uid), {
    nom: nomGerant, telephone: telClean, actif: true, dateActivation: new Date().toISOString()
  }, { merge: true });

  await setDoc(doc(db, "users", uid), {
    nom: nomGerant, telephone: telClean, role: "GERANT",
    accountType: "invite", validated: true, establishmentId: estId,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  window.AuthState = window.AuthState || {};
  window.AuthState.ready = true;
  window.AuthState.role = "GERANT";
  window.AuthState.accountType = "invite";
  window.AuthState.validated = true;

  localStorage.setItem("magerante_wasGerant", "1");

  let nomEtablissement = "";
  try {
    const estSnap = await getDoc(doc(db, "establishments", estId));
    if (estSnap.exists()) nomEtablissement = estSnap.data().name || "";
  } catch (e) { console.warn("Lecture etablissement impossible :", e); }

  afficherEcranBienvenue(nomGerant, nomEtablissement);
  return { success: true, estId, nomGerant };
}

window.InvitationModule = { creerInvitationGerant, traiterInvitationDepuisUrl, connecterGerantParCode };

document.addEventListener("DOMContentLoaded", () => {
  const btnMenuInvite = document.getElementById("menuInviteGerant");
  const inviteGate = document.getElementById("inviteGate");
  const inputNom = document.getElementById("inviteNomGerant");
  const inputTel = document.getElementById("inviteTelGerant");
  const inputCode = document.getElementById("inviteCodeGerant");
  const btnGenerer = document.getElementById("btnGenererInvitation");
  const linksZone = document.getElementById("inviteLinksZone");
  const lWhatsapp = document.getElementById("inviteLienWhatsapp");
  const lEmail = document.getElementById("inviteLienEmail");
  const btnClose = document.getElementById("btnCloseInvite");

  if (btnMenuInvite && inviteGate) {
    btnMenuInvite.addEventListener("click", () => {
      const sideMenu = document.getElementById("sideMenu");
      if (sideMenu) sideMenu.hidden = true;
      linksZone.hidden = true;
      inputNom.value = "";
      if (inputTel) inputTel.value = "";
      if (inputCode) inputCode.value = "";
      inviteGate.hidden = false;
    });
    btnClose.addEventListener("click", () => { inviteGate.hidden = true; });
    inviteGate.addEventListener("click", (e) => {
      if (e.target === inviteGate) inviteGate.hidden = true;
    });
    btnGenerer.addEventListener("click", async () => {
      const nom = inputNom.value.trim();
      const tel = inputTel ? inputTel.value.trim() : "";
      const code = inputCode ? inputCode.value.trim() : "";
      if (!nom) { alert("Indique le nom du gerant."); return; }
      if (!tel) { alert("Indique le numero WhatsApp du gerant."); return; }
      if (!code || !/^\d{4}$/.test(code)) { alert("Choisis un code a 4 chiffres pour ce gerant."); return; }
      if (!appState.establishmentId) { alert("Etablissement non pret, reessaie."); return; }
      btnGenerer.textContent = "Generation...";
      const resultat = await creerInvitationGerant(appState.establishmentId, nom, tel, code);
      lWhatsapp.href = resultat.lienWhatsapp;
      lEmail.href = resultat.lienEmail;
      linksZone.hidden = false;
      btnGenerer.textContent = "Generer le lien";
    });
  }

  // --- Ecran de connexion gerant (numero + code), reutilisable a chaque
  // reconnexion, sur n'importe quel appareil ---
  const gerantLoginGate = document.getElementById("gerantLoginGate");
  const gerantLoginTel = document.getElementById("gerantLoginTelephone");
  const gerantLoginCode = document.getElementById("gerantLoginCode");
  const btnGerantLogin = document.getElementById("btnGerantLogin");
  const gerantLoginError = document.getElementById("gerantLoginError");
  const linkOpenGerantLogin = document.getElementById("linkOpenGerantLogin");
  const btnCloseGerantLogin = document.getElementById("btnCloseGerantLogin");

  function ouvrirEcranConnexionGerant() {
    const authGate = document.getElementById("authGate");
    if (authGate) authGate.hidden = true;
    if (gerantLoginError) gerantLoginError.textContent = "";
    if (gerantLoginGate) gerantLoginGate.hidden = false;
  }
  window.ouvrirEcranConnexionGerant = ouvrirEcranConnexionGerant;

  if (linkOpenGerantLogin) {
    linkOpenGerantLogin.addEventListener("click", (e) => {
      e.preventDefault();
      ouvrirEcranConnexionGerant();
    });
  }
  if (btnCloseGerantLogin && gerantLoginGate) {
    btnCloseGerantLogin.addEventListener("click", () => { gerantLoginGate.hidden = true; });
  }
  if (btnGerantLogin) {
    btnGerantLogin.addEventListener("click", async () => {
      const tel = gerantLoginTel ? gerantLoginTel.value.trim() : "";
      const code = gerantLoginCode ? gerantLoginCode.value.trim() : "";
      if (gerantLoginError) gerantLoginError.textContent = "";
      btnGerantLogin.disabled = true;
      btnGerantLogin.textContent = "Connexion...";
      const resultat = await connecterGerantParCode(tel, code);
      btnGerantLogin.disabled = false;
      btnGerantLogin.textContent = "Se connecter";
      if (!resultat.success) {
        if (gerantLoginError) gerantLoginError.textContent = resultat.message;
        return;
      }
    });
  }

  const params = new URLSearchParams(window.location.search);
  if (params.has("invite")) {
    traiterInvitationDepuisUrl();
  }
});
