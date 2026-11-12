import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppRoutes } from '../../App'
import { hueOf } from '../../components/ColorPicker'
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

  it('picks colors from the palette and keeps a color that is not in it', async () => {
    const spy = setup()
    renderWithProviders(<AppRoutes />, '/spaces/s1/catalog')

    // Dairy has #0000ff (not in the palette): offered first and selected
    await userEvent.click(await screen.findByRole('button', { name: 'Color of Dairy' }))
    const radios = within(screen.getByRole('dialog')).getAllByRole('radio')
    expect(radios[0]).toHaveAccessibleName('#0000ff')
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    await userEvent.keyboard('{Escape}')

    await userEvent.click(screen.getByRole('button', { name: 'Color of the new category' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('radio', { name: '#4db6ac' }))
    // the choice shows in the hex field and is applied with Save
    expect(within(dialog).getByLabelText('Hex code')).toHaveValue('#4db6ac')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('New category'), 'Snacks')
    await userEvent.click(screen.getAllByRole('button', { name: 'Create' })[0])

    await waitFor(() => expect(sentBodies(spy, 'POST', '/api/spaces/s1/catalog/categories')).toEqual([{ name: 'Snacks', color: '#4db6ac' }]))
  })

  it('takes a typed hex code (with or without #) and only saves valid ones', async () => {
    const spy = setup()
    renderWithProviders(<AppRoutes />, '/spaces/s1/catalog')

    await userEvent.click(await screen.findByRole('button', { name: 'Color of the new category' }))
    const dialog = screen.getByRole('dialog')
    const hex = within(dialog).getByLabelText('Hex code')
    await userEvent.clear(hex)
    await userEvent.type(hex, '12AB')
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeDisabled() // incomplete code
    await userEvent.type(hex, '9F')
    expect(within(dialog).getByRole('slider', { name: 'Hue' })).toHaveValue(String(hueOf('#12ab9f')))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await userEvent.type(screen.getByLabelText('New category'), 'Snacks{Enter}')

    await waitFor(() => expect(sentBodies(spy, 'POST', '/api/spaces/s1/catalog/categories')).toEqual([{ name: 'Snacks', color: '#12ab9f' }]))
  })

  it('renames on blur and deletes after confirmation', async () => {
    const spy = setup()
    renderWithProviders(<AppRoutes />, '/spaces/s1/catalog')

    const dairy = (await screen.findAllByLabelText('Category name'))[1]
    await userEvent.clear(dairy)
    await userEvent.type(dairy, 'Milk products')
    await userEvent.tab()
    await waitFor(() =>
      expect(sentBodies(spy, 'PUT', '/api/spaces/s1/catalog/categories/dairy')).toEqual([{ name: 'Milk products', color: '#0000ff' }]),
    )

    // Cancel keeps the category, the dialog's Delete removes it
    await userEvent.click(screen.getByRole('button', { name: 'Delete Vegetables' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Delete "Vegetables"?' })
    expect(confirm).toHaveTextContent('Its items become uncategorized.')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.getAllByLabelText('Category name')).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Delete Vegetables' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.getAllByLabelText('Category name')).toHaveLength(1))
  })

  it('a refused or blank rename shows the error and the saved name again', async () => {
    mockApi({
      'GET /api/users/me': testUser,
      'GET /api/spaces/s1/catalog': catalog,
      'PUT /api/spaces/s1/catalog/categories/dairy': { status: 409, body: { code: 'CATEGORY_EXISTS' } },
    })
    renderWithProviders(<AppRoutes />, '/spaces/s1/catalog')

    const dairy = (await screen.findAllByLabelText('Category name'))[1]
    await userEvent.clear(dairy)
    await userEvent.type(dairy, 'vegetables')
    await userEvent.tab()
    expect(await screen.findByRole('alert')).toHaveTextContent('This category already exists.')
    await waitFor(() => expect(dairy).toHaveValue('Dairy'))

    await userEvent.clear(dairy)
    await userEvent.type(dairy, '   ')
    await userEvent.tab()
    expect(dairy).toHaveValue('Dairy')
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
