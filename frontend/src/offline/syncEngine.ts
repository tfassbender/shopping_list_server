import { ApiError } from '../api/client'
import type { ShoppingList } from '../api/lists'
import type { MergeWarningDto, NewSyncOp, SyncApi, SyncOp } from '../api/sync'
import { applyOp, applyPull, type ListsById } from './applyOp'
import type { KeyValueStorage } from './storage'

/** A merge warning (from the server) or a rejected change, kept until the user clears it. */
export type StoredWarning =
  | (MergeWarningDto & { id: string; at: string; spaceId: string })
  | { id: string; at: string; spaceId: string; type: 'REJECTED'; listId: string; code: string | null }

/** Everything the client keeps per space (persisted in IndexedDB). */
interface SpaceState {
  /** Sequence number of the last successful pull (`since` / `baseSeq` of the next sync). */
  seq: number
  /** Server state as of [seq]. */
  confirmed: ListsById
  /** Sent and accepted by the server, but not yet contained in a pull – still shown on top of [confirmed]. */
  acked: SyncOp[]
  /** Not yet sent (offline or in flight). */
  queue: SyncOp[]
  warnings: StoredWarning[]
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

const MAX_BATCH = 200
const INDEX_KEY = 'spaces'

const emptyState = (): SpaceState => ({ seq: 0, confirmed: {}, acked: [], queue: [], warnings: [] })

/**
 * The offline-first data layer for lists and items. The UI reads [listsOf] (server state + pending
 * changes) and writes via [enqueue]; [sync] pushes the queue and pulls what others changed. All state
 * is persisted, so changes made offline survive closing the app.
 */
export class SyncEngine {
  private states = new Map<string, SpaceState>()
  private views = new Map<string, ListsById>()
  private loading = new Map<string, Promise<void>>()
  private inflight = new Map<string, Promise<void>>()
  private scheduled = new Map<string, ReturnType<typeof setTimeout>>()
  private listeners = new Set<() => void>()
  private warningsCache: StoredWarning[] = []
  private statusValue: SyncStatus = 'idle'

  constructor(
    private api: SyncApi,
    private storage: KeyValueStorage,
    private options: { debounceMs?: number; now?: () => Date; newId?: () => string } = {},
  ) {}

  // ---- reading (used by React via useSyncExternalStore) ----

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The lists of a space as the user should see them, or undefined while not loaded yet. */
  listsOf(spaceId: string): ListsById | undefined {
    return this.views.get(spaceId)
  }

  get status(): SyncStatus {
    return this.statusValue
  }

  pendingCount(): number {
    return [...this.states.values()].reduce((sum, s) => sum + s.queue.length, 0)
  }

  warnings(): StoredWarning[] {
    return this.warningsCache
  }

  // ---- loading ----

  /** Loads all spaces known on this device (app start), then syncs them. */
  async start(): Promise<void> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? []
    await Promise.all(ids.map((id) => this.load(id)))
    await Promise.all(ids.map((id) => this.sync(id)))
  }

  /** Makes a space available (from storage, then from the server). */
  async open(spaceId: string): Promise<void> {
    await this.load(spaceId)
    await this.sync(spaceId)
  }

  private load(spaceId: string): Promise<void> {
    let promise = this.loading.get(spaceId)
    if (!promise) {
      promise = this.storage.get<SpaceState>(`space:${spaceId}`).then((stored) => {
        if (!this.states.has(spaceId)) this.states.set(spaceId, stored ?? emptyState())
        this.recompute(spaceId)
      })
      this.loading.set(spaceId, promise)
    }
    return promise
  }

  // ---- writing ----

  /** Applies a change locally right away and queues it for the server. */
  enqueue(spaceId: string, op: NewSyncOp): void {
    const state = this.stateOf(spaceId)
    state.queue.push({ ...op, changeId: this.newId() } as SyncOp)
    this.recompute(spaceId)
    void this.persist(spaceId)
    this.scheduleSync(spaceId)
  }

  clearWarnings(): void {
    for (const [spaceId, state] of this.states) {
      if (state.warnings.length > 0) {
        state.warnings = []
        void this.persist(spaceId)
      }
    }
    this.updateWarnings()
    this.notify()
  }

  /** Forgets everything (logout): another user must not see these lists. */
  async clear(): Promise<void> {
    this.scheduled.forEach((timer) => clearTimeout(timer))
    this.scheduled.clear()
    this.states.clear()
    this.views.clear()
    this.loading.clear()
    this.updateWarnings()
    this.notify()
    await this.storage.clear()
  }

  // ---- syncing ----

  /** Syncs all loaded spaces (reconnect, interval). */
  syncAll(): Promise<void> {
    return Promise.all([...this.states.keys()].map((id) => this.sync(id))).then(() => {})
  }

  /** Pushes pending changes, then pulls everything changed since the last pull. One run per space at a time. */
  sync(spaceId: string): Promise<void> {
    const running = this.inflight.get(spaceId)
    if (running) return running
    const run = this.runSync(spaceId).finally(() => {
      this.inflight.delete(spaceId)
      // Changes made while syncing go out with the next run.
      // After failures the next attempt comes from reconnect/interval, not a tight retry loop.
      if ((this.states.get(spaceId)?.queue.length ?? 0) > 0 && this.statusValue === 'idle') this.scheduleSync(spaceId)
    })
    this.inflight.set(spaceId, run)
    return run
  }

  private async runSync(spaceId: string): Promise<void> {
    await this.load(spaceId)
    const state = this.stateOf(spaceId)
    const base = state.seq
    this.setStatus('syncing')
    try {
      const batch = state.queue.slice(0, MAX_BATCH)
      if (batch.length > 0) {
        const pushed = await this.api.push(spaceId, base, batch)
        this.handlePushResult(spaceId, state, batch, pushed)
      }
      // Pull since the base (not the push seq): other users' changes may lie in between.
      const pulled = await this.api.pull(spaceId, base)
      state.confirmed = applyPull(state.confirmed, pulled, spaceId)
      state.seq = pulled.seq
      state.acked = []
      this.recompute(spaceId)
      await this.persist(spaceId)
      this.setStatus('idle')
    } catch (error) {
      this.handleSyncError(spaceId, error)
    }
  }

  private handlePushResult(spaceId: string, state: SpaceState, batch: SyncOp[], pushed: Awaited<ReturnType<SyncApi['push']>>) {
    const done = new Set(pushed.results.map((r) => r.changeId))
    const sent = batch.filter((op) => done.has(op.changeId))
    state.queue = state.queue.filter((op) => !done.has(op.changeId))
    const rejected = new Set(pushed.results.filter((r) => r.status === 'REJECTED').map((r) => r.changeId))
    state.acked = [...state.acked, ...sent.filter((op) => !rejected.has(op.changeId))]
    const at = this.now().toISOString()
    const warnings: StoredWarning[] = [
      ...pushed.warnings.map((w) => ({ ...w, id: this.newId(), at, spaceId })),
      ...pushed.results
        // A rejected change on a deleted list is already explained by the LIST_DELETED warning.
        .filter((r) => r.status === 'REJECTED' && r.code !== 'LIST_NOT_FOUND')
        .map((r) => ({
          id: this.newId(),
          at,
          spaceId,
          type: 'REJECTED' as const,
          listId: batch.find((op) => op.changeId === r.changeId)?.listId ?? '',
          code: r.code,
        })),
    ]
    state.warnings = [...state.warnings, ...warnings]
    this.recompute(spaceId)
    this.updateWarnings()
    void this.persist(spaceId)
  }

  private handleSyncError(spaceId: string, error: unknown) {
    if (error instanceof ApiError && error.status === 0) {
      this.setStatus('offline') // keep everything, retry later
    } else if (error instanceof ApiError && error.status === 404) {
      // The space is gone or we were removed: drop its local data.
      this.states.delete(spaceId)
      this.views.delete(spaceId)
      this.loading.delete(spaceId)
      void this.storage.del(`space:${spaceId}`).then(() => this.saveIndex())
      this.updateWarnings()
      this.setStatus('idle')
    } else {
      this.setStatus('error')
    }
  }

  private scheduleSync(spaceId: string) {
    clearTimeout(this.scheduled.get(spaceId))
    // A short delay batches quick taps (check, check, check) into one request.
    this.scheduled.set(spaceId, setTimeout(() => {
      this.scheduled.delete(spaceId)
      void this.sync(spaceId)
    }, this.options.debounceMs ?? 300))
  }

  // ---- internals ----

  private stateOf(spaceId: string): SpaceState {
    let state = this.states.get(spaceId)
    if (!state) {
      state = emptyState()
      this.states.set(spaceId, state)
      this.loading.set(spaceId, Promise.resolve())
    }
    return state
  }

  private recompute(spaceId: string) {
    const state = this.states.get(spaceId)
    if (!state) return
    const now = this.now().toISOString()
    const view = [...state.acked, ...state.queue].reduce((lists, op) => applyOp(lists, op, spaceId, now), state.confirmed)
    this.views.set(spaceId, view)
    this.updateWarnings()
    this.notify()
  }

  private updateWarnings() {
    this.warningsCache = [...this.states.values()].flatMap((s) => s.warnings).sort((a, b) => a.at.localeCompare(b.at))
  }

  private async persist(spaceId: string) {
    const state = this.states.get(spaceId)
    if (!state) return
    await this.storage.set(`space:${spaceId}`, state)
    await this.saveIndex()
  }

  private saveIndex() {
    return this.storage.set(INDEX_KEY, [...this.states.keys()])
  }

  private setStatus(status: SyncStatus) {
    if (this.statusValue !== status) {
      this.statusValue = status
      this.notify()
    }
  }

  private notify() {
    this.listeners.forEach((listener) => listener())
  }

  private now(): Date {
    return this.options.now?.() ?? new Date()
  }

  private newId(): string {
    return this.options.newId?.() ?? crypto.randomUUID()
  }
}

/** Sorted lists of a space for overviews. */
export function listArray(lists: ListsById | undefined): ShoppingList[] {
  return Object.values(lists ?? {}).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
