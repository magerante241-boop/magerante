with open("auth.js", "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace(
    'import { genererProduitsDemo } from "./demo.js";',
    'import { genererProduitsDemo } from "./demo.js";\nimport { enregistrerConnexion } from "./connexions.js";'
)
c = c.replace(
    "    await signInWithEmailAndPassword(auth, email, password);",
    "    const cred = await signInWithEmailAndPassword(auth, email, password);\n    enregistrerConnexion(cred.user, \"app\");"
)
with open("auth.js", "w", encoding="utf-8") as f:
    f.write(c)

with open("admin.js", "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace(
    '} from "./firebase-config.js";',
    '} from "./firebase-config.js";\nimport { enregistrerConnexion } from "./connexions.js";',
    1
)
c = c.replace(
    "collection, collectionGroup, query, where, onSnapshot, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, writeBatch",
    "collection, collectionGroup, query, where, orderBy, limit, onSnapshot, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, writeBatch"
)
c = c.replace(
    "    await signInWithEmailAndPassword(auth, email, password);",
    "    const cred = await signInWithEmailAndPassword(auth, email, password);\n    enregistrerConnexion(cred.user, \"admin\");"
)
c = c.replace(
    "    chargerGestionProduits();",
    "    chargerGestionProduits();\n    chargerConnexions();"
)

fonction = '''

async function chargerConnexions() {
  const connexionsTableBody = document.getElementById("connexionsTableBody");
  if (!connexionsTableBody) return;
  try {
    const q = query(collection(db, "connexions"), orderBy("dateConnexion", "desc"), limit(100));
    const snap = await getDocs(q);
    if (snap.empty) {
      connexionsTableBody.innerHTML = '<tr><td colspan="3" class="empty-msg">Aucune connexion enregistree.</td></tr>';
      return;
    }
    let html = "";
    snap.forEach((d) => {
      const data = d.data();
      const date = data.dateConnexion && data.dateConnexion.toDate ? data.dateConnexion.toDate() : null;
      const dateStr = date ? date.toLocaleString("fr-FR") : "\\u2014";
      const lieu = [data.ville, data.pays].filter(Boolean).join(", ") || "\\u2014";
      const contexte = data.contexte === "admin" ? " (admin)" : "";
      html += "<tr><td>" + escapeHtml(data.email || "inconnu") + contexte + "</td><td>" + dateStr + "</td><td>" + escapeHtml(lieu) + "</td></tr>";
    });
    connexionsTableBody.innerHTML = html;
  } catch (err) {
    console.error("Erreur chargement connexions:", err);
    connexionsTableBody.innerHTML = '<tr><td colspan="3" class="empty-msg">Erreur de chargement.</td></tr>';
  }
}
'''
c += fonction

with open("admin.js", "w", encoding="utf-8") as f:
    f.write(c)

with open("admin.html", "r", encoding="utf-8") as f:
    c = f.read()

section = '''      <h2 class="section-title" id="secConnexions">Historique des connexions</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Utilisateur</th><th>Date/Heure</th><th>Lieu</th></tr></thead>
          <tbody id="connexionsTableBody"><tr><td colspan="3" class="empty-msg">Chargement...</td></tr></tbody>
        </table>
      </div>
'''
old = '      <div id="rapportList" class="empty-msg">Chargement...</div>\n    </div>'
new = '      <div id="rapportList" class="empty-msg">Chargement...</div>\n' + section + '    </div>'
assert old in c, "ancre rapportList introuvable"
c = c.replace(old, new, 1)

c = c.replace(
    '<li><button class="side-menu-item" id="menuAdminRetourApp">',
    '<li><button class="side-menu-item" data-target="secConnexions">Historique des connexions</button></li>\n        <li><button class="side-menu-item" id="menuAdminRetourApp">'
)

c = c.replace(
    '<button class="bottom-nav-item" data-target="secVentes"><span class="bottom-nav-icon">',
    '<button class="bottom-nav-item" data-target="secConnexions"><span class="bottom-nav-icon">🔐</span><span>Connexions</span></button>\n    <button class="bottom-nav-item" data-target="secVentes"><span class="bottom-nav-icon">',
    1
)

with open("admin.html", "w", encoding="utf-8") as f:
    f.write(c)

print("Patch termine.")
