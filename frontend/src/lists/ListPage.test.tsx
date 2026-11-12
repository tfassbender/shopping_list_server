import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppRoutes } from '../App'
import type { Item } from '../api/lists'
import { fakeSyncServer } from '../test/fakeSyncServer'
import { mockApi, testUser } from '../test/mockApi'
import { loginForTest, renderWithProviders } from '../test/render'

const catalog = {
  categories: [
    { id: 'veg', name: 'Vegetables', color: '#00ff00' },
    { id: 'dairy', name: 'Dairy', color: '#0000ff' },
  ],
  units: ['l', 'kg'],
}
const space = { id: 's1', name: 'Home', myRole: 'MEMBER', memberCount: 2, createdAt: '' }
const item = (id: string, name: string, overrides: Partial<Item> = {}): Item => ({
  id, name, quantity: null, unit: null, note: null, categoryId: null, checked: false, createdAt: `2026-01-01T00:00:0${id}Z`, seq: 1, ...overrides,
})

/** A list "Groceries" with the given items behind a fake sync server, plus the other endpoints the page uses. */
function setup(items: Item[], extraRoutes: Record<string, unknown> = {}) {
  const server = fakeSyncServer('s1', [{ id: 'l1', spaceId: 's1', name: 'Groceries', createdAt: '', seq: 1, items }])
  const spy = mockApi({
    'GET /api/users/me': testUser,
    'GET /api/spaces/s1': space,
    'GET /api/spaces/s1/catalog': catalog,
    'GET /api/spaces/s1/layouts': [],
    ...server.routes,
    ...(extraRoutes as object),
  })
  renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')
  return { server, spy }
}

describe('ListPage', () => {
  beforeEach(() => loginForTest())

  it('adds several items in a row via the + dialog', async () => {
    const { server } = setup([])

    await userEvent.click(await screen.findByRole('button', { name: 'Add item' }))
    const dialog = screen.getByRole('dialog')
    // the amount takes only numbers
    await userEvent.type(within(dialog).getByLabelText('Amount'), '2x,a5')
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('2,5')
    await userEvent.clear(within(dialog).getByLabelText('Amount'))
    await userEvent.type(within(dialog).getByLabelText('Amount'), '2')
    // the unit is picked from the units of the space
    expect(within(within(dialog).getByLabelText('Unit')).getAllByRole('option').map((o) => o.textContent)).toEqual(['–', 'l', 'kg'])
    await userEvent.selectOptions(within(dialog).getByLabelText('Unit'), 'l')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Milk')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add another' }))

    // the dialog stays open, empty, for the next item; Enter does the same
    expect(within(dialog).getByLabelText('Name')).toHaveValue('')
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('')
    expect(within(dialog).getByLabelText('Unit')).toHaveValue('')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Bread{Enter}')
    expect(within(dialog).getByLabelText('Name')).toHaveValue('')

    // "Done" adds the current item and closes
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Eggs')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox').map((el) => el.getAttribute('aria-label'))).toEqual(['Milk', 'Bread', 'Eggs'])
    await waitFor(() => expect(server.received('ADD_ITEM')).toHaveLength(3))
    const [added] = server.received('ADD_ITEM') as { itemId: string; name: string; quantity: string; unit: string }[]
    expect(added).toMatchObject({ name: 'Milk', quantity: '2', unit: 'l' })
    expect(added.itemId).toMatch(/^[0-9a-f-]{36}$/) // client-generated UUID
  })

  it('cancel closes the add dialog without adding the entered item', async () => {
    const { server } = setup([item('1', 'Milk')])

    await userEvent.click(await screen.findByRole('button', { name: 'Add item' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Bread')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Bread' })).not.toBeInTheDocument()
    expect(server.received('ADD_ITEM')).toHaveLength(0)
  })

  it('checks an item by tapping; it stays in place until the sort button moves it', async () => {
    const { server } = setup([item('1', 'Milk'), item('2', 'Bread')])
    const order = () => screen.getAllByRole('checkbox').map((el) => el.getAttribute('aria-label'))

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Milk' }))
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toHaveAttribute('aria-checked', 'true')
    expect(order()).toEqual(['Milk', 'Bread'])

    await userEvent.click(screen.getByRole('button', { name: 'Move checked items to the end' }))
    expect(order()).toEqual(['Bread', 'Milk'])
    expect(screen.getByRole('list', { name: 'Checked' })).toBeInTheDocument()

    // unchecking returns the item to its place
    await userEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
    expect(order()).toEqual(['Milk', 'Bread'])
    await waitFor(() => expect(server.list('l1').items[0].checked).toBe(false))

    // checking it again keeps it in place, like any other newly checked item
    await userEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))
    expect(order()).toEqual(['Milk', 'Bread'])
    expect(screen.queryByRole('list', { name: 'Checked' })).not.toBeInTheDocument()
  })

  it('opens the items used before from the menu, back leads to the list', async () => {
    setup([item('1', 'Milk')], { 'GET /api/spaces/s1/catalog/history': [] })

    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Items used before' }))
    expect(await screen.findByRole('heading', { name: 'Items used before' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Back' }))
    expect(await screen.findByRole('checkbox', { name: 'Milk' })).toBeInTheDocument()
  })

  it('removes the checked items via the menu', async () => {
    const { server } = setup([item('1', 'Milk', { checked: true }), item('2', 'Bread')])

    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove 1 checked' }))

    expect(screen.queryByRole('checkbox', { name: 'Milk' })).not.toBeInTheDocument()
    await waitFor(() => expect(server.received('REMOVE_CHECKED')).toEqual([expect.objectContaining({ itemIds: ['1'] })]))
    expect(server.list('l1').items.map((i) => i.name)).toEqual(['Bread'])
  })

  it('renames the list via the menu', async () => {
    const { server } = setup([])

    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename list' }))
    const name = within(screen.getByRole('dialog')).getByRole('textbox')
    await userEvent.clear(name)
    await userEvent.type(name, 'Weekend{Enter}')

    expect(await screen.findByRole('heading', { name: 'Weekend' })).toBeInTheDocument()
    await waitFor(() => expect(server.list('l1').name).toBe('Weekend'))
  })

  it('edit sends one change per changed field', async () => {
    const { server } = setup([item('1', 'Milk', { quantity: '1' })])

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.clear(within(dialog).getByLabelText('Amount'))
    await userEvent.type(within(dialog).getByLabelText('Amount'), '3')
    await userEvent.selectOptions(within(dialog).getByLabelText('Unit'), 'l')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('3 l')).toBeInTheDocument()
    await waitFor(() =>
      expect(server.received('EDIT_ITEM').map((op) => op.type === 'EDIT_ITEM' && [op.field, op.value])).toEqual([
        ['QUANTITY', '3'],
        ['UNIT', 'l'],
      ]),
    )
  })

  it('works offline: changes are shown at once and sent when the server is back', async () => {
    const { server } = setup([item('1', 'Milk')])
    await screen.findByRole('checkbox', { name: 'Milk' })
    server.offline = true

    await userEvent.click(screen.getByRole('button', { name: 'Add item' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Bread{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Milk' }))

    expect(screen.getByRole('checkbox', { name: 'Bread' })).toBeInTheDocument()
    expect(await screen.findByText('Offline · 2 unsaved')).toBeInTheDocument()
    expect(server.received()).toHaveLength(0)

    server.offline = false
    window.dispatchEvent(new Event('online'))
    const { syncEngine } = await import('../offline/engine')
    await syncEngine.syncAll()

    await waitFor(() => expect(server.received().map((op) => op.type)).toEqual(['ADD_ITEM', 'CHECK_ITEM']))
    await waitFor(() => expect(screen.queryByText(/unsaved/)).not.toBeInTheDocument())
  })

  it('without a shop shows the items in the order of adding, not grouped by category', async () => {
    setup([item('1', 'Milk', { categoryId: 'dairy' }), item('2', 'Carrots', { categoryId: 'veg' }), item('3', 'Batteries')])

    await screen.findByRole('checkbox', { name: 'Milk' })
    expect(screen.getByRole('button', { name: /Order of adding/ })).toBeInTheDocument()
    expect(screen.getAllByRole('list')).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: 'Dairy' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox').map((el) => el.getAttribute('aria-label'))).toEqual(['Milk', 'Carrots', 'Batteries'])
  })

  it('picking an autocomplete suggestion adds the item with category and unit', async () => {
    const { server } = setup([], {
      'GET /api/spaces/s1/catalog/suggestions': (_: unknown, url: URL) =>
        url.searchParams.get('q') === 'mi' ? [{ name: 'Milk', categoryId: 'dairy', unit: 'l', usageCount: 3 }] : [],
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Add item' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Name' }), 'mi')
    await userEvent.click(await screen.findByRole('button', { name: /Milk/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(await screen.findByRole('checkbox', { name: 'Milk' })).toBeInTheDocument()
    await waitFor(() => expect(server.received('ADD_ITEM')[0]).toMatchObject({ name: 'Milk', categoryId: 'dairy', unit: 'l' }))
  })

  it('a suggestion keeps the amount entered before it', async () => {
    const { server } = setup([], {
      'GET /api/spaces/s1/catalog/suggestions': [{ name: 'Milk', categoryId: 'dairy', unit: 'l', usageCount: 3 }],
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Add item' }))
    await userEvent.type(screen.getByLabelText('Amount'), '2')
    await userEvent.type(screen.getByRole('combobox', { name: 'Name' }), 'mi')
    await userEvent.click(await screen.findByRole('button', { name: /Milk/ }))

    await waitFor(() => expect(server.received('ADD_ITEM')[0]).toMatchObject({ name: 'Milk', quantity: '2', unit: 'l' }))
  })

  it('editor keeps a unit that is not in the list of the space', async () => {
    setup([item('1', 'Rice', { quantity: '1', unit: 'Packung' })])

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Rice' }))

    expect(within(screen.getByRole('dialog')).getByLabelText('Unit')).toHaveValue('Packung')
  })

  it('editor offers the categories of the space', async () => {
    const { server } = setup([item('1', 'Milk')])

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    await userEvent.selectOptions(within(screen.getByRole('dialog')).getByLabelText('Category'), 'Dairy')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(server.received('EDIT_ITEM')).toEqual([expect.objectContaining({ field: 'CATEGORY', value: 'dairy' })]))
  })

  it('shows a hint for a list that does not exist', async () => {
    setup([])
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/unknown')
    expect(await screen.findByText('This list does not exist (anymore).')).toBeInTheDocument()
  })

  it('tells a removed member that the list is gone, including how many changes were lost', async () => {
    let removed = false
    const gone = { status: 404, body: { code: 'SPACE_NOT_FOUND' } }
    const original = fakeSyncServer('s1', [{ id: 'l1', spaceId: 's1', name: 'Groceries', createdAt: '', seq: 1, items: [item('1', 'Milk')] }])
    setup([], {
      'POST /api/spaces/s1/changes': (body: unknown) => (removed ? gone : original.routes['POST /api/spaces/s1/changes'](body)),
      'GET /api/spaces/s1/changes': () => (removed ? gone : original.routes['GET /api/spaces/s1/changes'](undefined)),
    })
    await screen.findByRole('checkbox', { name: 'Milk' })
    removed = true

    await userEvent.click(screen.getByRole('button', { name: 'Add item' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Bread')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    const { syncEngine } = await import('../offline/engine')
    await syncEngine.syncAll()

    expect(await screen.findByText(/You no longer have access to this list/)).toBeInTheDocument()
    expect(screen.getByText(/\(1\) could not be saved/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'To the start page' })).toBeInTheDocument()
  })

  it('a deep link into a space the user is not a member of does not load forever', async () => {
    mockApi({ 'GET /api/users/me': testUser, 'GET /api/spaces/s9/changes': { status: 404, body: { code: 'SPACE_NOT_FOUND' } } })
    renderWithProviders(<AppRoutes />, '/spaces/s9/lists/l1')
    expect(await screen.findByText(/You no longer have access to this list/)).toBeInTheDocument()
  })
})
