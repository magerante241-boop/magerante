const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DRY_RUN = false; // passera à false une fois validé

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

  const doublons = Object.entries(groupes).filter(([k, v]) => v.length > 1);
  console.log('Groupes en double à traiter:', doublons.length);

  let totalASupprimer = 0;
  for (const [cle, docs] of doublons) {
    docs.sort((a, b) => {
      const ua = a.data().updatedAt ? a.data().updatedAt.toMillis() : 0;
      const ub = b.data().updatedAt ? b.data().updatedAt.toMillis() : 0;
      return ub - ua;
    });
    const garder = docs[0];
    const aSupprimer = docs.slice(1);
    totalASupprimer += aSupprimer.length;
    console.log(`${cle} : garde ${garder.id} (stock=${garder.data().stock}), supprime ${aSupprimer.map(d => d.id + '(stock=' + d.data().stock + ')').join(', ')}`);
    if (!DRY_RUN) {
      for (const d of aSupprimer) {
        await d.ref.delete();
      }
    }
  }
  console.log('---');
  console.log(DRY_RUN ? 'DRY RUN — rien supprimé.' : 'SUPPRESSION RÉELLE effectuée.');
  console.log('Total documents qui seraient/ont été supprimés:', totalASupprimer);
  process.exit(0);
})();
