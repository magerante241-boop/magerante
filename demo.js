// demo.js — Catalogue de démarrage standard (plus de fausses données de
// démonstration). Injecté une seule fois à la création de chaque nouvel
// établissement pour que l'application soit utilisable immédiatement.
// Les gérants/propriétaires modifient ensuite librement leur inventaire.
import {
  db, doc, collection, getDocs, writeBatch, serverTimestamp
} from "./firebase-config.js";
import { appState } from "./state.js";
import { CATALOGUE_STANDARD } from "./catalogue-standard.js";

function produitsRef() {
  return collection(db, "establishments", appState.establishmentId, "produits");
}

// N'injecte le catalogue de démarrage que si l'établissement n'a encore
// aucun produit (évite d'écraser un inventaire déjà personnalisé si la
// fonction est rappelée par erreur).
export async function genererCatalogueDemarrage() {
  if (!appState.establishmentId) {
    return { success: false, message: "Établissement non initialisé." };
  }
  const ref = produitsRef();
  const existant = await getDocs(ref);
  if (!existant.empty) {
    return { success: true, count: 0, message: "Inventaire déjà initialisé, catalogue de démarrage non réappliqué." };
  }
  const batch = writeBatch(db);
  CATALOGUE_STANDARD.forEach((p) => {
    const newDocRef = doc(ref);
    batch.set(newDocRef, {
      ...p,
      isCatalogueDemarrage: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return { success: true, count: CATALOGUE_STANDARD.length };
}

// Alias conservé pour compatibilité (auth.js importe encore ce nom).
export const genererProduitsDemo = genererCatalogueDemarrage;

window.DemoModule = { genererCatalogueDemarrage, genererProduitsDemo };
