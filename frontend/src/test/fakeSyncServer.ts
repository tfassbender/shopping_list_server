import type { ShoppingList } from '../api/lists'
import type { PullResponse, PushResponse, SyncOp } from '../api/sync'
import { applyOp, type ListsById } from '../offline/applyOp'

/**
 * Fake sync endpoints (`POST/GET /api/spaces/{id}/changes`) for UI tests. Pushed operations are applied
 * with the client logic; pulls return the full state. Set `offline = true` to simulate no connection.
 */
export function fakeSyncServer(spaceId: string, initial: ShoppingList[]) {
  let lists: ListsById = Object.fromEntries(initial.map((l) => [l.id, l]))
  let seq = 1
  const received: SyncOp[] = []
  const server = {
    offline: false,
    routes: {
      [`POST /api/spaces/${spaceId}/changes`]: (body: unknown): PushResponse => {
        if (server.offline) throw new TypeError('Failed to fetch')
        const changes = (body as { changes: SyncOp[] }).changes
        changes.forEach((op) => {
          received.push(op)
          lists = applyOp(lists, op, spaceId, '2026-01-01T00:00:09Z')
        })
        seq++
        return { seq, results: changes.map((c) => ({ changeId: c.changeId, status: 'APPLIED', code: null })), warnings: [] }
      },
      [`GET /api/spaces/${spaceId}/changes`]: (): PullResponse => {
        if (server.offline) throw new TypeError('Failed to fetch')
        return {
          seq,
          fullResync: true,
          lists: Object.values(lists).map((l) => ({ ...l, deleted: false, items: l.items.map((i) => ({ ...i, deleted: false })) })),
          listIds: Object.keys(lists),
          catalog: null,
          historyChanges: [],
          layouts: null,
          layoutIds: [],
        }
      },
    },
    /** Operations the server received, optionally of one type. */
    received: (type?: SyncOp['type']) => received.filter((op) => !type || op.type === type),
    list: (listId: string) => lists[listId],
  }
  return server
}
