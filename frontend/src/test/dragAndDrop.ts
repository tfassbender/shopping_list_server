import { act, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

/* Helpers for testing drag and drop of `SortableList` with the keyboard (dnd-kit). */

const ROW_HEIGHT = 50

/**
 * jsdom does no layout: every element would measure 0×0, and dnd-kit could not tell which row is below
 * which. Give each row a rect from its position in the list, so keyboard moves work as in a browser.
 */
export function layoutRowsVertically() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const row = this.closest('li')
    const index = row ? Array.from(row.parentElement!.children).indexOf(row) : 0
    const top = index * ROW_HEIGHT
    return { x: 0, y: top, top, left: 0, width: 300, height: ROW_HEIGHT, right: 300, bottom: top + ROW_HEIGHT, toJSON: () => ({}) } as DOMRect
  })
}

/** Lifts the row with Space. dnd-kit listens for the arrow keys only from the next tick on, so wait for it. */
export async function lift(handle: HTMLElement) {
  handle.focus()
  await act(async () => {
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** Lifts the row with Space, presses `key` `times` times, then drops it with Space (dnd-kit's keyboard dragging). */
export async function moveWithKeyboard(handle: HTMLElement, key: 'ArrowDown' | 'ArrowUp', times: number) {
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
