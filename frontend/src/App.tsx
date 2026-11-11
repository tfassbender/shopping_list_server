import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { authApi, toThemePreference } from './api/auth'
import { RequireAuth } from './auth/RequireAuth'
import { getSession, setSession, shouldRefresh } from './auth/session'
import { useCurrentUser, useSession } from './auth/useAuth'
import { Layout } from './components/Layout'
import { syncEngine } from './offline/engine'
import { startLiveUpdates } from './offline/liveUpdates'
import { defaultStorage } from './offline/storage'
import { ListPage } from './lists/ListPage'
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from './pages/auth/EmailTokenPages'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SettingsPage } from './pages/SettingsPage'
import { CatalogPage } from './pages/space/CatalogPage'
import { InvitePage } from './pages/space/InvitePage'
import { LayoutEditorPage, LayoutsPage } from './pages/space/LayoutPages'
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
        <Route path="spaces/:spaceId/catalog" element={<RequireAuth><CatalogPage /></RequireAuth>} />
        <Route path="spaces/:spaceId/layouts" element={<RequireAuth><LayoutsPage /></RequireAuth>} />
        <Route path="spaces/:spaceId/layouts/:layoutId" element={<RequireAuth><LayoutEditorPage /></RequireAuth>} />
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

/**
 * Keeps the offline data fresh: loads and syncs all spaces on start, again when the connection comes
 * back or the tab becomes visible, and every few minutes as a fallback for missed live updates.
 */
function OfflineSync() {
  const session = useSession()
  useEffect(() => {
    if (!session) return
    void syncEngine.start()
    const syncNow = () => {
      if (document.visibilityState === 'visible') void syncEngine.syncAll()
    }
    window.addEventListener('online', syncNow)
    document.addEventListener('visibilitychange', syncNow)
    const timer = window.setInterval(syncNow, SYNC_INTERVAL_MS)
    return () => {
      window.removeEventListener('online', syncNow)
      document.removeEventListener('visibilitychange', syncNow)
      window.clearInterval(timer)
    }
  }, [session])
  return null
}

const SYNC_INTERVAL_MS = 5 * 60_000

/**
 * Live updates (SSE): when another member changes something in a space, its lists are synced and the
 * cached space data (catalog, shops, members) is refreshed - notify, then refetch.
 */
function LiveUpdates() {
  const session = useSession()
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!session) return
    return startLiveUpdates({
      getToken: () => getSession()?.token ?? null,
      onConnected: () => void syncEngine.syncAll(),
      onEvent: (event) => {
        if (event.type !== 'SPACE_CHANGED' || !event.spaceId) return
        void syncEngine.sync(event.spaceId)
        void queryClient.invalidateQueries({ queryKey: ['spaces', event.spaceId] })
        void queryClient.invalidateQueries({ queryKey: ['spaces'], exact: true })
      },
    })
  }, [session, queryClient])
  return null
}
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * The query cache (spaces, categories, shops, settings) is saved in IndexedDB, so the app shows them
 * offline too. `offlineFirst`: cached data is shown even when a refetch can't reach the server.
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { gcTime: CACHE_MAX_AGE_MS, networkMode: 'offlineFirst' } },
  })
}

const queryStorage = defaultStorage('queries')
const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => queryStorage.get<string>(key).then((value) => value ?? null),
    setItem: (key, value) => queryStorage.set(key, value),
    removeItem: (key) => queryStorage.del(key),
  },
})

export function App() {
  // One QueryClient for the app's lifetime: it caches server data (TanStack Query).
  const [queryClient] = useState(createQueryClient)

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: CACHE_MAX_AGE_MS }}>
      <ThemeSync />
      <SessionRefresher />
      <OfflineSync />
      <LiveUpdates />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </PersistQueryClientProvider>
  )
}
