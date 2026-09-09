import { initNotifications } from "./notifications.js";
// app.js — squelette : horloge, navigation, calculatrice de base
// (l'Inventaire est géré par inventaire.js, exposé sur window.InventaireModule)
// (les Ventes sont gérées par ventes.js, exposé sur window.VentesModule)

// --- Splash screen : affiché ~2.2s à l'ouverture, puis disparaît en fondu ---
window.addEventListener("load", () => {
  const splash = document.getElementById("splashScreen");
  if (splash) {
    setTimeout(() => splash.classList.add("hidden"), 2200);
  }
  if (window.InvitationModule) window.InvitationModule.traiterInvitationDepuisUrl();
});

// --- Date/heure dans l'en-tête ---
function updateHeaderDate() {
  const el = document.getElementById("headerDate");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric"
  }) + " — " + now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
updateHeaderDate();
setInterval(updateHeaderDate, 30000);

// --- Navigation bas d'écran : bascule entre calculatrice et modules ---
function switchView(view) {
  const calcZone = document.getElementById("calcZone");
  const numpadElement = document.getElementById("numpad");
  const abcKeyboardElement = document.getElementById("abcKeyboard");
  const viewContainer = document.getElementById("viewContainer");

  // On quitte proprement le module précédent s'il en avait un (désabonnement Firestore)
  if (window.InventaireModule) window.InventaireModule.cleanup();
  if (window.VentesModule && window.VentesModule.cleanup) window.VentesModule.cleanup();
  if (window.FacturesModule && window.FacturesModule.cleanup) window.FacturesModule.cleanup();

  const facturePanelEl = document.getElementById("facturePanel");

  if (view === "calc") {
    if (numpadElement) numpadElement.hidden = (typeof modeRecherche !== "undefined" && modeRecherche);
    if (abcKeyboardElement) abcKeyboardElement.hidden = !(typeof modeRecherche !== "undefined" && modeRecherche);
    calcZone.hidden = false;
    viewContainer.hidden = true;
    viewContainer.innerHTML = "";
    if (facturePanelEl && window.modeFacturierActif) facturePanelEl.hidden = false;
  } else if (view === "inventaire") {
    calcZone.hidden = true;
    if (numpadElement) numpadElement.hidden = true;
    if (abcKeyboardElement) abcKeyboardElement.hidden = true;
    viewContainer.hidden = false;
    if (facturePanelEl) facturePanelEl.hidden = true;
    if (window.InventaireModule) {
      window.InventaireModule.render(viewContainer);
    } else {
      viewContainer.innerHTML = `<p class="placeholder-msg">Chargement du module...</p>`;
    }
  } else if (view === "ventes") {
    calcZone.hidden = true;
    if (numpadElement) numpadElement.hidden = true;
    if (abcKeyboardElement) abcKeyboardElement.hidden = true;
    viewContainer.hidden = false;
    if (facturePanelEl) facturePanelEl.hidden = true;
    if (window.VentesModule && window.VentesModule.render) {
      window.VentesModule.render(viewContainer);
    } else {
      viewContainer.innerHTML = `<p class="placeholder-msg">Chargement du module...</p>`;
    }
  } else if (view === "factures") {
    calcZone.hidden = true;
    if (numpadElement) numpadElement.hidden = true;
    if (abcKeyboardElement) abcKeyboardElement.hidden = true;
    viewContainer.hidden = false;
    if (facturePanelEl) facturePanelEl.hidden = true;
    if (window.FacturesModule && window.FacturesModule.render) {
      window.FacturesModule.render(viewContainer);
    } else {
      viewContainer.innerHTML = `<p class="placeholder-msg">Chargement du module...</p>`;
    }
  } else {
    calcZone.hidden = true;
    if (numpadElement) numpadElement.hidden = true;
    if (abcKeyboardElement) abcKeyboardElement.hidden = true;
    viewContainer.hidden = false;
    if (facturePanelEl) facturePanelEl.hidden = true;
    viewContainer.innerHTML = `<p class="placeholder-msg">Module "${view}" — à construire à une prochaine étape.</p>`;
  }
}

window.switchView = switchView;

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    // Mode visiteur : l'établissement par défaut est créé en silence par auth.js,
    // on ne bloque plus jamais la navigation avec une modale. S'il n'est pas encore
    // prêt (connexion anonyme en cours, ~1s max), le module affiche son propre
    // état de chargement le temps que window.AuthState.hasEstablishment passe à true.
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    switchView(view);
  });
});

// --- Calculatrice de gestion (logique de base) ---
let calcExpr = "";
let totalCumule = 0;
let derniereLigneTexte = "";

// Applique le prix d'une marque sélectionnée : si une quantité est déjà tapée,
// on multiplie (quantité × prix) au lieu d'écraser la saisie.
function appliquerPrixMarque(prix) {
  const q = calcExpr.trim();
  const estQuantiteValide = q !== "" && /^[0-9]+([.,][0-9]+)?$/.test(q) && Number(q.replace(",", ".")) > 0;
  const expr = estQuantiteValide ? (q + "×" + prix) : String(prix);
  let valeur = 0;
  try {
    const safeExpr = expr.replace(/×/g, "*").replace(/,/g, ".");
    valeur = Function(`"use strict"; return (${safeExpr})`)();
  } catch {
    valeur = 0;
  }
  if (isFinite(valeur)) totalCumule += valeur;
  derniereLigneTexte = expr;
  calcExpr = "";
}
const exprEl = document.getElementById("calcExpression");
const resultEl = document.getElementById("calcResult");
let calcValeurNumerique = 0;
let produitSelectionne = null;

const resultValueEl = document.getElementById("calcResultValue");
const resultUnitEl = document.getElementById("calcResultUnit");

function ajusterTailleResultat() {
  resultValueEl.style.fontSize = "";
  const maxFontSize = parseFloat(getComputedStyle(resultValueEl).fontSize);
  let taille = maxFontSize;
  const minFontSize = 7;
  while (resultValueEl.scrollWidth > resultValueEl.clientWidth && taille > minFontSize) {
    taille -= 1;
    resultValueEl.style.fontSize = taille + "px";
  }
}

function renderCalc() {
  exprEl.textContent = calcExpr || derniereLigneTexte || "\u00A0";
  try {
    const safeExpr = calcExpr
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/,/g, ".");
    // eslint-disable-next-line no-new-func
    const value = safeExpr.trim() === "" ? 0 : Function(`"use strict"; return (${safeExpr})`)();
    calcValeurNumerique = isFinite(value) ? value : 0;
  } catch {
    calcValeurNumerique = 0;
  }
  resultValueEl.textContent = totalCumule.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  resultUnitEl.hidden = false;
  ajusterTailleResultat();
  updateCoins();
}

function updateCoins() {
  const elBenefice = document.getElementById("coinBeneficeUnite");
  const elValeurStock = document.getElementById("coinValeurStock");
  const elStockRestant = document.getElementById("coinStockRestant");
  const elQuantite = document.getElementById("coinQuantite");
  if (!elBenefice || !elValeurStock || !elStockRestant || !elQuantite) return;

  if (!produitSelectionne) {
    elBenefice.querySelector(".coin-value").textContent = "—";
    elValeurStock.querySelector(".coin-value").textContent = "—";
    elStockRestant.querySelector(".coin-value").textContent = "—";
    elQuantite.querySelector(".coin-value").textContent = "—";
    return;
  }

  const prixVente = produitSelectionne.prixVente;
  const prixAchat = produitSelectionne.prixAchat;
  const stock = produitSelectionne.stock;
  const benefice = prixVente - prixAchat;
  const valeurStock = stock * prixVente;
  const quantite = prixVente > 0 && calcValeurNumerique > 0 ? calcValeurNumerique / prixVente : 0;

  elBenefice.querySelector(".coin-value").textContent = benefice.toLocaleString("fr-FR") + " FCFA";
  elValeurStock.querySelector(".coin-value").textContent = valeurStock.toLocaleString("fr-FR") + " FCFA";
  elStockRestant.querySelector(".coin-value").textContent = stock + " u.";
  elQuantite.querySelector(".coin-value").textContent = quantite > 0 ? quantite.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " u." : "—";
}

document.getElementById("numpad").addEventListener("click", (e) => {
  const key = e.target.dataset.key;
  if (!key) return;
  e.target.classList.remove("key-glow");
  void e.target.offsetWidth;
  e.target.classList.add("key-glow");
  if (key === "AC") {
    calcExpr = "";
    totalCumule = 0;
    derniereLigneTexte = "";
  } else if (key === "⌫") {
    calcExpr = calcExpr.slice(0, -1);
  } else if (key === "=") {
    const expr = calcExpr.trim();
    if (expr !== "") {
      const matchModif = expr.match(/^([×÷])\s*([0-9]+(?:[.,][0-9]+)?)$/);
      if (matchModif) {
        const operateur = matchModif[1];
        const operande = Number(matchModif[2].replace(",", ".")) || 0;
        if (modeFacturier) {
          if (ligneFactureSelectionnee !== null && lignesFacture[ligneFactureSelectionnee]) {
            const ligne = lignesFacture[ligneFactureSelectionnee];
            if (operateur === "×") ligne.quantite *= operande;
            else if (operande !== 0) ligne.quantite /= operande;
            ligne.totalLigne = ligne.quantite * ligne.prixUnitaire;
            renderFacture();
          } else {
            alert("Sélectionne une ligne de facture avant de la modifier.");
          }
        } else {
          if (operateur === "×") totalCumule *= operande;
          else if (operande !== 0) totalCumule /= operande;
        }
        derniereLigneTexte = "";
        calcExpr = "";
      } else {
        let valeur = 0;
        try {
          const safeExpr = expr
            .replace(/\u00d7/g, "*")
            .replace(/\u00f7/g, "/")
            .replace(/,/g, ".");
          valeur = Function("\"use strict\"; return (" + safeExpr + ")")();
        } catch {
          valeur = 0;
        }
        if (isFinite(valeur)) totalCumule += valeur;
        derniereLigneTexte = expr;
        calcExpr = "";
      }
    }
  } else {
    const chiffresActuels = (calcExpr.match(/[0-9]/g) || []).length;
    if (/[0-9]/.test(key) && chiffresActuels >= 10) {
      // Limite atteinte : on ignore les chiffres supplémentaires
    } else {
      calcExpr += key;
    }
  }
  renderCalc();
});

document.querySelectorAll(".calc-actions button").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!(window.AuthState && window.AuthState.hasEstablishment)) {
      // Cas très rare : connexion anonyme encore en cours (fraction de seconde).
      alert("Initialisation en cours, réessaie dans un instant.");
      return;
    }
    if (window.AuthState.accountType === "anonyme") {
      alert("Veuillez vous inscrire en tant que propriétaire pour bénéficier de ce service.");
      if (window.openRegisterModal) window.openRegisterModal();
      return;
    }
    if (btn.dataset.action === "vente") {
      if (window.VentesModule) {
        window.VentesModule.ouvrirModaleVente(calcValeurNumerique > 0 ? calcValeurNumerique : "");
      } else {
        alert("Module Ventes en cours de chargement, réessaie dans un instant.");
      }
      return;
    }
    if (!(calcValeurNumerique > 0)) {
      alert("Entre d'abord un montant avant de choisir une action.");
      return;
    }
    if (window.MouvementsModule) {
      btn.disabled = true;
      window.MouvementsModule.enregistrerMouvement(btn.dataset.action, calcValeurNumerique).then((res) => {
        btn.disabled = false;
        if (!res.success) {
          alert(res.message);
        } else {
          calcExpr = "";
          calcValeurNumerique = 0;
          renderCalc();
        }
      });
    } else {
      alert("Module Mouvements en cours de chargement, réessaie dans un instant.");
    }
  });
});

renderCalc();

// --- Filtrage des tuiles Bar/Snack/Club selon le type d'etablissement ---
// Types d'établissement pour lesquels la grille de marques (boissons) n'a pas
// de sens et doit rester masquée. Tout type absent de cette liste (y compris
// le "boutique" créé par défaut en mode visiteur) l'affiche.
// ⚠️ À ajuster selon ton besoin réel si la liste ne te convient pas.
const TYPES_SANS_GRILLE_MARQUES = ["hotel", "salon", "atelier", "service"];
function filtrerCategoriesCalc(type) {
  const masquer = TYPES_SANS_GRILLE_MARQUES.includes((type || "").toLowerCase());
  const marqueGrid = document.getElementById("marqueGrid");
  if (marqueGrid) marqueGrid.hidden = masquer;
}
window.filtrerCategoriesCalc = filtrerCategoriesCalc;

// --- Tuiles Bar / Snack / Club : liste de produits filtrée par catégorie ---
const calcProduitsListe = document.getElementById("calcProduitsListe");
if (window.ScrollArrows) window.ScrollArrows.attachScrollArrows(calcProduitsListe);

function fermerListeProduits() {
  calcProduitsListe.hidden = true;
  calcProduitsListe.innerHTML = "";
}

const MARQUES_TAILLES = {
  "Régab": { petite: "Régab 33cl", grande: "Régab 65cl" },
  "33 Export": { petite: "33 Export 33cl", grande: "33 Export 65cl" },
  "Castel": { petite: "Castel Beer 33cl", grande: "Castel Beer 65cl" },
  "Booster": { petite: "Booster 24cl", grande: "Booster 50cl" },
  "Guinness": { petite: "Guinness 33cl", grande: "Guinness 65cl" },
  "Beaufort": { petite: "Beaufort 33cl", grande: "Beaufort 65cl" },
  "Tembo": { petite: "Tembo 33cl", grande: "Tembo 65cl" },
  "Heineken": { petite: "Heineken 33cl", grande: "Heineken 65cl" },
  "Malta Guinness": { petite: "Malta Guinness 33cl", grande: "Malta Guinness 50cl" },
  "Coca-Cola": { petite: "Coca-Cola 33cl", grande: "Coca-Cola 1L" },
  "Martini": { petite: "Martini 70cl", grande: "Martini 1L" },
  "Grand Versant": { petite: "Grand Versant 70cl", grande: "Grand Versant 1L" },
  "Label 5": { petite: "Label 5 70cl", grande: "Label 5 1L" },
  "Ricard": { petite: "Ricard 70cl", grande: "Ricard 1L" },
};

const marqueTaillesEl = document.getElementById("marqueTailles");
let marqueTaillesTimer = null;
// NB : on n'attache PAS les flèches de scroll ici. attachScrollArrows() déplace
// l'élément dans un wrapper `position: relative`, ce qui change son offsetParent
// et casse le positionnement dynamique (top/left calculés par rapport à
// #marqueGrid dans le gestionnaire de clic ci-dessous) — c'est ce qui causait
// le popup mal placé / les flèches qui débordaient sur la grille. Ce popup n'a
// de toute façon jamais plus de 2 entrées (petite/grande) : pas besoin de scroll.

async function chargerTousProduitsSurs() {
  if (!window.InventaireModule || !window.InventaireModule.getTousLesProduits) return [];
  try {
    return await window.InventaireModule.getTousLesProduits();
  } catch (err) {
    return [];
  }
}

document.querySelectorAll(".marque-cell:not(.marque-cell-autres)").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (!(window.AuthState && window.AuthState.hasEstablishment)) {
      alert("Initialisation en cours, réessaie dans un instant.");
      return;
    }
    const marque = btn.dataset.marque;
    const tailles = MARQUES_TAILLES[marque];
    if (!tailles) return;
    if (!marqueTaillesEl.hidden && marqueTaillesEl.dataset.openFor === marque) { marqueTaillesEl.hidden = true; marqueTaillesEl.dataset.openFor = ""; return; }
    fermerListeProduits();
    marqueTaillesEl.innerHTML = `<p class="placeholder-msg">Chargement...</p>`;
    marqueTaillesEl.hidden = false;
    if (marqueTaillesTimer) clearTimeout(marqueTaillesTimer);
    marqueTaillesTimer = setTimeout(() => { marqueTaillesEl.hidden = true; marqueTaillesTimer = null; }, 5000);
    marqueTaillesEl.style.top = (btn.offsetTop + btn.offsetHeight + 4) + "px";
    marqueTaillesEl.style.left = "0px";
    marqueTaillesEl.dataset.openFor = marque;
    const tousLesProduits = await chargerTousProduitsSurs();
    marqueTaillesEl.innerHTML = Object.entries(tailles).map(([taille, nomProduit]) => {
      const p = tousLesProduits.find((x) => x.nom === nomProduit);
      const label = taille;
      const demo = window.InventaireModule?.PRODUITS_DEMO?.find((x) => x.nom === nomProduit);
      const prixAffiche = p ? p.prixVente : (demo ? demo.prixVente : null);
      const suffixe = prixAffiche != null ? ` · ${prixAffiche} FCFA` : " (non configuré)";
      return `<button class="marque-taille-item" data-nom="${nomProduit}">${label}${suffixe}</button>`;
    }).join("");
    const maxLeft = Math.max(0, btn.parentElement.offsetWidth - marqueTaillesEl.offsetWidth - 4);
    marqueTaillesEl.style.left = Math.min(btn.offsetLeft, maxLeft) + "px";
    marqueTaillesEl.querySelectorAll(".marque-taille-item").forEach((item) => {
      item.addEventListener("click", () => {
        const p = tousLesProduits.find((x) => x.nom === item.dataset.nom);
        if (!p) {
          alert("Ce produit n'est pas encore configuré dans l'inventaire.");
          return;
        }
        if (modeFacturier) { ajouterLigneFacture(p); return; }
        appliquerPrixMarque(p.prixVente);
        produitSelectionne = {
          nom: p.nom,
          prixVente: Number(p.prixVente) || 0,
          prixAchat: Number(p.prixAchat) || 0,
          stock: Number(p.stock) || 0,
        };
        renderCalc();
        if (marqueTaillesTimer) { clearTimeout(marqueTaillesTimer); marqueTaillesTimer = null; }
        marqueTaillesEl.hidden = true;
      });
    });
  });
});

document.getElementById("btnMarqueAutres").addEventListener("click", async () => {
  if (!(window.AuthState && window.AuthState.hasEstablishment)) {
    alert("Initialisation en cours, réessaie dans un instant.");
    return;
  }
  marqueTaillesEl.hidden = true;
  calcProduitsListe.innerHTML = `<p class="placeholder-msg">Chargement...</p>`;
  calcProduitsListe.hidden = false;
  const tousLesProduits = await chargerTousProduitsSurs();
  if (!tousLesProduits.length) {
    calcProduitsListe.innerHTML = `<p class="placeholder-msg">Aucun produit dans l'inventaire.</p>`;
    return;
  }
  calcProduitsListe.innerHTML = tousLesProduits.map((p) => `
    <button class="calc-produit-item" data-prix="${p.prixVente}" data-prix-achat="${p.prixAchat || 0}" data-stock="${p.stock || 0}" data-nom="${p.nom || ""}">
      <span class="calc-produit-nom">${p.nom}</span>
      <span class="calc-produit-prix">${p.prixVente} FCFA</span>
    </button>
  `).join("");
  calcProduitsListe.querySelectorAll(".calc-produit-item").forEach((item) => {
    item.addEventListener("click", () => {
      const pf1 = tousLesProduits.find((x) => x.nom === item.dataset.nom);
      if (modeFacturier) { ajouterLigneFacture(pf1); return; }
      appliquerPrixMarque(item.dataset.prix);
      produitSelectionne = {
        nom: item.dataset.nom,
        prixVente: Number(item.dataset.prix) || 0,
        prixAchat: Number(item.dataset.prixAchat) || 0,
        stock: Number(item.dataset.stock) || 0,
      };
      renderCalc();
      fermerListeProduits();
    });
  });
});

// --- Menu latéral ---
const sideMenu = document.getElementById("sideMenu");
function openSideMenu() {
  sideMenu.hidden = false;
}
function closeSideMenu() {
  sideMenu.hidden = true;
}
document.getElementById("btnMenu").addEventListener("click", openSideMenu);
document.getElementById("btnCloseMenu").addEventListener("click", closeSideMenu);
document.getElementById("sideMenuOverlay").addEventListener("click", closeSideMenu);
document.getElementById("menuRenameEstablishment").addEventListener("click", () => {
  closeSideMenu();
  if (window.openAuthModal) window.openAuthModal();
});
document.getElementById("menuImportProduits").addEventListener("click", async () => {
  if (window.AuthState?.email !== window.ADMIN_EMAIL) {
    alert("Cette action est réservée au compte administrateur.");
    return;
  }
  closeSideMenu();
  if (!window.InventaireModule || !window.InventaireModule.importProduitsDemo) {
    alert("Module Inventaire en cours de chargement, réessaie dans un instant.");
    return;
  }
  if (!confirm("Importer 56 produits de démo (Bar, Snack, Club) dans l'inventaire ?")) return;
  try {
    const res = await window.InventaireModule.importProduitsDemo();
    if (res.success) {
      alert(res.count + " produits importés avec succès !");
    } else {
      alert("Erreur : " + res.message);
    }
  } catch (err) {
    alert("Erreur lors de l'import : " + err.message);
  }
});

document.getElementById("menuLogin").addEventListener("click", () => {
  closeSideMenu();
  if (window.openLoginModal) window.openLoginModal();
});

document.getElementById("menuLoginGerant").addEventListener("click", () => {
  closeSideMenu();
  if (window.ouvrirEcranConnexionGerant) window.ouvrirEcranConnexionGerant();
});
document.getElementById("menuCreateAccount").addEventListener("click", () => {
  closeSideMenu();
  if (window.openRegisterModal) window.openRegisterModal();
});

// --- Service Worker (mode PWA / hors-connexion) ---
// Purge forcée, une seule fois par appareil : supprime tout ancien Service
// Worker resté bloqué en cache-first (ex. magerante-v1) avant d'enregistrer
// le nouveau. Nécessaire car certains téléphones ne libèrent jamais l'ancien
// SW même après un vidage manuel du cache navigateur.
// --- Recherche de produit par nom (clavier alphabétique) ---
const btnToggleClavier = document.getElementById("btnToggleClavier");
const abcKeyboard = document.getElementById("abcKeyboard");
const numpadEl = document.getElementById("numpad");
let modeRecherche = false;
let rechercheTexte = "";
let tousProduits = [];

function afficherResultatsRecherche() {
  const texte = rechercheTexte.trim().toLowerCase();
  if (!texte) {
    calcProduitsListe.innerHTML = `<p class="placeholder-msg">Tape le nom d'un produit...</p>`;
    calcProduitsListe.hidden = false;
    return;
  }
  const resultats = tousProduits.filter((p) => (p.nom || "").toLowerCase().includes(texte));
  if (!resultats.length) {
    calcProduitsListe.innerHTML = `<p class="placeholder-msg">Aucun produit trouvé pour "${rechercheTexte}".</p>`;
    calcProduitsListe.hidden = false;
    return;
  }
  calcProduitsListe.innerHTML = resultats.map((p) => `
    <button class="calc-produit-item" data-prix="${p.prixVente}" data-prix-achat="${p.prixAchat || 0}" data-stock="${p.stock || 0}" data-nom="${p.nom || ""}">
      <span class="calc-produit-nom">${p.nom}</span>
      <span class="calc-produit-prix">${p.prixVente} FCFA</span>
    </button>
  `).join("");
  calcProduitsListe.hidden = false;
  calcProduitsListe.querySelectorAll(".calc-produit-item").forEach((item) => {
    item.addEventListener("click", () => {
      const pf2 = tousProduits.find((x) => x.nom === item.dataset.nom);
      if (modeFacturier) { ajouterLigneFacture(pf2); return; }
      appliquerPrixMarque(item.dataset.prix);
      produitSelectionne = {
        nom: item.dataset.nom,
        prixVente: Number(item.dataset.prix) || 0,
        prixAchat: Number(item.dataset.prixAchat) || 0,
        stock: Number(item.dataset.stock) || 0,
      };
      renderCalc();
      fermerListeProduits();
      quitterModeRecherche();
    });
  });
}

function quitterModeRecherche() {
  modeRecherche = false;
  rechercheTexte = "";
  abcKeyboard.hidden = true;
  numpadEl.hidden = false;
  if (btnToggleClavier) btnToggleClavier.classList.remove("active");
  exprEl.textContent = calcExpr || "\u00A0";
}

async function toggleModeRecherche() {
  modeRecherche = !modeRecherche;
  if (modeRecherche) {
    if (!(window.AuthState && window.AuthState.hasEstablishment)) {
      alert("Initialisation en cours, réessaie dans un instant.");
      modeRecherche = false;
      return;
    }
    if (!window.InventaireModule || !window.InventaireModule.getTousLesProduits) {
      alert("Module Inventaire en cours de chargement, réessaie dans un instant.");
      modeRecherche = false;
      return;
    }
    if (btnToggleClavier) btnToggleClavier.classList.add("active");
    abcKeyboard.hidden = false;
    numpadEl.hidden = true;
    rechercheTexte = "";
    exprEl.textContent = "Recherche : \u00A0";
    calcProduitsListe.innerHTML = `<p class="placeholder-msg">Chargement des produits...</p>`;
    calcProduitsListe.hidden = false;
    try {
      tousProduits = await window.InventaireModule.getTousLesProduits();
    } catch (err) {
      tousProduits = [];
    }
    afficherResultatsRecherche();
  } else {
    quitterModeRecherche();
    fermerListeProduits();
  }
}
if (btnToggleClavier) {
  btnToggleClavier.addEventListener("click", toggleModeRecherche);
}
const btnAbcToggle = document.getElementById("btnAbcToggle");
if (btnAbcToggle) {
  btnAbcToggle.addEventListener("click", toggleModeRecherche);
}

abcKeyboard.addEventListener("click", (e) => {
  const lettre = e.target.dataset.letter;
  if (lettre === undefined) return;
  e.target.classList.remove("key-glow");
  void e.target.offsetWidth;
  e.target.classList.add("key-glow");
  if (lettre === "⌫") {
    rechercheTexte = rechercheTexte.slice(0, -1);
  } else {
    rechercheTexte += lettre;
  }
  exprEl.textContent = "Recherche : " + (rechercheTexte || "\u00A0");
  afficherResultatsRecherche();
});

const btnAbcEntree = document.getElementById("btnAbcEntree");
if (btnAbcEntree) {
  btnAbcEntree.addEventListener("click", () => {
    const texte = rechercheTexte.trim().toLowerCase();
    const resultats = tousProduits.filter((p) => (p.nom || "").toLowerCase().includes(texte));
    if (resultats.length === 1) {
      const p = resultats[0];
      if (modeFacturier) { ajouterLigneFacture(p); return; }
      appliquerPrixMarque(p.prixVente);
      produitSelectionne = {
        nom: p.nom,
        prixVente: Number(p.prixVente) || 0,
        prixAchat: Number(p.prixAchat) || 0,
        stock: Number(p.stock) || 0,
      };
      renderCalc();
    }
    fermerListeProduits();
    quitterModeRecherche();
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      if (!localStorage.getItem("sw_force_cleared_v2")) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        localStorage.setItem("sw_force_cleared_v2", "1");
      }
    } catch (err) {
      console.warn("Purge de l'ancien Service Worker impossible :", err);
    }
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Échec enregistrement du service worker :", err);
    });
  });
}

document.addEventListener("click", (e) => {
  if (!marqueTaillesEl.hidden && !marqueTaillesEl.contains(e.target) && !e.target.closest(".marque-cell:not(.marque-cell-autres)")) {
    marqueTaillesEl.hidden = true;
  }
});
document.getElementById("menuGenererDemoComplet").addEventListener("click", async () => {
  if (window.AuthState?.email !== window.ADMIN_EMAIL) {
    alert("Cette action est réservée au compte administrateur.");
    return;
  }
  closeSideMenu();
  if (!window.DemoModule || !window.DemoModule.genererDonneesDemoCompletes) {
    alert("Module Démo en cours de chargement, réessaie dans un instant.");
    return;
  }
  if (!confirm("Générer toutes les données de démonstration (produits, ventes, comptes, établissements) ?")) return;
  try {
    const res = await window.DemoModule.genererDonneesDemoCompletes();
    if (res.success) {
      alert("Données démo générées avec succès !");
    } else {
      alert("Erreur : " + res.message);
    }
  } catch (err) {
    alert("Erreur lors de la génération : " + err.message);
  }
});

document.getElementById("menuSupprimerDemo").addEventListener("click", async () => {
  if (window.AuthState?.email !== window.ADMIN_EMAIL) {
    alert("Cette action est réservée au compte administrateur.");
    return;
  }
  closeSideMenu();
  if (!window.DemoModule || !window.DemoModule.supprimerDonneesDemo) {
    alert("Module Démo en cours de chargement, réessaie dans un instant.");
    return;
  }
  if (!confirm("Supprimer toutes les données de démonstration ?")) return;
  try {
    const res = await window.DemoModule.supprimerDonneesDemo();
    if (res.success) {
      alert(res.count + " éléments de démo supprimés avec succès !");
    } else {
      alert("Erreur : " + res.message);
    }
  } catch (err) {
    alert("Erreur lors de la suppression : " + err.message);
  }
});


// --- Mode Facturier (lignes multiples) ---
let modeFacturier = false;

let lignesFacture = [];
let ligneFactureSelectionnee = null;

function ajouterLigneFacture(p) {
  if (!p || !p.id) {
    alert("Ce produit n'est pas configuré correctement (id manquant).");
    return;
  }
  const quantite = calcValeurNumerique > 0 ? calcValeurNumerique : 1;
  const prixUnitaire = Number(p.prixVente) || 0;
  lignesFacture.push({
    produitId: p.id,
    nom: p.nom,
    prixUnitaire,
    quantite,
    totalLigne: quantite * prixUnitaire,
  });
  calcExpr = "";
  produitSelectionne = null;
  renderCalc();
  renderFacture();
}

function renderFacture() {
  const factureLignesEl = document.getElementById("factureLignes");
  const factureTotalEl = document.getElementById("factureTotalValue");
  if (!factureLignesEl || !factureTotalEl) return;
  const nbLignes = lignesFacture.length;
  factureLignesEl.dataset.count = Math.min(nbLignes, 5);
  factureLignesEl.classList.toggle("many", nbLignes > 5);
  if (lignesFacture.length === 0) {
    factureLignesEl.innerHTML = `<p class="placeholder-msg">Aucune ligne. Tape une quantité puis choisis une marque.</p>`;
  } else {
    factureLignesEl.innerHTML = lignesFacture.map((l, i) => `
      <div class="facture-ligne${i === ligneFactureSelectionnee ? " selected" : ""}" data-index="${i}">
        <span class="facture-ligne-nom">${l.nom}</span>
        <span class="facture-ligne-detail">${l.quantite} × ${l.prixUnitaire.toLocaleString("fr-FR")} FCFA</span>
        <span class="facture-ligne-total">${l.totalLigne.toLocaleString("fr-FR")} FCFA</span>
        <button class="facture-ligne-suppr" data-index="${i}">✕</button>
      </div>
    `).join("");
  }
  const total = lignesFacture.reduce((acc, l) => acc + l.totalLigne, 0);
  factureTotalEl.textContent = total.toLocaleString("fr-FR") + " FCFA";
}

const btnToggleFacturier = document.getElementById("btnToggleFacturier");
const facturePanel = document.getElementById("facturePanel");
const calcActionsEl = document.querySelector(".calc-actions");
function appliquerModeFacturier(actif) {
  modeFacturier = actif;
  window.modeFacturierActif = modeFacturier;
  if (btnToggleFacturier) {
    btnToggleFacturier.classList.toggle("active", modeFacturier);
    btnToggleFacturier.textContent = modeFacturier ? "🧮 Calculette classique" : "🧾 Mode Facturier";
  }
  if (facturePanel) facturePanel.hidden = !modeFacturier;
  const calcDisplayEl = document.querySelector(".calc-display");
  if (calcDisplayEl) calcDisplayEl.hidden = modeFacturier;
  const marqueGridEl = document.getElementById("marqueGrid");
  if (marqueGridEl) marqueGridEl.hidden = !modeFacturier;
  if (calcActionsEl) calcActionsEl.hidden = modeFacturier;
  document.body.classList.toggle("mode-facturier-actif", modeFacturier);
  calcExpr = "";
  produitSelectionne = null;
  renderCalc();
  renderFacture();
}
if (btnToggleFacturier) {
  btnToggleFacturier.addEventListener("click", () => {
    appliquerModeFacturier(!modeFacturier);
  });
}
appliquerModeFacturier(true);

const factureLignesContainer = document.getElementById("factureLignes");
if (factureLignesContainer) {
  factureLignesContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".facture-ligne-suppr");
    if (btn) {
      const idx = Number(btn.dataset.index);
      lignesFacture.splice(idx, 1);
      if (ligneFactureSelectionnee === idx) ligneFactureSelectionnee = null;
      else if (ligneFactureSelectionnee !== null && idx < ligneFactureSelectionnee) ligneFactureSelectionnee -= 1;
      renderFacture();
      return;
    }
    const ligneEl = e.target.closest(".facture-ligne");
    if (ligneEl) {
      const idx = Number(ligneEl.dataset.index);
      ligneFactureSelectionnee = (ligneFactureSelectionnee === idx) ? null : idx;
      renderFacture();
    }
  });
}

const btnFactureAnnuler = document.getElementById("btnFactureAnnuler");
if (btnFactureAnnuler) {
  btnFactureAnnuler.addEventListener("click", () => {
    if (lignesFacture.length && !confirm("Annuler toute la facture en cours ?")) return;
    lignesFacture = [];
    renderFacture();
  });
}

const btnFactureValider = document.getElementById("btnFactureValider");
if (btnFactureValider) {
  btnFactureValider.addEventListener("click", async () => {
    if (!lignesFacture.length) {
      alert("Ajoute au moins une ligne avant de valider.");
      return;
    }
    if (!window.VentesModule || !window.VentesModule.enregistrerVenteLigne) {
      alert("Module Ventes en cours de chargement, réessaie dans un instant.");
      return;
    }
    btnFactureValider.disabled = true;
    btnFactureValider.textContent = "Enregistrement...";
    const lignesAValider = [...lignesFacture];
    const lignesValidees = [];
    const erreurs = [];
    for (const ligne of lignesAValider) {
      const res = await window.VentesModule.enregistrerVenteLigne(ligne.produitId, ligne.quantite);
      if (!res.success) {
        erreurs.push(ligne.nom + " : " + res.message);
      } else {
        lignesValidees.push(ligne);
        const idx = lignesFacture.findIndex((l) => l === ligne);
        if (idx !== -1) lignesFacture.splice(idx, 1);
      }
    }
    if (lignesValidees.length > 0 && window.FacturesModule && window.FacturesModule.enregistrerFacture) {
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
    }
    btnFactureValider.disabled = false;
    btnFactureValider.textContent = "✅ Valider la facture";
    renderFacture();
    if (erreurs.length) {
      alert("Facture partiellement enregistrée. Erreurs :\n" + erreurs.join("\n"));
    } else {
      alert("Facture enregistrée avec succès !");
    }
  });
}

// ===== Installation PWA (FAB + menu) =====
(function(){
  let deferredPrompt = null;
  const DISMISS_KEY = 'magerante_install_fab_dismissed_at';
  const SNOOZE_DAYS = 7;

  function isStandalone(){
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }
  function wasRecentlyDismissed(){
    const ts = localStorage.getItem(DISMISS_KEY);
    if(!ts) return false;
    return (Date.now() - parseInt(ts,10)) / 86400000 < SNOOZE_DAYS;
  }
  function setInstalledState(){
    const item = document.getElementById('menuInstallApp');
    if(item){ item.classList.add('installee'); item.textContent = '✅ Application installée'; }
    const fab = document.getElementById('install-fab');
    if(fab){ fab.classList.remove('show'); fab.style.display = 'none'; }
  }
  function maybeShowFab(){
    if(isStandalone() || wasRecentlyDismissed()) return;
    const fab = document.getElementById('install-fab');
    if(fab){ fab.classList.add('show'); }
  }
  window.installApp = function(){
    if(deferredPrompt){
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(result){
        if(result.outcome === 'accepted'){ setInstalledState(); }
        deferredPrompt = null;
      });
    } else {
      alert('📲 Pour installer MAGERANTE :\n\nAndroid Chrome :\nMenu ⋮ → "Installer l\'application"\n\niPhone Safari :\nPartager ⬆️ → "Sur l\'écran d\'accueil"');
    }
  };
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(maybeShowFab, 1800);
  });
  window.addEventListener('appinstalled', setInstalledState);

  document.addEventListener('DOMContentLoaded', function(){
    const fabMain = document.getElementById('install-fab-main');
    if(fabMain) fabMain.addEventListener('click', window.installApp);
    const fabClose = document.getElementById('install-fab-close');
    if(fabClose) fabClose.addEventListener('click', function(ev){
      ev.stopPropagation();
      const fab = document.getElementById('install-fab');
      if(fab) fab.classList.remove('show');
      try{ localStorage.setItem(DISMISS_KEY, String(Date.now())); }catch(e){}
    });
    const menuInstall = document.getElementById('menuInstallApp');
    if(menuInstall) menuInstall.addEventListener('click', window.installApp);
    if(isStandalone()){ setInstalledState(); }
    else { setTimeout(maybeShowFab, 2500); }
  });
})();

// ===== Panneau "À propos" =====
document.addEventListener('DOMContentLoaded', function(){
  const menuAbout = document.getElementById('menuAbout');
  const aboutGate = document.getElementById('aboutGate');
  const btnCloseAbout = document.getElementById('btnCloseAbout');
  if(menuAbout && aboutGate){
    menuAbout.addEventListener('click', function(){
      aboutGate.hidden = false;
      if(typeof closeSideMenu === 'function') closeSideMenu();
    });
  }
  if(btnCloseAbout && aboutGate){
    btnCloseAbout.addEventListener('click', function(){ aboutGate.hidden = true; });
  }
});

// ===== Installation PWA (FAB + menu) =====
(function(){
  let deferredPrompt = null;
  const DISMISS_KEY = 'magerante_install_fab_dismissed_at';
  const SNOOZE_DAYS = 7;

  function isStandalone(){
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }
  function wasRecentlyDismissed(){
    const ts = localStorage.getItem(DISMISS_KEY);
    if(!ts) return false;
    return (Date.now() - parseInt(ts,10)) / 86400000 < SNOOZE_DAYS;
  }
  function setInstalledState(){
    const item = document.getElementById('menuInstallApp');
    if(item){ item.classList.add('installee'); item.textContent = '✅ Application installée'; }
    const fab = document.getElementById('install-fab');
    if(fab){ fab.classList.remove('show'); fab.style.display = 'none'; }
  }
  function maybeShowFab(){
    if(isStandalone() || wasRecentlyDismissed()) return;
    const fab = document.getElementById('install-fab');
    if(fab){ fab.classList.add('show'); }
  }
  window.installApp = function(){
    if(deferredPrompt){
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(result){
        if(result.outcome === 'accepted'){ setInstalledState(); }
        deferredPrompt = null;
      });
    } else {
      alert('📲 Pour installer MAGERANTE :\n\nAndroid Chrome :\nMenu ⋮ → "Installer l\'application"\n\niPhone Safari :\nPartager ⬆️ → "Sur l\'écran d\'accueil"');
    }
  };
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(maybeShowFab, 1800);
  });
  window.addEventListener('appinstalled', setInstalledState);

  document.addEventListener('DOMContentLoaded', function(){
    const fabMain = document.getElementById('install-fab-main');
    if(fabMain) fabMain.addEventListener('click', window.installApp);
    const fabClose = document.getElementById('install-fab-close');
    if(fabClose) fabClose.addEventListener('click', function(ev){
      ev.stopPropagation();
      const fab = document.getElementById('install-fab');
      if(fab) fab.classList.remove('show');
      try{ localStorage.setItem(DISMISS_KEY, String(Date.now())); }catch(e){}
    });
    const menuInstall = document.getElementById('menuInstallApp');
    if(menuInstall) menuInstall.addEventListener('click', window.installApp);
    if(isStandalone()){ setInstalledState(); }
    else { setTimeout(maybeShowFab, 2500); }
  });
})();

// ===== Panneau "À propos" =====
document.addEventListener('DOMContentLoaded', function(){
  const menuAbout = document.getElementById('menuAbout');
  const aboutGate = document.getElementById('aboutGate');
  const btnCloseAbout = document.getElementById('btnCloseAbout');
  if(menuAbout && aboutGate){
    menuAbout.addEventListener('click', function(){
      aboutGate.hidden = false;
      if(typeof closeSideMenu === 'function') closeSideMenu();
    });
  }
  if(btnCloseAbout && aboutGate){
    btnCloseAbout.addEventListener('click', function(){ aboutGate.hidden = true; });
  }
});
