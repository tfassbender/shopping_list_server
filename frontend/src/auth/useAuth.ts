import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'
import { accountApi, type SessionResponse } from '../api/auth'
import { syncEngine } from '../offline/engine'
import { clearSession, getSession, setSession, subscribeSession } from './session'

const LAST_USER_KEY = 'shoppinglist.lastUser'

/** The current session; re-renders the component on login/logout. */
export function useSession() {
  return useSyncExternalStore(subscribeSession, getSession)
}

/** The logged-in user (cached by TanStack Query under ['me']). */
export function useCurrentUser() {
  const session = useSession()
  return useQuery({ queryKey: ['me'], queryFn: accountApi.me, enabled: session !== null, staleTime: 60_000 })
}

/** Login/logout actions that keep the session store and the query cache consistent. */
export function useAuthActions() {
  const queryClient = useQueryClient()

  const startSession = useCallback(
    (response: SessionResponse) => {
      if (!response.token || !response.expiresAt) return
      // After an expired session the data of the previous user is still on the device (kept, so their
      // unsaved offline changes survive logging in again). Another user must not get it.
      if (lastUser() !== null && lastUser() !== response.user.id) {
        queryClient.clear()
        void syncEngine.clear()
      }
      rememberUser(response.user.id)
      setSession(response.token, response.expiresAt)
      queryClient.setQueryData(['me'], response.user)
    },
    [queryClient],
  )

  /** Deliberate logout; the app then shows [target]. */
  const logout = useCallback((target = '/login') => {
    clearSession({ then: target })
    // Drop all cached and offline data of the previous user (also from IndexedDB).
    queryClient.clear()
    void syncEngine.clear()
  }, [queryClient])

  return { startSession, logout }
}

function lastUser(): string | null {
  try {
    return localStorage.getItem(LAST_USER_KEY)
  } catch {
    return null
  }
}

function rememberUser(userId: string) {
  try {
    localStorage.setItem(LAST_USER_KEY, userId)
  } catch {
    // not remembered: the next login of another user can't clear the old data - acceptable
  }
}
