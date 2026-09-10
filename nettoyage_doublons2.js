const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

(async () => {
  const snap = await db.collectionGroup('produits').get();
  const groupes = {};
  snap.docs.forEach(d => {
    const etabId = d.ref.path.split('/')[1];
    const nom = d.data().nom;
    const cle = etabId + '|' + nom;
    if (groupes[cle] === undefined) groupes[cle] = [];
    groupes[cle].push(d);
  });

  const aSupprimer = [];
  Object.values(groupes).filter(v => v.length > 1).forEach(docs => {
    docs.sort((a, b) => {
      const ua = a.data().updatedAt ? a.data().updatedAt.toMillis() : 0;
      const ub = b.data().updatedAt ? b.data().updatedAt.toMillis() : 0;
      return ub - ua;
    });
    docs.slice(1).forEach(d => aSupprimer.push(d.ref));
  });

  console.log('Total restant à supprimer:', aSupprimer.length);
  let fait = 0;
  for (let i = 0; i < aSupprimer.length; i += 400) {
    const batch = db.batch();
    aSupprimer.slice(i, i + 400).forEach(ref => batch.delete(ref));
    await batch.commit();
    fait += Math.min(400, aSupprimer.length - i);
    console.log(`${fait}/${aSupprimer.length} supprimés`);
  }
  console.log('Terminé.');
  process.exit(0);
})();
