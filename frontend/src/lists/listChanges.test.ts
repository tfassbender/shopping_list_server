import type { Item, ShoppingList } from '../api/lists'
import { applyLocal } from './listChanges'
import { amountText, sortItems } from './sortItems'

const item = (id: string, overrides: Partial<Item> = {}): Item => ({
  id,
  name: id,
  quantity: null,
  unit: null,
  note: null,
  categoryId: null,
  checked: false,
  createdAt: `2026-01-01T00:00:0${id.length}Z`,
  seq: 1,
  ...overrides,
})

const list: ShoppingList = { id: 'l', spaceId: 's', name: 'Groceries', createdAt: '', seq: 1, items: [item('a'), item('bb', { checked: true })] }

describe('applyLocal', () => {
  it('adds an item with defaults', () => {
    const result = applyLocal(list, { type: 'addItem', item: { id: 'new', name: ' Milk ' } })
    expect(result.items.at(-1)).toMatchObject({ id: 'new', name: 'Milk', checked: false, quantity: null })
  })

  it('edits only the given fields, blank clears', () => {
    const withQty = applyLocal(list, { type: 'editItem', itemId: 'a', fields: { quantity: '2', unit: 'l' } })
    expect(withQty.items[0]).toMatchObject({ quantity: '2', unit: 'l', name: 'a' })
    const cleared = applyLocal(withQty, { type: 'editItem', itemId: 'a', fields: { unit: ' ' } })
    expect(cleared.items[0]).toMatchObject({ quantity: '2', unit: null })
  })

  it('never clears the name', () => {
    expect(applyLocal(list, { type: 'editItem', itemId: 'a', fields: { name: '' } }).items[0].name).toBe('a')
  })

  it('checks, unchecks, deletes and removes checked', () => {
    expect(applyLocal(list, { type: 'check', itemId: 'a' }).items[0].checked).toBe(true)
    expect(applyLocal(list, { type: 'uncheck', itemId: 'bb' }).items[1].checked).toBe(false)
    expect(applyLocal(list, { type: 'deleteItem', itemId: 'a' }).items.map((i) => i.id)).toEqual(['bb'])
    expect(applyLocal(list, { type: 'removeChecked' }).items.map((i) => i.id)).toEqual(['a'])
  })

  it('renames', () => {
    expect(applyLocal(list, { type: 'rename', name: ' Weekend ' }).name).toBe('Weekend')
  })

  it('does not mutate the input', () => {
    const copy = structuredClone(list)
    applyLocal(list, { type: 'check', itemId: 'a' })
    expect(list).toEqual(copy)
  })
})

describe('sortItems', () => {
  const items = [item('ccc', { checked: true }), item('a'), item('bb')]

  it('sorts by creation time', () => {
    expect(sortItems(items, false).map((i) => i.id)).toEqual(['a', 'bb', 'ccc'])
  })

  it('moves checked items to the end when enabled', () => {
    const mixed = [item('a', { checked: true }), item('bb'), item('ccc')]
    expect(sortItems(mixed, true).map((i) => i.id)).toEqual(['bb', 'ccc', 'a'])
    expect(sortItems(mixed, false).map((i) => i.id)).toEqual(['a', 'bb', 'ccc'])
  })

  it('formats amounts', () => {
    expect(amountText({ quantity: '2', unit: 'l' })).toBe('2 l')
    expect(amountText({ quantity: null, unit: 'kg' })).toBe('kg')
    expect(amountText({ quantity: null, unit: null })).toBe('')
  })
})
