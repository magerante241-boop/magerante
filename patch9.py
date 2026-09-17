with open("cloture.js", "r", encoding="utf-8") as f:
    contenu = f.read()

ancien = '''      if (Object.keys(stockParMarque).length) {
        htmlResume += `<div class="cloture-section"><div class="cloture-section-title">Stock restant (inventaire enregistré)</div>${construireStockHtml(stockParMarque)}</div>`;
      }
      if (Object.keys(stockSessionParMarque).length) {
        htmlResume += `<div class="cloture-section"><div class="cloture-section-title">Stock de session (visiteur)</div>${construireStockHtml(stockSessionParMarque)}</div>`;
      }'''

nouveau = '''      const estCompteEnregistre = window.AuthState && (window.AuthState.accountType === "enregistre" || window.AuthState.accountType === "invite");
      if (estCompteEnregistre && Object.keys(stockParMarque).length) {
        htmlResume += `<div class="cloture-section"><div class="cloture-section-title">Stock restant</div>${construireStockHtml(stockParMarque)}</div>`;
      }
      if (!estCompteEnregistre && Object.keys(stockSessionParMarque).length) {
        htmlResume += `<div class="cloture-section"><div class="cloture-section-title">Stock restant</div>${construireStockHtml(stockSessionParMarque)}</div>`;
      }'''

nb = contenu.count(ancien)
assert nb == 1, f"Trouve {nb} occurrence(s) au lieu de 1"
contenu = contenu.replace(ancien, nouveau, 1)

with open("cloture.js", "w", encoding="utf-8") as f:
    f.write(contenu)

print("Patch applique : affichage du stock conditionne au type de compte")
