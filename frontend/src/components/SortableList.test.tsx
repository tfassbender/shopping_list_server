import { act, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { layoutRowsVertically, lift, moveWithKeyboard } from '../test/dragAndDrop'
import { SortableList } from './SortableList'

const fruits = [
  { id: 'a', name: 'Apples' },
  { id: 'b', name: 'Bananas' },
  { id: 'c', name: 'Cherries' },
]

function setup() {
  const onReorder = vi.fn()
  render(<SortableList items={fruits} getId={(f) => f.id} getLabel={(f) => f.name} renderItem={(f) => <span>{f.name}</span>} onReorder={onReorder} />)
  return onReorder
}

describe('SortableList', () => {
  beforeEach(() => layoutRowsVertically())

  it('renders a labelled drag handle per row', () => {
    setup()

    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['⠿Apples', '⠿Bananas', '⠿Cherries'])
    expect(screen.getByRole('button', { name: 'Move Bananas' })).toBeInTheDocument()
  })

  it('moves a row down with the keyboard', async () => {
    const onReorder = setup()

    await moveWithKeyboard(screen.getByRole('button', { name: 'Move Bananas' }), 'ArrowDown', 1)

    expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b'])
  })

  it('moves the first row one place down with the keyboard', async () => {
    const onReorder = setup()

    await moveWithKeyboard(screen.getByRole('button', { name: 'Move Apples' }), 'ArrowDown', 1)

    expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c'])
  })

  it('moves the first row to the end with the keyboard', async () => {
    const onReorder = setup()

    await moveWithKeyboard(screen.getByRole('button', { name: 'Move Apples' }), 'ArrowDown', 2)

    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a'])
  })

  it('moves a row up by two places with the keyboard', async () => {
    const onReorder = setup()

    await moveWithKeyboard(screen.getByRole('button', { name: 'Move Cherries' }), 'ArrowUp', 2)

    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b'])
  })

  it('does not report a reorder when the row is dropped where it was', async () => {
    const onReorder = setup()

    await moveWithKeyboard(screen.getByRole('button', { name: 'Move Bananas' }), 'ArrowDown', 0)

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('Escape cancels the move', async () => {
    const onReorder = setup()
    await lift(screen.getByRole('button', { name: 'Move Apples' }))
    await act(async () => {
      fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' })
    })
    await act(async () => {
      fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' })
    })

    expect(onReorder).not.toHaveBeenCalled()
  })
})
