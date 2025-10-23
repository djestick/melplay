import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type User,
  onAuthStateChanged,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
import { firebaseServices } from '../lib/firebase.ts'

type AuthStatus = 'loading' | 'ready' | 'mock' | 'error'

export type AppUser = Pick<User, 'uid' | 'displayName' | 'photoURL' | 'email'>

const previewUser: AppUser = {
  uid: 'preview-user',
  displayName: 'Demo user',
  photoURL: null,
  email: null,
}

const isStandaloneDisplay = () => {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.matchMedia?.('(display-mode: fullscreen)')?.matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

const isIOSDevice = () => {
  if (typeof navigator === 'undefined') {
    return false
  }

  const ua = navigator.userAgent.toLowerCase()
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    ''

  return /iphone|ipad|ipod/.test(ua) || platform.toLowerCase().includes('ios')
}

const prefersRedirectAuth = () => {
  if (typeof window === 'undefined') {
    return false
  }

  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches === true

  return isStandaloneDisplay() || isIOSDevice() || coarsePointer
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

  const handleAuthError = useCallback((authError: unknown) => {
    const fallback = 'Unable to complete Google sign-in.'
    if (authError instanceof Error) {
      setError(authError.message || fallback)
    } else {
      setError(fallback)
    }
    setStatus('error')
  }, [])

  useEffect(() => {
    if (!auth || !hasValidConfig) {
      return
    }

    getRedirectResult(auth)
      .then((result) => {
        const nextUser = result?.user

        if (!nextUser) {
          return
        }

        setUser({
          uid: nextUser.uid,
          displayName: nextUser.displayName,
          photoURL: nextUser.photoURL,
          email: nextUser.email,
        })
        setStatus('ready')
        setError(null)
      })
      .catch((authError) => {
        const code = (authError as { code?: string })?.code ?? ''
        if (code === 'auth/no-auth-event') {
          return
        }
        handleAuthError(authError)
      })
  }, [auth, handleAuthError, hasValidConfig])

  const signIn = useCallback(async () => {
    if (!auth || !googleProvider || !hasValidConfig) {
      setStatus('mock')
      setUser(previewUser)
      return
    }

    const forcedRedirect = prefersRedirectAuth()

    try {
      if (forcedRedirect) {
        await signInWithRedirect(auth, googleProvider)
      } else {
        await signInWithPopup(auth, googleProvider)
      }
      setError(null)
    } catch (authError) {
      const code = (authError as { code?: string })?.code ?? ''

      if (
        !forcedRedirect &&
        (code.startsWith('auth/popup') || code === 'auth/network-request-failed')
      ) {
        try {
          await signInWithRedirect(auth, googleProvider)
          setError(null)
          return
        } catch (redirectError) {
          handleAuthError(redirectError)
          return
        }
      }

      handleAuthError(authError)
    }
  }, [auth, googleProvider, hasValidConfig, handleAuthError])

  const signOutUser = useCallback(async () => {
    if (!auth || !hasValidConfig) {
      setUser(previewUser)
      setStatus('mock')
      return
    }

    try {
      await signOut(auth)
    } catch (authError) {
      handleAuthError(authError)
    }
  }, [auth, handleAuthError, hasValidConfig])

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
