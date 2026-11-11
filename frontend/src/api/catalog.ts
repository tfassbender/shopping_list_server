import { useQuery, useQueryClient } from '@tanstack/react-query'
import { normalizeName } from '../lists/sortForLayout'
import { ApiError, api } from './client'

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
  /** The complete item history - lets the app suggest items offline (see [rankSuggestions]). */
  history?: HistoryEntry[]
}

export interface Suggestion {
  name: string
  categoryId: string | null
  unit: string | null
  usageCount: number
}

const base = (spaceId: string) => `/api/spaces/${spaceId}/catalog`
const SUGGESTION_LIMIT = 20

export const catalogApi = {
  get: (spaceId: string) => api.get<Catalog>(base(spaceId)),
  addCategory: (spaceId: string, name: string, color: string) => api.post<Catalog>(`${base(spaceId)}/categories`, { name, color }),
  updateCategory: (spaceId: string, id: string, name: string, color: string) =>
    api.put<Catalog>(`${base(spaceId)}/categories/${id}`, { name, color }),
  deleteCategory: (spaceId: string, id: string) => api.delete<Catalog>(`${base(spaceId)}/categories/${id}`),
  reorderCategories: (spaceId: string, ids: string[]) => api.put<Catalog>(`${base(spaceId)}/categories/order`, { ids }),
  setUnits: (spaceId: string, units: string[]) => api.put<Catalog>(`${base(spaceId)}/units`, { units }),
  suggestions: (spaceId: string, query: string) =>
    api.get<Suggestion[]>(`${base(spaceId)}/suggestions?q=${encodeURIComponent(query)}&limit=${SUGGESTION_LIMIT}`),
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

/**
 * Client-side copy of the server's suggestion ranking (`SpaceCatalog.suggestions`), used offline. An entry
 * matches if its name or one of its words starts with the query (normalized); names starting with the
 * query come first, then most used, most recently used, and by name. The test cases mirror the server's
 * `SpaceCatalogTest`; keep both in sync.
 */
export function rankSuggestions(history: HistoryEntry[], query: string, limit: number): Suggestion[] {
  const q = normalizeName(query)
  if (q.length === 0) return []
  const startsWithQuery = (entry: HistoryEntry) => normalizeName(entry.name).startsWith(q)
  return history
    .filter((entry) => startsWithQuery(entry) || normalizeName(entry.name).split(' ').some((word) => word.startsWith(q)))
    .sort(
      (a, b) =>
        Number(startsWithQuery(b)) - Number(startsWithQuery(a)) ||
        b.usageCount - a.usageCount ||
        // Parsed, not compared as strings: the fraction digits of the timestamps vary.
        Date.parse(b.lastUsed) - Date.parse(a.lastUsed) ||
        compareStrings(a.name.toLowerCase(), b.name.toLowerCase()),
    )
    .slice(0, limit)
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function useSuggestions(spaceId: string, query: string) {
  const queryClient = useQueryClient()
  const trimmed = query.trim()
  return useQuery({
    queryKey: catalogKeys.suggestions(spaceId, trimmed.toLowerCase()),
    queryFn: () =>
      catalogApi.suggestions(spaceId, trimmed).catch((error: unknown) => {
        // Offline: rank the (persisted) item history of the catalog the same way the server does.
        const history = queryClient.getQueryData<Catalog>(catalogKeys.catalog(spaceId))?.history
        if (error instanceof ApiError && error.status === 0 && history) return rankSuggestions(history, trimmed, SUGGESTION_LIMIT)
        throw error
      }),
    enabled: trimmed.length > 0,
    staleTime: 30_000,
  })
}
