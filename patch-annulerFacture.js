const fs = require("fs");
const fichier = "factures.js";
let contenu = fs.readFileSync(fichier, "utf8");
let modifie = false;

const ancienImport = `db, doc, collection, addDoc, onSnapshot, query, orderBy, runTransaction, serverTimestamp, auth, limit`;
const nouvelImport = `db, doc, collection, addDoc, updateDoc, onSnapshot, query, orderBy, runTransaction, serverTimestamp, auth, limit`;
if (contenu.includes(nouvelImport)) {
  console.log("DEJA APPLIQUE: import updateDoc");
} else if (!contenu.includes(ancienImport)) {
  console.log("ECHEC: ligne d'import introuvable");
} else {
  contenu = contenu.replace(ancienImport, nouvelImport);
  modifie = true;
  console.log("OK: import updateDoc ajoute");
}

const ancienBloc = `export function render(container) {`;
const nouveauBloc = `async function annulerFacture(numero, docId) {
  if (!appState.establishmentId || !docId) {
    return { success: false, message: "Facture introuvable." };
  }
  const estId = appState.establishmentId;
  try {
    if (await clotureExisteAujourdhui(estId)) {
      return { success: false, message: "Impossible d'annuler : la journee est deja cloturee." };
    }
    await updateDoc(doc(db, "establishments", estId, "factures", docId), {
      statut: "annulee",
      dateAnnulation: serverTimestamp(),
    });
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export function render(container) {`;

if (contenu.includes("async function annulerFacture")) {
  console.log("DEJA APPLIQUE: fonction annulerFacture");
} else if (!contenu.includes(ancienBloc)) {
  console.log("ECHEC: motif 'export function render' introuvable");
} else {
  contenu = contenu.replace(ancienBloc, nouveauBloc);
  modifie = true;
  console.log("OK: fonction annulerFacture ajoutee");
}

if (modifie) {
  fs.writeFileSync(fichier, contenu, "utf8");
  console.log("=== Fichier ecrit ===");
} else {
  console.log("=== Aucune ecriture ===");
}
