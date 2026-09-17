import re

with open("cloture.js", "r", encoding="utf-8") as f:
    contenu = f.read()

# 1) Ajouter la fonction imprimerTicketDevis() juste apres les declarations
old1 = '''  let resumeCourant = null;
  let etablissementNomCourant = "";

  menuBtn.addEventListener("click", async () => {'''

new1 = '''  let resumeCourant = null;
  let etablissementNomCourant = "";

  function imprimerTicketDevis() {
    if (!resumeCourant) return;
    const { devisRenouvellement, totalDevisRenouvellement } = resumeCourant;
    const entrees = Object.entries(devisRenouvellement || {}).sort((a, b) => b[1].coutTotal - a[1].coutTotal);
    if (entrees.length === 0) return;

    const maintenant = new Date();
    const dateStr = maintenant.toLocaleDateString("fr-FR");
    const heureStr = maintenant.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    let zone = document.getElementById("ticketImpressionDevis");
    if (!zone) {
      zone = document.createElement("div");
      zone.id = "ticketImpressionDevis";
      document.body.appendChild(zone);
    }

    zone.innerHTML = `
      <div class="ticket-entete">
        <div class="ticket-titre">${escapeHtml(etablissementNomCourant || "Etablissement")}</div>
        <div class="ticket-sous-titre">Devis de renouvellement de stock</div>
        <div class="ticket-date">${dateStr} a ${heureStr}</div>
      </div>
      <div class="ticket-separateur"></div>
      <table class="ticket-table"><tbody>
        ${entrees.map(([nom, d]) => `
          <tr><td colspan="2" class="ticket-produit-nom">${escapeHtml(nom)}</td></tr>
          <tr>
            <td class="ticket-produit-qte">${d.quantite} unite(s)</td>
            <td class="ticket-produit-montant">${d.coutTotal.toLocaleString("fr-FR")} FCFA</td>
          </tr>
        `).join("")}
      </tbody></table>
      <div class="ticket-separateur"></div>
      <div class="ticket-total-ligne">
        <span>TOTAL A REAPPROVISIONNER</span>
        <span>${totalDevisRenouvellement.toLocaleString("fr-FR")} FCFA</span>
      </div>
      <div class="ticket-pied">Genere par MAGERANTE</div>
    `;

    window.print();
  }

  menuBtn.addEventListener("click", async () => {'''

assert contenu.count(old1) == 1, f"old1 trouve {contenu.count(old1)} fois (attendu 1)"
contenu = contenu.replace(old1, new1, 1)

# 2) Ajouter le bouton Imprimer dans la section devis + brancher l'ecouteur
old2 = '''      if (Object.keys(devisRenouvellement).length) {
        htmlResume += `<div class="cloture-section"><div class="cloture-section-title">Devis de renouvellement de stock</div>${construireDevisHtml(devisRenouvellement, totalDevisRenouvellement)}</div>`;
      }
      resumeEl.innerHTML = htmlResume;

      btnConfirmer.dataset.total = total;'''

new2 = '''      if (Object.keys(devisRenouvellement).length) {
        htmlResume += `<div class="cloture-section"><div class="cloture-section-title-row"><div class="cloture-section-title">Devis de renouvellement de stock</div><button type="button" id="btnImprimerDevis" class="btn-imprimer-devis">Imprimer</button></div>${construireDevisHtml(devisRenouvellement, totalDevisRenouvellement)}</div>`;
      }
      resumeEl.innerHTML = htmlResume;

      const btnImprimerDevis = document.getElementById("btnImprimerDevis");
      if (btnImprimerDevis) btnImprimerDevis.addEventListener("click", imprimerTicketDevis);

      btnConfirmer.dataset.total = total;'''

assert contenu.count(old2) == 1, f"old2 trouve {contenu.count(old2)} fois (attendu 1)"
contenu = contenu.replace(old2, new2, 1)

with open("cloture.js", "w", encoding="utf-8") as f:
    f.write(contenu)

print("Patch applique avec succes sur cloture.js")
