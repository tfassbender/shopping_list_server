import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { SessionResponse } from '../api/auth'
import { syncEngine } from '../offline/engine'
import { testUser } from '../test/mockApi'
import { getLogoutTarget, getSession } from './session'
import { useAuthActions } from './useAuth'

const session = { user: testUser, token: 'jwt', expiresAt: '2030-01-01T00:00:00Z', verificationRequired: false } as unknown as SessionResponse

function setup() {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useAuthActions(), { wrapper })
  // data of whoever used the app before: cached spaces and an unsaved offline change
  queryClient.setQueryData(['spaces'], [{ id: 's1', name: 'Previous' }])
  syncEngine.enqueue('s1', { type: 'CREATE_LIST', listId: 'l1', name: 'Groceries' })
  return { queryClient, actions: result.current }
}

describe('useAuthActions', () => {
  it('a different user logging in does not get the data of the previous one', () => {
    localStorage.setItem('shoppinglist.lastUser', 'someone-else')
    const { queryClient, actions } = setup()

    act(() => actions.startSession(session))

    expect(queryClient.getQueryData(['spaces'])).toBeUndefined()
    expect(syncEngine.listsOf('s1')).toBeUndefined()
    expect(getSession()?.token).toBe('jwt')
  })

  it('the same user logging in again (e.g. after an expired session) keeps the unsaved offline changes', () => {
    localStorage.setItem('shoppinglist.lastUser', testUser.id)
    const { queryClient, actions } = setup()

    act(() => actions.startSession(session))

    expect(queryClient.getQueryData(['spaces'])).toBeDefined()
    expect(syncEngine.pendingCount()).toBe(1)
  })

  it('a deliberate logout tells the login guard where to go', () => {
    const { actions } = setup()
    act(() => actions.startSession(session))

    act(() => actions.logout('/register'))

    expect(getSession()).toBeNull()
    expect(getLogoutTarget()).toBe('/register')
  })
})
