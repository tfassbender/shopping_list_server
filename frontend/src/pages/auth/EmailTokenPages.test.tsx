import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppRoutes } from '../../App'
import { getSession } from '../../auth/session'
import { mockApi, sentBodies, testUser } from '../../test/mockApi'
import { renderWithProviders } from '../../test/render'

const session = { user: testUser, token: 'jwt', expiresAt: '2030-01-01T00:00:00Z', verificationRequired: false }

describe('VerifyEmailPage', () => {
  it('confirms the email with the token from the link, logs in and opens the start page', async () => {
    const spy = mockApi({
      'POST /api/auth/verify-email': session,
      'GET /api/users/me': testUser,
      'GET /api/spaces': [],
    })
    renderWithProviders(<AppRoutes />, '/verify-email?token=abc123')

    expect(await screen.findByRole('heading', { name: 'Lists' })).toBeInTheDocument()
    expect(getSession()?.token).toBe('jwt')
    // the single-use token is sent exactly once
    expect(sentBodies(spy, 'POST', '/api/auth/verify-email')).toEqual([{ token: 'abc123' }])
  })

  it('shows the error for an expired link and offers to send a new one', async () => {
    const spy = mockApi({
      'POST /api/auth/verify-email': { status: 400, body: { code: 'INVALID_TOKEN' } },
      'POST /api/auth/resend-verification': { status: 204 },
    })
    renderWithProviders(<AppRoutes />, '/verify-email?token=old')

    expect(await screen.findByRole('alert')).toHaveTextContent('This link is invalid or has expired.')
    expect(getSession()).toBeNull()

    await userEvent.type(screen.getByLabelText('Email'), 'anna@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send confirmation email again' }))

    expect(await screen.findByRole('status')).toHaveTextContent('If the account exists and is not confirmed yet, we sent a new link.')
    expect(sentBodies(spy, 'POST', '/api/auth/resend-verification')).toEqual([{ email: 'anna@example.com' }])
  })

  it('without a token only offers to resend, without calling the server', async () => {
    const spy = mockApi({ 'POST /api/auth/resend-verification': { status: 503, body: { code: 'EMAIL_DISABLED' } } })
    renderWithProviders(<AppRoutes />, '/verify-email')

    expect(screen.getByRole('heading', { name: 'Confirm email' })).toBeInTheDocument()
    expect(sentBodies(spy, 'POST', '/api/auth/verify-email')).toEqual([])

    await userEvent.type(screen.getByLabelText('Email'), 'anna@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send confirmation email again' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Emails are disabled on this server.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('ForgotPasswordPage', () => {
  it('is reachable from the login page and confirms that a link was sent', async () => {
    const spy = mockApi({ 'POST /api/auth/forgot-password': { status: 204 } })
    renderWithProviders(<AppRoutes />, '/login')

    await userEvent.click(screen.getByRole('link', { name: 'Forgot password?' }))
    expect(screen.getByRole('heading', { name: 'Forgot password' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Email'), 'anna@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('status')).toHaveTextContent('If an account exists for this email, we sent a link to reset the password.')
    // the form is replaced by the confirmation
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(sentBodies(spy, 'POST', '/api/auth/forgot-password')).toEqual([{ email: 'anna@example.com' }])
  })

  it('keeps the form and shows the error when the server cannot send emails', async () => {
    mockApi({ 'POST /api/auth/forgot-password': { status: 503, body: { code: 'EMAIL_DISABLED' } } })
    renderWithProviders(<AppRoutes />, '/forgot-password')

    await userEvent.type(screen.getByLabelText('Email'), 'anna@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Emails are disabled on this server.')
    expect(screen.getByLabelText('Email')).toHaveValue('anna@example.com')
  })
})

describe('ResetPasswordPage', () => {
  it('sets the new password with the token from the link and logs in', async () => {
    const spy = mockApi({
      'POST /api/auth/reset-password': session,
      'GET /api/users/me': testUser,
      'GET /api/spaces': [],
    })
    renderWithProviders(<AppRoutes />, '/reset-password?token=reset1')

    await userEvent.type(screen.getByLabelText('New password'), 'new-secret-pw')
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }))

    expect(await screen.findByRole('heading', { name: 'Lists' })).toBeInTheDocument()
    expect(getSession()?.token).toBe('jwt')
    expect(sentBodies(spy, 'POST', '/api/auth/reset-password')).toEqual([{ token: 'reset1', password: 'new-secret-pw' }])
  })

  it('shows the error for an invalid link and stays logged out', async () => {
    mockApi({ 'POST /api/auth/reset-password': { status: 400, body: { code: 'INVALID_TOKEN' } } })
    renderWithProviders(<AppRoutes />, '/reset-password?token=used')

    await userEvent.type(screen.getByLabelText('New password'), 'new-secret-pw')
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This link is invalid or has expired.')
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    await waitFor(() => expect(getSession()).toBeNull())
  })

  it('shows the server error when the password is rejected as too short', async () => {
    // the server's minimum (configurable) can be stricter than the field's minLength
    mockApi({ 'POST /api/auth/reset-password': { status: 400, body: { code: 'PASSWORD_TOO_SHORT' } } })
    renderWithProviders(<AppRoutes />, '/reset-password?token=t')

    await userEvent.type(screen.getByLabelText('New password'), 'longenough')
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The password is too short.')
  })
})
