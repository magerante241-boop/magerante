old = '''function updateBadge() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  const nonLus = notifsCache.filter(n => !n.lu && typeActif(n.type)).length;
  if (nonLus > 0) { badge.textContent = nonLus > 9 ? "9+" : String(nonLus); badge.hidden = false; }
  else { badge.hidden = true; }
}'''

new = '''function updateBadge() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  const nonLusListe = notifsCache.filter(n => !n.lu && typeActif(n.type));
  const nonLus = nonLusListe.length;
  if (nonLus > 0 && nonLus <= 2) {
    alert("DEBUG badge=" + nonLus + " : " + nonLusListe.map(n => n.id + " | type=" + n.type + " | lu=" + n.lu).join(" || "));
  }
  if (nonLus > 0) { badge.textContent = nonLus > 9 ? "9+" : String(nonLus); badge.hidden = false; }
  else { badge.hidden = true; }
}'''

with open("notifications.js") as f:
    content = f.read()

count = content.count(old)
assert count == 1, f"{count} occurrence(s), attendu 1"
content = content.replace(old, new)

open("notifications.js", "w").write(content)
print("Debug badge ajoute")
