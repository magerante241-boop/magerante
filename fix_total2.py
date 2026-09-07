with open("app.js", "r", encoding="utf-8") as f:
    content = f.read()

old1 = '''// --- Calculatrice de gestion (logique de base) ---
let calcExpr = "";'''
new1 = '''// --- Calculatrice de gestion (logique de base) ---
let calcExpr = "";
let totalCumule = 0;
let derniereLigneTexte = "";'''
assert content.count(old1) == 1, f"bloc 1 inattendu: {content.count(old1)}"
content = content.replace(old1, new1)
with open("app.js", "w", encoding="utf-8") as f:
    f.write(content)
print("bloc 1 OK")

old2 = '''function appliquerPrixMarque(prix) {
  const q = calcExpr.trim();
  const estQuantiteValide = q !== "" && /^[0-9]+([.,][0-9]+)?$/.test(q) && Number(q.replace(",", ".")) > 0;
  calcExpr = estQuantiteValide ? (q + "\u00d7" + prix) : String(prix);
}'''
new2 = '''function appliquerPrixMarque(prix) {
  const q = calcExpr.trim();
  const estQuantiteValide = q !== "" && /^[0-9]+([.,][0-9]+)?$/.test(q) && Number(q.replace(",", ".")) > 0;
  const expr = estQuantiteValide ? (q + "\u00d7" + prix) : String(prix);
  let valeur = 0;
  try {
    const safeExpr = expr.replace(/\u00d7/g, "*").replace(/,/g, ".");
    valeur = Function(`"use strict"; return (${safeExpr})`)();
  } catch {
    valeur = 0;
  }
  if (isFinite(valeur)) totalCumule += valeur;
  derniereLigneTexte = expr;
  calcExpr = "";
}'''
assert content.count(old2) == 1, f"bloc 2 inattendu: {content.count(old2)}"
content = content.replace(old2, new2)
with open("app.js", "w", encoding="utf-8") as f:
    f.write(content)
print("bloc 2 OK")

old3 = '''function renderCalc() {
  exprEl.textContent = calcExpr || "\\u00A0";
  try {
    const safeExpr = calcExpr
      .replace(/\u00d7/g, "*")
      .replace(/\u00f7/g, "/")
      .replace(/,/g, ".");
    // eslint-disable-next-line no-new-func
    const value = safeExpr.trim() === "" ? 0 : Function(`"use strict"; return (${safeExpr})`)();
    calcValeurNumerique = isFinite(value) ? value : 0;
    if (isFinite(value)) {
      resultValueEl.textContent = value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
      resultUnitEl.hidden = false;
    } else {
      resultValueEl.textContent = "Erreur";
      resultUnitEl.hidden = true;
    }
  } catch {
    resultValueEl.textContent = "\u2026";
    resultUnitEl.hidden = true;
  }
  ajusterTailleResultat();
  updateCoins();
}'''
new3 = '''function renderCalc() {
  exprEl.textContent = calcExpr || derniereLigneTexte || "\\u00A0";
  try {
    const safeExpr = calcExpr
      .replace(/\u00d7/g, "*")
      .replace(/\u00f7/g, "/")
      .replace(/,/g, ".");
    // eslint-disable-next-line no-new-func
    const value = safeExpr.trim() === "" ? 0 : Function(`"use strict"; return (${safeExpr})`)();
    calcValeurNumerique = isFinite(value) ? value : 0;
  } catch {
    calcValeurNumerique = 0;
  }
  resultValueEl.textContent = totalCumule.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  resultUnitEl.hidden = false;
  ajusterTailleResultat();
  updateCoins();
}'''
assert content.count(old3) == 1, f"bloc 3 inattendu: {content.count(old3)}"
content = content.replace(old3, new3)
with open("app.js", "w", encoding="utf-8") as f:
    f.write(content)
print("bloc 3 OK — tous les blocs restants appliqués")
