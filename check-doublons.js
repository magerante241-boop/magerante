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
      parNom[key].push({ id: d.id, stock: data.stock, prixVente: data.prixVente });
    });

    console.log(`\n=== ${etabDoc.id} (${produitsSnap.size} produits) ===`);

    const doublons = Object.entries(parNom).filter(([nom, docs]) => docs.length > 1);

    if (doublons.length === 0) {
      console.log("Aucun doublon.");
    } else {
      doublons.forEach(([nom, docs]) => {
        console.log(`DOUBLON: "${nom}" x${docs.length}`);
        docs.forEach(d => console.log(`   - id=${d.id} stock=${d.stock} prixVente=${d.prixVente}`));
      });
    }
  }
  console.log("\nTerminé.");
}

main().catch((err) => { console.error("Erreur :", err); process.exit(1); });
