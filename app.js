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
  const viewContainer = document.getElementById("viewContainer");

  // On quitte proprement le module précédent s'il en avait un (désabonnement Firestore)
  if (window.InventaireModule) window.InventaireModule.cleanup();

  if (view === "calc") {
    calcZone.hidden = false;
    viewContainer.hidden = true;
    viewContainer.innerHTML = "";
  } else if (view === "inventaire") {
    calcZone.hidden = true;
    viewContainer.hidden = false;
    if (window.InventaireModule) {
      window.InventaireModule.render(viewContainer);
    } else {
      viewContainer.innerHTML = `<p class="placeholder-msg">Chargement du module...</p>`;
    }
  } else if (view === "factures") {
    calcZone.hidden = true;
    viewContainer.hidden = false;
    if (window.FacturesModule) {
      window.FacturesModule.render(viewContainer);
    } else {
      viewContainer.innerHTML = `<p class="placeholder-msg">Chargement du module Factures...</p>`;
    }
  } else {
    calcZone.hidden = true;
    viewContainer.hidden = false;
    viewContainer.innerHTML = `<p class="placeholder-msg">Module "${view}" — à construire à une prochaine étape.</p>`;
  }
}

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
  exprEl.textContent = calcExpr || "\u00A0";
  try {
    const safeExpr = calcExpr
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/,/g, ".");
    // eslint-disable-next-line no-new-func
    const value = safeExpr.trim() === "" ? 0 : Function(`"use strict"; return (${safeExpr})`)();
    calcValeurNumerique = isFinite(value) ? value : 0;
    if (isFinite(value)) {
      resultValueEl.textContent = value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
      resultUnitEl.hidden = false;
    } else {
      resultValueEl.textContent = "Erreur";
      resultUnitEl.hidden = true;
    }
  } catch {
    resultValueEl.textContent = "…";
    resultUnitEl.hidden = true;
  }
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
  } else if (key === "⌫") {
    calcExpr = calcExpr.slice(0, -1);
  } else if (key === "=") {
    // Le calcul est déjà recalculé en direct dans renderCalc()
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
function filtrerCategoriesCalc(type) {
  const estBar = (type || "").toLowerCase() === "bar";
  const marqueGrid = document.getElementById("marqueGrid");
  if (marqueGrid) marqueGrid.hidden = !estBar;
}
window.filtrerCategoriesCalc = filtrerCategoriesCalc;

// --- Tuiles Bar / Snack / Club : liste de produits filtrée par catégorie ---
const calcProduitsListe = document.getElementById("calcProduitsListe");

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
    fermerListeProduits();
    marqueTaillesEl.innerHTML = `<p class="placeholder-msg">Chargement...</p>`;
    marqueTaillesEl.hidden = false;
    marqueTaillesEl.style.top = (btn.offsetTop + btn.offsetHeight + 4) + "px";
    marqueTaillesEl.style.left = btn.offsetLeft + "px";
    const tousLesProduits = await chargerTousProduitsSurs();
    marqueTaillesEl.innerHTML = Object.entries(tailles).map(([taille, nomProduit]) => {
      const p = tousLesProduits.find((x) => x.nom === nomProduit);
      const label = taille;
      const suffixe = p ? ` · ${p.prixVente} FCFA` : " (non configuré)";
      return `<button class="marque-taille-item" data-nom="${nomProduit}">${label}${suffixe}</button>`;
    }).join("");
    marqueTaillesEl.querySelectorAll(".marque-taille-item").forEach((item) => {
      item.addEventListener("click", () => {
        const p = tousLesProduits.find((x) => x.nom === item.dataset.nom);
        if (!p) {
          alert("Ce produit n'est pas encore configuré dans l'inventaire.");
          return;
        }
        calcExpr = String(p.prixVente);
        produitSelectionne = {
          nom: p.nom,
          prixVente: Number(p.prixVente) || 0,
          prixAchat: Number(p.prixAchat) || 0,
          stock: Number(p.stock) || 0,
        };
        renderCalc();
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
      calcExpr = item.dataset.prix;
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
      calcExpr = item.dataset.prix;
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
      calcExpr = String(p.prixVente);
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
