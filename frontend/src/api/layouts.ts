import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export type LayoutMode = 'CATEGORIES' | 'ITEMS'

export interface ShopLayout {
  id: string
  name: string
  mode: LayoutMode
  categoryOrder: string[]
  itemOrder: string[]
  listIds: string[]
  createdAt: string
}

const base = (spaceId: string) => `/api/spaces/${spaceId}/layouts`

export const layoutsApi = {
  list: (spaceId: string) => api.get<ShopLayout[]>(base(spaceId)),
  get: (spaceId: string, id: string) => api.get<ShopLayout>(`${base(spaceId)}/${id}`),
  create: (spaceId: string, name: string, mode: LayoutMode) => api.post<ShopLayout>(base(spaceId), { name, mode }),
  update: (spaceId: string, id: string, name: string, mode: LayoutMode) => api.put<ShopLayout>(`${base(spaceId)}/${id}`, { name, mode }),
  delete: (spaceId: string, id: string) => api.delete(`${base(spaceId)}/${id}`),
  /** Same mode, orders and connected lists. */
  copy: (spaceId: string, id: string, name: string) => api.post<ShopLayout>(`${base(spaceId)}/${id}/copy`, { name }),
  setCategoryOrder: (spaceId: string, id: string, entries: string[]) =>
    api.put<ShopLayout>(`${base(spaceId)}/${id}/category-order`, { entries }),
  setItemOrder: (spaceId: string, id: string, entries: string[]) => api.put<ShopLayout>(`${base(spaceId)}/${id}/item-order`, { entries }),
  connect: (spaceId: string, id: string, listId: string) => api.put<ShopLayout>(`${base(spaceId)}/${id}/lists/${listId}`, {}),
  disconnect: (spaceId: string, id: string, listId: string) => api.delete<ShopLayout>(`${base(spaceId)}/${id}/lists/${listId}`),
}

export const layoutKeys = {
  all: (spaceId: string) => ['spaces', spaceId, 'layouts'] as const,
  detail: (spaceId: string, id: string) => ['spaces', spaceId, 'layouts', id] as const,
}

export function useLayouts(spaceId: string) {
  return useQuery({ queryKey: layoutKeys.all(spaceId), queryFn: () => layoutsApi.list(spaceId) })
}

const STORAGE_KEY = 'shoppinglist.listLayout'

/**
 * The shop last chosen on a list is remembered locally (per device, per list) - it's a "where am I
 * shopping right now" choice, not shared data.
 */
export function rememberedLayout(listId: string): string | null {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, string>)[listId] ?? null
  } catch {
    return null
  }
}

export function rememberLayout(listId: string, layoutId: string | null) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, string>
    if (layoutId) all[listId] = layoutId
    else delete all[listId]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // storage unavailable (private mode): the choice just isn't remembered
  }
}
