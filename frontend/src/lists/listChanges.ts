import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { listKeys, listsApi, type EditableField, type Item, type ShoppingList } from '../api/lists'

/**
 * All list mutations of the web app go through this module. A change is
 * 1. applied locally right away (optimistic update - the UI reacts instantly), then
 * 2. sent to the server; changes are sent one after another, in order.
 * When the server answers, still pending changes are re-applied on top of its list, so a slow response
 * never undoes a newer local change. In Phase 8 this becomes the offline queue.
 */
export type ListChange =
  | { type: 'addItem'; item: Pick<Item, 'id' | 'name'> & Partial<Pick<Item, 'quantity' | 'unit' | 'note' | 'categoryId'>> }
  | { type: 'editItem'; itemId: string; fields: Partial<Record<EditableField, string | null>> }
  | { type: 'check'; itemId: string }
  | { type: 'uncheck'; itemId: string }
  | { type: 'deleteItem'; itemId: string }
  | { type: 'removeChecked' }
  | { type: 'rename'; name: string }

const blankToNull = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null)

/** The local (optimistic) version of the server's change logic. */
export function applyLocal(list: ShoppingList, change: ListChange): ShoppingList {
  const updateItem = (itemId: string, update: (item: Item) => Item) => ({
    ...list,
    items: list.items.map((item) => (item.id === itemId ? update(item) : item)),
  })
  switch (change.type) {
    case 'addItem':
      return {
        ...list,
        items: [
          ...list.items,
          {
            quantity: null,
            unit: null,
            note: null,
            categoryId: null,
            ...change.item,
            name: change.item.name.trim(),
            checked: false,
            createdAt: new Date().toISOString(),
            seq: list.seq,
          },
        ],
      }
    case 'editItem':
      return updateItem(change.itemId, (item) => {
        const updated = { ...item }
        for (const [field, value] of Object.entries(change.fields) as [EditableField, string | null][]) {
          if (field === 'name') updated.name = value?.trim() || item.name
          else updated[field] = blankToNull(value)
        }
        return updated
      })
    case 'check':
      return updateItem(change.itemId, (item) => ({ ...item, checked: true }))
    case 'uncheck':
      return updateItem(change.itemId, (item) => ({ ...item, checked: false }))
    case 'deleteItem':
      return { ...list, items: list.items.filter((item) => item.id !== change.itemId) }
    case 'removeChecked':
      return { ...list, items: list.items.filter((item) => !item.checked) }
    case 'rename':
      return { ...list, name: change.name.trim() }
  }
}

/** Maps a change to its REST call. Every call returns the updated list. */
export function sendChange(spaceId: string, listId: string, change: ListChange): Promise<ShoppingList> {
  switch (change.type) {
    case 'addItem':
      return listsApi.addItem(spaceId, listId, change.item)
    case 'editItem':
      return listsApi.editItem(spaceId, listId, change.itemId, change.fields)
    case 'check':
      return listsApi.check(spaceId, listId, change.itemId)
    case 'uncheck':
      return listsApi.uncheck(spaceId, listId, change.itemId)
    case 'deleteItem':
      return listsApi.deleteItem(spaceId, listId, change.itemId)
    case 'removeChecked':
      return listsApi.removeChecked(spaceId, listId)
    case 'rename':
      return listsApi.rename(spaceId, listId, change.name)
  }
}

/** Hook giving a list screen `apply(change)` plus the last error. */
export function useListChanges(spaceId: string, listId: string) {
  const queryClient = useQueryClient()
  const key = listKeys.detail(spaceId, listId)
  const pending = useRef<ListChange[]>([])
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const [error, setError] = useState<unknown>(null)

  const apply = useCallback(
    (change: ListChange) => {
      setError(null)
      queryClient.setQueryData<ShoppingList>(key, (list) => (list ? applyLocal(list, change) : list))
      pending.current.push(change)
      // Don't let a poll overwrite the optimistic state while changes are on their way.
      void queryClient.cancelQueries({ queryKey: key })

      queue.current = queue.current.then(async () => {
        try {
          const serverList = await sendChange(spaceId, listId, change)
          pending.current.shift()
          queryClient.setQueryData<ShoppingList>(key, pending.current.reduce(applyLocal, serverList))
        } catch (e) {
          // The server rejected the change (or is unreachable): drop local state, reload the truth.
          pending.current = []
          setError(e)
          await queryClient.invalidateQueries({ queryKey: key })
        }
        void queryClient.invalidateQueries({ queryKey: listKeys.all(spaceId), exact: true })
      })
    },
    // `key` is derived from spaceId/listId, so it isn't listed separately.
    [queryClient, spaceId, listId],
  )

  return { apply, error }
}
