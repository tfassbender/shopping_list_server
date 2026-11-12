import { useEffect, useSyncExternalStore } from 'react'
import type { ShoppingList } from '../api/lists'
import { syncApi } from '../api/sync'
import { defaultStorage } from './storage'
import { listArray, SyncEngine } from './syncEngine'

/** The app-wide sync engine (one per browser tab). */
export const syncEngine = new SyncEngine(syncApi, defaultStorage('sync'))

/**
 * React hooks read the engine with `useSyncExternalStore`: the component re-renders whenever the engine
 * notifies a change, and always sees a consistent snapshot.
 */
function useEngine<T>(select: () => T): T {
  return useSyncExternalStore(syncEngine.subscribe, select)
}

/** Loads (and syncs) a space while a screen of it is open. */
export function useOpenSpace(spaceId: string) {
  useEffect(() => {
    void syncEngine.open(spaceId)
  }, [spaceId])
}

/** All lists of a space (undefined while loading). */
export function useSpaceLists(spaceId: string): ShoppingList[] | undefined {
  useOpenSpace(spaceId)
  const lists = useEngine(() => syncEngine.listsOf(spaceId))
  return lists && listArray(lists)
}

/** One list (null = doesn't exist, undefined = still loading). */
export function useLocalList(spaceId: string, listId: string): ShoppingList | null | undefined {
  useOpenSpace(spaceId)
  const lists = useEngine(() => syncEngine.listsOf(spaceId))
  return lists === undefined ? undefined : (lists[listId] ?? null)
}

/** Set when the user lost access to the space: the number of unsaved changes that were dropped. */
export function useSpaceAccessLost(spaceId: string): number | undefined {
  return useEngine(() => syncEngine.accessLost(spaceId))
}

export function useSyncStatus() {
  const status = useEngine(() => syncEngine.status)
  const pending = useEngine(() => syncEngine.pendingCount())
  const storageFailed = useEngine(() => syncEngine.storageFailed)
  return { status, pending, storageFailed }
}

export function useMergeWarnings() {
  return useEngine(() => syncEngine.warnings())
}
