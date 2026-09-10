const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function verify() {
  const estabs = await db.collection("establishments").get();
  let total = 0, withField = 0, sample = [];
  for (const e of estabs.docs) {
    const produits = await db.collection(`establishments/${e.id}/produits`).get();
    produits.docs.forEach((p) => {
      const d = p.data();
      total++;
      if (d.stockDepart !== undefined) {
        withField++;
        if (sample.length < 5) sample.push({ nom: d.nom, stock: d.stock, stockDepart: d.stockDepart });
      }
    });
  }
  console.log(`Total produits : ${total}`);
  console.log(`Avec stockDepart : ${withField}`);
  console.log(`Sans stockDepart : ${total - withField}`);
  console.log("Échantillon :", JSON.stringify(sample, null, 2));
}
verify().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
