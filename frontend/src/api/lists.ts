import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export interface Item {
  id: string
  name: string
  quantity: string | null
  unit: string | null
  note: string | null
  categoryId: string | null
  checked: boolean
  createdAt: string
  seq: number
}

export interface ShoppingList {
  id: string
  spaceId: string
  name: string
  createdAt: string
  seq: number
  items: Item[]
}

export interface ListSummary {
  id: string
  name: string
  openItems: number
  checkedItems: number
  seq: number
}

export type EditableField = 'name' | 'quantity' | 'unit' | 'note' | 'categoryId'

const base = (spaceId: string) => `/api/spaces/${spaceId}/lists`

/** `?sort=<layoutId>` makes the server return the items sorted for that shop. */
const sortParam = (sort?: string | null) => (sort ? `?sort=${encodeURIComponent(sort)}` : '')

// Lists and items are changed via the sync endpoint (offline-first, see offline/SyncEngine); these
// direct calls are only used where the server state is needed right away.
export const listsApi = {
  list: (spaceId: string) => api.get<ListSummary[]>(base(spaceId)),
  get: (spaceId: string, listId: string, sort?: string | null) => api.get<ShoppingList>(`${base(spaceId)}/${listId}${sortParam(sort)}`),
  delete: (spaceId: string, listId: string) => api.delete(`${base(spaceId)}/${listId}`),
}

export const listKeys = {
  all: (spaceId: string) => ['spaces', spaceId, 'lists'] as const,
}

export function useLists(spaceId: string) {
  return useQuery({ queryKey: listKeys.all(spaceId), queryFn: () => listsApi.list(spaceId) })
}

/** Ids are generated on the client (offline-ready). */
export function newId(): string {
  return crypto.randomUUID()
}
