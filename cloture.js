import { auth, db, doc, getDoc, collection, getDocs, addDoc, query, where, serverTimestamp, onAuthStateChanged } from "./firebase-config.js";
import { appState } from "./state.js";

function calculerDebutFinJour() {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);
  return { debut, fin };
}

async function chargerResumeJour(estId, uid) {
  const { debut, fin } = calculerDebutFinJour();
  const ventesSnap = await getDocs(query(
    collection(db, "establishments", estId, "ventes"),
    where("date", ">=", debut),
    where("date", "<", fin)
  ));
  let total = 0, nombre = 0;
  ventesSnap.forEach((docSnap) => {
    const v = docSnap.data();
    if (v.auteurId === uid) {
      total += v.montant || 0;
      nombre += 1;
    }
  });
  return { total, nombre };
}

document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("menuClotureGerant");
  const clotureGate = document.getElementById("clotureGate");
  const resumeEl = document.getElementById("clotureResume");
  const errorEl = document.getElementById("clotureError");
  const btnConfirmer = document.getElementById("btnConfirmerCloture");
  const lienWhatsapp = document.getElementById("clotureLienWhatsapp");
  const btnClose = document.getElementById("btnCloseCloture");

  if (!menuBtn || !clotureGate) return;

  menuBtn.addEventListener("click", async () => {
    const sideMenu = document.getElementById("sideMenu");
    if (sideMenu) sideMenu.hidden = true;
    errorEl.textContent = "";
    lienWhatsapp.hidden = true;
    btnConfirmer.disabled = false;
    btnConfirmer.textContent = "Envoyer mes comptes au propriétaire";
    resumeEl.textContent = "Chargement du résumé...";
    clotureGate.hidden = false;

    const estId = appState.establishmentId;
    const uid = auth.currentUser?.uid;
    if (!estId || !uid) {
      resumeEl.textContent = "Impossible de charger le résumé pour le moment.";
      return;
    }

    try {
      const { total, nombre } = await chargerResumeJour(estId, uid);
      resumeEl.textContent = `Aujourd'hui : ${nombre} vente(s) pour un total de ${total.toLocaleString("fr-FR")} FCFA.`;
      btnConfirmer.dataset.total = total;
      btnConfirmer.dataset.nombre = nombre;

      const estSnap = await getDoc(doc(db, "establishments", estId));
      const telephoneProprietaire = estSnap.exists() ? estSnap.data().telephone : null;
      if (telephoneProprietaire) {
        const texte = `Bonjour, voici mes comptes du jour : ${nombre} vente(s), ${total.toLocaleString("fr-FR")} FCFA au total.`;
        lienWhatsapp.href = `https://wa.me/${telephoneProprietaire}?text=${encodeURIComponent(texte)}`;
        lienWhatsapp.hidden = false;
      }
    } catch (e) {
      resumeEl.textContent = "Erreur lors du chargement du résumé.";
      console.warn("Erreur resume cloture :", e);
    }
  });

  if (btnClose) btnClose.addEventListener("click", () => { clotureGate.hidden = true; });
  clotureGate.addEventListener("click", (e) => {
    if (e.target === clotureGate) clotureGate.hidden = true;
  });

  if (btnConfirmer) {
    btnConfirmer.addEventListener("click", async () => {
      const estId = appState.establishmentId;
      const uid = auth.currentUser?.uid;
      if (!estId || !uid) return;
      btnConfirmer.disabled = true;
      btnConfirmer.textContent = "Envoi...";
      try {
        await addDoc(collection(db, "establishments", estId, "clotures"), {
          gerantUid: uid,
          totalVentes: Number(btnConfirmer.dataset.total || 0),
          nombreVentes: Number(btnConfirmer.dataset.nombre || 0),
          date: serverTimestamp(),
        });
        btnConfirmer.textContent = "Comptes envoyés ✅";
      } catch (e) {
        errorEl.textContent = "Erreur lors de l'envoi : " + (e.code || e.message);
        btnConfirmer.disabled = false;
        btnConfirmer.textContent = "Envoyer mes comptes au propriétaire";
      }
    });
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) { menuBtn.hidden = true; return; }
    menuBtn.hidden = !(window.AuthState && window.AuthState.role === "GERANT");
  });
});
