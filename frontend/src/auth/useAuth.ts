import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'
import { accountApi, type SessionResponse } from '../api/auth'
import { clearSession, getSession, setSession, subscribeSession } from './session'

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
      setSession(response.token, response.expiresAt)
      queryClient.setQueryData(['me'], response.user)
    },
    [queryClient],
  )

  const logout = useCallback(() => {
    clearSession()
    // Drop all cached data of the previous user.
    queryClient.clear()
  }, [queryClient])

  return { startSession, logout }
}
