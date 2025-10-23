import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
import { firebaseServices } from '../lib/firebase.ts'

type AuthStatus = 'loading' | 'ready' | 'mock' | 'error'

export type AppUser = Pick<User, 'uid' | 'displayName' | 'photoURL' | 'email'>

const previewUser: AppUser = {
  uid: 'preview-user',
  displayName: 'Святослав',
  photoURL: null,
  email: null,
}

export function useAuth() {
  const { auth, googleProvider, hasValidConfig } = firebaseServices

  const [user, setUser] = useState<AppUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasValidConfig || !auth) {
      setUser(previewUser)
      setStatus('mock')
      return
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        if (nextUser) {
          setUser({
            uid: nextUser.uid,
            displayName: nextUser.displayName,
            photoURL: nextUser.photoURL,
            email: nextUser.email,
          })
        } else {
          setUser(null)
        }
        setStatus('ready')
        setError(null)
      },
      (authError) => {
        console.error('[firebase] auth error', authError)
        setError(authError.message)
        setStatus('error')
      },
    )

    return () => unsubscribe()
  }, [auth, hasValidConfig])

  const signIn = useCallback(async () => {
    if (!auth || !googleProvider || !hasValidConfig) {
      setStatus('mock')
      setUser(previewUser)
      return
    }

    try {
      const prefersRedirect = window.matchMedia('(pointer: coarse)').matches

      if (prefersRedirect) {
        await signInWithRedirect(auth, googleProvider)
      } else {
        await signInWithPopup(auth, googleProvider)
      }

      setError(null)
    } catch (authError) {
      const message =
        authError instanceof Error
          ? authError.message
          : 'Не удалось выполнить вход через Google.'
      setError(message)
      setStatus('error')
    }
  }, [auth, googleProvider, hasValidConfig])

  const signOutUser = useCallback(async () => {
    if (!auth || !hasValidConfig) {
      setUser(previewUser)
      setStatus('mock')
      return
    }

    try {
      await signOut(auth)
    } catch (authError) {
      const message =
        authError instanceof Error
          ? authError.message
          : 'Не удалось выполнить выход из аккаунта.'
      setError(message)
    }
  }, [auth, hasValidConfig])

  const helpers = useMemo(
    () => ({
      status,
      user,
      error,
      signIn,
      signOut: signOutUser,
      isUsingMock: status === 'mock',
    }),
    [error, signIn, signOutUser, status, user],
  )

  return helpers
}

