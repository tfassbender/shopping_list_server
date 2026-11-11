import { QueryClient } from '@tanstack/react-query'
import { catalogKeys, type Catalog, type HistoryEntry } from '../api/catalog'
import { layoutKeys } from '../api/layouts'
import type { PullResponse } from '../api/sync'
import { applyPullToCache, mergeHistory } from './pullToCache'

const entry = (name: string, usageCount: number, lastUsed = '2026-01-01T10:00:00Z'): HistoryEntry => ({
  name, categoryId: null, unit: null, usageCount, lastUsed,
})
const catalog: Catalog = {
  categories: [{ id: 'dairy', name: 'Dairy', color: '#90caf9' }],
  units: ['l'],
  usage: { milk: 3, bread: 1 },
  history: [entry('Milk', 3), entry('Bread', 1), entry('Hummus', 0)],
}
const pull = (overrides: Partial<PullResponse>): PullResponse => ({
  seq: 7, fullResync: false, lists: [], listIds: [], catalog: null, historyChanges: [], layouts: null, layoutIds: [], favorites: {},
  ...overrides,
})

describe('mergeHistory', () => {
  it('adds new entries and replaces known ones by normalized name, keeping usage in step', () => {
    const merged = mergeHistory(catalog, [entry('  MILK ', 4, '2026-01-02T10:00:00Z'), entry('Oat milk', 1), entry('Hummus', 0)])

    expect(merged.history?.map((e) => [e.name, e.usageCount])).toEqual([['  MILK ', 4], ['Bread', 1], ['Hummus', 0], ['Oat milk', 1]])
    expect(merged.usage).toEqual({ milk: 4, bread: 1, 'oat milk': 1 })
    expect(merged.categories).toBe(catalog.categories) // the rest is untouched
  })

  it('works for a catalog without history (from an older cache)', () => {
    expect(mergeHistory({ categories: [], units: [] }, [entry('Tea', 2)])).toEqual({
      categories: [], units: [], history: [entry('Tea', 2)], usage: { tea: 2 },
    })
  })
})

describe('applyPullToCache', () => {
  function cacheWith(cached?: Catalog) {
    const queryClient = new QueryClient()
    if (cached) queryClient.setQueryData(catalogKeys.catalog('s1'), cached)
    return queryClient
  }
  const cachedCatalog = (queryClient: QueryClient) => queryClient.getQueryData<Catalog>(catalogKeys.catalog('s1'))

  it('replaces the catalog when the pull brings a complete one', () => {
    const queryClient = cacheWith(catalog)
    const fresh = { ...catalog, units: ['l', 'x'], history: [] }
    applyPullToCache(queryClient, 's1', pull({ catalog: fresh, historyChanges: [entry('Ignored', 1)] }))
    expect(cachedCatalog(queryClient)).toEqual(fresh)
  })

  it('merges history changes into the cached catalog', () => {
    const queryClient = cacheWith(catalog)
    applyPullToCache(queryClient, 's1', pull({ historyChanges: [entry('Hummus', 1)] }))
    expect(cachedCatalog(queryClient)?.history?.find((e) => e.name === 'Hummus')?.usageCount).toBe(1)
    expect(cachedCatalog(queryClient)?.usage?.hummus).toBe(1)
  })

  it('does not invent a catalog from history changes alone', () => {
    const queryClient = cacheWith()
    applyPullToCache(queryClient, 's1', pull({ historyChanges: [entry('Hummus', 1)] }))
    expect(cachedCatalog(queryClient)).toBeUndefined()
  })

  it('sets the favorites of every layout of the space, empty for layouts without favorites', () => {
    const queryClient = cacheWith()
    queryClient.setQueryData(layoutKeys.favorites('s1', 'lidl'), ['old'])
    applyPullToCache(queryClient, 's1', pull({ layoutIds: ['aldi', 'lidl'], favorites: { aldi: ['milk'] } }))

    expect(queryClient.getQueryData(layoutKeys.favorites('s1', 'aldi'))).toEqual(['milk'])
    expect(queryClient.getQueryData(layoutKeys.favorites('s1', 'lidl'))).toEqual([])
  })
})
