import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AppRoutes } from '../../App'
import { mockApi, sentBodies, testUser } from '../../test/mockApi'
import { loginForTest, renderWithProviders } from '../../test/render'

const catalog = {
  categories: [
    { id: 'veg', name: 'Vegetables', color: '#00ff00' },
    { id: 'dairy', name: 'Dairy', color: '#0000ff' },
  ],
  units: ['l', 'kg'],
}

describe('CatalogPage', () => {
  beforeEach(() => loginForTest())

  function setup() {
    return mockApi({
      'GET /api/users/me': testUser,
      'GET /api/spaces/s1/catalog': catalog,
      'POST /api/spaces/s1/catalog/categories': (body) => ({
        status: 201,
        body: { ...catalog, categories: [...catalog.categories, { id: 'new', ...(body as object) }] },
      }),
      'PUT /api/spaces/s1/catalog/units': (body) => ({ ...catalog, ...(body as object) }),
      'PUT /api/spaces/s1/catalog/categories/dairy': (body) => ({ ...catalog, categories: [catalog.categories[0], { id: 'dairy', ...(body as object) }] }),
      'DELETE /api/spaces/s1/catalog/categories/veg': { ...catalog, categories: [catalog.categories[1]] },
    })
  }

  it('shows categories in order and adds a new one', async () => {
    const spy = setup()
    renderWithProviders(<AppRoutes />, '/spaces/s1/catalog')

    const names = await screen.findAllByLabelText('Category name')
    expect(names.map((input) => (input as HTMLInputElement).value)).toEqual(['Vegetables', 'Dairy'])

    await userEvent.type(screen.getByLabelText('New category'), 'Snacks')
    await userEvent.click(screen.getAllByRole('button', { name: 'Create' })[0])

    await waitFor(() => expect(screen.getAllByLabelText('Category name')).toHaveLength(3))
    expect(sentBodies(spy, 'POST', '/api/spaces/s1/catalog/categories')).toEqual([{ name: 'Snacks', color: '#78909c' }])
  })

  it('renames on blur and deletes after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const spy = setup()
    renderWithProviders(<AppRoutes />, '/spaces/s1/catalog')

    const dairy = (await screen.findAllByLabelText('Category name'))[1]
    await userEvent.clear(dairy)
    await userEvent.type(dairy, 'Milk products')
    await userEvent.tab()
    await waitFor(() =>
      expect(sentBodies(spy, 'PUT', '/api/spaces/s1/catalog/categories/dairy')).toEqual([{ name: 'Milk products', color: '#0000ff' }]),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Delete Vegetables' }))
    await waitFor(() => expect(screen.getAllByLabelText('Category name')).toHaveLength(1))
  })

  it('adds and removes units', async () => {
    const spy = setup()
    renderWithProviders(<AppRoutes />, '/spaces/s1/catalog')

    await userEvent.click(await screen.findByRole('button', { name: 'Remove unit kg' }))
    await waitFor(() => expect(sentBodies(spy, 'PUT', '/api/spaces/s1/catalog/units')).toEqual([{ units: ['l'] }]))

    await userEvent.type(screen.getByLabelText('New unit'), 'box')
    await userEvent.click(screen.getAllByRole('button', { name: 'Create' })[1])
    await waitFor(() => expect(sentBodies(spy, 'PUT', '/api/spaces/s1/catalog/units')).toHaveLength(2))
  })
})
