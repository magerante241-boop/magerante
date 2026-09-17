import re

with open("notifications.js") as f:
    content = f.read()

# Retire les alert() DEBUG de marquerToutLu, marquerUneLu et updateBadge
content = content.replace('  alert("DEBUG: " + nonLus.length + " notif(s) non lue(s) trouvee(s)");\n', '')
content = content.replace('    alert("DEBUG: batch.commit() reussi");\n', '')
content = content.replace('    alert("DEBUG ERREUR: " + err.message);\n', '')
content = content.replace('  if (!notif) { alert("DEBUG: notif " + id + " introuvable dans notifsCache"); return; }\n  if (notif.lu) { alert("DEBUG: notif " + id + " deja lu=true en cache, aucun appel Firestore"); return; }',
                           '  if (!notif || notif.lu) return;')
content = content.replace('    alert("DEBUG: updateDoc reussi pour " + id);\n', '')
content = content.replace('    alert("DEBUG ERREUR sur " + id + " : " + err.message);\n', '')
content = re.sub(r'  const nonLusListe = notifsCache\.filter.*?\n  const nonLus = nonLusListe\.length;\n  if \(nonLus > 0 && nonLus <= 2\) \{\n.*?\n  \}\n',
                  '  const nonLus = notifsCache.filter(n => !n.lu && typeActif(n.type)).length;\n', content, flags=re.S)

with open("notifications.js", "w") as f:
    f.write(content)
print("Debug retire")
