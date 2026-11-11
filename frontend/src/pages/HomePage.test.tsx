import { screen, within } from '@testing-library/react'
import { AppRoutes } from '../App'
import type { Item } from '../api/lists'
import { fakeSyncServer } from '../test/fakeSyncServer'
import { mockApi, testUser } from '../test/mockApi'
import { loginForTest, renderWithProviders } from '../test/render'

const item = (id: string, name: string, checked = false): Item => ({
  id, name, quantity: null, unit: null, note: null, categoryId: null, checked, createdAt: `2026-01-01T00:00:0${id}Z`, seq: 1,
})

describe('start page', () => {
  beforeEach(() => loginForTest())

  it('shows every list with the number of open items, but not the items themselves', async () => {
    mockApi({
      'GET /api/users/me': testUser,
      'GET /api/spaces': [{ id: 's1', name: 'Home', myRole: 'OWNER', memberCount: 1, createdAt: '' }],
      ...fakeSyncServer('s1', [
        { id: 'l1', spaceId: 's1', name: 'Groceries', createdAt: '', seq: 1, items: [item('1', 'Milk'), item('2', 'Bread'), item('3', 'Eggs', true)] },
        { id: 'l2', spaceId: 's1', name: 'Hardware', createdAt: '', seq: 1, items: [item('4', 'Screws', true)] },
      ]).routes,
    })
    renderWithProviders(<AppRoutes />, '/')

    const groceries = await screen.findByRole('link', { name: /Groceries/ })
    expect(within(groceries).getByLabelText('2 open')).toHaveTextContent('2')
    expect(within(screen.getByRole('link', { name: /Hardware/ })).getByLabelText('0 open')).toHaveTextContent('✓')
    expect(screen.queryByText(/Milk|Bread|Screws/)).not.toBeInTheDocument()
  })
})
