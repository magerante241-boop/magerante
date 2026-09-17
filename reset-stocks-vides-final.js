const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const CATALOGUE_STANDARD = [
  { nom: "Régab 33cl", categorie: "Bar", prixAchat: 245, prixVente: 400, stock: 10 },
  { nom: "Régab 65cl", categorie: "Bar", prixAchat: 433, prixVente: 700, stock: 10 },
  { nom: "Castel Beer 33cl", categorie: "Bar", prixAchat: 275, prixVente: 450, stock: 10 },
  { nom: "Castel Beer 65cl", categorie: "Bar", prixAchat: 550, prixVente: 700, stock: 10 },
  { nom: "33 Export 33cl", categorie: "Bar", prixAchat: 275, prixVente: 450, stock: 10 },
  { nom: "33 Export 65cl", categorie: "Bar", prixAchat: 550, prixVente: 900, stock: 10 },
  { nom: "Beaufort 33cl", categorie: "Bar", prixAchat: 417, prixVente: 700, stock: 10 },
  { nom: "Beaufort 65cl", categorie: "Bar", prixAchat: 833, prixVente: 1300, stock: 10 },
  { nom: "Guinness 33cl", categorie: "Bar", prixAchat: 583, prixVente: 1000, stock: 10 },
  { nom: "Guinness 65cl", categorie: "Bar", prixAchat: 1167, prixVente: 1800, stock: 10 },
  { nom: "Heineken 33cl", categorie: "Bar", prixAchat: 750, prixVente: 1100, stock: 10 },
  { nom: "Heineken 65cl", categorie: "Bar", prixAchat: 1500, prixVente: 2200, stock: 10 },
  { nom: "Tembo 33cl", categorie: "Bar", prixAchat: 300, prixVente: 500, stock: 10 },
  { nom: "Tembo 65cl", categorie: "Bar", prixAchat: 600, prixVente: 900, stock: 10 },
  { nom: "Booster 24cl", categorie: "Bar", prixAchat: 300, prixVente: 500, stock: 10 },
  { nom: "Booster 33cl", categorie: "Bar", prixAchat: 400, prixVente: 700, stock: 10 },
  { nom: "Malta Guinness 33cl", categorie: "Bar", prixAchat: 400, prixVente: 700, stock: 10 },
  { nom: "Malta Guinness 50cl", categorie: "Bar", prixAchat: 550, prixVente: 900, stock: 10 },
  { nom: "Coca-Cola 33cl", categorie: "Bar", prixAchat: 300, prixVente: 500, stock: 10 },
  { nom: "Coca-Cola 1L", categorie: "Bar", prixAchat: 600, prixVente: 1000, stock: 10 },
  { nom: "Martini 70cl", categorie: "Bar", prixAchat: 4500, prixVente: 7000, stock: 10 },
  { nom: "Martini 1L", categorie: "Bar", prixAchat: 6000, prixVente: 9000, stock: 10 },
  { nom: "Martini Rosso 1L", categorie: "Bar", prixAchat: 6000, prixVente: 9000, stock: 10 },
  { nom: "Martini Bianco 1L", categorie: "Bar", prixAchat: 6000, prixVente: 9000, stock: 10 },
  { nom: "Grand Versant 70cl", categorie: "Bar", prixAchat: 2000, prixVente: 3500, stock: 10 },
  { nom: "Grand Versant 1L", categorie: "Bar", prixAchat: 2500, prixVente: 4000, stock: 10 },
  { nom: "Grand Versant Rouge 75cl", categorie: "Bar", prixAchat: 2500, prixVente: 4000, stock: 10 },
  { nom: "Grand Versant Blanc 75cl", categorie: "Bar", prixAchat: 2500, prixVente: 4000, stock: 10 },
  { nom: "Label 5 70cl", categorie: "Bar", prixAchat: 7000, prixVente: 13000, stock: 10 },
  { nom: "Label 5 1L", categorie: "Bar", prixAchat: 9000, prixVente: 17000, stock: 10 },
  { nom: "Ricard 70cl", categorie: "Bar", prixAchat: 7000, prixVente: 13000, stock: 10 },
  { nom: "Ricard 1L", categorie: "Bar", prixAchat: 9000, prixVente: 17000, stock: 10 },
];

async function main() {
  const etabsSnap = await db.collection("establishments").get();
  for (const etabDoc of etabsSnap.docs) {
    const produitsRef = db.collection("establishments").doc(etabDoc.id).collection("produits");
    const produitsSnap = await produitsRef.get();
    const aZero = produitsSnap.docs.filter(d => (d.data().stock || 0) === 0);

    if (aZero.length === 0) { console.log(`${etabDoc.id}: aucun produit à 0.`); continue; }

    let batch = db.batch();
    aZero.forEach(d => {
      console.log(`${etabDoc.id}: "${d.data().nom}" -> stock 0 -> 10`);
      batch.update(d.ref, { stock: 10 });
    });
    await batch.commit();
    console.log(`${etabDoc.id}: ${aZero.length} produit(s) remis à 10.\n`);
  }
  console.log("Tout est terminé.");
}
main().catch((err) => { console.error("Erreur :", err); process.exit(1); });
