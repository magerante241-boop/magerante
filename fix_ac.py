with open("app.js", "r", encoding="utf-8") as f:
    content = f.read()

old4 = '''  if (key === "AC") {
    calcExpr = "";
  } else if (key === "\u232b") {'''
new4 = '''  if (key === "AC") {
    calcExpr = "";
    totalCumule = 0;
    derniereLigneTexte = "";
  } else if (key === "\u232b") {'''
assert content.count(old4) == 1, f"bloc AC inattendu: {content.count(old4)}"
content = content.replace(old4, new4)

with open("app.js", "w", encoding="utf-8") as f:
    f.write(content)

print("OK : bloc AC appliqué")
