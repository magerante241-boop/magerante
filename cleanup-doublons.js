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
