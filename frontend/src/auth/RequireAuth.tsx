import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { getLogoutTarget } from './session'
import { useSession } from './useAuth'

/**
 * Route guard: renders its children only when logged in, otherwise redirects to /login and remembers the
 * requested page in `?redirect=` (e.g. an invite link), so the user lands there after login.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession()
  const location = useLocation()
  if (!session) {
    // A deliberate logout says where to go; React would otherwise render this redirect first.
    const afterLogout = getLogoutTarget()
    if (afterLogout) return <Navigate to={afterLogout} replace />
    const target = location.pathname + location.search
    return <Navigate to={`/login?redirect=${encodeURIComponent(target)}`} replace />
  }
  return <>{children}</>
}

/** Only allows same-app paths as redirect targets (no open redirect to other sites). */
export function safeRedirect(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}
