import { act, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { SortableList } from './SortableList'

const ROW_HEIGHT = 50

/**
 * jsdom does no layout: every element would measure 0×0, and dnd-kit could not tell which row is below
 * which. Give each row a rect from its position in the list, so keyboard moves work as in a browser.
 */
function layoutRowsVertically() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const row = this.closest('li')
    const index = row ? Array.from(row.parentElement!.children).indexOf(row) : 0
    const top = index * ROW_HEIGHT
    return { x: 0, y: top, top, left: 0, width: 300, height: ROW_HEIGHT, right: 300, bottom: top + ROW_HEIGHT, toJSON: () => ({}) } as DOMRect
  })
}

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

/** Lifts the row with Space. dnd-kit listens for the arrow keys only from the next tick on, so wait for it. */
async function lift(handle: HTMLElement) {
  handle.focus()
  await act(async () => {
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** Lifts the row with Space, presses `key` `times` times, then drops it with Space (dnd-kit's keyboard dragging). */
async function moveWithKeyboard(handle: HTMLElement, key: 'ArrowDown' | 'ArrowUp', times: number) {
  await lift(handle)
  for (let i = 0; i < times; i++) {
    await act(async () => {
      fireEvent.keyDown(document, { code: key, key })
    })
  }
  await act(async () => {
    fireEvent.keyDown(document, { code: 'Space', key: ' ' })
  })
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
