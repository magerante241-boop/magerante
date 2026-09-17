with open("ventes.js", "r", encoding="utf-8") as f:
    contenu = f.read()

variantes = [
    '      creerNotification({ type: "vente", titre: "Nouvelle vente (facture)", message: `${quantite} x ${produitNom} — ${montant.toLocaleString("fr-FR")} FCFA${auteurNom ? " par " + auteurNom : ""}.`, cible: "factures" });\n',
    '    creerNotification({ type: "vente", titre: "Nouvelle vente (facture)", message: `${quantite} x ${produitNom} — ${montant.toLocaleString("fr-FR")} FCFA${auteurNom ? " par " + auteurNom : ""}.`, cible: "factures" });\n',
]

total = 0
for v in variantes:
    nb = contenu.count(v)
    contenu = contenu.replace(v, "", 1) if nb >= 1 else contenu
    total += min(nb, 1)

assert total == 2, f"Seulement {total} occurrence(s) supprimee(s) au lieu de 2"

with open("ventes.js", "w", encoding="utf-8") as f:
    f.write(contenu)

print(f"{total} notification(s) par ligne supprimee(s) de ventes.js")
