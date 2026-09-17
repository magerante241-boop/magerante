const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const etabsSnap = await db.collection("establishments").get();
  console.log(`Total établissements : ${etabsSnap.size}\n`);

  for (const etabDoc of etabsSnap.docs) {
    const d = etabDoc.data();
    const produitsSnap = await db
      .collection("establishments")
      .doc(etabDoc.id)
      .collection("produits")
      .get();

    const createdAt = d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : "?";

    console.log(
      `ID: ${etabDoc.id} | nom: ${d.nom || "(sans nom)"} | email: ${d.email || d.ownerEmail || "?"} | tel: ${d.telephone || "?"} | créé: ${createdAt} | produits: ${produitsSnap.size}`
    );
  }
}

main().catch((err) => { console.error("Erreur :", err); process.exit(1); });
