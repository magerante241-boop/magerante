import re

# --- admin.html : ajout des deux canvas dans la zone vide ---
with open("admin.html", "r", encoding="utf-8") as f:
    html = f.read()

old_html = """      <h2 class="section-title">Inventaire global</h2>
      <div class="stats-grid">
        <div class="stat-card" data-target="secImport">
          <div class="icon">📦</div>
          <div class="value" id="statTotalProduits">—</div>
          <div class="label">Produits references (tous etablissements)</div>
        </div>
        <div class="stat-card" data-target="secImport">
          <div class="icon">💵</div>
          <div class="value" id="statValeurStock">—</div>
          <div class="label">Valeur totale du stock estimee</div>
        </div>
      </div>

      <section class="admin-import" id="secImport">"""

new_html = """      <h2 class="section-title">Inventaire global</h2>
      <div class="stats-grid">
        <div class="stat-card" data-target="secImport">
          <div class="icon">📦</div>
          <div class="value" id="statTotalProduits">—</div>
          <div class="label">Produits references (tous etablissements)</div>
        </div>
        <div class="stat-card" data-target="secImport">
          <div class="icon">💵</div>
          <div class="value" id="statValeurStock">—</div>
          <div class="label">Valeur totale du stock estimee</div>
        </div>
      </div>

      <p style="font-size:13px;color:var(--muted);margin:4px 0;">Repartition du stock par categorie</p>
      <div class="table-wrap">
        <canvas id="stockCategorieChart" height="220"></canvas>
      </div>
      <p style="font-size:13px;color:var(--muted);margin:16px 0 4px;">Top 8 produits par valeur de stock</p>
      <div class="table-wrap">
        <canvas id="stockTopProduitsChart" height="260"></canvas>
      </div>

      <section class="admin-import" id="secImport">"""

assert old_html in html, "ancre HTML inventaire introuvable"
html = html.replace(old_html, new_html, 1)

with open("admin.html", "w", encoding="utf-8") as f:
    f.write(html)

# --- admin.js : ajout du rendu des graphiques + suppression de la requete en double ---
with open("admin.js", "r", encoding="utf-8") as f:
    js = f.read()

# 1. Retire l'appel a l'ancienne fonction dans onAuthStateChanged
old_call = "    chargerInventaireGlobal();\n    chargerGestionProduits();"
new_call = "    chargerGestionProduits();"
assert old_call in js, "ancre appel onAuthStateChanged introuvable"
js = js.replace(old_call, new_call, 1)

# 2. Supprime l'ancienne fonction chargerInventaireGlobal (requete en double)
pattern = re.compile(
    r"async function chargerInventaireGlobal\(\) \{.*?\n\}\n\n// --- Import catalogue CSV",
    re.DOTALL
)
nouvelle_fonction = '''function renderInventaireGlobal(produits) {
  let valeurTotale = 0;
  const parCategorie = {};
  produits.forEach((p) => {
    const prix = Number(p.prixVente || p.prixAchat || p.prix || 0);
    const qte = Number(p.stock || p.quantite || 0);
    valeurTotale += prix * qte;
    const cat = p.categorie || "Sans categorie";
    parCategorie[cat] = (parCategorie[cat] || 0) + qte;
  });
  document.getElementById("statTotalProduits").textContent = produits.length;
  document.getElementById("statValeurStock").textContent = valeurTotale.toLocaleString("fr-FR") + " FCFA";

  const ctxCat = document.getElementById("stockCategorieChart");
  if (ctxCat) {
    if (window._stockCategorieChart) window._stockCategorieChart.destroy();
    const labels = Object.keys(parCategorie);
    window._stockCategorieChart = new Chart(ctxCat, {
      type: "pie",
      data: {
        labels,
        datasets: [{
          data: labels.map((l) => parCategorie[l]),
          backgroundColor: ["#2a78d6","#eb6834","#1baf7a","#eda100","#e87ba4","#008300","#6250d6","#e34948"]
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const top8 = [...produits]
    .map((p) => ({
      nom: p.nom || "?",
      valeur: Number(p.prixVente || p.prixAchat || p.prix || 0) * Number(p.stock || p.quantite || 0)
    }))
    .sort((a, b) => b.valeur - a.valeur)
    .slice(0, 8);
  const ctxTop = document.getElementById("stockTopProduitsChart");
  if (ctxTop) {
    if (window._stockTopProduitsChart) window._stockTopProduitsChart.destroy();
    window._stockTopProduitsChart = new Chart(ctxTop, {
      type: "bar",
      data: {
        labels: top8.map((p) => p.nom),
        datasets: [{ data: top8.map((p) => p.valeur), backgroundColor: "#2a78d6" }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { callback: (v) => Number(v).toLocaleString("fr-FR") } } }
      }
    });
  }
}

// --- Import catalogue CSV'''

js, n = pattern.subn(nouvelle_fonction, js, count=1)
assert n == 1, "ancienne fonction chargerInventaireGlobal introuvable ou pattern ne correspond pas"

# 3. Appelle le rendu des graphiques juste apres la construction du cache produits
old_cache = """    _cacheProduitsGestion = prodSnap.docs.map((d) => ({
      ref: d.ref,
      id: d.id,
      estId: d.ref.parent.parent.id,
      ...d.data(),
    }));
    rendreTableauGestionProduits();"""
new_cache = """    _cacheProduitsGestion = prodSnap.docs.map((d) => ({
      ref: d.ref,
      id: d.id,
      estId: d.ref.parent.parent.id,
      ...d.data(),
    }));
    rendreTableauGestionProduits();
    renderInventaireGlobal(_cacheProduitsGestion);"""
assert old_cache in js, "ancre cache produits introuvable"
js = js.replace(old_cache, new_cache, 1)

with open("admin.js", "w", encoding="utf-8") as f:
    f.write(js)

print("Patch charts inventaire termine.")
