const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function nettoyer() {
  const estabs = await db.collection("establishments").get();
  let totalSupprimes = 0;
  for (const estabDoc of estabs.docs) {
    const produitsRef = db.collection(`establishments/${estabDoc.id}/produits`);
    const snap = await produitsRef.where("categorie", "in", ["Club", "Snack"]).get();
    if (snap.empty) continue;
    for (const p of snap.docs) {
      console.log(`Suppression : ${estabDoc.data().name} → ${p.data().nom} (${p.data().categorie})`);
      await p.ref.delete();
      totalSupprimes++;
    }
  }
  console.log(`Terminé : ${totalSupprimes} produit(s) supprimé(s).`);
}
nettoyer().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
