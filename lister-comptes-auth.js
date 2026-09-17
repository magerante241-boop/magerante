const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

async function main() {
  const etabsSnap = await db.collection("establishments").get();

  for (const etabDoc of etabsSnap.docs) {
    const produitsSnap = await db
      .collection("establishments").doc(etabDoc.id).collection("produits").get();

    let info = `ID: ${etabDoc.id} | produits: ${produitsSnap.size}`;
    try {
      const user = await auth.getUser(etabDoc.id);
      info += ` | anonyme: ${user.providerData.length === 0} | email: ${user.email || "-"} | tel: ${user.phoneNumber || "-"} | créé(Auth): ${user.metadata.creationTime} | dernière connexion: ${user.metadata.lastSignInTime}`;
    } catch (e) {
      info += ` | (aucun compte Auth correspondant — orphelin)`;
    }
    console.log(info);
  }
}

main().catch((err) => { console.error("Erreur :", err); process.exit(1); });
