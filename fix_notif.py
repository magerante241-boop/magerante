with open('notifications.js') as f:
    j = f.read()

# 1. Ajouter une fonction pour marquer une seule notification comme lue
old_marquer_tout = '''export async function marquerToutLu() {
  const nonLus = notifsCache.filter(n => !n.lu);
  if (nonLus.length === 0) return;
  const batch = writeBatch(db);
  nonLus.forEach(n => batch.update(doc(db, "establishments", appState.establishmentId, "notifications", n.id), { lu: true }));
  await batch.commit();
}'''

new_marquer_tout = '''export async function marquerToutLu() {
  const nonLus = notifsCache.filter(n => !n.lu);
  if (nonLus.length === 0) return;
  const batch = writeBatch(db);
  nonLus.forEach(n => batch.update(doc(db, "establishments", appState.establishmentId, "notifications", n.id), { lu: true }));
  await batch.commit();
}

export async function marquerUneLu(id) {
  const notif = notifsCache.find(n => n.id === id);
  if (!notif || notif.lu) return;
  try {
    await updateDoc(doc(db, "establishments", appState.establishmentId, "notifications", id), { lu: true });
  } catch (err) {
    console.warn("Marquage notification lue échoué :", err.message);
  }
}'''

assert old_marquer_tout in j, 'Bloc marquerToutLu non trouve'
j = j.replace(old_marquer_tout, new_marquer_tout, 1)

# 2. Importer updateDoc depuis firebase-config
old_import = '''import {
  auth, db, doc, getDoc, collection, addDoc, onSnapshot, query, orderBy, where, getDocs, serverTimestamp, writeBatch, limit
} from "./firebase-config.js";'''
new_import = '''import {
  auth, db, doc, getDoc, updateDoc, collection, addDoc, onSnapshot, query, orderBy, where, getDocs, serverTimestamp, writeBatch, limit
} from "./firebase-config.js";'''
assert old_import in j, 'Import non trouve'
j = j.replace(old_import, new_import, 1)

# 3. Corriger le listener de clic : marquer lu sur TOUT item cliqué, naviguer seulement si cible
old_listener = '''    if (listEl2) listEl2.addEventListener("click", (e) => {
      const item = e.target.closest(".notif-item[data-cible]");
      if (!item) return;
      const cible = item.dataset.cible;
      const factureNumero = item.dataset.factureNumero;
      panel.hidden = true;
      if (window.switchView) window.switchView(cible);
      if (factureNumero && window.FacturesModule && window.FacturesModule.ouvrirFacture) {
        setTimeout(() => window.FacturesModule.ouvrirFacture(factureNumero), 300);
      }
    });'''

new_listener = '''    if (listEl2) listEl2.addEventListener("click", (e) => {
      const item = e.target.closest(".notif-item");
      if (!item) return;
      const notifId = item.dataset.notifId;
      if (notifId) marquerUneLu(notifId);
      const cible = item.dataset.cible;
      if (!cible) return;
      const factureNumero = item.dataset.factureNumero;
      panel.hidden = true;
      if (window.switchView) window.switchView(cible);
      if (factureNumero && window.FacturesModule && window.FacturesModule.ouvrirFacture) {
        setTimeout(() => window.FacturesModule.ouvrirFacture(factureNumero), 300);
      }
    });'''

assert old_listener in j, 'Listener non trouve'
j = j.replace(old_listener, new_listener, 1)

with open('notifications.js', 'w') as f:
    f.write(j)
print('OK')
