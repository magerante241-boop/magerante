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
    viewContainer.innerHTML = `<p class="placeholder-msg">Les modules (Caisse, Ventes...) arriveront aux prochaines étapes.</p>`;
  } else if (view === "inventaire") {
    calcZone.hidden = true;
    if (window.InventaireModule) {
      window.InventaireModule.render(viewContainer);
    } else {
      viewContainer.innerHTML = `<p class="placeholder-msg">Chargement du module...</p>`;
    }
  } else {
    calcZone.hidden = true;
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
const actionsEl = document.getElementById("calcActions");
let calcValeurNumerique = 0;

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
    resultEl.textContent = isFinite(value)
      ? value.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " FCFA"
      : "Erreur";
    actionsEl.hidden = !(isFinite(value) && calcExpr !== "" && /[0-9]/.test(calcExpr));
  } catch {
    resultEl.textContent = "…";
    actionsEl.hidden = true;
  }
}

document.getElementById("numpad").addEventListener("click", (e) => {
  const key = e.target.dataset.key;
  if (!key) return;
  if (key === "AC") {
    calcExpr = "";
  } else if (key === "⌫") {
    calcExpr = calcExpr.slice(0, -1);
  } else if (key === "=") {
    // Le calcul est déjà recalculé en direct dans renderCalc()
  } else {
    calcExpr += key;
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
    if (btn.dataset.action === "vente") {
      if (window.VentesModule) {
        window.VentesModule.ouvrirModaleVente(calcValeurNumerique > 0 ? calcValeurNumerique : "");
      } else {
        alert("Module Ventes en cours de chargement, réessaie dans un instant.");
      }
      return;
    }
    // Étape suivante : brancher ACHAT / DÉPENSE / RECETTE / ENTRÉE STOCK sur Firestore.
    alert(`Action "${btn.dataset.action}" — sera enregistrée dans Firestore à une prochaine étape.\nMontant : ${resultEl.textContent}`);
  });
});

renderCalc();

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
document.getElementById("menuLogin").addEventListener("click", () => {
  closeSideMenu();
  if (window.openLoginModal) window.openLoginModal();
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
