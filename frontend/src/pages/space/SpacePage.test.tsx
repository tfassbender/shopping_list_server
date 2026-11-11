import { screen, waitFor, within } from '@testing-library/react'
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
const createdInvite = (url: string) => ({
  status: 201,
  body: { invite: { id: 'i9', createdAt: '', expiresAt: '2026-01-02T00:00:00Z' }, token: 't', url },
})

/** The space page of "Home" (owner by default) with all endpoints it loads, plus `extraRoutes`. */
function setup(extraRoutes: Record<string, unknown> = {}) {
  const spy = mockApi({
    'GET /api/users/me': testUser,
    'GET /api/spaces': [space],
    'GET /api/spaces/s1': space,
    'GET /api/spaces/s1/members': members,
    'GET /api/spaces/s1/invites': [],
    'GET /api/spaces/s1/catalog': { categories: [{ id: 'c1', name: 'Dairy', color: '#fff' }], units: [] },
    'GET /api/spaces/s1/catalog/history': [],
    'GET /api/spaces/s1/layouts': [],
    ...(extraRoutes as object),
  })
  renderWithProviders(<AppRoutes />, '/spaces/s1')
  return spy
}

const wasCalled = (spy: ReturnType<typeof mockApi>, method: string, path: string) =>
  spy.mock.calls.some(([url, init]) => (init?.method ?? 'GET') === method && new URL(String(url), 'http://localhost').pathname === path)

describe('SpacePage', () => {
  beforeEach(() => loginForTest())

  it('summarises what the lists of the space share', async () => {
    setup({
      'GET /api/spaces/s1/catalog/history': [{ name: 'Milk' }, { name: 'Bread' }, { name: 'Eggs' }],
      'GET /api/spaces/s1/layouts': [{ id: 'l1', name: 'Aldi' }, { id: 'l2', name: 'Lidl' }],
    })

    expect(await screen.findByRole('button', { name: /Categories & units.*1 categories/ })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Items used before.*3 items/ })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Shops.*Aldi, Lidl/ })).toBeInTheDocument()
  })

  it('shows "no shops" and opens the shops page', async () => {
    setup()

    await userEvent.click(await screen.findByRole('button', { name: /Shops.*No shops yet\./ }))

    expect(await screen.findByRole('heading', { name: 'Shops' })).toBeInTheDocument()
  })

  it('shows the load error with a retry button', async () => {
    let calls = 0
    setup({
      'GET /api/spaces/s1': () => (++calls === 1 ? { status: 404, body: { code: 'SPACE_NOT_FOUND' } } : space),
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('This space does not exist or you are not a member.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('renames the space via the menu', async () => {
    let name = 'Home'
    const spy = setup({
      'GET /api/spaces/s1': () => ({ ...space, name }),
      'PUT /api/spaces/s1/name': (body: { name: string }) => {
        name = body.name
        return { ...space, name }
      },
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename space' }))
    const field = within(screen.getByRole('dialog', { name: 'Rename space' })).getByLabelText('Name')
    expect(field).toHaveValue('Home')
    await userEvent.clear(field)
    await userEvent.type(field, 'Family{Enter}')

    expect(await screen.findByRole('heading', { name: 'Family' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(sentBodies(spy, 'PUT', '/api/spaces/s1/name')).toEqual([{ name: 'Family' }])
  })

  it('deletes the space after confirmation and returns to the spaces', async () => {
    const spy = setup({ 'DELETE /api/spaces/s1': { status: 204 } })

    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete space' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Delete "Home"?' })
    expect(confirm).toHaveTextContent('Delete the space "Home" with all its lists for all members?')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete space' }))

    expect(await screen.findByRole('heading', { name: 'Spaces & sharing' })).toBeInTheDocument()
    expect(wasCalled(spy, 'DELETE', '/api/spaces/s1')).toBe(true)
  })

  it('stays on the page and shows the reason when leaving is refused', async () => {
    setup({
      'GET /api/spaces/s1': { ...space, myRole: 'MEMBER' },
      'POST /api/spaces/s1/leave': { status: 409, body: { code: 'OWNER_CANNOT_LEAVE' } },
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Leave space' }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Leave "Home"?' })).getByRole('button', { name: 'Leave space' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Hand over ownership to another member before leaving.')
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('a member leaves the space after confirmation', async () => {
    const spy = setup({
      'GET /api/users/me': { ...testUser, id: 'u2' },
      'GET /api/spaces/s1': { ...space, myRole: 'MEMBER' },
      'POST /api/spaces/s1/leave': { status: 204 },
      'GET /api/spaces': [],
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Leave space' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Leave space' }))

    expect(await screen.findByRole('heading', { name: 'Spaces & sharing' })).toBeInTheDocument()
    expect(wasCalled(spy, 'POST', '/api/spaces/s1/leave')).toBe(true)
  })

  it('hands over ownership to a member after confirmation', async () => {
    const spy = setup({ 'POST /api/spaces/s1/transfer-ownership': { ...space, myRole: 'MEMBER' } })

    await userEvent.click(await screen.findByRole('button', { name: 'Options for Bob' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Bob' })).getByRole('button', { name: /^Make owner/ }))
    const confirm = screen.getByRole('alertdialog', { name: 'Make Bob the owner?' })
    expect(confirm).toHaveTextContent('Hand over ownership to Bob? You will become a normal member.')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Make owner' }))

    await waitFor(() => expect(sentBodies(spy, 'POST', '/api/spaces/s1/transfer-ownership')).toEqual([{ userId: 'u2' }]))
  })

  it('cancelling a member action sends nothing', async () => {
    const spy = setup()

    await userEvent.click(await screen.findByRole('button', { name: 'Options for Bob' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Remove/ }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Remove Bob?' })).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(wasCalled(spy, 'DELETE', '/api/spaces/s1/members/u2')).toBe(false)
  })

  it('shows an error when removing a member fails', async () => {
    setup({ 'DELETE /api/spaces/s1/members/u2': { status: 403, body: { code: 'OWNER_ONLY' } } })

    await userEvent.click(await screen.findByRole('button', { name: 'Options for Bob' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Remove/ }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Only the owner of the space can do this.')
  })

  it('lists open invite links and revokes one', async () => {
    let invites = [{ id: 'i1', createdAt: '', expiresAt: '2026-01-02T10:00:00Z' }]
    const spy = setup({
      'GET /api/spaces/s1/invites': () => invites,
      'DELETE /api/spaces/s1/invites/i1': () => {
        invites = []
        return { status: 204 }
      },
    })

    expect(await screen.findByRole('heading', { name: 'Open invite links' })).toBeInTheDocument()
    expect(screen.getByText('Link for one person')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }))

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Open invite links' })).not.toBeInTheDocument())
    expect(wasCalled(spy, 'DELETE', '/api/spaces/s1/invites/i1')).toBe(true)
  })

  it('creates an invite link with the chosen validity and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const spy = setup({ 'POST /api/spaces/s1/invites': createdInvite('http://x/invite/week') })

    await userEvent.click(await screen.findByRole('button', { name: 'Invite someone' }))
    const dialog = screen.getByRole('dialog', { name: 'Invite someone' })
    await userEvent.click(within(within(dialog).getByRole('group', { name: 'Valid for' })).getByRole('button', { name: '1 week' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create invite link' }))

    const linkDialog = await screen.findByRole('dialog', { name: 'Send this link' })
    expect(within(linkDialog).getByLabelText('Invite link')).toHaveValue('http://x/invite/week')
    expect(linkDialog).toHaveTextContent('Valid for 1 week, for one person.')
    expect(sentBodies(spy, 'POST', '/api/spaces/s1/invites')).toEqual([{ expiresInHours: 168 }])

    await userEvent.click(within(linkDialog).getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith('http://x/invite/week')
    expect(await within(linkDialog).findByRole('button', { name: 'Copied!' })).toBeInTheDocument()
  })

  it('offers the system share menu where the browser has one', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    try {
      setup({ 'POST /api/spaces/s1/invites': createdInvite('http://x/invite/s') })

      await userEvent.click(await screen.findByRole('button', { name: 'Invite someone' }))
      await userEvent.click(screen.getByRole('button', { name: 'Create invite link' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Share link' }))

      expect(share).toHaveBeenCalledWith({ title: expect.any(String), url: 'http://x/invite/s' })
    } finally {
      // jsdom has no navigator.share; remove it again for the other tests
      delete (navigator as { share?: unknown }).share
    }
  })

  it('has no share button without the Web Share API', async () => {
    setup({ 'POST /api/spaces/s1/invites': createdInvite('http://x/invite/s') })

    await userEvent.click(await screen.findByRole('button', { name: 'Invite someone' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create invite link' }))

    expect(await screen.findByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share link' })).not.toBeInTheDocument()
  })

  it('shows an error in the invite dialog when the link cannot be created', async () => {
    setup({ 'POST /api/spaces/s1/invites': { status: 400, body: { code: 'INVALID_EXPIRY' } } })

    await userEvent.click(await screen.findByRole('button', { name: 'Invite someone' }))
    const dialog = screen.getByRole('dialog', { name: 'Invite someone' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create invite link' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Invalid validity period.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
