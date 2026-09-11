with open("admin.html", "r", encoding="utf-8") as f:
    c = f.read()

old = '''<div class="stat-card" data-target="secCA">
          <div class="icon">🏢</div>
          <div class="value" id="statEtablissements">—</div>
          <div class="label">Etablissements</div>
        </div>'''

new = '''<div class="stat-card" data-target="secZones">
          <div class="icon">🏢</div>
          <div class="value" id="statEtablissements">—</div>
          <div class="label">Etablissements</div>
        </div>'''

assert old in c, "ancre statEtablissements introuvable"
c = c.replace(old, new, 1)

with open("admin.html", "w", encoding="utf-8") as f:
    f.write(c)

print("Patch cible carte Etablissements corrige (secZones).")
