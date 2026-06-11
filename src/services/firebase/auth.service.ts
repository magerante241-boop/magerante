// ============================================
// MAGERANTE — src/services/firebase/auth.service.ts
// Toutes les fonctions d'authentification
// ============================================

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  type User
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './config'

// --------- TYPES ---------
interface RegisterData {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
  businessId?: string
}

interface LoginData {
  email: string
  password: string
}

// --------- INSCRIPTION ---------
export const register = async (data: RegisterData) => {
  try {
    // 1. Créer le compte Firebase Auth
    const { user } = await createUserWithEmailAndPassword(
      auth,
      data.email,
      data.password
    )

    // 2. Mettre à jour le profil Auth
    await updateProfile(user, {
      displayName: `${data.firstName} ${data.lastName}`
    })

    // 3. Créer le document utilisateur dans Firestore
    await setDoc(doc(db, 'users', user.uid), {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || '',
      businessId: data.businessId || '',
      role: 'admin', // Premier utilisateur = admin
      permissions: ['read', 'write', 'delete'],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    return { success: true, user }
  } catch (error: any) {
    return { success: false, error: getErrorMessage(error.code) }
  }
}

// --------- CONNEXION ---------
export const login = async ({ email, password }: LoginData) => {
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password)

    // Récupérer le profil Firestore
    const userDoc = await getDoc(doc(db, 'users', user.uid))
    const profile = userDoc.data()

    return { success: true, user, profile }
  } catch (error: any) {
    return { success: false, error: getErrorMessage(error.code) }
  }
}

// --------- DÉCONNEXION ---------
export const logout = async () => {
  try {
    await signOut(auth)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// --------- RÉINITIALISATION MOT DE PASSE ---------
export const resetPassword = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: getErrorMessage(error.code) }
  }
}

// --------- ÉCOUTE DE L'ÉTAT D'AUTH ---------
// À utiliser dans un Context pour toute l'app
export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback)
}

// --------- TRADUCTION DES ERREURS ---------
const getErrorMessage = (code: string): string => {
  const errors: Record<string, string> = {
    'auth/email-already-in-use': 'Cette adresse email est déjà utilisée.',
    'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
    'auth/user-not-found': 'Aucun compte trouvé avec cet email.',
    'auth/wrong-password': 'Mot de passe incorrect.',
    'auth/invalid-email': 'Adresse email invalide.',
    'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
    'auth/network-request-failed': 'Erreur réseau. Vérifiez votre connexion.',
    'auth/user-disabled': 'Ce compte a été désactivé.',
  }
  return errors[code] || 'Une erreur est survenue. Réessayez.'
}
