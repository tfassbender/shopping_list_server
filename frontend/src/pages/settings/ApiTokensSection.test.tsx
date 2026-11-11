import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AppRoutes } from '../../App'
import { mockApi, sentBodies, testUser } from '../../test/mockApi'
import { loginForTest, renderWithProviders } from '../../test/render'

describe('API tokens in the settings', () => {
  beforeEach(() => loginForTest())

  it('creates a token, shows it once and revokes tokens', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
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
    renderWithProviders(<AppRoutes />, '/settings')

    expect(await screen.findByText(/Old agent/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Name', { selector: 'input[placeholder="e.g. Claude"]' }), 'Claude')
    await userEvent.selectOptions(screen.getByLabelText('Access'), 'Full access')
    await userEvent.click(screen.getByRole('button', { name: 'Create token' }))

    expect(await screen.findByDisplayValue('slt_u1_secret')).toBeInTheDocument()
    expect(sentBodies(spy, 'POST', '/api/users/me/api-tokens')).toEqual([{ name: 'Claude', scope: 'FULL', expiresInDays: 90 }])

    await userEvent.click(screen.getAllByRole('button', { name: 'Revoke' })[0])
    await waitFor(() => expect(spy.mock.calls.some(([url, init]) => String(url).endsWith('/t1') && init?.method === 'DELETE')).toBe(true))
  })
})
