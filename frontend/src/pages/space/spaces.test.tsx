import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AppRoutes } from '../../App'
import { mockApi, sentBodies, testUser } from '../../test/mockApi'
import { loginForTest, renderWithProviders } from '../../test/render'

const space = { id: 's1', name: 'Home', myRole: 'OWNER', memberCount: 2, createdAt: '2026-01-01T00:00:00Z' }
const members = [
  { userId: 'u1', displayName: 'Anna', role: 'OWNER', joinedAt: '2026-01-01T00:00:00Z' },
  { userId: 'u2', displayName: 'Bob', role: 'MEMBER', joinedAt: '2026-01-02T00:00:00Z' },
]

describe('spaces', () => {
  beforeEach(() => loginForTest())

  it('lists spaces and creates a new one', async () => {
    const created: unknown[] = []
    const spy = mockApi({
      'GET /api/users/me': testUser,
      'GET /api/spaces': () => [space, ...created],
      'POST /api/spaces': (body) => {
        const newSpace = { ...space, id: 's2', name: (body as { name: string }).name }
        created.push(newSpace)
        return { status: 201, body: newSpace }
      },
    })
    renderWithProviders(<AppRoutes />, '/')

    expect(await screen.findByText('Home')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Name of a new space'), 'Office')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Office')).toBeInTheDocument()
    expect(sentBodies(spy, 'POST', '/api/spaces')).toEqual([{ name: 'Office' }])
  })

  it('shows invite details and joins the space', async () => {
    const spy = mockApi({
      'GET /api/users/me': testUser,
      'GET /api/invites/tok123': { spaceName: 'Family', invitedBy: 'Olga', alreadyMember: false },
      'POST /api/invites/tok123/accept': { ...space, id: 's9', name: 'Family', myRole: 'MEMBER' },
      'GET /api/spaces/s9': { ...space, id: 's9', name: 'Family', myRole: 'MEMBER' },
      'GET /api/spaces/s9/lists': [],
    })
    renderWithProviders(<AppRoutes />, '/invite/tok123')

    expect(await screen.findByText('Olga invites you to the space "Family". Join?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(await screen.findByRole('heading', { name: 'Family' })).toBeInTheDocument()
    expect(spy.mock.calls.some(([url, init]) => String(url).endsWith('/accept') && init?.method === 'POST')).toBe(true)
  })

  it('shows an error for a used invite', async () => {
    mockApi({
      'GET /api/users/me': testUser,
      'GET /api/invites/used': { status: 404, body: { code: 'INVITE_INVALID' } },
    })
    renderWithProviders(<AppRoutes />, '/invite/used')
    expect(await screen.findByRole('alert')).toHaveTextContent('already used')
  })

  it('owner sees member management and creates an invite link', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const spy = mockApi({
      'GET /api/users/me': testUser,
      'GET /api/spaces/s1': space,
      'GET /api/spaces/s1/members': members,
      'GET /api/spaces/s1/invites': [],
      'POST /api/spaces/s1/invites': {
        status: 201,
        body: { invite: { id: 'i1', createdAt: '', expiresAt: '2026-01-02T00:00:00Z' }, token: 't', url: 'http://x/invite/t' },
      },
      'DELETE /api/spaces/s1/members/u2': { status: 204 },
    })
    renderWithProviders(<AppRoutes />, '/spaces/s1/members')

    expect(await screen.findByText('Anna (you)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create invite link' }))
    expect(await screen.findByDisplayValue('http://x/invite/t')).toBeInTheDocument()
    expect(sentBodies(spy, 'POST', '/api/spaces/s1/invites')).toEqual([{ expiresInHours: 24 }])

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(spy.mock.calls.some(([url, init]) => String(url).endsWith('/members/u2') && init?.method === 'DELETE')).toBe(true)
  })

  it('member sees no owner controls but can leave', async () => {
    mockApi({
      'GET /api/users/me': { ...testUser, id: 'u2' },
      'GET /api/spaces/s1': { ...space, myRole: 'MEMBER' },
      'GET /api/spaces/s1/members': members,
    })
    renderWithProviders(<AppRoutes />, '/spaces/s1/members')

    expect(await screen.findByText('Bob (you)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create invite link' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave space' })).toBeInTheDocument()
  })
})
