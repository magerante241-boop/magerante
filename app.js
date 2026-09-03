// app.js — squelette étape 1 : horloge, navigation, calculatrice de base
// (pas encore de Firestore ici — connexion cloud viendra à une étape dédiée)

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

// --- Navigation bas d'écran (affichage seul pour l'instant) ---
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    const placeholder = document.querySelector(".placeholder-msg");
    if (placeholder) {
      placeholder.textContent = view === "calc"
        ? "Les modules (Inventaire, Caisse, Ventes...) arriveront aux prochaines étapes."
        : `Module "${view}" — à construire à une prochaine étape.`;
    }
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
