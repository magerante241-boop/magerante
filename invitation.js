import { doc, setDoc, getDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

function genererToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

// PROPRIETAIRE : génère un lien d'invitation pour un gérant
async function creerInvitationGerant(estId, nomGerant) {
  const token = genererToken();
  await setDoc(doc(db, "invitations", token), {
    estId,
    nomGerant,
    createdAt: new Date().toISOString()
  });
  const lien = `${window.location.origin}${window.location.pathname}?invite=${token}`;
  const texteWhatsapp = `Bonjour ${nomGerant}, voici ton accès MAGERANTE : ${lien}`;
  const lienWhatsapp = `https://wa.me/?text=${encodeURIComponent(texteWhatsapp)}`;
  return { token, lien, lienWhatsapp };
}

// GERANT : au
cd ~/magerante && cat > invitation.js << 'EOF'
import { doc, setDoc, getDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

function genererToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

// PROPRIETAIRE : génère un lien d'invitation pour un gérant
async function creerInvitationGerant(estId, nomGerant) {
  const token = genererToken();
  await setDoc(doc(db, "invitations", token), {
    estId,
    nomGerant,
    createdAt: new Date().toISOString()
  });
  const lien = `${window.location.origin}${window.location.pathname}?invite=${token}`;
  const texteWhatsapp = `Bonjour ${nomGerant}, voici ton accès MAGERANTE : ${lien}`;
  const lienWhatsapp = `https://wa.me/?text=${encodeURIComponent(texteWhatsapp)}`;
  return { token, lien, lienWhatsapp };
}

// GERANT : au clic sur le lien (?invite=token), rejoint l'établissement
async function traiterInvitationDepuisUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("invite");
  if (!token) return null;

  const invSnap = await getDoc(doc(db, "invitations", token));
  if (!invSnap.exists()) {
    alert("Lien d'invitation invalide ou expiré.");
    return null;
  }
  const { estId, nomGerant } = invSnap.data();

  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        await signInAnonymously(auth);
        return;
      }
      await setDoc(doc(db, "establishments", estId, "gerants", user.uid), {
        nom: nomGerant,
        actif: true,
        dateActivation: new Date().toISOString()
      }, { merge: true });
      resolve({ estId, nomGerant, uid: user.uid });
    });
  });
}

window.InvitationModule = { creerInvitationGerant, traiterInvitationDepuisUrl };
