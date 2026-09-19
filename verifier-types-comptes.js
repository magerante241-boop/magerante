const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const gerants = await db.collection("gerant_logins").get();
  console.log(`Comptes Gérant (gerant_logins) : ${gerants.size}`);
  gerants.forEach((d) => {
    const g = d.data();
    console.log(`  - tel: ${d.id} | établissement: ${g.estId} | nom: ${g.nom || "?"}`);
  });
}

main().catch((err) => { console.error("Erreur :", err); process.exit(1); });
