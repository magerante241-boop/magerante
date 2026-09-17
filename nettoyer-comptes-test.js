const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

// Comptes à CONSERVER — tout le reste sera supprimé
const A_GARDER = new Set([
  "Ee9NdiK1dzO3rZmBepWiR469gCE2", // essonopat13@gmail.com — Propriétaire réel
  "x5LPz8ouBsYq3wZnXI7wIpYhuxw2", // magerante241@gmail.com — Admin
  "xaeohBa9ZhMH0c0lEaQxCca5IHl1", // patrickessono06@gmail.com — Propriétaire réel
  "AB6zjCeWIzO6lIDQjJCmI5qprJO2", // bar.glass@demo.magerante.ga — démo Bar à garder
]);

const CONFIRMER = process.argv.includes("--confirmer");

async function supprimerSousCollection(ref) {
  const snap = await ref.get();
  if (snap.empty) return 0;
  let batch = db.batch();
  let count = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    count++;
    if (count % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  return count;
}

async function main() {
  const etabsSnap = await db.collection("establishments").get();
  let aSupprimer = etabsSnap.docs.filter((d) => !A_GARDER.has(d.id));

  console.log(`Total établissements : ${etabsSnap.size}`);
  console.log(`À garder : ${A_GARDER.size}`);
  console.log(`À supprimer : ${aSupprimer.length}`);
  console.log(CONFIRMER ? "\n=== SUPPRESSION RÉELLE ===\n" : "\n=== ESSAI À BLANC (rien n'est supprimé) — relance avec --confirmer pour exécuter ===\n");

  for (const etabDoc of aSupprimer) {
    if (!CONFIRMER) {
      console.log(`[simulation] supprimerait establishments/${etabDoc.id} + produits + compte Auth`);
      continue;
    }
    const produitsRef = db.collection("establishments").doc(etabDoc.id).collection("produits");
    const n = await supprimerSousCollection(produitsRef);
    await db.collection("establishments").doc(etabDoc.id).delete();

    let authMsg = "OK";
    try {
      await auth.deleteUser(etabDoc.id);
    } catch (e) {
      authMsg = `compte Auth déjà absent (${e.code})`;
    }
    console.log(`✔ ${etabDoc.id} supprimé (${n} produits) — Auth: ${authMsg}`);
  }

  console.log(`\nTerminé.`);
}

main().catch((err) => { console.error("Erreur :", err); process.exit(1); });
