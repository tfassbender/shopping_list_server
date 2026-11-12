import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
      'GET /api/spaces/s2': () => created[0],
      'GET /api/spaces/s2/members': [],
    })
    renderWithProviders(<AppRoutes />, '/spaces')

    expect(await screen.findByText('Home')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'New space' }))
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText('Name'), 'Office')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create' }))

    // the new space opens right away
    expect(await screen.findByRole('heading', { name: 'Office' })).toBeInTheDocument()
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

    await waitFor(() => expect(spy.mock.calls.some(([url, init]) => String(url).endsWith('/accept') && init?.method === 'POST')).toBe(true))
    // back on the start page with the lists of all spaces
    expect(await screen.findByRole('heading', { name: 'Lists' })).toBeInTheDocument()
  })

  it('shows an error for a used invite', async () => {
    mockApi({
      'GET /api/users/me': testUser,
      'GET /api/invites/used': { status: 404, body: { code: 'INVITE_INVALID' } },
    })
    renderWithProviders(<AppRoutes />, '/invite/used')
    expect(await screen.findByRole('alert')).toHaveTextContent('already used')
    // not a dead end
    expect(screen.getByRole('link', { name: 'To the start page' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument()
  })

  it('tells a member opening a valid invite of their own space that they are already a member', async () => {
    mockApi({
      'GET /api/users/me': testUser,
      'GET /api/invites/mine': { spaceName: 'Family', invitedBy: 'Anna', alreadyMember: true },
    })
    renderWithProviders(<AppRoutes />, '/invite/mine')
    expect(await screen.findByText(/You are already a member of "Family"/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument()
  })

  it('owner sees member management and creates an invite link', async () => {
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
    renderWithProviders(<AppRoutes />, '/spaces/s1/members') // old address, redirects to the space

    expect(await screen.findByText('(you)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Invite someone' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create invite link' }))
    expect(await screen.findByDisplayValue('http://x/invite/t')).toBeInTheDocument()
    expect(sentBodies(spy, 'POST', '/api/spaces/s1/invites')).toEqual([{ expiresInHours: 24 }])
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    await userEvent.click(screen.getByRole('button', { name: 'Options for Bob' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Remove/ }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(spy.mock.calls.some(([url, init]) => String(url).endsWith('/members/u2') && init?.method === 'DELETE')).toBe(true))
  })

  it('member sees no owner controls but can leave', async () => {
    mockApi({
      'GET /api/users/me': { ...testUser, id: 'u2' },
      'GET /api/spaces/s1': { ...space, myRole: 'MEMBER' },
      'GET /api/spaces/s1/members': members,
    })
    renderWithProviders(<AppRoutes />, '/spaces/s1')

    expect(await screen.findByText('(you)')).toBeInTheDocument()
    expect(screen.getByText('Only the owner can invite people.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invite someone' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Options for/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('menuitem', { name: 'Leave space' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Delete space' })).not.toBeInTheDocument()
  })
})
