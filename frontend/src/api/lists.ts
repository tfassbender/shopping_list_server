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

export const listsApi = {
  list: (spaceId: string) => api.get<ListSummary[]>(base(spaceId)),
  get: (spaceId: string, listId: string) => api.get<ShoppingList>(`${base(spaceId)}/${listId}`),
  create: (spaceId: string, name: string, id: string) => api.post<ShoppingList>(base(spaceId), { name, id }),
  delete: (spaceId: string, listId: string) => api.delete(`${base(spaceId)}/${listId}`),
  rename: (spaceId: string, listId: string, name: string) => api.put<ShoppingList>(`${base(spaceId)}/${listId}/name`, { name }),
  addItem: (spaceId: string, listId: string, item: Partial<Item> & { id: string; name: string }) =>
    api.post<ShoppingList>(`${base(spaceId)}/${listId}/items`, item),
  editItem: (spaceId: string, listId: string, itemId: string, fields: Partial<Record<EditableField, string | null>>) =>
    api.patch<ShoppingList>(`${base(spaceId)}/${listId}/items/${itemId}`, fields),
  check: (spaceId: string, listId: string, itemId: string) => api.post<ShoppingList>(`${base(spaceId)}/${listId}/items/${itemId}/check`),
  uncheck: (spaceId: string, listId: string, itemId: string) =>
    api.post<ShoppingList>(`${base(spaceId)}/${listId}/items/${itemId}/uncheck`),
  deleteItem: (spaceId: string, listId: string, itemId: string) =>
    api.delete<ShoppingList>(`${base(spaceId)}/${listId}/items/${itemId}`),
  removeChecked: (spaceId: string, listId: string) => api.post<ShoppingList>(`${base(spaceId)}/${listId}/remove-checked`),
}

export const listKeys = {
  all: (spaceId: string) => ['spaces', spaceId, 'lists'] as const,
  detail: (spaceId: string, listId: string) => ['spaces', spaceId, 'lists', listId] as const,
}

export function useLists(spaceId: string) {
  return useQuery({ queryKey: listKeys.all(spaceId), queryFn: () => listsApi.list(spaceId) })
}

export function useList(spaceId: string, listId: string) {
  // Poll every 10 s so changes of other members show up (live updates via SSE come in Phase 9).
  return useQuery({
    queryKey: listKeys.detail(spaceId, listId),
    queryFn: () => listsApi.get(spaceId, listId),
    refetchInterval: 10_000,
  })
}

/** Ids are generated on the client (offline-ready). */
export function newId(): string {
  return crypto.randomUUID()
}
