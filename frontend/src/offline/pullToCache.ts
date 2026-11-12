import type { QueryClient } from '@tanstack/react-query'
import { catalogKeys, type Catalog, type HistoryEntry } from '../api/catalog'
import type { PullResponse } from '../api/sync'
import { normalizeName } from '../lists/sortForLayout'

/**
 * Puts what a sync pull brings besides the lists into the (persisted) query cache, so the offline
 * suggestions and the "most bought first" order are as fresh as the last sync - not only as fresh as the
 * last catalog request.
 */
export function applyPullToCache(queryClient: QueryClient, spaceId: string, pull: PullResponse) {
  if (pull.catalog) {
    queryClient.setQueryData(catalogKeys.catalog(spaceId), pull.catalog)
  } else if (pull.historyChanges?.length) {
    // Only merge into a catalog we already have; without one the next catalog request brings everything.
    queryClient.setQueryData<Catalog>(catalogKeys.catalog(spaceId), (cached) => cached && mergeHistory(cached, pull.historyChanges))
  }
}

/**
 * Adds or replaces history entries (matched by normalized name, like the server) and keeps the `usage`
 * counts in step, since the list sorting reads those.
 */
export function mergeHistory(catalog: Catalog, changes: HistoryEntry[]): Catalog {
  const byName = new Map((catalog.history ?? []).map((entry) => [normalizeName(entry.name), entry]))
  const usage = { ...catalog.usage }
  for (const entry of changes) {
    const key = normalizeName(entry.name)
    byName.set(key, entry)
    if (entry.usageCount > 0) usage[key] = entry.usageCount
    else delete usage[key]
  }
  return { ...catalog, history: [...byName.values()], usage }
}
