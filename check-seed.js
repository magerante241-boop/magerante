const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function check() {
  const estabs = await db.collection("establishments").get();
  for (const doc of estabs.docs) {
    const produits = await db.collection(`establishments/${doc.id}/produits`).get();
    const manquants = produits.docs.filter(p => {
      const d = p.data();
      return !d.stock && d.stock !== 0 || !d.prixVente || !d.prixAchat;
    });
    console.log(`${doc.data().name} (${doc.id}) : ${produits.size} produits, ${manquants.length} incomplets`);
  }
}
check().then(() => process.exit(0));
