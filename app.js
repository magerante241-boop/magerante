// app.js — squelette : horloge, navigation, calculatrice de base
// (l'Inventaire est géré par inventaire.js, exposé sur window.InventaireModule)

// --- Splash screen : affiché ~2.2s à l'ouverture, puis disparaît en fondu ---
window.addEventListener("load", () => {
  const splash = document.getElementById("splashScreen");
  if (splash) {
    setTimeout(() => splash.classList.add("hidden"), 2200);
  }
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

// --- Champs mot de passe : bascule afficher / masquer ---
document.querySelectorAll(".auth-eye-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.getElementById(btn.dataset.target);
    if (!target) return;
    const isHidden = target.type === "password";
    target.type = isHidden ? "text" : "password";
    btn.textContent = isHidden ? "🙈" : "👁️";
    btn.setAttribute("aria-label", isHidden ? "Masquer le mot de passe" : "Afficher le mot de passe");
  });
});

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
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    switchView(btn.dataset.view);
  });
});

// --- Calculatrice de gestion (logique de base) ---
let calcExpr = "";
const exprEl = document.getElementById("calcExpression");
const resultEl = document.getElementById("calcResult");
const actionsEl = document.getElementById("calcActions");

function renderCalc() {
  exprEl.textContent = calcExpr || "\u00A0";
  try {
    const safeExpr = calcExpr
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/,/g, ".");
    // eslint-disable-next-line no-new-func
    const value = safeExpr.trim() === "" ? 0 : Function(`"use strict"; return (${safeExpr})`)();
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
    // Étape suivante : brancher ces boutons sur Firestore (achats, ventes, etc.)
    alert(`Action "${btn.dataset.action}" — sera enregistrée dans Firestore à une prochaine étape.\nMontant : ${resultEl.textContent}`);
  });
});

renderCalc();

// --- Service Worker (mode PWA / hors-connexion) ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Échec enregistrement du service worker :", err);
    });
  });
}
