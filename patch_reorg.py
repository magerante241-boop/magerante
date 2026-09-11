with open("admin.html", "r", encoding="utf-8") as f:
    c = f.read()

# 1. Style des nouvelles tuiles d'accès rapide
style_ajout = """
.quick-access-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 16px 0 20px;
}
.quick-tile {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 14px 6px;
}
.quick-tile .quick-tile-icon { font-size: 24px; }
.quick-tile .quick-tile-label { font-size: 11.5px; font-weight: 700; color: var(--text); text-align: center; }
"""
assert ".stat-card[data-target]:active {" in c, "ancre CSS introuvable"
c = c.replace(
    ".stat-card[data-target]:active {\n  transform: scale(0.96);\n  box-shadow: 0 1px 3px rgba(0,0,0,0.12);\n}",
    ".stat-card[data-target]:active {\n  transform: scale(0.96);\n  box-shadow: 0 1px 3px rgba(0,0,0,0.12);\n}\n" + style_ajout
)

# 2. Grille de tuiles d'acces rapide, inseree juste avant les KPI existants
tuiles = '''      <div class="quick-access-grid">
        <div class="stat-card quick-tile" data-target="secVentes">
          <span class="quick-tile-icon">🧾</span><span class="quick-tile-label">Ventes</span>
        </div>
        <div class="stat-card quick-tile" data-target="secComptesAttente">
          <span class="quick-tile-icon">👥</span><span class="quick-tile-label">Comptes</span>
        </div>
        <div class="stat-card quick-tile" data-target="secGestionProduits">
          <span class="quick-tile-icon">🛠️</span><span class="quick-tile-label">Produits</span>
        </div>
        <div class="stat-card quick-tile" data-target="secCA">
          <span class="quick-tile-icon">💰</span><span class="quick-tile-label">Chiffre d'affaires</span>
        </div>
        <div class="stat-card quick-tile" data-target="secZones">
          <span class="quick-tile-icon">📍</span><span class="quick-tile-label">Zones</span>
        </div>
        <div class="stat-card quick-tile" data-target="secConnexions">
          <span class="quick-tile-icon">🔐</span><span class="quick-tile-label">Connexions</span>
        </div>
      </div>
'''
old = '    <div id="adminPanel" hidden>\n      <div class="stats-grid">'
assert old in c, "ancre adminPanel introuvable"
c = c.replace(old, '    <div id="adminPanel" hidden>\n' + tuiles + '      <div class="stats-grid">', 1)

# 3. Reordonner le menu lateral (priorite : Ventes, Comptes, Produits, Inventaire, CA, Zones, Connexions)
old_menu = '''      <ul class="side-menu-list">
        <li><button class="side-menu-item" data-target="secComptesAttente">👥 Comptes proprietaires</button></li>
        <li><button class="side-menu-item" data-target="secCA">💰 Chiffre d'affaires</button></li>
        <li><button class="side-menu-item" data-target="secZones">📍 Établissements par zone</button></li>
        <li><button class="side-menu-item" data-target="secImport">📦 Inventaire global</button></li>
        <li><button class="side-menu-item" data-target="secGestionProduits">🛠️ Gestion des produits</button></li>
        <li><button class="side-menu-item" data-target="secVentes">🧾 Dernieres ventes</button></li>
        <li><button class="side-menu-item" data-target="secConnexions">Historique des connexions</button></li>
        <li><button class="side-menu-item" id="menuAdminRetourApp">🏠 Retour a l'application</button></li>
      </ul>'''
new_menu = '''      <ul class="side-menu-list">
        <li><button class="side-menu-item" data-target="secVentes">🧾 Dernieres ventes</button></li>
        <li><button class="side-menu-item" data-target="secComptesAttente">👥 Comptes proprietaires</button></li>
        <li><button class="side-menu-item" data-target="secGestionProduits">🛠️ Gestion des produits</button></li>
        <li><button class="side-menu-item" data-target="secImport">📦 Inventaire global</button></li>
        <li><button class="side-menu-item" data-target="secCA">💰 Chiffre d'affaires</button></li>
        <li><button class="side-menu-item" data-target="secZones">📍 Établissements par zone</button></li>
        <li><button class="side-menu-item" data-target="secConnexions">🔐 Historique des connexions</button></li>
        <li><button class="side-menu-item" id="menuAdminRetourApp">🏠 Retour a l'application</button></li>
      </ul>'''
assert old_menu in c, "ancre menu lateral introuvable"
c = c.replace(old_menu, new_menu, 1)

# 4. Reordonner la nav du bas (meme priorite)
old_nav = '''  <nav id="adminBottomNav" class="bottom-nav" hidden>
    <button class="bottom-nav-item" data-target="secComptesAttente"><span class="bottom-nav-icon">👥</span><span>Comptes</span></button>
    <button class="bottom-nav-item" data-target="secCA"><span class="bottom-nav-icon">💰</span><span>CA</span></button>
    <button class="bottom-nav-item" data-target="secZones"><span class="bottom-nav-icon">📍</span><span>Zones</span></button>
    <button class="bottom-nav-item" data-target="secConnexions"><span class="bottom-nav-icon">🔐</span><span>Connexions</span></button>
    <button class="bottom-nav-item" data-target="secGestionProduits"><span class="bottom-nav-icon">🛠️</span><span>Produits</span></button>
    <button class="bottom-nav-item" data-target="secVentes"><span class="bottom-nav-icon">🧾</span><span>Ventes</span></button>
  </nav>'''
new_nav = '''  <nav id="adminBottomNav" class="bottom-nav" hidden>
    <button class="bottom-nav-item" data-target="secVentes"><span class="bottom-nav-icon">🧾</span><span>Ventes</span></button>
    <button class="bottom-nav-item" data-target="secComptesAttente"><span class="bottom-nav-icon">👥</span><span>Comptes</span></button>
    <button class="bottom-nav-item" data-target="secGestionProduits"><span class="bottom-nav-icon">🛠️</span><span>Produits</span></button>
    <button class="bottom-nav-item" data-target="secCA"><span class="bottom-nav-icon">💰</span><span>CA</span></button>
    <button class="bottom-nav-item" data-target="secZones"><span class="bottom-nav-icon">📍</span><span>Zones</span></button>
    <button class="bottom-nav-item" data-target="secConnexions"><span class="bottom-nav-icon">🔐</span><span>Connexions</span></button>
  </nav>'''
assert old_nav in c, "ancre nav du bas introuvable"
c = c.replace(old_nav, new_nav, 1)

with open("admin.html", "w", encoding="utf-8") as f:
    f.write(c)

print("Reorganisation terminee.")
