old = '''export async function marquerUneLu(id) {
  const notif = notifsCache.find(n => n.id === id);
  if (!notif || notif.lu) return;
  try {
    await updateDoc(doc(db, "establishments", appState.establishmentId, "notifications", id), { lu: true });
  } catch (err) {
    console.warn("Marquage notification lue echoue :", err.message);
  }
}'''

new = '''export async function marquerUneLu(id) {
  const notif = notifsCache.find(n => n.id === id);
  if (!notif) { alert("DEBUG: notif " + id + " introuvable dans notifsCache"); return; }
  if (notif.lu) { alert("DEBUG: notif " + id + " deja lu=true en cache, aucun appel Firestore"); return; }
  try {
    await updateDoc(doc(db, "establishments", appState.establishmentId, "notifications", id), { lu: true });
    alert("DEBUG: updateDoc reussi pour " + id);
  } catch (err) {
    alert("DEBUG ERREUR sur " + id + " : " + err.message);
    console.warn("Marquage notification lue echoue :", err.message);
  }
}'''

with open("notifications.js") as f:
    content = f.read()

count = content.count(old)
assert count == 1, f"{count} occurrence(s), attendu 1"
content = content.replace(old, new)

open("notifications.js", "w").write(content)
print("Debug ajoute dans marquerUneLu")
