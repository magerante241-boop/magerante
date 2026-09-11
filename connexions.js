import { db, addDoc, collection, serverTimestamp } from "./firebase-config.js";

let geoloc = null;
async function obtenirGeoloc() {
  if (geoloc !== null) return geoloc;
  try {
    const rep = await fetch("https://ipwho.is/");
    const data = await rep.json();
    geoloc = data?.success ? { ville: data.city || null, pays: data.country || null } : { ville: null, pays: null };
  } catch (e) {
    geoloc = { ville: null, pays: null };
  }
  return geoloc;
}

export async function enregistrerConnexion(user, contexte) {
  if (!user || user.isAnonymous) return;
  try {
    const { ville, pays } = await obtenirGeoloc();
    await addDoc(collection(db, "connexions"), {
      uid: user.uid,
      email: user.email || null,
      contexte: contexte || "app",
      ville, pays,
      dateConnexion: serverTimestamp()
    });
  } catch (e) {
    console.error("Erreur d'enregistrement de connexion :", e);
  }
}
