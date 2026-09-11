import re

# ============ 1. admin.html : CSS summary.section-title + structure onglets ============
with open("admin.html", "r", encoding="utf-8") as f:
    html = f.read()

old_css = "h2.section-title { font-size: 17px; margin: 24px 0 10px; color: var(--primary-dark); font-weight: 700; }"
new_css = """h2.section-title { font-size: 17px; margin: 24px 0 10px; color: var(--primary-dark); font-weight: 700; }
.collapsible-section summary.section-title { color: var(--primary-dark); font-weight: 700; }
.admin-tab-hidden { display: none !important; }
.admin-tab-back { display: none; align-items: center; gap: 6px; background: none; border: none; color: var(--primary-dark); font-weight: 700; font-size: 15px; margin: 8px 0 4px; cursor: pointer; padding: 4px 0; }
.admin-tab-back.show { display: flex; }"""

assert old_css in html, "ancre CSS h2.section-title introuvable"
html = html.replace(old_css, new_css, 1)

old_back_anchor = '<div class="quick-access-grid" id="secAccueil">'
new_back_anchor = '<button class="admin-tab-back" id="btnAdminTabBack"><span>&larr;</span> Retour a l\'accueil</button>\n      <div class="quick-access-grid" id="secAccueil">'
assert old_back_anchor in html, "ancre bouton retour introuvable"
html = html.replace(old_back_anchor, new_back_anchor, 1)

with open("admin.html", "w", encoding="utf-8") as f:
    f.write(html)

# ============ 2. admin.js : logique onglets plein ecran + graphiques vides ============
with open("admin.js", "r", encoding="utf-8") as f:
    js = f.read()

old_nav = '''  document.querySelectorAll("#adminSideMenu [data-target], #adminBottomNav [data-target]").forEach((btn) => {'''
assert old_nav in js, "ancre boucle nav introuvable"

nav_block_old = re.search(
    r'document\.querySelectorAll\("#adminSideMenu \[data-target\], #adminBottomNav \[data-target\]"\)\.forEach\(\(btn\) => \{.*?\n  \}\);',
    js, re.DOTALL
)
assert nav_block_old, "bloc complet nav introuvable"

nav_block_new = '''const TOUTES_SECTIONS_ADMIN = ["secAccueil","secCourbeCA","secComptesAttente","secCA","secZones","secImport","secGestionProduits","secVentes","secConnexions"];

function afficherOngletAdmin(idCible) {
  TOUTES_SECTIONS_ADMIN.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const conteneur = el.closest("details") || el;
    if (id === idCible || id === "secAccueil" && idCible === "secAccueil") {
      conteneur.classList.remove("admin-tab-hidden");
      if (conteneur.tagName === "DETAILS") conteneur.open = true;
    } else {
      conteneur.classList.add("admin-tab-hidden");
    }
  });
  const backBtn = document.getElementById("btnAdminTabBack");
  if (backBtn) backBtn.classList.toggle("show", idCible !== "secAccueil");
  window.scrollTo({ top: 0, behavior: "instant" });
}

document.querySelectorAll("#adminSideMenu [data-target], #adminBottomNav [data-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      afficherOngletAdmin(btn.dataset.target);
    });
  });

const btnAdminTabBack = document.getElementById("btnAdminTabBack");
if (btnAdminTabBack) {
  btnAdminTabBack.addEventListener("click", () => afficherOngletAdmin("secAccueil"));
}'''

js = js[:nav_block_old.start()] + nav_block_new + js[nav_block_old.end():]

old_stat_click = '''document.querySelectorAll(".stat-card[data-target]").forEach((card) => {
  card.addEventListener("click", () => {
    const cible = document.getElementById(card.dataset.target);
    if (cible) cible.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});'''
new_stat_click = '''document.querySelectorAll(".stat-card[data-target], .quick-tile[data-target]").forEach((card) => {
  card.addEventListener("click", () => {
    if (typeof afficherOngletAdmin === "function") afficherOngletAdmin(card.dataset.target);
  });
});'''
assert old_stat_click in js, "ancre clic stat-card introuvable"
js = js.replace(old_stat_click, new_stat_click, 1)

old_render_empty = '''  const ctxCat = document.getElementById("stockCategorieChart");
  if (ctxCat) {
    if (window._stockCategorieChart) window._stockCategorieChart.destroy();
    const labels = Object.keys(parCategorie);
    window._stockCategorieChart = new Chart(ctxCat, {'''
new_render_empty = '''  const ctxCat = document.getElementById("stockCategorieChart");
  if (ctxCat) {
    if (window._stockCategorieChart) window._stockCategorieChart.destroy();
    const labels = Object.keys(parCategorie);
    if (!labels.length) {
      const octx = ctxCat.getContext("2d");
      octx.clearRect(0, 0, ctxCat.width, ctxCat.height);
      octx.font = "13px sans-serif";
      octx.fillStyle = "#8c8271";
      octx.textAlign = "center";
      octx.fillText("Aucune donnee pour l'instant", ctxCat.width / 2, ctxCat.height / 2);
      return;
    }
    window._stockCategorieChart = new Chart(ctxCat, {'''
assert old_render_empty in js, "ancre rendu camembert introuvable"
js = js.replace(old_render_empty, new_render_empty, 1)

old_top8_empty = '''  const ctxTop = document.getElementById("stockTopProduitsChart");
  if (ctxTop) {
    if (window._stockTopProduitsChart) window._stockTopProduitsChart.destroy();
    window._stockTopProduitsChart = new Chart(ctxTop, {'''
new_top8_empty = '''  const ctxTop = document.getElementById("stockTopProduitsChart");
  if (ctxTop) {
    if (window._stockTopProduitsChart) window._stockTopProduitsChart.destroy();
    if (!top8.length) {
      const octx2 = ctxTop.getContext("2d");
      octx2.clearRect(0, 0, ctxTop.width, ctxTop.height);
      octx2.font = "13px sans-serif";
      octx2.fillStyle = "#8c8271";
      octx2.textAlign = "center";
      octx2.fillText("Aucune donnee pour l'instant", ctxTop.width / 2, ctxTop.height / 2);
      return;
    }
    window._stockTopProduitsChart = new Chart(ctxTop, {'''
assert old_top8_empty in js, "ancre rendu top8 introuvable"
js = js.replace(old_top8_empty, new_top8_empty, 1)

with open("admin.js", "w", encoding="utf-8") as f:
    f.write(js)

# ============ 3. app.js : controle stock a la saisie (facturier) ============
with open("app.js", "r", encoding="utf-8") as f:
    appjs = f.read()

old_ajout = '''function ajouterLigneFacture(p) {
  if (!p || !p.id) {
    alert("Ce produit n'est pas configuré correctement (id manquant).");
    return;
  }
  const quantite = calcValeurNumerique > 0 ? calcValeurNumerique : 1;
  const prixUnitaire = Number(p.prixVente) || 0;
  const ligneExistante = lignesFacture.find(l => l.produitId === p.id);'''
new_ajout = '''function afficherToastFacture(message) {
  let toast = document.getElementById("factureToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "factureToast";
    toast.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#a3342b;color:#fdfaf3;padding:10px 16px;border-radius:10px;font-size:13px;z-index:999;max-width:85vw;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,0.25);";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = "1";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = "0"; }, 2500);
}

function ajouterLigneFacture(p) {
  if (!p || !p.id) {
    alert("Ce produit n'est pas configuré correctement (id manquant).");
    return;
  }
  const quantite = calcValeurNumerique > 0 ? calcValeurNumerique : 1;
  const stockDisponible = Number(p.stock || 0);
  const ligneExistanteAvant = lignesFacture.find(l => l.produitId === p.id);
  const quantiteDejaPrevue = ligneExistanteAvant ? ligneExistanteAvant.quantite : 0;
  if (quantiteDejaPrevue + quantite > stockDisponible) {
    afficherToastFacture("Stock insuffisant pour " + (p.nom || "ce produit") + " (" + stockDisponible + " disponible).");
    calcExpr = "";
    renderCalc();
    return;
  }
  const prixUnitaire = Number(p.prixVente) || 0;
  const ligneExistante = lignesFacture.find(l => l.produitId === p.id);'''
assert old_ajout in appjs, "ancre ajouterLigneFacture introuvable"
appjs = appjs.replace(old_ajout, new_ajout, 1)

with open("app.js", "w", encoding="utf-8") as f:
    f.write(appjs)

print("Patch multi-corrections termine.")
