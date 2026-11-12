import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppRoutes } from '../App'
import type { Item, ShoppingList } from '../api/lists'
import { setLastList } from '../lists/lastList'
import { fakeSyncServer } from '../test/fakeSyncServer'
import { mockApi, sentBodies, testUser } from '../test/mockApi'
import { loginForTest, renderWithProviders } from '../test/render'

const home = { id: 's1', name: 'Home', myRole: 'OWNER', memberCount: 1, createdAt: '' }
const office = { id: 's2', name: 'Office', myRole: 'MEMBER', memberCount: 3, createdAt: '' }

const item = (id: string, name: string, checked = false): Item => ({
  id, name, quantity: null, unit: null, note: null, categoryId: null, checked, createdAt: `2026-01-01T00:00:0${id}Z`, seq: 1,
})
const list = (id: string, spaceId: string, name: string, items: Item[] = []): ShoppingList => ({ id, spaceId, name, createdAt: '', seq: 1, items })

/** The start page with the given spaces and their lists (served by fake sync servers). */
function setup(spaces: (typeof home)[], listsBySpace: Record<string, ShoppingList[]> = {}, extraRoutes: Record<string, unknown> = {}) {
  const servers = Object.fromEntries(spaces.map((s) => [s.id, fakeSyncServer(s.id, listsBySpace[s.id] ?? [])]))
  const spy = mockApi({
    'GET /api/users/me': testUser,
    'GET /api/spaces': spaces,
    ...Object.assign({}, ...Object.values(servers).map((s) => s.routes)),
    ...(extraRoutes as object),
  })
  renderWithProviders(<AppRoutes />, '/')
  return { spy, servers }
}

describe('HomePage', () => {
  beforeEach(() => loginForTest())

  it('shows each list with the number of open items, but not the items themselves', async () => {
    setup([home], {
      s1: [
        list('l1', 's1', 'Groceries', [item('1', 'Milk'), item('2', 'Bread', true), item('3', 'Eggs'), item('4', 'Tea'), item('5', 'Rice'), item('6', 'Salt')]),
        list('l2', 's1', 'Hardware', [item('1', 'Nails', true)]),
      ],
    })

    const groceries = await screen.findByRole('link', { name: /Groceries/ })
    expect(within(groceries).getByLabelText('5 open')).toHaveTextContent('5')
    expect(groceries).toHaveAttribute('href', '/spaces/s1/lists/l1')
    expect(screen.queryByText(/Milk|Eggs|Nails/)).not.toBeInTheDocument()

    const hardware = screen.getByRole('link', { name: /Hardware/ })
    expect(within(hardware).getByLabelText('0 open')).toHaveTextContent('✓')
    // with one space, its name is not shown as a heading
    expect(screen.queryByRole('heading', { name: 'Home' })).not.toBeInTheDocument()
  })

  it('groups the lists by space when there are several and marks the last used list', async () => {
    setLastList({ spaceId: 's2', listId: 'l2' })
    setup([home, office], { s1: [list('l1', 's1', 'Groceries')], s2: [list('l2', 's2', 'Coffee corner')] })

    const officeSection = await screen.findByRole('region', { name: 'Office' })
    expect(within(officeSection).getByRole('heading', { name: 'Office' })).toBeInTheDocument()
    expect(await within(officeSection).findByRole('link', { name: /Coffee corner/ })).toHaveTextContent('last used')
    const homeSection = screen.getByRole('region', { name: 'Home' })
    expect(await within(homeSection).findByRole('link', { name: /Groceries/ })).not.toHaveTextContent('last used')
  })

  it('without spaces asks to create the first one', async () => {
    let spaces: (typeof home)[] = []
    const { spy } = setup([], {}, {
      'GET /api/spaces': () => spaces,
      'POST /api/spaces': (body: { name: string }) => {
        spaces = [{ ...home, name: body.name }]
        return { status: 201, body: spaces[0] }
      },
      ...fakeSyncServer('s1', []).routes,
    })

    expect(await screen.findByText(/Create your first space to get started/)).toBeInTheDocument()
    // a new list needs a space
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('menuitem', { name: 'New list' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(screen.getByRole('button', { name: 'Create a space' }))
    await userEvent.type(within(screen.getByRole('dialog', { name: 'New space' })).getByLabelText('Name'), 'Flat{Enter}')

    expect(await screen.findByText('No lists yet.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(sentBodies(spy, 'POST', '/api/spaces')).toEqual([{ name: 'Flat' }])
  })

  it('creates a list from the empty hint and opens it', async () => {
    const { servers } = setup([home], {}, {
      'GET /api/spaces/s1': home,
      'GET /api/spaces/s1/catalog': { categories: [], units: [] },
      'GET /api/spaces/s1/layouts': [],
    })

    await userEvent.click(await screen.findByRole('button', { name: 'New list' }))
    const dialog = screen.getByRole('dialog', { name: 'New list' })
    // only one space: no choice offered
    expect(within(dialog).queryByRole('group', { name: 'In space' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Name'), '  Weekend  ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(await screen.findByRole('heading', { name: 'Weekend' })).toBeInTheDocument()
    await waitFor(() => expect(servers.s1.received('CREATE_LIST')).toMatchObject([{ name: 'Weekend' }]))
  })

  it('preselects the space of the last used list for a new list', async () => {
    setLastList({ spaceId: 's2', listId: 'gone' })
    const { servers } = setup([home, office], {}, {
      'GET /api/spaces/s2': office,
      'GET /api/spaces/s2/catalog': { categories: [], units: [] },
      'GET /api/spaces/s2/layouts': [],
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'New list' }))
    const spaceChoice = within(screen.getByRole('dialog')).getByRole('group', { name: 'In space' })
    expect(within(spaceChoice).getByRole('button', { name: 'Office' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(spaceChoice).getByRole('button', { name: 'Home' })).toHaveAttribute('aria-pressed', 'false')

    // switch to the other space
    await userEvent.click(within(spaceChoice).getByRole('button', { name: 'Home' }))
    expect(within(spaceChoice).getByRole('button', { name: 'Home' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(spaceChoice).getByRole('button', { name: 'Office' }))
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText('Name'), 'Snacks{Enter}')

    expect(await screen.findByRole('heading', { name: 'Snacks' })).toBeInTheDocument()
    await waitFor(() => expect(servers.s2.received('CREATE_LIST')).toHaveLength(1))
    expect(servers.s1.received()).toHaveLength(0)
  })

  it('"New list" below a space without lists preselects that space', async () => {
    setup([home, office])

    const officeSection = await screen.findByRole('region', { name: 'Office' })
    await userEvent.click(await within(officeSection).findByRole('button', { name: 'New list' }))

    const spaceChoice = within(screen.getByRole('dialog')).getByRole('group', { name: 'In space' })
    expect(within(spaceChoice).getByRole('button', { name: 'Office' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('offline without lists on this device says so instead of loading forever', async () => {
    setup([home], {}, {
      'GET /api/spaces/s1/changes': () => {
        throw new TypeError('Failed to fetch')
      },
    })

    expect(await screen.findByText(/No connection - the lists of this space are not on this device yet/)).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('cancelling the new list dialog creates nothing', async () => {
    const { servers } = setup([home])

    await userEvent.click(await screen.findByRole('button', { name: 'New list' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Nope')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lists' })).toBeInTheDocument()
    expect(servers.s1.received()).toHaveLength(0)
  })

  it('leads to the spaces and the settings via the menu', async () => {
    setup([home], {}, { 'GET /api/users/me/api-tokens': [] })

    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Spaces & sharing' }))
    expect(await screen.findByRole('heading', { name: 'Spaces & sharing' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Back' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('shows the load error with a retry button', async () => {
    let calls = 0
    setup([], {}, {
      'GET /api/spaces': () => (++calls === 1 ? { status: 500, body: { code: 'BOOM' } } : [home]),
      ...fakeSyncServer('s1', [list('l1', 's1', 'Groceries')]).routes,
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('link', { name: /Groceries/ })).toBeInTheDocument()
  })
})
