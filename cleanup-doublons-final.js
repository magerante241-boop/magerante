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
    const parNom = {};
    produitsSnap.docs.forEach(d => {
      const data = d.data();
      const key = data.nom;
      if (!parNom[key]) parNom[key] = [];
      parNom[key].push({ id: d.id, stock: data.stock || 0, ref: d.ref });
    });
    const doublons = Object.entries(parNom).filter(([nom, docs]) => docs.length > 1);
    if (doublons.length === 0) { console.log(`${etabDoc.id}: aucun doublon.`); continue; }

    let batch = db.batch();
    for (const [nom, docs] of doublons) {
      const stockTotal = docs.reduce((s, d) => s + d.stock, 0);
      const stockFinal = stockTotal === 0 ? 10 : stockTotal;
      const garder = docs.reduce((max, d) => (d.stock > max.stock ? d : max), docs[0]);
      console.log(`${etabDoc.id}: "${nom}" -> garde id=${garder.id}, stock final=${stockFinal} (${stockTotal === 0 ? "reset défaut 10" : "somme réelle"}), suppression de ${docs.length - 1} doublon(s)`);
      batch.update(garder.ref, { stock: stockFinal });
      docs.forEach(d => { if (d.id !== garder.id) batch.delete(d.ref); });
    }
    await batch.commit();
    console.log(`${etabDoc.id}: nettoyage terminé.\n`);
  }
  console.log("Tout est terminé.");
}
main().catch((err) => { console.error("Erreur :", err); process.exit(1); });
