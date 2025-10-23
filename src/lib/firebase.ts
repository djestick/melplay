import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const defaultFirebaseConfig = {
  apiKey: 'AIzaSyAzbZJDsLX1wo6nW7t55Pxgu4WL3R9tvhw',
  authDomain: 'lumpo1.firebaseapp.com',
  projectId: 'lumpo1',
  storageBucket: 'lumpo1.appspot.com',
  messagingSenderId: '964713129480',
  appId: '1:964713129480:web:2246804b67928a62ac93bd',
  measurementId: 'G-HGYNGJ9V15',
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? defaultFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? defaultFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? defaultFirebaseConfig.projectId,
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? defaultFirebaseConfig.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? defaultFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? defaultFirebaseConfig.appId,
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? defaultFirebaseConfig.measurementId,
} as const

const hasValidConfig = Object.values(firebaseConfig).every(
  (value) => typeof value === 'string' && value.length > 0,
)

let app: FirebaseApp | null = null
let auth: Auth | null = null
let googleProvider: GoogleAuthProvider | null = null
let db: Firestore | null = null

if (hasValidConfig) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  auth.languageCode = 'ru'
  void setPersistence(auth, browserLocalPersistence)

  googleProvider = new GoogleAuthProvider()
  googleProvider.setCustomParameters({
    prompt: 'select_account',
  })

  db = getFirestore(app)
} else if (import.meta.env.DEV) {
  console.warn(
    '[firebase] Отсутствует конфигурация Firebase. Авторизация будет работать в mock-режиме.',
  )
}

export const firebaseServices = {
  app,
  auth,
  googleProvider,
  db,
  hasValidConfig,
} as const
