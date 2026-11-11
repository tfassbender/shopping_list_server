import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AppRoutes } from '../App'
import type { Item, ShoppingList } from '../api/lists'
import { mockApi, sentBodies, testUser } from '../test/mockApi'
import { loginForTest, renderWithProviders } from '../test/render'
import { applyLocal, type ListChange } from './listChanges'

const space = { id: 's1', name: 'Home', myRole: 'MEMBER', memberCount: 2, createdAt: '' }
const item = (id: string, name: string, overrides: Partial<Item> = {}): Item => ({
  id, name, quantity: null, unit: null, note: null, categoryId: null, checked: false, createdAt: `2026-01-01T00:00:0${id}Z`, seq: 1, ...overrides,
})

/** A fake backend that applies the same change logic, so tests see realistic responses. */
function fakeListBackend(initial: Item[]) {
  let list: ShoppingList = { id: 'l1', spaceId: 's1', name: 'Groceries', createdAt: '', seq: 1, items: initial }
  const change = (c: ListChange) => () => {
    list = applyLocal(list, c)
    return list
  }
  const routes = {
    'GET /api/users/me': testUser,
    'GET /api/spaces/s1': space,
    'GET /api/spaces/s1/lists': [],
    'GET /api/spaces/s1/lists/l1': () => list,
    'POST /api/spaces/s1/lists/l1/items': (body: unknown) => change({ type: 'addItem', item: body as Item })(),
    'POST /api/spaces/s1/lists/l1/items/1/check': change({ type: 'check', itemId: '1' }),
    'POST /api/spaces/s1/lists/l1/items/1/uncheck': change({ type: 'uncheck', itemId: '1' }),
    'POST /api/spaces/s1/lists/l1/remove-checked': change({ type: 'removeChecked' }),
    'PATCH /api/spaces/s1/lists/l1/items/1': (body: unknown) => change({ type: 'editItem', itemId: '1', fields: body as never })(),
  }
  return { routes, current: () => list }
}

describe('ListPage', () => {
  beforeEach(() => loginForTest())

  it('adds an item via the quick add field', async () => {
    const backend = fakeListBackend([])
    const spy = mockApi(backend.routes)
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')

    await userEvent.type(await screen.findByLabelText('Add item...'), 'Milk{Enter}')

    expect(await screen.findByRole('checkbox', { name: 'Milk' })).toBeInTheDocument()
    const [body] = sentBodies(spy, 'POST', '/api/spaces/s1/lists/l1/items') as { id: string; name: string }[]
    expect(body.name).toBe('Milk')
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/) // client-generated UUID
    expect(screen.getByLabelText('Add item...')).toHaveValue('')
  })

  it('checks an item by tapping and offers undo', async () => {
    const backend = fakeListBackend([item('1', 'Milk'), item('2', 'Bread')])
    mockApi(backend.routes)
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Milk' }))
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toHaveAttribute('aria-checked', 'true')
    // checked items move to the end (setting is on for the test user)
    expect(screen.getAllByRole('checkbox').map((el) => el.getAttribute('aria-label'))).toEqual(['Bread', 'Milk'])

    await userEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(backend.current().items[0].checked).toBe(false))
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toHaveAttribute('aria-checked', 'false')
  })

  it('removes all checked items after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const backend = fakeListBackend([item('1', 'Milk', { checked: true }), item('2', 'Bread')])
    mockApi(backend.routes)
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')

    await userEvent.click(await screen.findByRole('button', { name: 'Remove checked (1)' }))

    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Milk' })).not.toBeInTheDocument())
    expect(backend.current().items.map((i) => i.name)).toEqual(['Bread'])
  })

  it('edit sends only the changed fields', async () => {
    const backend = fakeListBackend([item('1', 'Milk', { quantity: '1' })])
    const spy = mockApi(backend.routes)
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Milk' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.clear(within(dialog).getByLabelText('Quantity'))
    await userEvent.type(within(dialog).getByLabelText('Quantity'), '3')
    await userEvent.type(within(dialog).getByLabelText('Unit'), 'l')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(sentBodies(spy, 'PATCH', '/api/spaces/s1/lists/l1/items/1')).toEqual([{ quantity: '3', unit: 'l' }]))
    expect(await screen.findByText('3 l')).toBeInTheDocument()
  })

  it('a slow server response does not undo a newer local change', async () => {
    const backend = fakeListBackend([item('1', 'Milk')])
    let releaseCheck: () => void = () => {}
    mockApi({
      ...backend.routes,
      // The check request hangs until released; meanwhile the user unchecks again.
      'POST /api/spaces/s1/lists/l1/items/1/check': () => backend.routes['POST /api/spaces/s1/lists/l1/items/1/check'](),
    })
    const fetchSpy = vi.mocked(globalThis.fetch)
    const original = fetchSpy.getMockImplementation()!
    fetchSpy.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/check')) await new Promise<void>((resolve) => (releaseCheck = resolve))
      return original(input, init)
    })
    renderWithProviders(<AppRoutes />, '/spaces/s1/lists/l1')

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Milk' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Milk' })) // uncheck while check is in flight
    releaseCheck()

    await waitFor(() => expect(backend.current().items[0].checked).toBe(false))
    expect(screen.getByRole('checkbox', { name: 'Milk' })).toHaveAttribute('aria-checked', 'false')
  })
})
