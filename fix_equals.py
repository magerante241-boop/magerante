with open("app.js", "r", encoding="utf-8") as f:
    content = f.read()

old = '''  } else if (key === "=") {
    // Le calcul est déjà recalculé en direct dans renderCalc()
  } else {'''

new = '''  } else if (key === "=") {
    if (calcExpr.trim() !== "") {
      let valeur = 0;
      try {
        const safeExpr = calcExpr
          .replace(/\\u00d7/g, "*")
          .replace(/\\u00f7/g, "/")
          .replace(/,/g, ".");
        valeur = Function(`"use strict"; return (${safeExpr})`)();
      } catch {
        valeur = 0;
      }
      if (isFinite(valeur)) totalCumule += valeur;
      derniereLigneTexte = calcExpr;
      calcExpr = "";
    }
  } else {'''

assert content.count(old) == 1, f"bloc '=' inattendu: {content.count(old)}"
content = content.replace(old, new)
with open("app.js", "w", encoding="utf-8") as f:
    f.write(content)
print("Touche = corrigée")
