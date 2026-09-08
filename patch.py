import pathlib

# --- notifications.js ---
p = pathlib.Path("notifications.js"); s = p.read_text()
s = s.replace(
    'export async function creerNotification({ type, titre, message }) {',
    'export async function creerNotification({ type, titre, message, factureNumero, cible }) {')
old = '''  try {
    await addDoc(notifsRef(), {
      type, titre, message, lu: false, createdAt: serverTimestamp()
    });
  } catch (err) {'''
new = '''  try {
    const payload = { type, titre, message, lu: false, createdAt: serverTimestamp() };
    if (factureNumero) payload.factureNumero = factureNumero;
    if (cible) payload.cible = cible;
    await addDoc(notifsRef(), payload);
  } catch (err) {'''
assert old in s, "ANCHOR1_FAIL"; s = s.replace(old, new)
old = '''  listEl.innerHTML = notifsCache.map(n => `
    <div class="notif-item${n.lu ? "" : " non-lu"}">
      <span class="notif-icone">${iconePourType(n.type)}</span>
      <div class="notif-texte">
        <span class="notif-titre">${escapeHtml(n.titre)}</span>
        <span class="notif-msg">${escapeHtml(n.message)}</span>
        <span class="notif-date">${formatDate(n.createdAt)}</span>
      </div>
    </div>
  `).join("");'''
new = '''  listEl.innerHTML = notifsCache.map(n => `
    <div class="notif-item${n.lu ? "" : " non-lu"}${n.cible ? " notif-item-cliquable" : ""}"
         data-notif-id="${n.id}"
         ${n.cible ? `data-cible="${n.cible}"` : ""}
         ${n.factureNumero ? `data-facture-numero="${n.factureNumero}"` : ""}>
      <span class="notif-icone">${iconePourType(n.type)}</span>
      <div class="notif-texte">
        <span class="notif-titre">${escapeHtml(n.titre)}</span>
        <span class="notif-msg">${escapeHtml(n.message)}</span>
        <span class="notif-date">${formatDate(n.createdAt)}</span>
      </div>
    </div>
  `).join("");'''
assert old in s, "ANCHOR2_FAIL"; s = s.replace(old, new)
old = '''  const btn = document.getElementById("btnNotifications");
  const panel = document.getElementById("notifPanel");'''
new = '''  const btn = document.getElementById("btnNotifications");
  const panel = document.getElementById("notifPanel");
  const listEl2 = document.getElementById("notifList");'''
assert old in s, "ANCHOR3_FAIL"; s = s.replace(old, new)
old = '''  if (overlay) overlay.addEventListener("click", () => { panel.hidden = true; });'''
new = '''  if (overlay) overlay.addEventListener("click", () => { panel.hidden = true; });
  if (listEl2) listEl2.addEventListener("click", (e) => {
    const item = e.target.closest(".notif-item[data-cible]");
    if (!item) return;
    const cible = item.dataset.cible;
    const factureNumero = item.dataset.factureNumero;
    panel.hidden = true;
    if (window.switchView) window.switchView(cible);
    if (factureNumero && window.FacturesModule && window.FacturesModule.ouvrirFacture) {
      setTimeout(() => window.FacturesModule.ouvrirFacture(factureNumero), 300);
    }
  });'''
assert old in s, "ANCHOR4_FAIL"; s = s.replace(old, new)
if "window.NotificationsModule" not in s:
    s = s.rstrip() + "\n\nwindow.NotificationsModule = { creerNotification };\n"
p.write_text(s); print("notifications.js OK")

# --- ventes.js ---
p = pathlib.Path("ventes.js"); s = p.read_text()
old = 'creerNotification({ type: "vente", titre: "Nouvelle vente", message: `Vente de ${montant.toLocaleString("fr-FR")} FCFA enregistrée${auteurNom ? " par " + auteurNom : ""}.` });'
new = 'creerNotification({ type: "vente", titre: "Nouvelle vente", message: `Vente de ${montant.toLocaleString("fr-FR")} FCFA enregistrée${auteurNom ? " par " + auteurNom : ""}.`, cible: "ventes" });'
assert old in s, "ANCHOR5_FAIL"; s = s.replace(old, new)
old = 'creerNotification({ type: "vente", titre: "Nouvelle vente", message: `${qte} x ${produit.nom} — ${montant.toLocaleString("fr-FR")} FCFA${auteurNom2 ? " par " + auteurNom2 : ""}.` });'
new = 'creerNotification({ type: "vente", titre: "Nouvelle vente", message: `${qte} x ${produit.nom} — ${montant.toLocaleString("fr-FR")} FCFA${auteurNom2 ? " par " + auteurNom2 : ""}.`, cible: "ventes" });'
assert old in s, "ANCHOR6_FAIL"; s = s.replace(old, new)
p.write_text(s); print("ventes.js OK")

# --- factures.js ---
p = pathlib.Path("factures.js"); s = p.read_text()
old = '''    return `
      <details class="collapsible-section">
        <summary style="display:flex; justify-content:space-between; padding:10px 14px; cursor:pointer;">'''
new = '''    return `
      <details class="collapsible-section" id="facture-${f.numero}">
        <summary style="display:flex; justify-content:space-between; padding:10px 14px; cursor:pointer;">'''
assert old in s, "ANCHOR7_FAIL"; s = s.replace(old, new)
old = '''export function cleanup() {'''
new = '''export function ouvrirFacture(numero) {
  filtrePeriodeFactureActuel = "tout";
  afficherFacturesFiltrees();
  requestAnimationFrame(() => {
    setTimeout(() => {
      const el = document.getElementById(`facture-${numero}`);
      if (!el) return;
      el.setAttribute("open", "");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  });
}

export function cleanup() {'''
assert old in s, "ANCHOR8_FAIL"; s = s.replace(old, new)
old = 'window.FacturesModule = { render, cleanup, enregistrerFacture };'
new = 'window.FacturesModule = { render, cleanup, enregistrerFacture, ouvrirFacture };'
assert old in s, "ANCHOR9_FAIL"; s = s.replace(old, new)
p.write_text(s); print("factures.js OK")

# --- app.js ---
p = pathlib.Path("app.js"); s = p.read_text()
old = '''    if (lignesValidees.length > 0 && window.FacturesModule && window.FacturesModule.enregistrerFacture) {
      const totalValide = lignesValidees.reduce((acc, l) => acc + l.totalLigne, 0);
      await window.FacturesModule.enregistrerFacture(lignesValidees, totalValide);
    }'''
new = '''    if (lignesValidees.length > 0 && window.FacturesModule && window.FacturesModule.enregistrerFacture) {
      const totalValide = lignesValidees.reduce((acc, l) => acc + l.totalLigne, 0);
      const resFacture = await window.FacturesModule.enregistrerFacture(lignesValidees, totalValide);
      if (resFacture && resFacture.success && window.NotificationsModule && window.NotificationsModule.creerNotification) {
        window.NotificationsModule.creerNotification({
          type: "vente",
          titre: "Nouvelle facture",
          message: `${lignesValidees.length} ligne${lignesValidees.length > 1 ? "s" : ""} — ${totalValide.toLocaleString("fr-FR")} FCFA`,
          factureNumero: resFacture.numero,
          cible: "factures"
        });
      }
    }'''
assert old in s, "ANCHOR10_FAIL"; s = s.replace(old, new)
p.write_text(s); print("app.js OK")
print("ALL PATCHES APPLIED")
