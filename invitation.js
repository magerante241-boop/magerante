import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db, auth } from "./firebase-config.js";
import { appState } from "./state.js";

function genererToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

async function creerInvitationGerant(estId, nomGerant, telephone) {
  const token = genererToken();
  const telClean = (telephone || "").replace(/\D/g, "");
  await setDoc(doc(db, "invitations", token), {
    estId, nomGerant, telephone: telClean, createdAt: new Date().toISOString()
  });
  const lien = `${window.location.origin}${window.location.pathname}?invite=${token}`;
  const texteWhatsapp = `Bonjour ${nomGerant}, voici ton acces MAGERANTE : ${lien}`;
  const lienWhatsapp = telClean
    ? `https://wa.me/${telClean}?text=${encodeURIComponent(texteWhatsapp)}`
    : `https://wa.me/?text=${encodeURIComponent(texteWhatsapp)}`;
  const sujet = "Ton acces MAGERANTE";
  const corps = `Bonjour ${nomGerant},\n\nVoici ton lien d'acces a ton interface de gestion MAGERANTE :\n${lien}\n\nClique dessus pour acceder directement a ton espace.`;
  const lienEmail = `mailto:?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  return { token, lien, lienWhatsapp, lienEmail };
}

function afficherEcranBienvenue(nomGerant, nomEtablissement) {
  const splash = document.getElementById("splashScreen");
  const authGate = document.getElementById("authGate");
  const gerantGate = document.getElementById("gerantGate");
  const texte = document.getElementById("gerantWelcomeText");
  const etablissementNomEl = document.getElementById("etablissementNom");
  if (splash) splash.hidden = true;
  if (authGate) authGate.hidden = true;
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

window.InvitationModule = { creerInvitationGerant, traiterInvitationDepuisUrl };

document.addEventListener("DOMContentLoaded", () => {
  const btnMenuInvite = document.getElementById("menuInviteGerant");
  const inviteGate = document.getElementById("inviteGate");
  const inputNom = document.getElementById("inviteNomGerant");
  const inputTel = document.getElementById("inviteTelGerant");
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
      inviteGate.hidden = false;
    });
    btnClose.addEventListener("click", () => { inviteGate.hidden = true; });
    inviteGate.addEventListener("click", (e) => {
      if (e.target === inviteGate) inviteGate.hidden = true;
    });
    btnGenerer.addEventListener("click", async () => {
      const nom = inputNom.value.trim();
      const tel = inputTel ? inputTel.value.trim() : "";
      if (!nom) { alert("Indique le nom du gerant."); return; }
      if (!tel) { alert("Indique le numero WhatsApp du gerant."); return; }
      if (!appState.establishmentId) { alert("Etablissement non pret, reessaie."); return; }
      btnGenerer.textContent = "Generation...";
      const resultat = await creerInvitationGerant(appState.establishmentId, nom, tel);
      lWhatsapp.href = resultat.lienWhatsapp;
      lEmail.href = resultat.lienEmail;
      linksZone.hidden = false;
      btnGenerer.textContent = "Generer le lien";
    });
  }

  const params = new URLSearchParams(window.location.search);
  if (params.has("invite")) {
    traiterInvitationDepuisUrl();
  }
});
