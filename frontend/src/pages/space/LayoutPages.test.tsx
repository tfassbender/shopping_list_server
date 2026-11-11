import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppRoutes } from '../../App'
import type { Item, ShoppingList } from '../../api/lists'
import type { ShopLayout } from '../../api/layouts'
import { groupSorted, withoutCategoryHeaders } from '../../lists/sortItems'
import { fakeSyncServer } from '../../test/fakeSyncServer'
import { mockApi, sentBodies, testUser } from '../../test/mockApi'
import { loginForTest, renderWithProviders } from '../../test/render'
import { categoriesInLayoutOrder } from './LayoutPages'

const categories = [
  { id: 'veg', name: 'Vegetables', color: '#00ff00' },
  { id: 'dairy', name: 'Dairy', color: '#0000ff' },
  { id: 'bakery', name: 'Bakery', color: '#aa8800' },
]
const catalog = { categories, units: [] }
const layout: ShopLayout = {
  id: 'aldi', name: 'Aldi', mode: 'CATEGORIES', categoryOrder: ['bakery', 'dairy'], itemOrder: [], listIds: ['l1'], createdAt: '',
}
const item = (id: string, name: string, overrides: Partial<Item> = {}): Item => ({
  id, name, quantity: null, unit: null, note: null, categoryId: null, checked: false, createdAt: `2026-01-01T00:00:0${id}Z`, seq: 1, ...overrides,
})

describe('layout helpers', () => {
  it('shows the layout order first, then categories added later', () => {
    expect(categoriesInLayoutOrder({ ...layout, categoryOrder: ['bakery', 'deleted', 'veg'] }, categories).map((c) => c.id)).toEqual([
      'bakery', 'veg', 'dairy',
    ])
  })

  it('groups a server-sorted list into consecutive category sections, checked last', () => {
    const sorted = [
      item('1', 'Bread', { categoryId: 'bakery' }),
      item('2', 'Milk', { categoryId: 'dairy' }),
      item('3', 'Cheese', { categoryId: 'dairy', checked: true }),
      item('4', 'Batteries'),
    ]
    const summary = groupSorted(sorted, categories, 'CATEGORIES', new Set(['3'])).map((s) => `${s.kind}:${s.items.map((i) => i.name).join(',')}`)
    expect(summary).toEqual(['category:Bread', 'category:Milk', 'other:Batteries', 'checked:Cheese'])
  })

  it('without category headers keeps the order in one section, only the checked section stays', () => {
    const sorted = [item('1', 'Bread', { categoryId: 'bakery' }), item('2', 'Milk', { categoryId: 'dairy' }), item('3', 'Cheese', { categoryId: 'dairy', checked: true })]
    const sections = withoutCategoryHeaders(groupSorted(sorted, categories, 'CATEGORIES', new Set(['3'])))
    expect(sections.map((s) => `${s.kind}:${s.items.map((i) => i.name).join(',')}`)).toEqual(['items:Bread,Milk', 'checked:Cheese'])
    expect(withoutCategoryHeaders([])).toEqual([])
  })

  it('uses one header-less section in item mode', () => {
    const sections = groupSorted([item('1', 'Bread', { categoryId: 'bakery' }), item('2', 'Milk')], categories, 'ITEMS')
    expect(sections.map((s) => [s.kind, s.items.length])).toEqual([['items', 2]])
  })
})

describe('shop selection on the list screen', () => {
  beforeEach(() => loginForTest())

  function setup() {
    const list: ShoppingList = {
      id: 'l1', spaceId: 's1', name: 'Groceries', createdAt: '', seq: 1,
      items: [item('1', 'Milk', { categoryId: 'dairy' }), item('2', 'Bread', { categoryId: 'bakery' })],
    }
    let favorites = ['milk']
    return mockApi({
      'GET /api/users/me': testUser,
      'GET /api/spaces/s1': { id: 's1', name: 'Home', myRole: 'MEMBER', memberCount: 1, createdAt: '' },
      'GET /api/spaces/s1/catalog': catalog,
      'GET /api/spaces/s1/layouts': [layout],
      'GET /api/spaces/s1/layouts/aldi/favorites': () => ({ names: favorites }),
      'POST /api/spaces/s1/layouts/aldi/favorites': (body) => ({ names: (favorites = [...favorites, (body as { name: string }).name.toLowerCase()]) }),
      ...fakeSyncServer('s1', [list]).routes,
    })
  }

  it('sorts by the chosen shop (on the device), remembers it and offers favorites', async () => {
    const spy = setup()
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')

    await screen.findByRole('checkbox', { name: 'Milk' })
    expect(screen.queryByRole('button', { name: 'Favorite Milk' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Order of adding/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Aldi/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getAllByRole('list').map((l) => l.getAttribute('aria-label'))).toEqual(['Bakery', 'Dairy']))
    expect(localStorage.getItem('shoppinglist.listLayout')).toBe('{"l1":"aldi"}')
    expect(screen.getByRole('button', { name: /Sorted for Aldi/ })).toBeInTheDocument()

    // favorites are toggled in the item details
    await userEvent.click(screen.getByRole('button', { name: 'Edit Milk' }))
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('switch', { name: 'Favorite at Aldi' })).toBeChecked())
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Edit Bread' }))
    const favorite = within(screen.getByRole('dialog')).getByRole('switch', { name: 'Favorite at Aldi' })
    expect(favorite).not.toBeChecked()
    await userEvent.click(favorite)
    await waitFor(() => expect(favorite).toBeChecked())
    await waitFor(() => expect(sentBodies(spy, 'POST', '/api/spaces/s1/layouts/aldi/favorites')).toEqual([{ name: 'Bread' }]))
  })

  it('hides the category headers with the header button and shows a color bar per item instead', async () => {
    localStorage.setItem('shoppinglist.listLayout', '{"l1":"aldi"}')
    setup()
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')

    expect(await screen.findByRole('heading', { name: 'Bakery' })).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Show category headers' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('heading', { name: 'Bakery' })).not.toBeInTheDocument()
    // same order as with headers (shop order), one color bar per item
    expect(screen.getAllByRole('checkbox').map((el) => el.getAttribute('aria-label'))).toEqual(['Bread', 'Milk'])
    const bar = screen.getByRole('checkbox', { name: 'Bread' }).parentElement!.firstElementChild as HTMLElement
    expect(bar).toHaveStyle({ backgroundColor: '#aa8800' })
    expect(localStorage.getItem('shoppinglist.categoryHeaders')).toBe('false') // remembered on this device

    await userEvent.click(toggle)
    expect(await screen.findByRole('heading', { name: 'Bakery' })).toBeInTheDocument()
  })

  it('uses the remembered shop when opening the list again', async () => {
    localStorage.setItem('shoppinglist.listLayout', '{"l1":"aldi"}')
    setup()
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')

    expect(await screen.findByRole('list', { name: 'Bakery' })).toBeInTheDocument()
  })
})

describe('layout editor', () => {
  beforeEach(() => loginForTest())

  it('opens the categories from the shop, back leads to the shop again', async () => {
    mockApi({
      'GET /api/users/me': testUser,
      'GET /api/spaces/s1/catalog': catalog,
      'GET /api/spaces/s1/layouts': [layout],
      'GET /api/spaces/s1/lists': [],
    })
    renderWithProviders(<AppRoutes />, '/spaces/s1/layouts/aldi')

    await userEvent.click(await screen.findByRole('button', { name: 'Edit categories' }))
    expect(await screen.findByRole('heading', { name: 'Categories & units' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Aldi' })).toBeInTheDocument()
  })

  it('copies a shop under a new name and opens the copy', async () => {
    let layouts = [layout]
    const spy = mockApi({
      'GET /api/users/me': testUser,
      'GET /api/spaces/s1/catalog': catalog,
      'GET /api/spaces/s1/layouts': () => layouts,
      'GET /api/spaces/s1/lists': [],
      'POST /api/spaces/s1/layouts/aldi/copy': (body) => {
        const copy = { ...layout, id: 'aldi-2', name: (body as { name: string }).name }
        layouts = [...layouts, copy]
        return { status: 201, body: copy }
      },
    })
    renderWithProviders(<AppRoutes />, '/spaces/s1/layouts/aldi')

    await userEvent.click(await screen.findByRole('button', { name: 'Copy shop' }))
    const name = within(screen.getByRole('dialog')).getByLabelText('Name')
    expect(name).toHaveValue('Aldi (copy)')
    await userEvent.clear(name)
    await userEvent.type(name, 'Aldi Süd{Enter}')

    expect(await screen.findByRole('heading', { name: 'Aldi Süd' })).toBeInTheDocument()
    expect(sentBodies(spy, 'POST', '/api/spaces/s1/layouts/aldi/copy')).toEqual([{ name: 'Aldi Süd' }])
  })

  it('deletes a shop only after confirming in the dialog', async () => {
    let layouts = [layout]
    const spy = mockApi({
      'GET /api/users/me': testUser,
      'GET /api/spaces/s1/catalog': catalog,
      'GET /api/spaces/s1/layouts': () => layouts,
      'GET /api/spaces/s1/lists': [],
      'DELETE /api/spaces/s1/layouts/aldi': () => {
        layouts = []
        return { status: 204 }
      },
    })
    renderWithProviders(<AppRoutes />, '/spaces/s1/layouts/aldi')

    await userEvent.click(await screen.findByRole('button', { name: 'Delete shop' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Delete "Aldi"?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(spy.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Delete shop' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete shop' }))
    // back on the overview, which is now empty
    expect(await screen.findByRole('heading', { name: 'Shops' })).toBeInTheDocument()
    expect(spy.mock.calls.some(([url, init]) => String(url).endsWith('/layouts/aldi') && init?.method === 'DELETE')).toBe(true)
  })

  it('switches the mode, adds item entries and connects lists', async () => {
    let current = { ...layout }
    const spy = mockApi({
      'GET /api/users/me': testUser,
      'GET /api/spaces/s1/catalog': catalog,
      'GET /api/spaces/s1/layouts': () => [current],
      'GET /api/spaces/s1/lists': [{ id: 'l1', name: 'Groceries', openItems: 0, checkedItems: 0, seq: 1 }, { id: 'l2', name: 'Hardware', openItems: 0, checkedItems: 0, seq: 1 }],
      'PUT /api/spaces/s1/layouts/aldi': (body) => (current = { ...current, ...(body as object) }),
      'PUT /api/spaces/s1/layouts/aldi/item-order': (body) => (current = { ...current, itemOrder: (body as { entries: string[] }).entries }),
      'PUT /api/spaces/s1/layouts/aldi/lists/l2': () => (current = { ...current, listIds: [...current.listIds, 'l2'] }),
    })
    renderWithProviders(<AppRoutes />, '/spaces/s1/layouts/aldi')

    // category mode shows the categories in layout order
    await screen.findByRole('button', { name: 'Move Bakery' })
    expect(screen.getAllByRole('button', { name: /^Move / }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Move Bakery', 'Move Dairy', 'Move Vegetables',
    ])

    await userEvent.click(screen.getByLabelText(/By single items/))
    await waitFor(() => expect(sentBodies(spy, 'PUT', '/api/spaces/s1/layouts/aldi')).toEqual([{ name: 'Aldi', mode: 'ITEMS' }]))

    await userEvent.type(await screen.findByLabelText('Add item'), 'Milk')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(sentBodies(spy, 'PUT', '/api/spaces/s1/layouts/aldi/item-order')).toEqual([{ entries: ['Milk'] }]))

    const lists = screen.getByRole('heading', { name: 'Lists' }).parentElement!
    await userEvent.click(within(lists).getByLabelText('Hardware'))
    await waitFor(() => expect(within(lists).getByLabelText('Hardware')).toBeChecked())
  })
})
