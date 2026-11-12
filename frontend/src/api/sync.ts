import type { Catalog, HistoryEntry } from './catalog'
import { api } from './client'
import type { ShopLayout } from './layouts'

/** The aspects of an item, as named by the server (merge warnings, EDIT_ITEM). */
export type ItemAspect = 'EXISTENCE' | 'NAME' | 'QUANTITY' | 'UNIT' | 'NOTE' | 'CATEGORY' | 'CHECKED'
export type EditField = 'NAME' | 'QUANTITY' | 'UNIT' | 'NOTE' | 'CATEGORY'

/** One offline change, exactly as sent to `POST /api/spaces/{id}/changes`. */
export type SyncOp =
  | { changeId: string; type: 'CREATE_LIST'; listId: string; name: string }
  | { changeId: string; type: 'RENAME_LIST'; listId: string; name: string }
  | {
      changeId: string
      type: 'ADD_ITEM'
      listId: string
      itemId: string
      name: string
      quantity?: string | null
      unit?: string | null
      note?: string | null
      categoryId?: string | null
    }
  | { changeId: string; type: 'EDIT_ITEM'; listId: string; itemId: string; field: EditField; value: string | null }
  | { changeId: string; type: 'CHECK_ITEM' | 'UNCHECK_ITEM' | 'DELETE_ITEM'; listId: string; itemId: string }
  | { changeId: string; type: 'REMOVE_CHECKED'; listId: string; itemIds: string[] }

export type ChangeStatus = 'APPLIED' | 'DUPLICATE' | 'REJECTED'

export interface MergeWarningDto {
  type: 'OVERWRITTEN' | 'RESTORED' | 'DELETE_SKIPPED' | 'LIST_DELETED'
  listId: string
  listName: string | null
  itemId: string | null
  itemName: string | null
  field: ItemAspect | null
  theirValue: string | null
  yourValue: string | null
  byName: string | null
}

export interface PushResponse {
  seq: number
  results: { changeId: string; status: ChangeStatus; code: string | null }[]
  warnings: MergeWarningDto[]
}

export interface SyncItem {
  id: string
  name: string
  quantity: string | null
  unit: string | null
  note: string | null
  categoryId: string | null
  checked: boolean
  deleted: boolean
  createdAt: string
  seq: number
}

export interface SyncList {
  id: string
  name: string
  createdAt: string
  seq: number
  deleted: boolean
  items: SyncItem[]
}

export interface PullResponse {
  seq: number
  fullResync: boolean
  lists: SyncList[]
  listIds: string[]
  /** The complete catalog incl. history, only if categories/units changed or history entries were removed. */
  catalog: Catalog | null
  /** History entries added/updated since `since` (empty if `catalog` is sent); merged into the cached catalog. */
  historyChanges: HistoryEntry[]
  layouts: ShopLayout[] | null
  layoutIds: string[]
}

export const syncApi = {
  push: (spaceId: string, baseSeq: number, changes: SyncOp[]) =>
    api.post<PushResponse>(`/api/spaces/${spaceId}/changes`, { baseSeq, changes }),
  pull: (spaceId: string, since: number) => api.get<PullResponse>(`/api/spaces/${spaceId}/changes?since=${since}`),
}

export type SyncApi = typeof syncApi

/** A change before it gets its change id (`Omit` applied to each union member separately). */
export type NewSyncOp = SyncOp extends infer T ? (T extends unknown ? Omit<T, 'changeId'> : never) : never
