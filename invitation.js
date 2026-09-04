import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db, auth } from "./firebase-config.js";
import { appState } from "./state.js";

function genererToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

// PROPRIETAIRE : genere un lien d'invitation, exploitable via WhatsApp ou e-mail
async function creerInvitationGerant(estId, nomGerant) {
  const token = genererToken();
  await setDoc(doc(db, "invitations", token), {
    estId, nomGerant, createdAt: new Date().toISOString()
  });
  const lien = `${window.location.origin}${window.location.pathname}?invite=${token}`;
  const texteWhatsapp = `Bonjour ${nomGerant}, voici ton acces MAGERANTE : ${lien}`;
  const lienWhatsapp = `https://wa.me/?text=${encodeURIComponent(texteWhatsapp)}`;
  const sujet = "Ton acces MAGERANTE";
  const corps = `Bonjour ${nomGerant},\n\nVoici ton lien d'acces a ton interface de gestion MAGERANTE :\n${lien}\n\nClique dessus pour acceder directement a ton espace.`;
  const lienEmail = `mailto:?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  return { token, lien, lienWhatsapp, lienEmail };
}

// GERANT : ecran de bienvenue dedie avant d'entrer dans l'app
function afficherEcranBienvenue(nomGerant) {
  const splash = document.getElementById("splashScreen");
  const authGate = document.getElementById("authGate");
  const gerantGate = document.getElementById("gerantGate");
  const texte = document.getElementById("gerantWelcomeText");
  if (splash) splash.hidden = true;
  if (authGate) authGate.hidden = true;
  if (texte) texte.textContent = `${nomGerant}, tu es maintenant connecte(e) a ton etablissement.`;
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

// GERANT : au clic sur le lien (?invite=token)
async function traiterInvitationDepuisUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("invite");
  if (!token) return null;

  const invSnap = await getDoc(doc(db, "invitations", token));
  if (!invSnap.exists()) {
    alert("Lien d'invitation invalide ou expire.");
    return null;
  }
  const { estId, nomGerant } = invSnap.data();

  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) { await signInAnonymously(auth); return; }
      await setDoc(doc(db, "establishments", estId, "gerants", user.uid), {
        nom: nomGerant, actif: true, dateActivation: new Date().toISOString()
      }, { merge: true });
      afficherEcranBienvenue(nomGerant);
      resolve({ estId, nomGerant, uid: user.uid });
    });
  });
}

window.InvitationModule = { creerInvitationGerant, traiterInvitationDepuisUrl };

// --- UI : bouton "Inviter un gerant" + modale de generation de lien ---
document.addEventListener("DOMContentLoaded", () => {
  const btnMenuInvite = document.getElementById("menuInviteGerant");
  const inviteGate = document.getElementById("inviteGate");
  const inputNom = document.getElementById("inviteNomGerant");
  const btnGenerer = document.getElementById("btnGenererInvitation");
  const linksZone = document.getElementById("inviteLinksZone");
  const lWhatsapp = document.getElementById("inviteLienWhatsapp");
  const lEmail = document.getElementById("inviteLienEmail");
  const btnClose = document.getElementById("btnCloseInvite");
  if (!btnMenuInvite || !inviteGate) return;

  btnMenuInvite.addEventListener("click", () => {
    const sideMenu = document.getElementById("sideMenu");
    if (sideMenu) sideMenu.hidden = true;
    linksZone.hidden = true;
    inputNom.value = "";
    inviteGate.hidden = false;
  });
  btnClose.addEventListener("click", () => { inviteGate.hidden = true; });
  inviteGate.addEventListener("click", (e) => {
    if (e.target === inviteGate) inviteGate.hidden = true;
  });
  btnGenerer.addEventListener("click", async () => {
    const nom = inputNom.value.trim();
    if (!nom) { alert("Indique le nom du gerant."); return; }
    if (!appState.establishmentId) { alert("Etablissement non pret, reessaie."); return; }
    btnGenerer.textContent = "Generation...";
    const { lienWhatsapp, lienEmail } = await creerInvitationGerant(appState.establishmentId, nom);
    lWhatsapp.href = lienWhatsapp;
    lEmail.href = lienEmail;
    linksZone.hidden = false;
    btnGenerer.textContent = "Generer le lien";
  });
});
