import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { Item } from '../api/lists'
import { renderWithProviders } from '../test/render'
import { ItemEditor } from './ItemEditor'

const catalog = {
  categories: [
    { id: 'dairy', name: 'Dairy', color: '#0000ff' },
    { id: 'veg', name: 'Vegetables', color: '#00ff00' },
  ],
  units: ['l', 'kg'],
  history: [],
}
const milk: Item = {
  id: 'i1', name: 'Milk', quantity: '2', unit: 'l', note: 'low fat', categoryId: 'dairy', checked: false, createdAt: '', seq: 1,
}

function setup(props: Partial<Parameters<typeof ItemEditor>[0]> = {}) {
  const handlers = { onSave: vi.fn(), onDelete: vi.fn(), onClose: vi.fn() }
  renderWithProviders(<ItemEditor item={milk} catalog={catalog} {...handlers} {...props} />)
  return { ...handlers, dialog: screen.getByRole('dialog', { name: props.item?.name ?? 'Milk' }) }
}

describe('ItemEditor', () => {
  it('starts with the current values of the item', () => {
    const { dialog } = setup()

    expect(within(dialog).getByLabelText('Amount')).toHaveValue('2')
    expect(within(dialog).getByLabelText('Unit')).toHaveValue('l')
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Milk')
    expect(within(dialog).getByLabelText('Category')).toHaveValue('dairy')
    expect(within(dialog).getByLabelText('Note')).toHaveValue('low fat')
  })

  it('sends only the changed fields, trimmed, and closes', async () => {
    const { dialog, onSave, onClose } = setup()

    await userEvent.clear(within(dialog).getByLabelText('Name'))
    await userEvent.type(within(dialog).getByLabelText('Name'), ' Oat milk ')
    await userEvent.selectOptions(within(dialog).getByLabelText('Category'), 'veg')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith({ name: 'Oat milk', categoryId: 'veg' })
    expect(onClose).toHaveBeenCalled()
  })

  it('sends cleared fields as null', async () => {
    const { dialog, onSave } = setup()

    await userEvent.clear(within(dialog).getByLabelText('Note'))
    await userEvent.clear(within(dialog).getByLabelText('Amount'))
    await userEvent.selectOptions(within(dialog).getByLabelText('Unit'), '')
    await userEvent.selectOptions(within(dialog).getByLabelText('Category'), '')
    await userEvent.type(within(dialog).getByLabelText('Name'), '{Enter}')

    expect(onSave).toHaveBeenCalledWith({ note: null, quantity: null, unit: null, categoryId: null })
  })

  it('saving without changes sends nothing but closes', async () => {
    const { dialog, onSave, onClose } = setup()

    // whitespace only around the same value is no change
    await userEvent.type(within(dialog).getByLabelText('Note'), '  ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps a unit that is no longer configured for the space selectable', () => {
    const { dialog } = setup({ item: { ...milk, unit: 'pack' } })

    expect(within(within(dialog).getByLabelText('Unit')).getAllByRole('option').map((o) => o.textContent)).toEqual(['–', 'pack', 'l', 'kg'])
    expect(within(dialog).getByLabelText('Unit')).toHaveValue('pack')
  })

  it('deletes the item and closes', async () => {
    const { dialog, onDelete, onClose, onSave } = setup()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(onDelete).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('cancel closes without saving', async () => {
    const { dialog, onSave, onClose } = setup()

    await userEvent.type(within(dialog).getByLabelText('Note'), ' and fresh')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('offers the favorite switch only with a selected shop', async () => {
    const onToggleFavorite = vi.fn()
    const { dialog } = setup({ shopName: 'Aldi', favorite: true, onToggleFavorite })

    const favorite = within(dialog).getByRole('switch', { name: 'Favorite at Aldi' })
    expect(favorite).toBeChecked()
    await userEvent.click(favorite)
    expect(onToggleFavorite).toHaveBeenCalled()
  })

  it('has no favorite switch without a shop', () => {
    const { dialog } = setup({ onToggleFavorite: vi.fn() })
    expect(within(dialog).queryByRole('switch')).not.toBeInTheDocument()
  })

  it('cannot save a name of only spaces', async () => {
    const { dialog, onSave } = setup()

    await userEvent.clear(within(dialog).getByLabelText('Name'))
    await userEvent.type(within(dialog).getByLabelText('Name'), '   ')

    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Name'), '{Enter}')
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('disables the favorite switch while offline (favorites are not part of the offline sync)', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { dialog } = setup({ shopName: 'Aldi', favorite: false, onToggleFavorite: vi.fn() })

    expect(within(dialog).getByRole('switch', { name: 'Favorite at Aldi' })).toBeDisabled()
    expect(within(dialog).getByText('Only possible with a connection.')).toBeInTheDocument()
    onLine.mockRestore()
  })
})
