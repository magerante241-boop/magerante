const fs = require("fs");
const fichier = "factures.js";
let contenu = fs.readFileSync(fichier, "utf8");

const ancien = `const total = filtrees.reduce((acc, f) => acc + Number(f.total || 0), 0);
  totalEl.textContent = \`Total : \${total.toLocaleString("fr-FR")} FCFA (\${filtrees.length} facture\${filtrees.length > 1 ? "s" : ""})\`;`;

const nouveau = `const filtreesActives = filtrees.filter((f) => f.statut !== "annulee");
  const total = filtreesActives.reduce((acc, f) => acc + Number(f.total || 0), 0);
  totalEl.textContent = \`Total : \${total.toLocaleString("fr-FR")} FCFA (\${filtreesActives.length} facture\${filtreesActives.length > 1 ? "s" : ""})\`;`;

if (contenu.includes("filtreesActives")) {
  console.log("DEJA APPLIQUE");
} else if (!contenu.includes(ancien)) {
  console.log("ECHEC: motif introuvable dans factures.js");
} else {
  contenu = contenu.replace(ancien, nouveau);
  fs.writeFileSync(fichier, contenu, "utf8");
  console.log("OK: total Factures exclut desormais les annulees");
}
