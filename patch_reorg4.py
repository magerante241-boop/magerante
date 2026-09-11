with open("admin.html", "r", encoding="utf-8") as f:
    c = f.read()

# 1. Tuiles : hauteur uniforme
old_css = """.quick-tile {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 14px 6px;
}"""
new_css = """.quick-tile {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 14px 6px; min-height: 76px; box-sizing: border-box;
}"""
assert old_css in c, "ancre CSS quick-tile introuvable"
c = c.replace(old_css, new_css, 1)

# 2. Marqueur Accueil sur la grille de tuiles (cible de scroll "tableau de bord")
old_grid = '<div class="quick-access-grid">'
assert c.count(old_grid) == 1, "ancre quick-access-grid introuvable ou dupliquee"
c = c.replace(old_grid, '<div class="quick-access-grid" id="secAccueil">', 1)

# 3. Ajout de l'onglet Accueil en tete du menu lateral
old_menu_item = '<li><button class="side-menu-item" data-target="secVentes">🧾 Dernieres ventes</button></li>'
assert c.count(old_menu_item) == 1
c = c.replace(
    old_menu_item,
    '<li><button class="side-menu-item" data-target="secAccueil">🏠 Tableau de bord</button></li>\n        ' + old_menu_item,
    1
)

# 4. Ajout de l'onglet Accueil en tete de la nav du bas
old_nav_item = '<button class="bottom-nav-item" data-target="secVentes"><span class="bottom-nav-icon">🧾</span><span>Ventes</span></button>'
assert c.count(old_nav_item) == 1
c = c.replace(
    old_nav_item,
    '<button class="bottom-nav-item" data-target="secAccueil"><span class="bottom-nav-icon">🏠</span><span>Accueil</span></button>\n    ' + old_nav_item,
    1
)

# 5. Fermer par defaut les 2 details existants
avant = c.count('<details class="collapsible-section" open>')
c = c.replace('<details class="collapsible-section" open>', '<details class="collapsible-section">')
print("details fermes:", avant)

# 6. Compter proprietaires en attente -> details replie
old = '''<h2 class="section-title" id="secComptesAttente">Comptes proprietaires en attente de validation</h2>
      <div id="pendingList" class="empty-msg">Chargement...</div>'''
new = '''<details class="collapsible-section">
        <summary class="section-title" id="secComptesAttente">Comptes proprietaires en attente de validation</summary>
        <div id="pendingList" class="empty-msg">Chargement...</div>
      </details>'''
assert old in c, "ancre comptesAttente introuvable"
c = c.replace(old, new, 1)

# 7. Zones -> details replie
old = '''<h2 class="section-title" id="secZones">Établissements par zone / quartier</h2>
      <select id="filtreZone" class="filtre-select"><option value="">Toutes les zones</option></select>
      <div id="listeZones"></div>'''
new = '''<details class="collapsible-section">
        <summary class="section-title" id="secZones">Établissements par zone / quartier</summary>
        <select id="filtreZone" class="filtre-select"><option value="">Toutes les zones</option></select>
        <div id="listeZones"></div>
      </details>'''
assert old in c, "ancre zones introuvable"
c = c.replace(old, new, 1)

# 8. Gestion des produits -> details replie
old = '''<h2 class="section-title" id="secGestionProduits">Gestion des produits (tous etablissements)</h2>
      <select id="filtreEtablissementProduits" class="filtre-select">
        <option value="tous">Tous les etablissements</option>
      </select>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Etablissement</th><th>Nom</th><th>Categorie</th><th>Prix vente</th><th>Stock</th><th></th></tr></thead>
          <tbody id="produitsGestionTableBody"><tr><td colspan="6" class="empty-msg">Chargement...</td></tr></tbody>
        </table>
      </div>'''
new = '''<details class="collapsible-section">
        <summary class="section-title" id="secGestionProduits">Gestion des produits (tous etablissements)</summary>
        <select id="filtreEtablissementProduits" class="filtre-select">
          <option value="tous">Tous les etablissements</option>
        </select>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Etablissement</th><th>Nom</th><th>Categorie</th><th>Prix vente</th><th>Stock</th><th></th></tr></thead>
            <tbody id="produitsGestionTableBody"><tr><td colspan="6" class="empty-msg">Chargement...</td></tr></tbody>
          </table>
        </div>
      </details>'''
assert old in c, "ancre gestionProduits introuvable"
c = c.replace(old, new, 1)

# 9. Dernieres ventes -> details replie
old = '''<h2 class="section-title" id="secVentes">Dernieres ventes (toutes etablissements)</h2>
      <div id="rapportList" class="empty-msg">Chargement...</div>'''
new = '''<details class="collapsible-section">
        <summary class="section-title" id="secVentes">Dernieres ventes (toutes etablissements)</summary>
        <div id="rapportList" class="empty-msg">Chargement...</div>
      </details>'''
assert old in c, "ancre ventes introuvable"
c = c.replace(old, new, 1)

# 10. Connexions -> details replie
old = '''<h2 class="section-title" id="secConnexions">Historique des connexions</h2>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Utilisateur</th><th>Date/Heure</th><th>Lieu</th></tr></thead>
          <tbody id="connexionsTableBody"><tr><td colspan="3" class="empty-msg">Chargement...</td></tr></tbody>
        </table>
      </div>'''
new = '''<details class="collapsible-section">
        <summary class="section-title" id="secConnexions">Historique des connexions</summary>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Utilisateur</th><th>Date/Heure</th><th>Lieu</th></tr></thead>
            <tbody id="connexionsTableBody"><tr><td colspan="3" class="empty-msg">Chargement...</td></tr></tbody>
          </table>
        </div>
      </details>'''
assert old in c, "ancre connexions introuvable"
c = c.replace(old, new, 1)

with open("admin.html", "w", encoding="utf-8") as f:
    f.write(c)

print("Patch admin.html termine.")
