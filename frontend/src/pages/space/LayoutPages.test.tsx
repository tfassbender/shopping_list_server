import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppRoutes } from '../../App'
import type { Item, ShoppingList } from '../../api/lists'
import type { ShopLayout } from '../../api/layouts'
import { groupSorted } from '../../lists/sortItems'
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
    const summary = groupSorted(sorted, categories, 'CATEGORIES', true).map((s) => `${s.kind}:${s.items.map((i) => i.name).join(',')}`)
    expect(summary).toEqual(['category:Bread', 'category:Milk', 'other:Batteries', 'checked:Cheese'])
  })

  it('uses one header-less section in item mode', () => {
    const sections = groupSorted([item('1', 'Bread', { categoryId: 'bakery' }), item('2', 'Milk')], categories, 'ITEMS', false)
    expect(sections.map((s) => [s.kind, s.items.length])).toEqual([['items', 2]])
  })
})

describe('shop selection on the list screen', () => {
  beforeEach(() => loginForTest())

  function setup() {
    const unsorted: ShoppingList = {
      id: 'l1', spaceId: 's1', name: 'Groceries', createdAt: '', seq: 1,
      items: [item('1', 'Milk', { categoryId: 'dairy' }), item('2', 'Bread', { categoryId: 'bakery' })],
    }
    return mockApi({
      'GET /api/users/me': testUser,
      'GET /api/spaces/s1': { id: 's1', name: 'Home', myRole: 'MEMBER', memberCount: 1, createdAt: '' },
      'GET /api/spaces/s1/catalog': catalog,
      'GET /api/spaces/s1/layouts': [layout],
      'GET /api/spaces/s1/lists/l1': (_: unknown, url: URL) =>
        url.searchParams.get('sort') === 'aldi'
          ? { ...unsorted, sortedBy: 'aldi', items: [{ ...unsorted.items[1], favorite: false }, { ...unsorted.items[0], favorite: true }] }
          : unsorted,
      'POST /api/spaces/s1/layouts/aldi/favorites': { names: ['bread', 'milk'] },
    })
  }

  it('sorts by the chosen shop, remembers it and offers favorites', async () => {
    const spy = setup()
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')

    await screen.findByRole('checkbox', { name: 'Milk' })
    expect(screen.queryByRole('button', { name: 'Favorite Milk' })).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Shop'), 'Aldi')

    await waitFor(() => expect(screen.getAllByRole('list').map((l) => l.getAttribute('aria-label'))).toEqual(['Bakery', 'Dairy']))
    expect(localStorage.getItem('shoppinglist.listLayout')).toBe('{"l1":"aldi"}')
    expect(screen.getByRole('button', { name: 'Favorite Milk' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Favorite Bread' }))
    expect(sentBodies(spy, 'POST', '/api/spaces/s1/layouts/aldi/favorites')).toEqual([{ name: 'Bread' }])
  })

  it('uses the remembered shop when opening the list again', async () => {
    localStorage.setItem('shoppinglist.listLayout', '{"l1":"aldi"}')
    const spy = setup()
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')

    await screen.findByRole('list', { name: 'Bakery' })
    expect(spy.mock.calls.some(([url]) => String(url).includes('sort=aldi'))).toBe(true)
  })
})

describe('layout editor', () => {
  beforeEach(() => loginForTest())

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
