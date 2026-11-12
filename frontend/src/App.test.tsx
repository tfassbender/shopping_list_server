import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AppRoutes } from './App'
import { getSession } from './auth/session'
import { mockApi, sentBodies, testUser } from './test/mockApi'
import { loginForTest, renderWithProviders } from './test/render'

describe('App routing and auth', () => {
  it('redirects to the login page when not logged in', () => {
    mockApi({})
    renderWithProviders(<AppRoutes />, '/settings')
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('leads to the start page via the title in the header bar', async () => {
    loginForTest()
    mockApi({ 'GET /api/users/me': testUser, 'GET /api/spaces': [] })
    renderWithProviders(<AppRoutes />, '/settings')

    await userEvent.click(await screen.findByRole('link', { name: 'Settings' }))

    expect(await screen.findByRole('heading', { name: 'Lists' })).toBeInTheDocument()
    // on the start page itself the title is no link
    expect(screen.queryByRole('link', { name: 'Lists' })).not.toBeInTheDocument()
  })

  it('shows the not found page for unknown routes', () => {
    mockApi({})
    renderWithProviders(<AppRoutes />, '/does/not/exist')
    expect(screen.getByText('Page not found')).toBeInTheDocument()
  })

  it('logs in, stores the session and returns to the requested page', async () => {
    const spy = mockApi({
      'POST /api/auth/login': { user: testUser, token: 'jwt', expiresAt: '2030-01-01T00:00:00Z', verificationRequired: false },
      'GET /api/users/me': testUser,
    })
    renderWithProviders(<AppRoutes />, '/settings')

    await userEvent.type(screen.getByLabelText('Email'), 'anna@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret-password')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(getSession()?.token).toBe('jwt')
    expect(sentBodies(spy, 'POST', '/api/auth/login')).toEqual([{ email: 'anna@example.com', password: 'secret-password' }])
  })

  it('shows a translated error for wrong credentials', async () => {
    mockApi({ 'POST /api/auth/login': { status: 401, body: { code: 'INVALID_CREDENTIALS' } } })
    renderWithProviders(<AppRoutes />, '/login')

    await userEvent.type(screen.getByLabelText('Email'), 'anna@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
    expect(getSession()).toBeNull()
  })

  it('tells the user to check the mail when verification is required', async () => {
    mockApi({ 'POST /api/auth/register': { user: testUser, verificationRequired: true } })
    renderWithProviders(<AppRoutes />, '/register')

    await userEvent.type(screen.getByLabelText('Email'), 'anna@example.com')
    await userEvent.type(screen.getByLabelText('Display name'), 'Anna')
    await userEvent.type(screen.getByLabelText('Password'), 'secret-password')
    await userEvent.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByText(/We sent a confirmation link to anna@example.com/)).toBeInTheDocument()
    expect(getSession()).toBeNull()
  })

  it('saves display settings immediately', async () => {
    loginForTest()
    const spy = mockApi({
      'GET /api/users/me': testUser,
      'PUT /api/users/me/settings': (body) => ({ ...testUser, settings: body }),
    })
    renderWithProviders(<AppRoutes />, '/settings')

    await userEvent.click(await screen.findByRole('switch', { name: 'Show notes about merged changes' }))

    expect(sentBodies(spy, 'PUT', '/api/users/me/settings')).toEqual([
      { ...testUser.settings, ignoreMergeWarnings: !testUser.settings.ignoreMergeWarnings },
    ])
  })
})

const DAY_MS = 24 * 60 * 60 * 1000

/** A logged-in session as stored by the app, received `ageMs` ago. */
function storeSession(ageMs: number) {
  const receivedAt = new Date(Date.now() - ageMs).toISOString()
  localStorage.setItem('shoppinglist.session', JSON.stringify({ token: 'old-token', expiresAt: '2099-01-01T00:00:00Z', receivedAt }))
}

const wasRequested = (spy: ReturnType<typeof mockApi>, method: string, path: string) =>
  spy.mock.calls.some(([url, init]) => (init?.method ?? 'GET') === method && new URL(String(url), 'http://localhost').pathname === path)

/**
 * The whole app (with its background sync, session refresh and live updates) at `path`. The app keeps
 * its query cache (incl. the user), the session and the language in module-wide stores; fresh module
 * copies keep one test from seeing the state of the test before. Returns the session module the app uses.
 */
async function renderApp(path: string) {
  vi.resetModules()
  const session = await import('./auth/session')
  const { App } = await import('./App')
  window.history.pushState({}, '', path)
  render(<App />)
  return session
}

describe('App (background tasks)', () => {
  // The app's live update stream: 403 ends it at once, unless a test serves events.
  const baseRoutes = { 'GET /api/spaces': [], 'GET /api/events': { status: 403 } }

  afterEach(() => {
    document.documentElement.classList.remove('dark')
    window.history.pushState({}, '', '/')
  })

  it('exchanges a session older than a day for a fresh one', async () => {
    storeSession(2 * DAY_MS)
    const spy = mockApi({
      ...baseRoutes,
      'GET /api/users/me': testUser,
      'POST /api/auth/refresh': { user: testUser, token: 'fresh-token', expiresAt: '2099-02-01T00:00:00Z', verificationRequired: false },
    })
    const session = await renderApp('/')

    await waitFor(() => expect(session.getSession()?.token).toBe('fresh-token'))
    expect(wasRequested(spy, 'POST', '/api/auth/refresh')).toBe(true)
  })

  it('keeps a recent session without asking the server', async () => {
    storeSession(60_000)
    const spy = mockApi({ ...baseRoutes, 'GET /api/users/me': testUser })
    const session = await renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Lists' })).toBeInTheDocument()
    expect(wasRequested(spy, 'POST', '/api/auth/refresh')).toBe(false)
    expect(session.getSession()?.token).toBe('old-token')
  })

  it('logs out when the refresh is refused', async () => {
    storeSession(2 * DAY_MS)
    mockApi({ ...baseRoutes, 'GET /api/users/me': testUser, 'POST /api/auth/refresh': { status: 401, body: { code: 'INVALID_TOKEN' } } })
    const session = await renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(session.getSession()).toBeNull()
  })

  it("applies the user's theme and language", async () => {
    storeSession(60_000)
    mockApi({ ...baseRoutes, 'GET /api/users/me': { ...testUser, settings: { ...testUser.settings, theme: 'DARK', language: 'de' } } })
    await renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Listen' })).toBeInTheDocument()
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
  })

  it('syncs a space when the live update stream reports a change in it', async () => {
    storeSession(60_000)
    const spy = mockApi({
      'GET /api/users/me': testUser,
      'GET /api/spaces': [],
      'GET /api/spaces/s1/changes': { seq: 1, fullResync: true, lists: [], listIds: [], catalog: null, historyChanges: [], layouts: null, layoutIds: [] },
    })
    const answer = spy.getMockImplementation()!
    let authorization: string | null = null
    spy.mockImplementation(async (input, init) => {
      if (String(input) !== '/api/events') return answer(input, init)
      authorization = new Headers(init?.headers).get('Authorization')
      // one event, then the stream stays open
      const stream = new ReadableStream({
        start: (controller) => controller.enqueue(new TextEncoder().encode('data: {"type":"SPACE_CHANGED","spaceId":"s1","seq":5}\n\n')),
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    })
    await renderApp('/')

    await waitFor(() => expect(wasRequested(spy, 'GET', '/api/spaces/s1/changes')).toBe(true))
    expect(authorization).toBe('Bearer old-token')
  })
})
