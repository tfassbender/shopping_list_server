import type { Item, ShoppingList } from '../api/lists'
import type { EditField, PullResponse, SyncOp } from '../api/sync'

/** Local lists of a space by id. */
export type ListsById = Record<string, ShoppingList>

const FIELD_NAMES: Record<EditField, keyof Item> = {
  NAME: 'name',
  QUANTITY: 'quantity',
  UNIT: 'unit',
  NOTE: 'note',
  CATEGORY: 'categoryId',
}

const blankToNull = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null)

/**
 * Applies one queued change to the local lists (the optimistic view). It mirrors the server's change
 * logic closely enough for display; the server's answer after the next sync is the truth.
 */
export function applyOp(lists: ListsById, op: SyncOp, spaceId: string, now: string): ListsById {
  if (op.type === 'CREATE_LIST') {
    if (lists[op.listId]) return lists
    return { ...lists, [op.listId]: { id: op.listId, spaceId, name: op.name.trim(), createdAt: now, seq: 0, items: [] } }
  }
  const list = lists[op.listId]
  if (!list) return lists // list deleted meanwhile: the server will reject the change
  return { ...lists, [op.listId]: applyToList(list, op, now) }
}

function applyToList(list: ShoppingList, op: Exclude<SyncOp, { type: 'CREATE_LIST' }>, now: string): ShoppingList {
  const update = (itemId: string, change: (item: Item) => Item) => ({
    ...list,
    items: list.items.map((item) => (item.id === itemId ? change(item) : item)),
  })
  switch (op.type) {
    case 'RENAME_LIST':
      return { ...list, name: op.name.trim() }
    case 'ADD_ITEM':
      if (list.items.some((i) => i.id === op.itemId)) return list
      return {
        ...list,
        items: [
          ...list.items,
          {
            id: op.itemId,
            name: op.name.trim(),
            quantity: blankToNull(op.quantity),
            unit: blankToNull(op.unit),
            note: blankToNull(op.note),
            categoryId: blankToNull(op.categoryId),
            checked: false,
            createdAt: now,
            seq: 0,
          },
        ],
      }
    case 'EDIT_ITEM':
      return update(op.itemId, (item) => {
        if (op.field === 'NAME') return { ...item, name: op.value?.trim() || item.name }
        return { ...item, [FIELD_NAMES[op.field]]: blankToNull(op.value) }
      })
    case 'CHECK_ITEM':
      return update(op.itemId, (item) => ({ ...item, checked: true }))
    case 'UNCHECK_ITEM':
      return update(op.itemId, (item) => ({ ...item, checked: false }))
    case 'DELETE_ITEM':
      return { ...list, items: list.items.filter((i) => i.id !== op.itemId) }
    case 'REMOVE_CHECKED':
      return { ...list, items: list.items.filter((i) => !op.itemIds.includes(i.id)) }
  }
}

/** Merges a pull answer into the confirmed (server) state. */
export function applyPull(lists: ListsById, pull: PullResponse, spaceId: string): ListsById {
  const result: ListsById = pull.fullResync ? {} : { ...lists }
  for (const delta of pull.lists) {
    if (delta.deleted) {
      delete result[delta.id]
      continue
    }
    const existing = result[delta.id]
    const items = new Map((existing?.items ?? []).map((item) => [item.id, item]))
    for (const item of delta.items) {
      if (item.deleted) items.delete(item.id)
      else items.set(item.id, toItem(item))
    }
    result[delta.id] = { id: delta.id, spaceId, name: delta.name, createdAt: delta.createdAt, seq: delta.seq, items: [...items.values()] }
  }
  // Lists that disappeared (deleted, or their tombstone is already gone) are dropped.
  const existingIds = new Set(pull.listIds)
  for (const id of Object.keys(result)) {
    if (!existingIds.has(id)) delete result[id]
  }
  return result
}

function toItem({ deleted: _deleted, ...item }: PullResponse['lists'][number]['items'][number]): Item {
  return item
}
