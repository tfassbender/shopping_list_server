import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { MergeWarningDto, PushResponse, SyncOp } from '../api/sync'
import { mockApi, testUser } from '../test/mockApi'
import { loginForTest, renderWithProviders } from '../test/render'
import { syncEngine } from './engine'
import { SyncIndicator, warningText } from './SyncIndicator'
import type { StoredWarning } from './syncEngine'

const warning = (overrides: Partial<MergeWarningDto>): MergeWarningDto => ({
  type: 'OVERWRITTEN',
  listId: 'l1',
  listName: 'Groceries',
  itemId: 'i1',
  itemName: 'Milk',
  field: 'QUANTITY',
  theirValue: '2',
  yourValue: '3',
  byName: 'Bob',
  ...overrides,
})
const stored = (w: MergeWarningDto): StoredWarning => ({ ...w, id: 'w', at: '2026-01-01T00:00:00Z', spaceId: 's1' })
const categoryName = (id: string | null) => (id === 'c1' ? 'Dairy' : (id ?? '-'))

describe('warningText', () => {
  it('describes an overwritten field with the values of both sides', () => {
    expect(warningText(stored(warning({})), categoryName)).toBe('Bob had set the quantity of "Milk" to "2" - your change set it to "3".')
  })

  it('shows category names instead of ids and a dash for no category', () => {
    const text = warningText(stored(warning({ field: 'CATEGORY', theirValue: 'c1', yourValue: null })), categoryName)
    expect(text).toBe('Bob had set the category of "Milk" to "Dairy" - your change set it to "-".')
  })

  it('shows the checked state in words', () => {
    const text = warningText(stored(warning({ field: 'CHECKED', theirValue: 'true', yourValue: 'false' })), categoryName)
    expect(text).toBe('Bob had set the checked state of "Milk" to "checked" - your change set it to "not checked".')
  })

  it('describes a renamed list (no item) and falls back to "Someone" without a name', () => {
    const text = warningText(stored(warning({ itemId: null, itemName: null, field: 'NAME', theirValue: 'Food', yourValue: 'Shop', byName: null })), categoryName)
    expect(text).toBe('Someone had renamed the list to "Food" - your change renamed it to "Shop".')
  })

  it('describes restored, kept and dropped changes', () => {
    expect(warningText(stored(warning({ type: 'RESTORED' })), categoryName)).toBe('Bob had deleted "Milk" - your change brought it back.')
    expect(warningText(stored(warning({ type: 'DELETE_SKIPPED' })), categoryName)).toBe('Bob had changed "Milk", so it was not deleted.')
    expect(warningText(stored(warning({ type: 'LIST_DELETED' })), categoryName)).toBe(
      'The list "Groceries" was deleted - your changes to it were dropped.',
    )
  })

  it('explains a rejected change with the translated error code', () => {
    const rejected: StoredWarning = { id: 'r', at: '', spaceId: 's1', type: 'REJECTED', listId: 'l1', code: 'LIST_FULL' }
    expect(warningText(rejected, categoryName)).toBe('A change could not be saved: The list is full.')
    expect(warningText({ ...rejected, code: null }, categoryName)).toBe('A change could not be saved: Something went wrong. Please try again.')
  })
})

/** Push answers with the given warnings (all changes applied); pulls return an empty space. */
function syncRoutes(warnings: MergeWarningDto[]) {
  return {
    'POST /api/spaces/s1/changes': (body: { changes: SyncOp[] }): PushResponse => ({
      seq: 2,
      results: body.changes.map((c) => ({ changeId: c.changeId, status: 'APPLIED', code: null })),
      warnings,
    }),
    'GET /api/spaces/s1/changes': { seq: 2, fullResync: true, lists: [], listIds: [], catalog: null, historyChanges: [], layouts: null, layoutIds: [] },
  }
}

async function syncOneChange() {
  await act(async () => {
    syncEngine.enqueue('s1', { type: 'CREATE_LIST', listId: 'l1', name: 'Groceries' })
    await syncEngine.sync('s1')
  })
}

describe('SyncIndicator', () => {
  beforeEach(() => loginForTest())

  it('shows nothing while online and in sync', async () => {
    mockApi({ 'GET /api/users/me': testUser, ...syncRoutes([]) })
    renderWithProviders(<SyncIndicator />)

    await syncOneChange()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lists merge notes newest first and clears them', async () => {
    mockApi({
      'GET /api/users/me': testUser,
      ...syncRoutes([warning({ type: 'RESTORED', itemName: 'Bread' }), warning({ type: 'DELETE_SKIPPED', itemName: 'Eggs' })]),
    })
    renderWithProviders(<SyncIndicator />)
    await syncOneChange()

    await userEvent.click(await screen.findByRole('button', { name: 'Show 2 merge note(s)' }))
    const dialog = screen.getByRole('dialog', { name: 'Merged changes' })
    expect(within(dialog).getAllByRole('listitem').map((li) => li.firstChild?.textContent)).toEqual([
      'Bob had changed "Eggs", so it was not deleted.',
      'Bob had deleted "Bread" - your change brought it back.',
    ])

    // "Close" keeps the notes
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show 2 merge note(s)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear notes' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /merge note/ })).not.toBeInTheDocument()
    expect(syncEngine.warnings()).toEqual([])
  })

  it('hides merge notes when the user turned them off', async () => {
    mockApi({
      'GET /api/users/me': { ...testUser, settings: { ...testUser.settings, ignoreMergeWarnings: true } },
      ...syncRoutes([warning({})]),
    })
    renderWithProviders(<SyncIndicator />)
    await syncOneChange()
    // wait until the user (with the setting) is loaded
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect(syncEngine.warnings()).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /merge note/ })).not.toBeInTheDocument()
  })

  it('shows "Offline" with the number of unsaved changes when the server is unreachable', async () => {
    mockApi({ 'GET /api/users/me': testUser })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    renderWithProviders(<SyncIndicator />)

    await syncOneChange()

    expect(screen.getByRole('status')).toHaveTextContent('Offline · 1 unsaved')
  })

  it('shows just "Offline" when nothing is waiting', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    renderWithProviders(<SyncIndicator />)

    await act(() => syncEngine.sync('s1'))

    expect(screen.getByRole('status')).toHaveAttribute('title', 'Offline')
    expect(screen.getByRole('status')).not.toHaveTextContent(/unsaved/)
  })

  it('shows "Saving..." while changes are being sent', async () => {
    let answer: (response: Response) => void = () => {}
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)))
    renderWithProviders(<SyncIndicator />)

    let running: Promise<void> = Promise.resolve()
    await act(async () => {
      syncEngine.enqueue('s1', { type: 'CREATE_LIST', listId: 'l1', name: 'Groceries' })
      running = syncEngine.sync('s1')
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.getByRole('status')).toHaveTextContent('Saving...')

    // the server fails: the change stays queued, the badge goes away (no tight retry)
    await act(async () => {
      answer(new Response(JSON.stringify({ code: 'BOOM' }), { status: 500 }))
      await running
    })
    expect(screen.queryByText('Saving...')).not.toBeInTheDocument()
    expect(syncEngine.pendingCount()).toBe(1)
  })
})
