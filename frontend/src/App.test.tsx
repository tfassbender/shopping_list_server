import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
