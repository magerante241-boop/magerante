with open("admin.html", "r", encoding="utf-8") as f:
    c = f.read()

old_nav = '''  <nav id="adminBottomNav" class="bottom-nav" hidden>
    <button class="bottom-nav-item" data-target="secComptesAttente"><span class="bottom-nav-icon">👥</span><span>Comptes</span></button>
    <button class="bottom-nav-item" data-target="secCA"><span class="bottom-nav-icon">💰</span><span>CA</span></button>
    <button class="bottom-nav-item" data-target="secZones"><span class="bottom-nav-icon">📍</span><span>Zones</span></button>
    <button class="bottom-nav-item" data-target="secGestionProduits"><span class="bottom-nav-icon">🛠️</span><span>Produits</span></button>
    <button class="bottom-nav-item" data-target="secConnexions"><span class="bottom-nav-icon">🔐</span><span>Connexions</span></button>
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
assert old_nav in c, "ancre nav du bas introuvable (2e essai)"
c = c.replace(old_nav, new_nav, 1)

with open("admin.html", "w", encoding="utf-8") as f:
    f.write(c)

print("Reorganisation terminee.")
