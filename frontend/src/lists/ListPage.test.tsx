import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
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

  it('adds an item via the quick add field', async () => {
    const { server } = setup([])

    await userEvent.type(await screen.findByLabelText('Add item...'), 'Milk{Enter}')

    expect(await screen.findByRole('checkbox', { name: 'Milk' })).toBeInTheDocument()
    expect(screen.getByLabelText('Add item...')).toHaveValue('')
    await waitFor(() => expect(server.received('ADD_ITEM')).toHaveLength(1))
    const [added] = server.received('ADD_ITEM') as { itemId: string; name: string }[]
    expect(added.name).toBe('Milk')
    expect(added.itemId).toMatch(/^[0-9a-f-]{36}$/) // client-generated UUID
  })

  it('checks an item by tapping and offers undo', async () => {
    const { server } = setup([item('1', 'Milk'), item('2', 'Bread')])

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Milk' }))
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toHaveAttribute('aria-checked', 'true')
    // checked items move to the end (setting is on for the test user)
    expect(screen.getAllByRole('checkbox').map((el) => el.getAttribute('aria-label'))).toEqual(['Bread', 'Milk'])

    await userEvent.click(within(screen.getByText('"Milk" checked').parentElement!).getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toHaveAttribute('aria-checked', 'false')
    await waitFor(() => expect(server.list('l1').items[0].checked).toBe(false))
  })

  it('removes the checked items after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { server } = setup([item('1', 'Milk', { checked: true }), item('2', 'Bread')])

    await userEvent.click(await screen.findByRole('button', { name: 'Remove checked (1)' }))

    expect(screen.queryByRole('checkbox', { name: 'Milk' })).not.toBeInTheDocument()
    await waitFor(() => expect(server.received('REMOVE_CHECKED')).toEqual([expect.objectContaining({ itemIds: ['1'] })]))
    expect(server.list('l1').items.map((i) => i.name)).toEqual(['Bread'])
  })

  it('edit sends one change per changed field', async () => {
    const { server } = setup([item('1', 'Milk', { quantity: '1' })])

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.clear(within(dialog).getByLabelText('Quantity'))
    await userEvent.type(within(dialog).getByLabelText('Quantity'), '3')
    await userEvent.type(within(dialog).getByLabelText('Unit'), 'l')
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

    await userEvent.type(screen.getByLabelText('Add item...'), 'Bread{Enter}')
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

  it('groups items by category in category order', async () => {
    setup([item('1', 'Milk', { categoryId: 'dairy' }), item('2', 'Carrots', { categoryId: 'veg' }), item('3', 'Batteries')])

    await screen.findByRole('list', { name: 'Dairy' })
    expect(screen.getAllByRole('list').map((section) => section.getAttribute('aria-label'))).toEqual(['Vegetables', 'Dairy', 'Other'])
    expect(within(screen.getByRole('list', { name: 'Dairy' })).getByRole('checkbox', { name: 'Milk' })).toBeInTheDocument()
  })

  it('picking an autocomplete suggestion adds the item with category and unit', async () => {
    const { server } = setup([], {
      'GET /api/spaces/s1/catalog/suggestions': (_: unknown, url: URL) =>
        url.searchParams.get('q') === 'mi' ? [{ name: 'Milk', categoryId: 'dairy', unit: 'l', usageCount: 3 }] : [],
    })

    await userEvent.type(await screen.findByRole('combobox'), 'mi')
    await userEvent.click(await screen.findByRole('button', { name: /Milk/ }))

    expect(await screen.findByRole('list', { name: 'Dairy' })).toBeInTheDocument()
    await waitFor(() => expect(server.received('ADD_ITEM')[0]).toMatchObject({ name: 'Milk', categoryId: 'dairy', unit: 'l' }))
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
})
