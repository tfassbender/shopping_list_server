import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { setSession } from '../auth/session'

/** Renders `ui` with a fresh query cache and an in-memory router starting at `path`. */
export function renderWithProviders(ui: ReactNode, path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Simulates a logged-in user. */
export function loginForTest() {
  setSession('test-token', new Date(Date.now() + 86_400_000).toISOString())
}
