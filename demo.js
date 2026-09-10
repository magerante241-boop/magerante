// demo.js — Génération et suppression de données de démonstration (admin uniquement)
// Permet de tester toutes les fonctionnalités (stock, ventes, comptes en attente,
// établissements par zone) sans polluer les vraies données. Tout ce qui est créé
// ici porte le flag isDemo:true afin de pouvoir tout supprimer d'un clic.
import {
  db, doc, collection, addDoc, setDoc, getDocs, query, where,
  writeBatch, serverTimestamp
} from "./firebase-config.js";
import { appState } from "./state.js";

function produitsRef() {
  return collection(db, "establishments", appState.establishmentId, "produits");
}
function ventesRef() {
  return collection(db, "establishments", appState.establishmentId, "ventes");
}

const PRODUITS_DEMO_ETENDU = [
  { nom: "Régab 33cl", categorie: "Bar", prixAchat: 300, prixVente: 500, stock: 100 },
  { nom: "Régab 65cl", categorie: "Bar", prixAchat: 433, prixVente: 700, stock: 80 },
  { nom: "Castel Beer 33cl", categorie: "Bar", prixAchat: 275, prixVente: 450, stock: 100 },
  { nom: "Castel Beer 65cl", categorie: "Bar", prixAchat: 550, prixVente: 900, stock: 80 },
  { nom: "Beaufort 33cl", categorie: "Bar", prixAchat: 417, prixVente: 700, stock: 60 },
  { nom: "Guinness 33cl", categorie: "Bar", prixAchat: 583, prixVente: 1000, stock: 50 },
  { nom: "33 Export 33cl", categorie: "Bar", prixAchat: 275, prixVente: 450, stock: 60 },
  { nom: "Heineken 33cl", categorie: "Bar", prixAchat: 750, prixVente: 1100, stock: 50 },
  { nom: "Tembo 33cl", categorie: "Bar", prixAchat: 300, prixVente: 500, stock: 70 },
  { nom: "Malta Guinness 33cl", categorie: "Bar", prixAchat: 400, prixVente: 700, stock: 40 },
  { nom: "Malta Guinness 50cl", categorie: "Bar", prixAchat: 550, prixVente: 900, stock: 30 },
  { nom: "Coca-Cola 33cl", categorie: "Bar", prixAchat: 300, prixVente: 500, stock: 120 },
  { nom: "Coca-Cola 1L", categorie: "Bar", prixAchat: 600, prixVente: 1000, stock: 40 },
  { nom: "Martini 70cl", categorie: "Bar", prixAchat: 4500, prixVente: 7000, stock: 15 },
  { nom: "Martini 1L", categorie: "Bar", prixAchat: 6000, prixVente: 9000, stock: 15 },
  { nom: "Grand Versant 70cl", categorie: "Bar", prixAchat: 2000, prixVente: 3500, stock: 15 },
  { nom: "Grand Versant 1L", categorie: "Bar", prixAchat: 2500, prixVente: 4000, stock: 15 },
  { nom: "Label 5 70cl", categorie: "Bar", prixAchat: 7000, prixVente: 13000, stock: 15 },
  { nom: "Label 5 1L", categorie: "Bar", prixAchat: 9000, prixVente: 17000, stock: 15 },
  { nom: "Ricard 70cl", categorie: "Bar", prixAchat: 7000, prixVente: 13000, stock: 15 },
  { nom: "Ricard 1L", categorie: "Bar", prixAchat: 9000, prixVente: 17000, stock: 15 },
  { nom: "Booster 33cl", categorie: "Bar", prixAchat: 400, prixVente: 700, stock: 60 },
  { nom: "Brochette de bœuf", categorie: "Snack", prixAchat: 500, prixVente: 1000, stock: 40 },
  { nom: "Poulet braisé (portion)", categorie: "Snack", prixAchat: 1500, prixVente: 2500, stock: 25 },
  { nom: "Beignets (lot de 5)", categorie: "Snack", prixAchat: 300, prixVente: 500, stock: 50 },
  { nom: "Whisky Johnnie Walker Red Label 70cl", categorie: "Club", prixAchat: 8000, prixVente: 15000, stock: 20 },
  { nom: "Champagne Moët (bouteille)", categorie: "Club", prixAchat: 25000, prixVente: 40000, stock: 8 },
];

export async function genererProduitsDemo() {
  if (!appState.establishmentId) {
    return { success: false, message: "Établissement non initialisé." };
  }
  const ref = produitsRef();
  const existant = await getDocs(query(ref, where("isDemo", "==", true)));
  if (!existant.empty) {
    return { success: true, count: 0, message: "Produits démo déjà présents, import ignoré." };
  }
  const batch = writeBatch(db);
  PRODUITS_DEMO_ETENDU.forEach((p) => {
    const newDocRef = doc(ref);
    batch.set(newDocRef, {
      ...p,
      isDemo: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return { success: true, count: PRODUITS_DEMO_ETENDU.length };
}

export async function genererVentesDemo(nombreVentes = 18) {
  if (!appState.establishmentId) {
    return { success: false, message: "Établissement non initialisé." };
  }
  const snap = await getDocs(produitsRef());
  const produits = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (produits.length === 0) {
    return { success: false, message: "Aucun produit dans l'inventaire — importe d'abord les produits démo." };
  }

  const batch = writeBatch(db);
  const ref = ventesRef();
  const maintenant = Date.now();
  const septJoursMs = 7 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < nombreVentes; i++) {
    const dateAlea = new Date(maintenant - Math.random() * septJoursMs);
    const nouvelleVenteRef = doc(ref);

    if (Math.random() < 0.8) {
      const produit = produits[Math.floor(Math.random() * produits.length)];
      const qte = 1 + Math.floor(Math.random() * 4);
      const montant = qte * (produit.prixVente || 0);
      batch.set(nouvelleVenteRef, {
        montant, type: "produit",
        produitId: produit.id, produitNom: produit.nom,
        quantite: qte,
        date: dateAlea,
        isDemo: true,
      });
    } else {
      const montant = [500, 1000, 1500, 2000, 3000, 5000][Math.floor(Math.random() * 6)];
      batch.set(nouvelleVenteRef, {
        montant, type: "libre",
        date: dateAlea,
        isDemo: true,
      });
    }
  }

  await batch.commit();
  return { success: true, count: nombreVentes };
}

export async function genererComptesEtZonesDemo() {
  const comptesDemo = [
    { nom: "Ndong", prenom: "Paul", email: "demo.paul.ndong@example.com", telephone: "074000001", zone: "Akanda" },
    { nom: "Obiang", prenom: "Sylvie", email: "demo.sylvie.obiang@example.com", telephone: "074000002", zone: "Nzeng-Ayong" },
    { nom: "Mba", prenom: "Jean", email: "demo.jean.mba@example.com", telephone: "074000003", zone: "Akanda" },
    { nom: "Koumba", prenom: "Alice", email: "demo.alice.koumba@example.com", telephone: "074000004", zone: "Charbonnages" },
  ];

  const batch = writeBatch(db);

  comptesDemo.forEach((c) => {
    const uidRef = doc(collection(db, "users"));
    const etabRef = doc(collection(db, "establishments"));
    batch.set(uidRef, {
      nom: c.nom, prenom: c.prenom, telephone: c.telephone, email: c.email,
      role: "PROPRIETAIRE",
      accountType: "enregistre",
      validated: false,
      establishmentId: etabRef.id,
      isDemo: true,
      updatedAt: serverTimestamp(),
    });
    batch.set(etabRef, {
      name: "Bar demo " + c.prenom,
      type: "bar",
      localisation: c.zone,
      whatsappEtablissement: null,
      gps: null,
      lienGoogleMaps: "",
      telephone: c.telephone,
      status: "en_attente",
      ownerId: uidRef.id,
      isDemo: true,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return { success: true, count: comptesDemo.length };
}

export async function genererDonneesDemoCompletes() {
  const resProduits = await genererProduitsDemo();
  if (!resProduits.success) return resProduits;
  const resVentes = await genererVentesDemo();
  const resComptes = await genererComptesEtZonesDemo();
  return {
    success: true,
    resume: `${resProduits.count} produits, ${resVentes.count || 0} ventes, ${resComptes.count} comptes/établissements démo créés.`,
  };
}

export async function supprimerDonneesDemo() {
  let total = 0;

  if (appState.establishmentId) {
    const qProduits = query(produitsRef(), where("isDemo", "==", true));
    const snapProduits = await getDocs(qProduits);
    if (!snapProduits.empty) {
      const batch1 = writeBatch(db);
      snapProduits.docs.forEach((d) => batch1.delete(d.ref));
      await batch1.commit();
      total += snapProduits.size;
    }

    const qVentes = query(ventesRef(), where("isDemo", "==", true));
    const snapVentes = await getDocs(qVentes);
    if (!snapVentes.empty) {
      const batch2 = writeBatch(db);
      snapVentes.docs.forEach((d) => batch2.delete(d.ref));
      await batch2.commit();
      total += snapVentes.size;
    }
  }

  const qUsers = query(collection(db, "users"), where("isDemo", "==", true));
  const snapUsers = await getDocs(qUsers);
  if (!snapUsers.empty) {
    const batch3 = writeBatch(db);
    snapUsers.docs.forEach((d) => batch3.delete(d.ref));
    await batch3.commit();
    total += snapUsers.size;
  }

  const qEtabs = query(collection(db, "establishments"), where("isDemo", "==", true));
  const snapEtabs = await getDocs(qEtabs);
  if (!snapEtabs.empty) {
    const batch4 = writeBatch(db);
    snapEtabs.docs.forEach((d) => batch4.delete(d.ref));
    await batch4.commit();
    total += snapEtabs.size;
  }

  return { success: true, count: total };
}

window.DemoModule = {
  genererProduitsDemo,
  genererVentesDemo,
  genererComptesEtZonesDemo,
  genererDonneesDemoCompletes,
  supprimerDonneesDemo,
};
