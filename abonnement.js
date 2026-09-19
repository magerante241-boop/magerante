import { db, doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "./firebase-config.js";
import { appState } from "./state.js";

const PLANS = {
  mensuel: { label: "Mensuel", montant: 3000 },
  trimestriel: { label: "Trimestriel", montant: 8000 },
  annuel: { label: "Annuel", montant: 28000 }
};
const ADMIN_PHONE = "24160141924";
const AIRTEL_MONEY = "24174450924";

function formaterDate(d) {
  return new Date(d).toLocaleDateString("fr-FR");
}
function joursRestants(dateFin) {
  if (!dateFin) return null;
  const d = dateFin.toDate ? dateFin.toDate() : new Date(dateFin);
  return Math.ceil((d - new Date()) / 86400000);
}

function creerModaleAbonnement() {
  if (document.getElementById("modalAbonnement")) return;
  const overlay = document.createElement("div");
  overlay.id = "modalAbonnement";
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="modal-box">' +
      '<button class="modal-close" id="btnFermerAbonnement">✕</button>' +
      '<h3>💳 Mon abonnement</h3>' +
      '<div id="abonnementContenu"></div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) fermerModaleAbonnement(); });
  document.getElementById("btnFermerAbonnement").addEventListener("click", fermerModaleAbonnement);
}
function fermerModaleAbonnement() {
  const m = document.getElementById("modalAbonnement");
  if (m) m.hidden = true;
}
async function ouvrirModaleAbonnement() {
  creerModaleAbonnement();
  document.getElementById("modalAbonnement").hidden = false;
  await rafraichirContenuAbonnement();
}

async function demanderAbonnement(planKey) {
  const estId = appState.establishmentId;
  if (!estId) return;
  const plan = PLANS[planKey];
  await setDoc(doc(db, "establishments", estId), {
    abonnement: { statut: "demande", plan: planKey, montant: plan.montant, dateDemande: serverTimestamp() }
  }, { merge: true });
  const estSnap = await getDoc(doc(db, "establishments", estId));
  const nomEtab = estSnap.data()?.name || "établissement";
  const userSnap = await getDoc(doc(db, "users", estId));
  const ud = userSnap.data() || {};
  const nomComplet = ((ud.nom || "") + " " + (ud.prenom || "")).trim() || "Proprietaire";
  const texte = "Demande d'abonnement MAGERANTE\n" + nomComplet +
    "\nEtablissement : " + nomEtab +
    "\nTelephone : " + (ud.telephone || estSnap.data()?.telephone || "") +
    "\nPlan : " + plan.label + " (" + plan.montant + " FCFA)" +
    "\n\nAccepter ou refuser depuis le panneau admin :" +
    "\nhttps://magerante241-boop.github.io/magerante/admin.html";
  window.open("https://wa.me/" + ADMIN_PHONE + "?text=" + encodeURIComponent(texte), "_blank");
  rendreEtatAbonnement({ statut: "demande", plan: planKey });
}

function rendreEtatAbonnement(ab) {
  const zone = document.getElementById("abonnementContenu");
  if (!zone) return;
  if (!ab || !ab.statut || ab.statut === "aucun" || ab.statut === "refuse") {
    zone.innerHTML =
      "<p>Choisis une formule :</p>" +
      '<div class="abonnement-plans">' +
        '<button class="btn-plan" data-plan="mensuel">Mensuel<br>3 000 FCFA</button>' +
        '<button class="btn-plan" data-plan="trimestriel">Trimestriel<br>8 000 FCFA</button>' +
        '<button class="btn-plan" data-plan="annuel">Annuel<br>28 000 FCFA</button>' +
      "</div>" +
      (ab && ab.statut === "refuse" ? "<p class='abonnement-refuse'>Ta dernière demande a été refusée.</p>" : "");
    zone.querySelectorAll(".btn-plan[data-plan]").forEach((btn) => {
      btn.addEventListener("click", () => demanderAbonnement(btn.dataset.plan));
    });
    return;
  }
  if (ab.statut === "demande") {
    zone.innerHTML = "<p>⏳ Demande envoyée pour le plan <strong>" + (PLANS[ab.plan]?.label || ab.plan) +
      "</strong>.<br>En attente de réponse de l'admin.</p>";
    return;
  }
  if (ab.statut === "accepte_attente_paiement") {
    zone.innerHTML =
      "<p>✅ Demande acceptée !</p>" +
      "<p>Effectue le paiement de <strong>" + ab.montant + " FCFA</strong> :</p>" +
      "<p>📱 Moov Money : <strong>" + ADMIN_PHONE + "</strong></p>" +
      "<p>📱 Airtel Money : <strong>" + AIRTEL_MONEY + "</strong></p>" +
      "<p class='abonnement-note'>La fonctionnalité s'active dès que l'admin confirme la réception du paiement.</p>";
    return;
  }
  if (ab.statut === "actif") {
    const jours = joursRestants(ab.dateFin);
    let classe = "abonnement-ok";
    if (jours !== null && jours <= 2) classe = "abonnement-urgent";
    else if (jours !== null && jours <= 7) classe = "abonnement-alerte";
    zone.innerHTML =
      '<p class="' + classe + '">🟢 Abonnement ' + (PLANS[ab.plan]?.label || ab.plan) + " actif</p>" +
      "<p>" + (jours !== null ? jours + " jour(s) restant(s)" : "") + "</p>" +
      "<p class='abonnement-note'>Expire le " + (ab.dateFin ? formaterDate(ab.dateFin.toDate ? ab.dateFin.toDate() : ab.dateFin) : "?") + "</p>" +
      (jours !== null && jours <= 7 ? "<p class='abonnement-alerte'>Pense à renouveler pour ne pas perdre l'accès.</p>" : "") +
      '<button class="btn-plan" id="btnRenouveler">🔄 Renouveler</button>';
    const btnRenew = document.getElementById("btnRenouveler");
    if (btnRenew) btnRenew.addEventListener("click", () => rendreEtatAbonnement({ statut: "aucun" }));
    return;
  }
  if (ab.statut === "expire") {
    zone.innerHTML = "<p class='abonnement-urgent'>🔴 Abonnement expiré.</p>";
    setTimeout(() => rendreEtatAbonnement({ statut: "aucun" }), 1200);
  }
}

async function rafraichirContenuAbonnement() {
  const estId = appState.establishmentId;
  if (!estId) return;
  const snap = await getDoc(doc(db, "establishments", estId));
  rendreEtatAbonnement(snap.data()?.abonnement);
}

function initAbonnement() {
  const btnMenu = document.getElementById("menuAbonnement");
  if (btnMenu && !btnMenu._abonnementBound) {
    btnMenu.addEventListener("click", ouvrirModaleAbonnement);
    btnMenu._abonnementBound = true;
  } else if (!btnMenu) {
    setTimeout(initAbonnement, 300);
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(initAbonnement, 300));
} else {
  setTimeout(initAbonnement, 300);
}

export { ouvrirModaleAbonnement };
