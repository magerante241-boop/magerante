const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const etabsSnap = await db.collection("establishments").get();
  console.log(`Établissements trouvés : ${etabsSnap.size}`);

  let totalCorriges = 0;
  let totalEtabs = 0;

  for (const etabDoc of etabsSnap.docs) {
    const produitsSnap = await db
      .collection("establishments")
      .doc(etabDoc.id)
      .collection("produits")
      .get();

    if (produitsSnap.empty) continue;

    let batch = db.batch();
    let count = 0;
    let corrigesEtab = 0;

    for (const prodDoc of produitsSnap.docs) {
      const data = prodDoc.data();
      const stockVide = data.stock === undefined || data.stock === null;

      if (!stockVide) continue;

      batch.update(prodDoc.ref, {
        stock: 10,
        updatedAt: FieldValue.serverTimestamp(),
      });
      count++;
      corrigesEtab++;
      totalCorriges++;

      if (count === 450) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }

    if (count > 0) await batch.commit();

    if (corrigesEtab > 0) {
      totalEtabs++;
      console.log(`✔ ${etabDoc.id} : ${corrigesEtab} produit(s) sans stock corrigé(s) à 10`);
    }
  }

  console.log(`\nTerminé. ${totalCorriges} produit(s) corrigé(s) sur ${totalEtabs} établissement(s).`);
}

main().catch((err) => {
  console.error("Erreur :", err);
  process.exit(1);
});
