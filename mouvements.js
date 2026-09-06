// mouvements.js — Enregistrement des mouvements de caisse du gerant
// (achat, depense, recette, entree-stock) + journal d'audit silencieux
// consultable par le proprietaire, independamment de la cloture.
import {
  auth, db, collection, addDoc, serverTimestamp
} from "./firebase-config.js";
import { appState } from "./state.js";

function mouvementsRef() {
  return collection(db, "establishments", appState.establishmentId, "mouvements");
}

function journalRef() {
  return collection(db, "establishments", appState.establishmentId, "journal");
}

export async function enregistrerMouvement(type, montant) {
  if (!appState.establishmentId) {
    return { success: false, message: "Initialisation en cours, réessaie dans un instant." };
  }
  if (!(montant > 0)) {
    return { success: false, message: "Montant invalide." };
  }
  const auteurId = auth.currentUser ? auth.currentUser.uid : null;
  const auteurNom = (window.AuthState && window.AuthState.nomGerant) || null;
  const payload = { type, montant, date: serverTimestamp(), auteurId, auteurNom };
  try {
    await addDoc(mouvementsRef(), payload);
    await addDoc(journalRef(), { ...payload, source: "mouvement" });
    return { success: true };
  } catch (err) {
    console.warn("Enregistrement mouvement impossible :", err);
    return { success: false, message: "Erreur d'enregistrement, réessaie." };
  }
}

window.MouvementsModule = { enregistrerMouvement };
