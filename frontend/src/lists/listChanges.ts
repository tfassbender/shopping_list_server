import { useCallback } from 'react'
import type { EditableField, Item, ShoppingList } from '../api/lists'
import type { EditField, NewSyncOp } from '../api/sync'
import { syncEngine } from '../offline/engine'

/**
 * All list mutations of the web app go through this module. A UI action ([ListChange]) becomes one or
 * more sync operations that the sync engine applies locally at once and sends to the server when online
 * (offline they wait in the queue). See `offline/syncEngine.ts`.
 */
export type ListChange =
  | { type: 'addItem'; item: Pick<Item, 'id' | 'name'> & Partial<Pick<Item, 'quantity' | 'unit' | 'note' | 'categoryId'>> }
  | { type: 'editItem'; itemId: string; fields: Partial<Record<EditableField, string | null>> }
  | { type: 'check'; itemId: string }
  | { type: 'uncheck'; itemId: string }
  | { type: 'deleteItem'; itemId: string }
  | { type: 'removeChecked' }
  | { type: 'rename'; name: string }

type NewOp = NewSyncOp

const EDIT_FIELDS: Record<EditableField, EditField> = {
  name: 'NAME',
  quantity: 'QUANTITY',
  unit: 'UNIT',
  note: 'NOTE',
  categoryId: 'CATEGORY',
}

/**
 * Translates a UI action into sync operations. Edits become one operation per field, so concurrent edits
 * of different fields by others merge. "Remove checked" names the items checked right now on this device.
 */
export function toSyncOps(list: ShoppingList, change: ListChange): NewOp[] {
  const listId = list.id
  switch (change.type) {
    case 'addItem': {
      const { id, ...fields } = change.item
      return [{ type: 'ADD_ITEM', listId, itemId: id, ...fields }]
    }
    case 'editItem':
      return (Object.entries(change.fields) as [EditableField, string | null][]).map(([field, value]) => ({
        type: 'EDIT_ITEM',
        listId,
        itemId: change.itemId,
        field: EDIT_FIELDS[field],
        value,
      }))
    case 'check':
      return [{ type: 'CHECK_ITEM', listId, itemId: change.itemId }]
    case 'uncheck':
      return [{ type: 'UNCHECK_ITEM', listId, itemId: change.itemId }]
    case 'deleteItem':
      return [{ type: 'DELETE_ITEM', listId, itemId: change.itemId }]
    case 'removeChecked':
      return [{ type: 'REMOVE_CHECKED', listId, itemIds: list.items.filter((i) => i.checked).map((i) => i.id) }]
    case 'rename':
      return [{ type: 'RENAME_LIST', listId, name: change.name }]
  }
}

/** Hook giving a list screen `apply(change)`. Works offline. */
export function useListActions(spaceId: string, listId: string) {
  const apply = useCallback(
    (change: ListChange) => {
      const list = syncEngine.listsOf(spaceId)?.[listId]
      if (!list) return
      toSyncOps(list, change).forEach((op) => syncEngine.enqueue(spaceId, op))
    },
    [spaceId, listId],
  )
  return { apply }
}
