const PRODUITS_DJINO = [
  { nom: "Djino Pamplemousse", categorie: "Bar", prixAchat: 400, prixVente: 500, stock: 10 },
  { nom: "Djino Cocktail", categorie: "Bar", prixAchat: 400, prixVente: 500, stock: 10 },
  { nom: "Djino Ananas", categorie: "Bar", prixAchat: 400, prixVente: 500, stock: 10 },
];

async function main() {
  const etabsSnap = await db.collection("establishments").get();
  for (const etabDoc of etabsSnap.docs) {
    const produitsRef = db.collection("establishments").doc(etabDoc.id).collection("produits");
    const produitsSnap = await produitsRef.get();
    const nomsExistants = new Set(produitsSnap.docs.map((d) => d.data().nom));
    const manquants = PRODUITS_DJINO.filter((p) => !nomsExistants.has(p.nom));
    if (manquants.length === 0) { console.log(`${etabDoc.id}: déjà complet.`); continue; }

    let batch = db.batch();
    manquants.forEach((p) => {
      const newDocRef = produitsRef.doc();
      batch.set(newDocRef, { ...p, stockDepart: p.stock, isCatalogueDemarrage: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    await batch.commit();
    console.log(`${etabDoc.id}: ${manquants.length} produit(s) ajouté(s) - ${manquants.map(p => p.nom).join(", ")}`);
  }
  console.log("\nTerminé.");
}
main().catch((err) => { console.error("Erreur :", err); process.exit(1); });
