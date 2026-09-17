with open("app.js") as f:
    app = f.read()

ancien = '<span class="calc-produit-prix">${p.prixVente} FCFA</span>'
assert app.count(ancien) == 2, f"{app.count(ancien)} occurrence(s), attendu 2"

nouveau = '<span class="calc-produit-prix">${p.prixVente != null ? p.prixVente.toLocaleString("fr-FR") + " FCFA" : "Pas défini"}</span>'
app = app.replace(ancien, nouveau)

with open("app.js", "w") as f:
    f.write(app)

print("Patch prix Pas defini : applique avec succes")
