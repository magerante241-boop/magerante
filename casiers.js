// casiers.js — logique de conditionnement en casiers

// Bières/Booster en 33cl (ou 24cl pour Booster) => casier de 24
const PETIT_FORMAT_REGEX = /\b(33\s?cl|24\s?cl)\b|djino/i;
// Bières 50cl et plus => casier de 12
const GRAND_FORMAT_REGEX = /\b(50\s?cl|65\s?cl|1\s?l)\b/i;
// Jamais de casier : spiritueux, sodas, jus
const HORS_CASIER_REGEX = /martini|label\s?5|ricard|grand\s?versant/i;

// produit peut être soit un objet { nom, casierTaille }, soit juste une string (nom)
export function tailleCasier(produit) {
  const nom = typeof produit === "string" ? produit : produit?.nom;
  const manuel = typeof produit === "object" ? produit?.casierTaille : null;

  if (manuel !== null && manuel !== undefined && Number(manuel) > 0) {
    return Number(manuel);
  }
  if (!nom || HORS_CASIER_REGEX.test(nom)) return null;
  if (PETIT_FORMAT_REGEX.test(nom)) return 24;
  if (GRAND_FORMAT_REGEX.test(nom)) return 12;
  return null;
}

export function formaterQuantiteAvecCasiers(quantite, produit) {
  const taille = tailleCasier(produit);
  const q = Number(quantite) || 0;
  if (!taille || q < taille) return q.toLocaleString("fr-FR") + " u.";
  const casiers = Math.floor(q / taille);
  const reste = q % taille;
  const partCasier = casiers + (casiers > 1 ? " casiers" : " casier");
  return reste > 0
    ? `${q.toLocaleString("fr-FR")} u. (${partCasier} + ${reste} u.)`
    : `${q.toLocaleString("fr-FR")} u. (${partCasier})`;
}
