import type { Item, ShoppingList } from '../api/lists'
import type { NewSyncOp, SyncOp } from '../api/sync'
import { applyOp, applyPull } from '../offline/applyOp'
import { toSyncOps } from './listChanges'
import { amountText, groupItems, sortItems } from './sortItems'

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
const NOW = '2026-02-02T00:00:00Z'
const op = (o: NewSyncOp) => ({ ...o, changeId: 'c' }) as SyncOp
const apply = (o: NewSyncOp, lists = { l: list }) => applyOp(lists, op(o), 's', NOW)

describe('toSyncOps', () => {
  it('splits an edit into one operation per field', () => {
    expect(toSyncOps(list, { type: 'editItem', itemId: 'a', fields: { quantity: '2', unit: null } })).toEqual([
      { type: 'EDIT_ITEM', listId: 'l', itemId: 'a', field: 'QUANTITY', value: '2' },
      { type: 'EDIT_ITEM', listId: 'l', itemId: 'a', field: 'UNIT', value: null },
    ])
  })

  it('"remove checked" names the items checked on this device', () => {
    expect(toSyncOps(list, { type: 'removeChecked' })).toEqual([{ type: 'REMOVE_CHECKED', listId: 'l', itemIds: ['bb'] }])
  })

  it('adds carry the client-generated item id', () => {
    expect(toSyncOps(list, { type: 'addItem', item: { id: 'x', name: 'Milk', categoryId: 'dairy' } })).toEqual([
      { type: 'ADD_ITEM', listId: 'l', itemId: 'x', name: 'Milk', categoryId: 'dairy' },
    ])
  })
})

describe('applyOp (optimistic local view)', () => {
  it('creates lists and adds items with defaults', () => {
    const created = applyOp({}, op({ type: 'CREATE_LIST', listId: 'n', name: ' New ' }), 's', NOW)
    expect(created.n).toMatchObject({ name: 'New', items: [], createdAt: NOW })
    const added = apply({ type: 'ADD_ITEM', listId: 'l', itemId: 'm', name: ' Milk ', unit: ' ' })
    expect(added.l.items.at(-1)).toMatchObject({ id: 'm', name: 'Milk', unit: null, checked: false })
  })

  it('edits fields; blank clears, the name can not be cleared', () => {
    expect(apply({ type: 'EDIT_ITEM', listId: 'l', itemId: 'a', field: 'QUANTITY', value: ' 3 ' }).l.items[0].quantity).toBe('3')
    expect(apply({ type: 'EDIT_ITEM', listId: 'l', itemId: 'a', field: 'CATEGORY', value: 'dairy' }).l.items[0].categoryId).toBe('dairy')
    expect(apply({ type: 'EDIT_ITEM', listId: 'l', itemId: 'a', field: 'NAME', value: '' }).l.items[0].name).toBe('a')
  })

  it('checks, unchecks, deletes and removes the given checked items', () => {
    expect(apply({ type: 'CHECK_ITEM', listId: 'l', itemId: 'a' }).l.items[0].checked).toBe(true)
    expect(apply({ type: 'UNCHECK_ITEM', listId: 'l', itemId: 'bb' }).l.items[1].checked).toBe(false)
    expect(apply({ type: 'DELETE_ITEM', listId: 'l', itemId: 'a' }).l.items.map((i) => i.id)).toEqual(['bb'])
    expect(apply({ type: 'REMOVE_CHECKED', listId: 'l', itemIds: ['bb'] }).l.items.map((i) => i.id)).toEqual(['a'])
  })

  it('ignores changes to lists that no longer exist and duplicate adds', () => {
    const lists = { l: list }
    expect(apply({ type: 'CHECK_ITEM', listId: 'gone', itemId: 'a' }, lists)).toBe(lists)
    expect(apply({ type: 'ADD_ITEM', listId: 'l', itemId: 'a', name: 'again' }).l.items).toHaveLength(2)
  })

  it('does not mutate its input', () => {
    const copy = structuredClone(list)
    apply({ type: 'CHECK_ITEM', listId: 'l', itemId: 'a' })
    expect(list).toEqual(copy)
  })

  it('applyPull keeps unchanged items and lists of a delta', () => {
    const result = applyPull({ l: list }, {
      seq: 5, fullResync: false, lists: [], listIds: ['l'], catalog: null, historyChanges: [], layouts: null, layoutIds: [],
    }, 's')
    expect(result.l).toEqual(list)
  })
})

describe('sortItems', () => {
  const items = [item('ccc', { checked: true }), item('a'), item('bb')]

  it('sorts by creation time and leaves checked items in place', () => {
    expect(sortItems(items).map((i) => i.id)).toEqual(['a', 'bb', 'ccc'])
    const mixed = [item('a', { checked: true }), item('bb'), item('ccc')]
    expect(sortItems(mixed).map((i) => i.id)).toEqual(['a', 'bb', 'ccc'])
  })

  it('formats amounts', () => {
    expect(amountText({ quantity: '2', unit: 'l' })).toBe('2 l')
    expect(amountText({ quantity: null, unit: 'kg' })).toBe('kg')
    expect(amountText({ quantity: null, unit: null })).toBe('')
  })
})

describe('groupItems', () => {
  const categories = [
    { id: 'veg', name: 'Vegetables', color: '#00ff00' },
    { id: 'dairy', name: 'Dairy', color: '#0000ff' },
  ]
  const items = [
    item('a', { categoryId: 'dairy' }),
    item('bb', { categoryId: 'veg', checked: true }),
    item('ccc', { categoryId: null }),
    item('dddd', { categoryId: 'deleted-category' }),
    item('eeeee', { categoryId: 'veg' }),
  ]
  const summary = (movedToEnd: ReadonlySet<string>) =>
    groupItems(items, categories, movedToEnd).map((s) => `${s.key}:${s.items.map((i) => i.id).join(',')}`)

  it('groups in category order, unknown categories in "other", moved checked items last', () => {
    expect(summary(new Set(['bb']))).toEqual(['veg:eeeee', 'dairy:a', '__other:ccc,dddd', '__checked:bb'])
  })

  it('keeps checked items in their category until they are moved', () => {
    expect(summary(new Set())).toEqual(['veg:bb,eeeee', 'dairy:a', '__other:ccc,dddd'])
  })

  it('does not move an item that was unchecked again', () => {
    expect(summary(new Set(['a']))).toEqual(['veg:bb,eeeee', 'dairy:a', '__other:ccc,dddd'])
  })

  it('omits empty sections', () => {
    expect(groupItems([], categories)).toEqual([])
  })
})
