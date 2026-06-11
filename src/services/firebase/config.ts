// ============================================
// MAGERANTE — src/services/firebase/config.ts
// Configuration et initialisation Firebase
// ============================================

import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getStorage, connectStorageEmulator } from 'firebase/storage'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { getAnalytics, isSupported } from 'firebase/analytics'

// --------- CONFIGURATION ---------
// Les valeurs viennent de vos variables d'environnement (.env.local)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// --------- INITIALISATION ---------
// Évite d'initialiser deux fois (important en développement)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

// --------- SERVICES ---------
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app)

// --------- ANALYTICS (production seulement) ---------
export const initAnalytics = async () => {
  const supported = await isSupported()
  if (supported) {
    return getAnalytics(app)
  }
  return null
}

// --------- EMULATEURS (développement local) ---------
// Décommenter ces lignes pour tester en local sans toucher la prod
const isDev = import.meta.env.VITE_APP_ENV === 'development'
const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'

if (isDev && useEmulators) {
  console.log('🔧 Mode Emulateurs Firebase activé')
  connectAuthEmulator(auth, 'http://localhost:9099')
  connectFirestoreEmulator(db, 'localhost', 8080)
  connectStorageEmulator(storage, 'localhost', 9199)
  connectFunctionsEmulator(functions, 'localhost', 5001)
}

export default app
