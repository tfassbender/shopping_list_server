import { vi } from 'vitest'
import { ApiError } from '../api/client'
import type { PullResponse, PushResponse, SyncApi, SyncList, SyncOp } from '../api/sync'
import { applyOp, type ListsById } from './applyOp'
import { memoryStorage, type KeyValueStorage } from './storage'
import { SyncEngine } from './syncEngine'

const SPACE = 's1'

/** A minimal server: applies pushed ops with the client logic and answers pulls with the full state. */
class FakeServer implements SyncApi {
  lists: ListsById = {}
  seq = 10
  offline = false
  pushes: { baseSeq: number; changes: SyncOp[] }[] = []
  pulls: number[] = []
  nextWarnings: PushResponse['warnings'] = []
  rejectCodes: Record<string, string> = {}
  pullOverride?: (since: number) => PullResponse

  push = vi.fn(async (_spaceId: string, baseSeq: number, changes: SyncOp[]): Promise<PushResponse> => {
    if (this.offline) throw new ApiError(0, 'NETWORK_ERROR')
    this.pushes.push({ baseSeq, changes })
    this.seq++
    const results = changes.map((op) => {
      const code = this.rejectCodes[op.changeId]
      if (!code) this.lists = applyOp(this.lists, op, SPACE, '2026-01-01T00:00:00Z')
      return { changeId: op.changeId, status: code ? ('REJECTED' as const) : ('APPLIED' as const), code: code ?? null }
    })
    const warnings = this.nextWarnings
    this.nextWarnings = []
    return { seq: this.seq, results, warnings }
  })

  pull = vi.fn(async (_spaceId: string, since: number): Promise<PullResponse> => {
    if (this.offline) throw new ApiError(0, 'NETWORK_ERROR')
    this.pulls.push(since)
    if (this.pullOverride) return this.pullOverride(since)
    const lists: SyncList[] = Object.values(this.lists).map((l) => ({
      ...l,
      deleted: false,
      items: l.items.map((i) => ({ ...i, deleted: false })),
    }))
    return { seq: this.seq, fullResync: true, lists, listIds: Object.keys(this.lists), catalog: null, historyChanges: [], layouts: null, layoutIds: [] }
  })
}

let ids = 0
function engineWith(server: FakeServer, storage: KeyValueStorage = memoryStorage()) {
  return new SyncEngine(server, storage, { debounceMs: 1_000_000, newId: () => `id-${ids++}`, now: () => new Date('2026-01-02T00:00:00Z') })
}

function names(engine: SyncEngine, listId = 'l1') {
  return engine.listsOf(SPACE)?.[listId]?.items.map((i) => i.name)
}

describe('SyncEngine', () => {
  let server: FakeServer
  let engine: SyncEngine

  beforeEach(async () => {
    server = new FakeServer()
    server.lists = { l1: { id: 'l1', spaceId: SPACE, name: 'Groceries', createdAt: '2026-01-01T00:00:00Z', seq: 1, items: [] } }
    engine = engineWith(server)
    await engine.open(SPACE)
  })

  it('loads the server state when a space is opened', () => {
    expect(engine.listsOf(SPACE)?.l1.name).toBe('Groceries')
    expect(server.pulls).toEqual([0])
  })

  it('applies changes locally at once and sends them with the last pulled seq as base', async () => {
    engine.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'milk', name: 'Milk' })
    expect(names(engine)).toEqual(['Milk']) // before any request
    expect(engine.pendingCount()).toBe(1)

    await engine.sync(SPACE)

    expect(server.pushes[0].baseSeq).toBe(10)
    expect(server.pushes[0].changes.map((c) => c.type)).toEqual(['ADD_ITEM'])
    expect(server.pulls).toEqual([0, 10]) // pull since the base, not since the push seq
    expect(engine.pendingCount()).toBe(0)
    expect(names(engine)).toEqual(['Milk'])
  })

  it('keeps changes while offline and sends them once the server is reachable', async () => {
    server.offline = true
    engine.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'milk', name: 'Milk' })
    engine.enqueue(SPACE, { type: 'CHECK_ITEM', listId: 'l1', itemId: 'milk' })
    await engine.sync(SPACE)

    expect(engine.status).toBe('offline')
    expect(engine.pendingCount()).toBe(2)
    expect(engine.listsOf(SPACE)?.l1.items[0].checked).toBe(true)

    server.offline = false
    await engine.sync(SPACE)
    expect(engine.status).toBe('idle')
    expect(engine.pendingCount()).toBe(0)
    expect(server.lists.l1.items[0]).toMatchObject({ name: 'Milk', checked: true })
  })

  it('changes made offline survive a restart of the app', async () => {
    const storage = memoryStorage()
    const first = engineWith(server, storage)
    await first.open(SPACE)
    server.offline = true
    first.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'bread', name: 'Bread' })
    await new Promise((resolve) => setTimeout(resolve, 0)) // let the write to storage finish

    const restarted = engineWith(server, storage)
    await restarted.start()
    expect(names(restarted)).toEqual(['Bread'])
    expect(restarted.pendingCount()).toBe(1)

    server.offline = false
    await restarted.syncAll()
    expect(server.lists.l1.items.map((i) => i.name)).toEqual(['Bread'])
  })

  it('changes made during a running sync are kept and sent with the next sync', async () => {
    let releasePush: () => void = () => {}
    const realPush = server.push.getMockImplementation()!
    server.push.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => (releasePush = resolve))
      return realPush(...args)
    })
    engine.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'a', name: 'A' })
    const running = engine.sync(SPACE)
    await vi.waitFor(() => expect(server.push).toHaveBeenCalled()) // the first batch is on its way
    engine.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'b', name: 'B' })
    releasePush()
    await running

    expect(names(engine)).toEqual(['A', 'B'])
    expect(engine.pendingCount()).toBe(1)
    await engine.sync(SPACE)
    expect(server.pushes.map((p) => p.changes.length)).toEqual([1, 1])
    expect(engine.pendingCount()).toBe(0)
  })

  it('accepted changes stay visible if the pull afterwards fails', async () => {
    engine.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'a', name: 'A' })
    server.pull.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR'))
    await engine.sync(SPACE)

    expect(engine.pendingCount()).toBe(0) // not sent again
    expect(names(engine)).toEqual(['A'])
    await engine.sync(SPACE)
    expect(server.pushes).toHaveLength(1)
    expect(names(engine)).toEqual(['A'])
  })

  it('reports every successful pull to its listeners, failed pulls not', async () => {
    const pulls: [string, number][] = []
    const stop = engine.onPull((spaceId, pull) => pulls.push([spaceId, pull.seq]))

    server.pull.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR'))
    await engine.sync(SPACE)
    expect(pulls).toEqual([])

    await engine.sync(SPACE)
    expect(pulls).toEqual([[SPACE, server.seq]])

    stop()
    await engine.sync(SPACE)
    expect(pulls).toHaveLength(1)
  })

  it('parallel sync calls share one run', async () => {
    engine.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'a', name: 'A' })
    await Promise.all([engine.sync(SPACE), engine.sync(SPACE), engine.syncAll()])
    expect(server.pushes).toHaveLength(1)
  })

  it('merges a delta pull: changed and deleted items, deleted and vanished lists', async () => {
    engine.enqueue(SPACE, { type: 'CREATE_LIST', listId: 'l2', name: 'Hardware' })
    engine.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'milk', name: 'Milk' })
    engine.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'bread', name: 'Bread' })
    await engine.sync(SPACE)

    const item = (id: string, name: string, deleted = false) => ({
      id, name, quantity: null, unit: null, note: null, categoryId: null, checked: false, deleted, createdAt: '2026-01-01T00:00:00Z', seq: 12,
    })
    server.pullOverride = () => ({
      seq: 12,
      fullResync: false,
      lists: [
        { id: 'l1', name: 'Weekend', createdAt: '2026-01-01T00:00:00Z', seq: 12, deleted: false, items: [item('milk', 'Oat milk'), item('bread', 'Bread', true), item('eggs', 'Eggs')] },
        { id: 'l2', name: 'Hardware', createdAt: '2026-01-01T00:00:00Z', seq: 12, deleted: true, items: [] },
      ],
      listIds: ['l1'],
      catalog: null, historyChanges: [],
      layouts: null,
      layoutIds: [],
    })
    await engine.sync(SPACE)

    expect(Object.keys(engine.listsOf(SPACE)!)).toEqual(['l1'])
    expect(engine.listsOf(SPACE)!.l1.name).toBe('Weekend')
    expect(names(engine)).toEqual(['Oat milk', 'Eggs'])
  })

  it('a full resync replaces everything local', async () => {
    engine.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'milk', name: 'Milk' })
    await engine.sync(SPACE)
    server.pullOverride = () => ({
      seq: 50, fullResync: true, lists: [{ id: 'l9', name: 'Fresh', createdAt: '', seq: 50, deleted: false, items: [] }],
      listIds: ['l9'], catalog: null, historyChanges: [], layouts: null, layoutIds: [],
    })
    await engine.sync(SPACE)
    expect(Object.keys(engine.listsOf(SPACE)!)).toEqual(['l9'])
  })

  it('stores merge warnings and rejected changes until cleared', async () => {
    server.nextWarnings = [{
      type: 'RESTORED', listId: 'l1', listName: 'Groceries', itemId: 'milk', itemName: 'Milk', field: null, theirValue: null, yourValue: null, byName: 'Anna',
    }]
    engine.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'x', name: 'X' })
    const rejectedId = `id-${ids}`
    engine.enqueue(SPACE, { type: 'RENAME_LIST', listId: 'l1', name: 'Too long' })
    server.rejectCodes[rejectedId] = 'INVALID_NAME'
    await engine.sync(SPACE)

    expect(engine.warnings().map((w) => w.type)).toEqual(['RESTORED', 'REJECTED'])
    expect(engine.warnings()[1]).toMatchObject({ code: 'INVALID_NAME', listId: 'l1', spaceId: SPACE })
    expect(engine.listsOf(SPACE)!.l1.name).toBe('Groceries') // rejected change no longer shown

    engine.clearWarnings()
    expect(engine.warnings()).toEqual([])
  })

  it('a rejection because the list was deleted is not reported twice', async () => {
    const changeId = `id-${ids}`
    engine.enqueue(SPACE, { type: 'CHECK_ITEM', listId: 'l1', itemId: 'x' })
    server.rejectCodes[changeId] = 'LIST_NOT_FOUND'
    server.nextWarnings = [{ type: 'LIST_DELETED', listId: 'l1', listName: 'Groceries', itemId: null, itemName: null, field: null, theirValue: null, yourValue: null, byName: null }]
    await engine.sync(SPACE)
    expect(engine.warnings().map((w) => w.type)).toEqual(['LIST_DELETED'])
  })

  it('drops a space the user lost access to', async () => {
    server.pull.mockRejectedValueOnce(new ApiError(404, 'SPACE_NOT_FOUND'))
    await engine.sync(SPACE)
    expect(engine.listsOf(SPACE)).toBeUndefined()
  })

  it('remembers a lost space with the number of dropped changes until a pull succeeds again', async () => {
    expect(engine.accessLost(SPACE)).toBeUndefined()
    engine.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'a', name: 'A' })
    server.push.mockRejectedValueOnce(new ApiError(404, 'SPACE_NOT_FOUND'))
    await engine.sync(SPACE)
    expect(engine.accessLost(SPACE)).toBe(1)
    expect(engine.pendingCount()).toBe(0)

    await engine.open(SPACE) // e.g. invited again
    expect(engine.accessLost(SPACE)).toBeUndefined()
    expect(engine.listsOf(SPACE)?.l1.name).toBe('Groceries')
  })

  it('stays "loading" for a space with nothing on this device until the first pull', async () => {
    const fresh = engineWith(server)
    let resolvePull: () => void = () => {}
    server.pull.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => (resolvePull = resolve))
      return { seq: 1, fullResync: true, lists: [], listIds: [], catalog: null, historyChanges: [], layouts: null, layoutIds: [] }
    })
    const opening = fresh.open(SPACE)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fresh.listsOf(SPACE)).toBeUndefined()
    resolvePull()
    await opening
    expect(fresh.listsOf(SPACE)).toEqual({})
  })

  it('other errors keep the data and report an error status', async () => {
    engine.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'a', name: 'A' })
    server.push.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR'))
    await engine.sync(SPACE)
    expect(engine.status).toBe('error')
    expect(engine.pendingCount()).toBe(1)
  })

  it('clear forgets all data (logout)', async () => {
    const storage = memoryStorage()
    const local = engineWith(server, storage)
    await local.open(SPACE)
    await local.clear()
    expect(local.listsOf(SPACE)).toBeUndefined()
    expect(await storage.get('spaces')).toBeUndefined()
  })

  it('clear resets an offline status and a start right after it does not load the old data', async () => {
    const storage = memoryStorage()
    const local = engineWith(server, storage)
    await local.open(SPACE)
    server.offline = true
    await local.sync(SPACE)
    expect(local.status).toBe('offline')

    const clearing = local.clear()
    const starting = local.start() // e.g. the next user logs in at once
    await Promise.all([clearing, starting])

    expect(local.status).toBe('idle')
    expect(local.listsOf(SPACE)).toBeUndefined()
  })

  it('notifies subscribers about changes', () => {
    const listener = vi.fn()
    engine.subscribe(listener)
    engine.enqueue(SPACE, { type: 'ADD_ITEM', listId: 'l1', itemId: 'a', name: 'A' })
    expect(listener).toHaveBeenCalled()
  })
})
