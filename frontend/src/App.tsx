import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { authApi, toThemePreference } from './api/auth'
import { RequireAuth } from './auth/RequireAuth'
import { getSession, setSession, shouldRefresh } from './auth/session'
import { useCurrentUser, useSession } from './auth/useAuth'
import { Layout } from './components/Layout'
import { ListPage } from './lists/ListPage'
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from './pages/auth/EmailTokenPages'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SettingsPage } from './pages/SettingsPage'
import { InvitePage } from './pages/space/InvitePage'
import { MembersPage } from './pages/space/MembersPage'
import { SpacePage } from './pages/space/SpacePage'
import { applyTheme } from './theme/theme'

/** Route table. Every page is rendered inside <Layout> (header + content area). */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route index element={<RequireAuth><HomePage /></RequireAuth>} />
        <Route path="settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="invite/:token" element={<RequireAuth><InvitePage /></RequireAuth>} />
        <Route path="spaces/:spaceId" element={<RequireAuth><SpacePage /></RequireAuth>} />
        <Route path="spaces/:spaceId/members" element={<RequireAuth><MembersPage /></RequireAuth>} />
        <Route path="spaces/:spaceId/lists/:listId" element={<RequireAuth><ListPage /></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

/** Applies the user's theme preference (or the system setting when logged out). */
function ThemeSync() {
  const { data: user } = useCurrentUser()
  const preference = user ? toThemePreference(user.settings.theme) : 'system'
  // applyTheme returns its cleanup, so React stops listening for OS theme changes on change/unmount.
  useEffect(() => applyTheme(preference), [preference])
  return null
}

/**
 * Sliding session: a token older than a day is exchanged for a fresh one (on start and once an hour),
 * so active users stay logged in while unused tokens expire after 30 days.
 */
function SessionRefresher() {
  const session = useSession()
  useEffect(() => {
    const refreshIfDue = () => {
      const current = getSession()
      if (current && shouldRefresh(current)) {
        authApi
          .refresh()
          .then((response) => response.token && response.expiresAt && setSession(response.token, response.expiresAt))
          .catch(() => {}) // offline or expired: apiRequest already logs out on 401
      }
    }
    refreshIfDue()
    const timer = window.setInterval(refreshIfDue, 60 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [session?.token])
  return null
}

export function App() {
  // One QueryClient for the app's lifetime: it caches server data (TanStack Query).
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <SessionRefresher />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
