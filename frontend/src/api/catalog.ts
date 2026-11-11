import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export interface Category {
  id: string
  name: string
  color: string
}

export interface Catalog {
  categories: Category[]
  units: string[]
  /** How often each item was bought (normalized name -> count), for "most used first". */
  usage?: Record<string, number>
}

export interface Suggestion {
  name: string
  categoryId: string | null
  unit: string | null
  usageCount: number
}

const base = (spaceId: string) => `/api/spaces/${spaceId}/catalog`

export const catalogApi = {
  get: (spaceId: string) => api.get<Catalog>(base(spaceId)),
  addCategory: (spaceId: string, name: string, color: string) => api.post<Catalog>(`${base(spaceId)}/categories`, { name, color }),
  updateCategory: (spaceId: string, id: string, name: string, color: string) =>
    api.put<Catalog>(`${base(spaceId)}/categories/${id}`, { name, color }),
  deleteCategory: (spaceId: string, id: string) => api.delete<Catalog>(`${base(spaceId)}/categories/${id}`),
  reorderCategories: (spaceId: string, ids: string[]) => api.put<Catalog>(`${base(spaceId)}/categories/order`, { ids }),
  setUnits: (spaceId: string, units: string[]) => api.put<Catalog>(`${base(spaceId)}/units`, { units }),
  suggestions: (spaceId: string, query: string) =>
    api.get<Suggestion[]>(`${base(spaceId)}/suggestions?q=${encodeURIComponent(query)}&limit=20`),
  // History entries are addressed by name as query parameter (names may contain '/').
  history: (spaceId: string) => api.get<HistoryEntry[]>(`${base(spaceId)}/history`),
  renameHistory: (spaceId: string, name: string, newName: string) =>
    api.put<HistoryEntry[]>(`${base(spaceId)}/history?name=${encodeURIComponent(name)}`, { name: newName }),
  removeHistory: (spaceId: string, name: string) => api.delete<HistoryEntry[]>(`${base(spaceId)}/history?name=${encodeURIComponent(name)}`),
}

/** An item used before in the space: the source of the suggestions. */
export interface HistoryEntry extends Suggestion {
  lastUsed: string
}

export const catalogKeys = {
  catalog: (spaceId: string) => ['spaces', spaceId, 'catalog'] as const,
  suggestions: (spaceId: string, query: string) => ['spaces', spaceId, 'suggestions', query] as const,
  allSuggestions: (spaceId: string) => ['spaces', spaceId, 'suggestions'] as const,
  history: (spaceId: string) => ['spaces', spaceId, 'history'] as const,
}

export function useHistory(spaceId: string) {
  return useQuery({ queryKey: catalogKeys.history(spaceId), queryFn: () => catalogApi.history(spaceId) })
}

export function useCatalog(spaceId: string) {
  return useQuery({ queryKey: catalogKeys.catalog(spaceId), queryFn: () => catalogApi.get(spaceId), staleTime: 60_000 })
}

export function useSuggestions(spaceId: string, query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: catalogKeys.suggestions(spaceId, trimmed.toLowerCase()),
    queryFn: () => catalogApi.suggestions(spaceId, trimmed),
    enabled: trimmed.length > 0,
    staleTime: 30_000,
  })
}
