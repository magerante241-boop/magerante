with open("dashboard.js", "r", encoding="utf-8") as f:
    js = f.read()

old_line = '''  const labels = Object.keys(parJour).sort().slice(-14);
  const data = labels.map((k) => parJour[k]);
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Ventes (FCFA)", data, borderColor: "#22c55e", tension: 0.3 }] },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });'''
new_line = '''  let labels = Object.keys(parJour).sort().slice(-14);
  let data = labels.map((k) => parJour[k]);
  if (!labels.length) {
    labels = Array.from({ length: 14 }, (_, i) => "J-" + (13 - i));
    data = labels.map(() => 0);
  }
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Ventes (FCFA)", data, borderColor: "#22c55e", tension: 0.3 }] },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });'''
assert old_line in js, "ancre chart ligne introuvable"
js = js.replace(old_line, new_line, 1)

old_cat = '''  const labelsCategorie = Object.keys(donneesMois.parCategorie);
  const dataCategorie = labelsCategorie.map((k) => donneesMois.parCategorie[k]);
  if (chartCategorie) chartCategorie.destroy();
  chartCategorie = new Chart(ctxCategorie, {
    type: "pie",
    data: { labels: labelsCategorie, datasets: [{ data: dataCategorie, backgroundColor: ["#22c55e", "#f2c94c", "#4a90d9", "#e5484d", "#9b59b6", "#f39c12"] }] },
    options: { responsive: true },
  });'''
new_cat = '''  let labelsCategorie = Object.keys(donneesMois.parCategorie);
  let dataCategorie = labelsCategorie.map((k) => donneesMois.parCategorie[k]);
  if (!labelsCategorie.length) {
    labelsCategorie = ["Aucune vente"];
    dataCategorie = [1];
  }
  if (chartCategorie) chartCategorie.destroy();
  chartCategorie = new Chart(ctxCategorie, {
    type: "pie",
    data: { labels: labelsCategorie, datasets: [{ data: dataCategorie, backgroundColor: (labelsCategorie.length === 1 && labelsCategorie[0] === "Aucune vente") ? ["#d8d5cc"] : ["#22c55e", "#f2c94c", "#4a90d9", "#e5484d", "#9b59b6", "#f39c12"] }] },
    options: { responsive: true },
  });'''
assert old_cat in js, "ancre chartCategorie introuvable"
js = js.replace(old_cat, new_cat, 1)

old_top = '''let topProduitsChart = null;
function afficherTopProduits(topProduits) {
  if (!topProduits.length) {
    topProduitsContentEl.innerHTML = "<p>Aucune vente de produit sur la période.</p>";
    if (topProduitsChart) { topProduitsChart.destroy(); topProduitsChart = null; }
    return;
  }
  topProduitsContentEl.innerHTML = "<ol>" + topProduits.map((p) =>
    `<li>${p.nom} — ${p.quantite} vendu(s), ${p.montant.toLocaleString("fr-FR")} FCFA</li>`
  ).join("") + "</ol>";

  let canvasTop = document.getElementById("topProduitsChart");
  if (!canvasTop) {
    canvasTop = document.createElement("canvas");
    canvasTop.id = "topProduitsChart";
    canvasTop.height = 180;
    topProduitsContentEl.after(canvasTop);
  }
  if (topProduitsChart) topProduitsChart.destroy();
  topProduitsChart = new Chart(canvasTop.getContext("2d"), {
    type: "bar",
    data: { labels: topProduits.map((p) => p.nom), datasets: [{ label: "Ventes (FCFA)", data: topProduits.map((p) => p.montant), backgroundColor: "#f2c94c" }] },
    options: { responsive: true, indexAxis: "y", plugins: { legend: { display: false } } },
  });
}'''
new_top = '''let topProduitsChart = null;
function afficherTopProduits(topProduits) {
  const aDesDonnees = topProduits.length > 0;
  topProduitsContentEl.innerHTML = aDesDonnees
    ? "<ol>" + topProduits.map((p) =>
        `<li>${p.nom} — ${p.quantite} vendu(s), ${p.montant.toLocaleString("fr-FR")} FCFA</li>`
      ).join("") + "</ol>"
    : "<p>Aucune vente de produit sur la période.</p>";

  let canvasTop = document.getElementById("topProduitsChart");
  if (!canvasTop) {
    canvasTop = document.createElement("canvas");
    canvasTop.id = "topProduitsChart";
    canvasTop.height = 180;
    topProduitsContentEl.after(canvasTop);
  }
  if (topProduitsChart) topProduitsChart.destroy();
  const labelsTop = aDesDonnees ? topProduits.map((p) => p.nom) : ["Aucun produit"];
  const dataTop = aDesDonnees ? topProduits.map((p) => p.montant) : [0];
  topProduitsChart = new Chart(canvasTop.getContext("2d"), {
    type: "bar",
    data: { labels: labelsTop, datasets: [{ label: "Ventes (FCFA)", data: dataTop, backgroundColor: "#f2c94c" }] },
    options: { responsive: true, indexAxis: "y", plugins: { legend: { display: false } } },
  });
}'''
assert old_top in js, "ancre afficherTopProduits introuvable"
js = js.replace(old_top, new_top, 1)

with open("dashboard.js", "w", encoding="utf-8") as f:
    f.write(js)

with open("admin.js", "r", encoding="utf-8") as f:
    ajs = f.read()

old_admin_cat = '''  const ctxCat = document.getElementById("stockCategorieChart");
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
  }'''
new_admin_cat = '''  const ctxCat = document.getElementById("stockCategorieChart");
  if (ctxCat) {
    if (window._stockCategorieChart) window._stockCategorieChart.destroy();
    let labels = Object.keys(parCategorie);
    let dataCat = labels.map((l) => parCategorie[l]);
    if (!labels.length) {
      labels = ["Aucune donnee"];
      dataCat = [1];
    }
    window._stockCategorieChart = new Chart(ctxCat, {
      type: "pie",
      data: {
        labels,
        datasets: [{
          data: dataCat,
          backgroundColor: (labels.length === 1 && labels[0] === "Aucune donnee") ? ["#d8d5cc"] : ["#2a78d6","#eb6834","#1baf7a","#eda100","#e87ba4","#008300","#6250d6","#e34948"]
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }'''
assert old_admin_cat in ajs, "ancre admin stockCategorieChart introuvable"
ajs = ajs.replace(old_admin_cat, new_admin_cat, 1)

old_admin_top = '''  const ctxTop = document.getElementById("stockTopProduitsChart");
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
}'''
new_admin_top = '''  const ctxTop = document.getElementById("stockTopProduitsChart");
  if (ctxTop) {
    if (window._stockTopProduitsChart) window._stockTopProduitsChart.destroy();
    const top8Affiche = top8.length ? top8 : [{ nom: "Aucun produit", valeur: 0 }];
    window._stockTopProduitsChart = new Chart(ctxTop, {
      type: "bar",
      data: {
        labels: top8Affiche.map((p) => p.nom),
        datasets: [{ data: top8Affiche.map((p) => p.valeur), backgroundColor: "#2a78d6" }]
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
}'''
assert old_admin_top in ajs, "ancre admin stockTopProduitsChart introuvable"
ajs = ajs.replace(old_admin_top, new_admin_top, 1)

with open("admin.js", "w", encoding="utf-8") as f:
    f.write(ajs)

print("Patch charts zero termine (dashboard.js + admin.js).")
