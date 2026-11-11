import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { applyTheme } from './theme/theme'

/** Route table. Every page is rendered inside <Layout> (header + content area). */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export function App() {
  // One QueryClient for the app's lifetime: it caches server data (TanStack Query).
  const [queryClient] = useState(() => new QueryClient())

  // Returns applyTheme's cleanup, so React stops listening for OS theme changes on unmount.
  useEffect(() => applyTheme('system'), [])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
