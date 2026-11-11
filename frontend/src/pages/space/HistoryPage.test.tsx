import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppRoutes } from '../../App'
import type { HistoryEntry } from '../../api/catalog'
import { mockApi, sentBodies, testUser } from '../../test/mockApi'
import { loginForTest, renderWithProviders } from '../../test/render'

const entry = (name: string, usageCount = 0): HistoryEntry => ({ name, categoryId: 'dairy', unit: null, usageCount, lastUsed: '2026-01-01T00:00:00Z' })

describe('items used before', () => {
  beforeEach(() => loginForTest())

  function setup() {
    let entries = [entry('Brot/Brötchen'), entry('Mlich', 3)]
    const spy = mockApi({
      'GET /api/users/me': testUser,
      'GET /api/spaces/s1/catalog': { categories: [{ id: 'dairy', name: 'Dairy', color: '#0000ff' }], units: [] },
      'GET /api/spaces/s1/catalog/history': () => entries,
      'PUT /api/spaces/s1/catalog/history': (body: unknown, url: URL) =>
        (entries = entries.map((e) => (e.name === url.searchParams.get('name') ? { ...e, name: (body as { name: string }).name } : e))),
      'DELETE /api/spaces/s1/catalog/history': (_: unknown, url: URL) => (entries = entries.filter((e) => e.name !== url.searchParams.get('name'))),
    })
    renderWithProviders(<AppRoutes />, '/spaces/s1/history')
    return spy
  }

  it('lists, filters, renames and removes items', async () => {
    const spy = setup()

    expect(await screen.findByText('Dairy · bought 3×')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Search'), 'ml')
    expect(screen.queryByText('Brot/Brötchen')).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Search'))

    await userEvent.click(screen.getByRole('button', { name: /^Mlich/ }))
    const name = within(screen.getByRole('dialog')).getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Milch{Enter}')
    expect(await screen.findByRole('button', { name: /^Milch/ })).toBeInTheDocument()
    expect(sentBodies(spy, 'PUT', '/api/spaces/s1/catalog/history')).toEqual([{ name: 'Milch' }])

    await userEvent.click(screen.getByRole('button', { name: /^Brot\/Brötchen/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByText('Brot/Brötchen')).not.toBeInTheDocument())
    expect(spy.mock.calls.some(([url, init]) => String(url).includes('history?name=Brot%2FBr%C3%B6tchen') && init?.method === 'DELETE')).toBe(true)
  })
})
