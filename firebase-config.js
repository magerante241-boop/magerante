// firebase-config.js
// ⚠️ Complète bien l'apiKey ci-dessous avec la valeur exacte de ta console Firebase
// (Paramètres du projet > Général > magerante-web > Extrait de configuration du SDK)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp,
  collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously,
  EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCt2I_RjoWmfnJ-8N3kT9WIIezc9EqrSCA",
  authDomain: "magerante-c1b66.firebaseapp.com",
  projectId: "magerante-c1b66",
  storageBucket: "magerante-c1b66.firebasestorage.app",
  messagingSenderId: "264116354317",
  appId: "1:264116354317:web:eae5b779f0ac3ad34bc444",
  measurementId: "G-2JTMWVXVXW"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

export {
  doc, getDoc, setDoc, serverTimestamp,
  collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, where,
  onAuthStateChanged, signInAnonymously,
  EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut
};
