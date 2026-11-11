import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppRoutes } from '../../App'
import { mockApi, sentBodies, testUser } from '../../test/mockApi'
import { loginForTest, renderWithProviders } from '../../test/render'

describe('API tokens page', () => {
  beforeEach(() => loginForTest())

  it('creates a token, shows it once and revokes tokens', async () => {
    const tokens = [{ id: 't1', name: 'Old agent', scope: 'READ', createdAt: '', expiresAt: null, lastUsedAt: null }]
    const spy = mockApi({
      'GET /api/users/me': testUser,
      'GET /api/users/me/api-tokens': () => tokens,
      'POST /api/users/me/api-tokens': (body) => {
        const token = { id: 't2', createdAt: '', expiresAt: '2030-01-01T00:00:00Z', lastUsedAt: null, ...(body as object) }
        tokens.push(token as never)
        return { status: 201, body: { token, rawToken: 'slt_u1_secret' } }
      },
      'DELETE /api/users/me/api-tokens/t1': { status: 204 },
    })
    renderWithProviders(<AppRoutes />, '/settings/api-tokens')

    expect(await screen.findByText(/Old agent/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create token' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Claude')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Full access' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(await screen.findByDisplayValue('slt_u1_secret')).toBeInTheDocument()
    expect(sentBodies(spy, 'POST', '/api/users/me/api-tokens')).toEqual([{ name: 'Claude', scope: 'FULL', expiresInDays: 30 }])
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    await userEvent.click(screen.getAllByRole('button', { name: 'Revoke' })[0])
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(spy.mock.calls.some(([url, init]) => String(url).endsWith('/t1') && init?.method === 'DELETE')).toBe(true))
  })
})
