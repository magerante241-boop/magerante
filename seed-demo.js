const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require("./serviceAccountKey.json");
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const auth = getAuth();

const ETABLISSEMENTS = [
  {
    email: "bar.glass@demo.magerante.ga", password: "Demo1234!",
    nom: "Établissement", prenom: "Test", telephone: "074123456",
    name: "Le Régal de Glass", type: "bar", localisation: "Quartier Glass, Libreville",
    produits: [
      { nom: "Régab 33cl", categorie: "Bar", prixAchat: 300, prixVente: 400, stock: 120 },
      { nom: "Castel Beer 65cl", categorie: "Bar", prixAchat: 550, prixVente: 900, stock: 60 },
      { nom: "Guinness 33cl", categorie: "Bar", prixAchat: 500, prixVente: 700, stock: 48 },
      { nom: "Whisky Label 5 (verre)", categorie: "Bar", prixAchat: 800, prixVente: 1500, stock: 30 },
      { nom: "Sucrerie Coca-Cola 33cl", categorie: "Bar", prixAchat: 250, prixVente: 400, stock: 90 },
      { nom: "Eau minérale 1.5L", categorie: "Bar", prixAchat: 300, prixVente: 500, stock: 100 },
    ]
  },
  {
    email: "maquis.nombakele@demo.magerante.ga", password: "Demo1234!",
    nom: "Établissement", prenom: "Test", telephone: "066234567",
    name: "Maquis Chez Nadège", type: "restaurant", localisation: "Nombakélé, Libreville",
    produits: [
      { nom: "Poulet braisé (portion)", categorie: "Snack", prixAchat: 1500, prixVente: 2500, stock: 25 },
      { nom: "Poisson salé sauce", categorie: "Snack", prixAchat: 1800, prixVente: 3000, stock: 20 },
      { nom: "Riz gras (assiette)", categorie: "Snack", prixAchat: 800, prixVente: 1500, stock: 30 },
      { nom: "Régab 65cl", categorie: "Bar", prixAchat: 433, prixVente: 700, stock: 70 },
      { nom: "Sucrerie Fanta 33cl", categorie: "Bar", prixAchat: 250, prixVente: 400, stock: 80 },
    ]
  },
  {
    email: "club.louis@demo.magerante.ga", password: "Demo1234!",
    nom: "Établissement", prenom: "Test", telephone: "077345678",
    name: "VIP Lounge Louis", type: "club", localisation: "Quartier Louis, Libreville",
    produits: [
      { nom: "Bouteille Champagne Moët", categorie: "Club", prixAchat: 45000, prixVente: 75000, stock: 8 },
      { nom: "Bouteille Whisky Chivas 12", categorie: "Club", prixAchat: 25000, prixVente: 45000, stock: 12 },
      { nom: "Bouteille Vodka Ciroc", categorie: "Club", prixAchat: 30000, prixVente: 50000, stock: 10 },
      { nom: "Cigarettes Marlboro (paquet)", categorie: "Snack", prixAchat: 1000, prixVente: 1500, stock: 40 },
      { nom: "Régab 33cl", categorie: "Bar", prixAchat: 300, prixVente: 500, stock: 100 },
      { nom: "Glaçons (sachet)", categorie: "Snack", prixAchat: 200, prixVente: 500, stock: 50 },
    ]
  },
  {
    email: "depot.akebe@demo.magerante.ga", password: "Demo1234!",
    nom: "Établissement", prenom: "Test", telephone: "062456789",
    name: "Dépôt Boissons Akébé", type: "autre", localisation: "Akébé, Libreville",
    produits: [
      { nom: "Casier Régab 33cl (12)", categorie: "Bar", prixAchat: 3200, prixVente: 4200, stock: 40 },
      { nom: "Casier Castel Beer (12)", categorie: "Bar", prixAchat: 3300, prixVente: 4400, stock: 35 },
      { nom: "Carton Coca-Cola (24)", categorie: "Bar", prixAchat: 5500, prixVente: 7000, stock: 20 },
      { nom: "Bidon eau 5L", categorie: "Bar", prixAchat: 800, prixVente: 1200, stock: 60 },
    ]
  },
  {
    email: "snack.pk8@demo.magerante.ga", password: "Demo1234!",
    nom: "Établissement", prenom: "Test", telephone: "065567890",
    name: "Snack Bar PK8", type: "snack", localisation: "PK8, Libreville",
    produits: [
      { nom: "Beignets (sachet)", categorie: "Snack", prixAchat: 300, prixVente: 500, stock: 50 },
      { nom: "Sandwich poulet", categorie: "Snack", prixAchat: 700, prixVente: 1200, stock: 25 },
      { nom: "Jus de bissap 50cl", categorie: "Snack", prixAchat: 400, prixVente: 800, stock: 40 },
      { nom: "Brochettes de bœuf (unité)", categorie: "Snack", prixAchat: 300, prixVente: 500, stock: 60 },
      { nom: "Régab 33cl", categorie: "Bar", prixAchat: 300, prixVente: 450, stock: 80 },
    ]
  },
];

async function seed() {
  for (const e of ETABLISSEMENTS) {
    let uid;
    try {
      const user = await auth.createUser({
        email: e.email, password: e.password,
        displayName: `${e.prenom} ${e.nom}`,
      });
      uid = user.uid;
      console.log(`✅ Compte créé : ${e.email} (${uid})`);
    } catch (err) {
      if (err.code === "auth/email-already-exists") {
        const existing = await auth.getUserByEmail(e.email);
        uid = existing.uid;
        console.log(`↺ Compte déjà existant : ${e.email} (${uid})`);
      } else { throw err; }
    }

    await db.doc(`users/${uid}`).set({
      nom: e.nom, prenom: e.prenom, telephone: e.telephone, email: e.email,
      role: "PROPRIETAIRE", accountType: "enregistre", validated: true,
      establishmentId: uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.doc(`establishments/${uid}`).set({
      name: e.name, type: e.type, localisation: e.localisation,
      status: "actif", ownerId: uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const batch = db.batch();
    const ref = db.collection(`establishments/${uid}/produits`);
    e.produits.forEach((p) => {
      const docRef = ref.doc();
      batch.set(docRef, { ...p, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    await batch.commit();
    console.log(`   → ${e.produits.length} produits ajoutés pour "${e.name}"`);
  }
  console.log("\nTerminé. Identifiants de connexion (mot de passe identique pour tous : Demo1234!) :");
  ETABLISSEMENTS.forEach(e => console.log(`  ${e.name} → ${e.email}`));
}

seed().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
