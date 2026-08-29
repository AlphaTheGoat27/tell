import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'

// Values come from Firebase console -> Project settings -> Your apps.
// See frontend/.env.example. When unset, the app runs in local demo mode.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId,
)

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null
const auth = app ? getAuth(app) : null

export async function signInWithGoogle(): Promise<User> {
  if (!auth) throw new Error('Firebase is not configured in this environment.')
  const result = await signInWithPopup(auth, new GoogleAuthProvider())
  return result.user
}

export async function signOutUser(): Promise<void> {
  if (auth) await signOut(auth)
}

export function watchAuth(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null)
    return () => {}
  }
  return onAuthStateChanged(auth, callback)
}

// getIdToken() auto-refreshes expired tokens, so registering this as the
// API token provider keeps long study sessions authenticated.
export async function currentIdToken(): Promise<string | null> {
  if (!auth?.currentUser) return null
  return auth.currentUser.getIdToken()
}
