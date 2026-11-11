import { clear, createStore, del, get, set } from 'idb-keyval'

/**
 * Minimal async key-value storage. In the browser it is IndexedDB (via the tiny `idb-keyval` library):
 * unlike localStorage it holds megabytes and structured data. Tests use the in-memory version.
 */
export interface KeyValueStorage {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
  clear(): Promise<void>
}

export function indexedDbStorage(storeName: string): KeyValueStorage {
  // One database per store: idb-keyval creates the object store only when the database is created, so a
  // second store in an existing database would never exist ("object store not found").
  const store = createStore(`shoppinglist-${storeName}`, 'kv')
  return {
    get: <T,>(key: string) => get<T>(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
    clear: () => clear(store),
  }
}

export function memoryStorage(): KeyValueStorage {
  const data = new Map<string, unknown>()
  return {
    get: async <T,>(key: string) => structuredClone(data.get(key)) as T | undefined,
    set: async (key, value) => void data.set(key, structuredClone(value)),
    del: async (key) => void data.delete(key),
    clear: async () => data.clear(),
  }
}

/** IndexedDB where available (browser), memory otherwise (tests, very old browsers). */
export function defaultStorage(storeName: string): KeyValueStorage {
  return typeof indexedDB === 'undefined' ? memoryStorage() : indexedDbStorage(storeName)
}
