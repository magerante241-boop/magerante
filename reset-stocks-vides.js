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
