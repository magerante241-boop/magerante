import re

# ===== 1) inventaire.js : tuiles modernes pour le Propriétaire =====
with open("inventaire.js") as f:
    inv = f.read()

pattern_boutons = re.compile(
    r'const boutonsStockHtml = estProprietaire\s*\n\s*\? `.*?`\s*\n\s*: estGerant',
    re.S
)
matches = pattern_boutons.findall(inv)
assert len(matches) == 1, f"{len(matches)} correspondance(s) boutonsStockHtml, attendu 1"

nouveau_bloc = '''const boutonsStockHtml = estProprietaire
    ? `<div class="inv-stock-tiles">
         <button class="inv-stock-tile" id="invStockDepartBtn">
           <span class="inv-stock-tile-icone">📋</span>
           <span class="inv-stock-tile-label">Stock de départ</span>
         </button>
         <button class="inv-stock-tile" id="invDevisRestaurationBtn">
           <span class="inv-stock-tile-icone">🧾</span>
           <span class="inv-stock-tile-label">Devis de restauration</span>
         </button>
         <button class="inv-stock-tile inv-stock-tile-ajout" id="invAjoutStockBtnProprio">
           <span class="inv-stock-tile-icone">➕</span>
           <span class="inv-stock-tile-label">Augmenter le stock</span>
         </button>
       </div>`
    : estGerant'''

inv = pattern_boutons.sub(nouveau_bloc, inv, count=1)

# ===== 2) inventaire.js : bouton Imprimer dans la modale Devis de restauration =====
old_actions = '''      <div class="inv-modal-actions">
        <button class="inv-btn-secondary" id="devisRestaurationCancel">Fermer</button>
        <button class="inv-btn-primary" id="devisRestaurationConfirm">Confirmer la restauration</button>
      </div>'''
assert inv.count(old_actions) == 1, "bloc inv-modal-actions du devis non trouve"
new_actions = '''      <div class="inv-modal-actions">
        <button class="inv-btn-secondary" id="devisRestaurationCancel">Fermer</button>
        <button class="inv-btn-secondary" id="devisRestaurationPrint">🖨️ Imprimer</button>
        <button class="inv-btn-primary" id="devisRestaurationConfirm">Confirmer la restauration</button>
      </div>'''
inv = inv.replace(old_actions, new_actions)

old_vide = '''    listeEl.innerHTML = `<p class="inv-empty">Aucune restauration nécessaire, le stock est déjà au niveau de référence.</p>`;
    document.getElementById("devisRestaurationConfirm").disabled = true;
    return;'''
assert inv.count(old_vide) == 1, "bloc 'aucune restauration necessaire' non trouve"
new_vide = '''    listeEl.innerHTML = `<p class="inv-empty">Aucune restauration nécessaire, le stock est déjà au niveau de référence.</p>`;
    document.getElementById("devisRestaurationConfirm").disabled = true;
    document.getElementById("devisRestaurationPrint").disabled = true;
    return;'''
inv = inv.replace(old_vide, new_vide)

old_join = '''  listeEl.innerHTML = manquants.map((m) => `
    <div class="devis-restauration-ligne">
      <span class="devis-restauration-nom">${escapeHtml(m.nom)}</span>
      <span class="devis-restauration-detail">${m.stockActuel} / ${m.stockDepart} — <strong>+${m.manquant}</strong> à racheter</span>
    </div>
  `).join("");'''
assert inv.count(old_join) == 1, "bloc listeEl.innerHTML manquants non trouve"
new_join = old_join + '''

  document.getElementById("devisRestaurationPrint").addEventListener("click", () => {
    imprimerDevisRestauration(manquants);
  });'''
inv = inv.replace(old_join, new_join)

# Fonction d'impression, ajoutee juste avant openDevisRestaurationModal
old_fn_anchor = "async function openDevisRestaurationModal() {"
assert inv.count(old_fn_anchor) == 1
fonction_impression = '''function imprimerDevisRestauration(manquants) {
  const dateStr = new Date().toLocaleDateString("fr-FR");
  const nomEtab = (window.AuthState && window.AuthState.nomEtablissement) || "Établissement";
  const lignes = manquants.map((m) => `
    <tr><td>${escapeHtml(m.nom)}</td><td>${m.stockActuel}</td><td>${m.stockDepart}</td><td>+${m.manquant}</td></tr>
  `).join("");
  const fenetre = window.open("", "_blank");
  if (!fenetre) { alert("Autorise les pop-ups pour imprimer le devis."); return; }
  fenetre.document.write(`
    <html><head><title>Devis de restauration du stock</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; color:#222; }
      h1 { font-size: 18px; margin-bottom:4px; }
      p.meta { color:#555; margin-top:0; }
      table { width:100%; border-collapse: collapse; margin-top:14px; }
      th, td { border:1px solid #ccc; padding:6px 8px; text-align:left; font-size:13px; }
      th { background:#f0f0f0; }
    </style>
    </head><body>
    <h1>🧾 Devis de restauration du stock</h1>
    <p class="meta">${nomEtab} — ${dateStr}</p>
    <table>
      <thead><tr><th>Produit</th><th>Stock actuel</th><th>Stock de référence</th><th>À racheter</th></tr></thead>
      <tbody>${lignes}</tbody>
    </table>
    </body></html>
  `);
  fenetre.document.close();
  fenetre.focus();
  fenetre.print();
}

'''
inv = inv.replace(old_fn_anchor, fonction_impression + old_fn_anchor)

with open("inventaire.js", "w") as f:
    f.write(inv)

# ===== 3) CSS : styles des tuiles =====
css_file = "style.css"
with open(css_file) as f:
    css = f.read()

old_css_anchor = ".inv-stock-depart-btn:active { transform:scale(0.98); }"
assert css.count(old_css_anchor) == 1, "ancre CSS .inv-stock-depart-btn:active introuvable"

nouveau_css = old_css_anchor + """

.inv-stock-tiles { display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; margin-bottom:14px; }
.inv-stock-tile {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:6px; padding:14px 8px; border:none; border-radius:14px; cursor:pointer;
  background:linear-gradient(135deg, #2f7d5c, #1f5c42); color:#fff;
  box-shadow:0 3px 8px rgba(0,0,0,0.15); transition:transform 0.15s ease;
}
.inv-stock-tile:active { transform:scale(0.96); }
.inv-stock-tile-icone { font-size:26px; }
.inv-stock-tile-label { font-size:12px; font-weight:600; text-align:center; line-height:1.25; }
.inv-stock-tile-ajout { background:linear-gradient(135deg, #3f7fc4, #285a94); }
@media (max-width: 400px) {
  .inv-stock-tiles { grid-template-columns: 1fr 1fr; }
}
"""
css = css.replace(old_css_anchor, nouveau_css)

with open(css_file, "w") as f:
    f.write(css)

print("Tuiles + impression + CSS : patch applique avec succes")
