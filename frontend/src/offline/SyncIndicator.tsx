import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { catalogKeys, type Catalog } from '../api/catalog'
import { useCurrentUser } from '../auth/useAuth'
import { Button } from '../components/ui'
import { Dialog } from '../components/Dialog'
import { errorMessage, t, tDynamic } from '../i18n/messages'
import { syncEngine, useMergeWarnings, useSyncStatus } from './engine'
import { useOnline } from './online'
import type { StoredWarning } from './syncEngine'

/** Header badges: offline / pending changes, and the merge warning icon (unless the user hides it). */
export function SyncIndicator() {
  const online = useOnline()
  const { status, pending } = useSyncStatus()
  const warnings = useMergeWarnings()
  const { data: user } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const showWarnings = warnings.length > 0 && !user?.settings.ignoreMergeWarnings

  return (
    <div className="flex items-center gap-1">
      {!online && <OfflineBadge pending={pending} />}
      {online && status === 'syncing' && pending > 0 && (
        <span className="rounded-full bg-brand-ink/10 px-2.5 py-0.5 text-sm whitespace-nowrap" role="status">
          {t('offline.saving')}
        </span>
      )}
      {showWarnings && (
        <button
          onClick={() => setOpen(true)}
          aria-label={t('warnings.open', { count: warnings.length })}
          className="flex size-12 items-center justify-center rounded-full text-xl hover:bg-brand-ink/10"
        >
          ⚠
        </button>
      )}
      {open && <WarningsDialog warnings={warnings} onClose={() => setOpen(false)} />}
    </div>
  )
}

/**
 * Compact, so the page title next to it keeps its room on a phone: "Offline" plus the number of unsaved
 * changes in a bubble. Screen readers (and the tooltip) get the full sentence.
 */
function OfflineBadge({ pending }: { pending: number }) {
  const text = pending > 0 ? t('offline.badgePending', { count: pending }) : t('offline.badge')
  return (
    <span role="status" title={text} className="flex items-center gap-1 rounded-full bg-brand-ink/10 py-0.5 pr-1.5 pl-2.5 text-sm font-medium whitespace-nowrap">
      <span aria-hidden="true">{t('offline.badge')}</span>
      {pending > 0 && <span aria-hidden="true" className="min-w-5 rounded-full bg-brand-ink/20 px-1.5 text-center text-xs font-bold">{pending}</span>}
      <span className="sr-only">{text}</span>
    </span>
  )
}

function WarningsDialog({ warnings, onClose }: { warnings: StoredWarning[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const categoryName = (spaceId: string, id: string | null) =>
    queryClient.getQueryData<Catalog>(catalogKeys.catalog(spaceId))?.categories.find((c) => c.id === id)?.name ?? id ?? '-'

  return (
    <Dialog title={t('warnings.title')} onClose={onClose}>
      <p className="text-muted">{t('warnings.explanation')}</p>
      <ul className="max-h-[50dvh] space-y-2 overflow-y-auto">
        {[...warnings].reverse().map((w) => (
          <li key={w.id} className="rounded-lg bg-raised px-3 py-2 text-sm">
            {warningText(w, (id) => categoryName(w.spaceId, id))}
            <span className="block text-xs text-muted">{new Date(w.at).toLocaleString()}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
        <Button
          onClick={() => {
            syncEngine.clearWarnings()
            onClose()
          }}
        >
          {t('warnings.clear')}
        </Button>
      </div>
    </Dialog>
  )
}

/** Human-readable text of a merge warning, e.g. "Anna had set the quantity of "Milk" to "3" ...". */
export function warningText(w: StoredWarning, categoryName: (id: string | null) => string): string {
  const by = ('byName' in w && w.byName) || t('warnings.someone')
  switch (w.type) {
    case 'OVERWRITTEN': {
      const value = (v: string | null) =>
        w.field === 'CATEGORY' ? categoryName(v) : w.field === 'CHECKED' ? t(v === 'true' ? 'warnings.checked' : 'warnings.unchecked') : (v ?? '-')
      if (!w.itemId) return t('warnings.listRenamed', { by, their: value(w.theirValue), yours: value(w.yourValue) })
      return t('warnings.overwritten', {
        by,
        field: tDynamic(`warnings.field.${w.field}`),
        item: w.itemName ?? '',
        their: value(w.theirValue),
        yours: value(w.yourValue),
      })
    }
    case 'RESTORED':
      return t('warnings.restored', { by, item: w.itemName ?? '' })
    case 'DELETE_SKIPPED':
      return t('warnings.deleteSkipped', { by, item: w.itemName ?? '' })
    case 'LIST_DELETED':
      return t('warnings.listDeleted', { list: w.listName ?? '' })
    case 'REJECTED':
      return t('warnings.rejected', { reason: errorMessage(w.code ?? 'unknown') })
  }
}
