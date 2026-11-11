import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation, useParams } from 'react-router'
import { catalogApi, catalogKeys, useCatalog, useHistory, type HistoryEntry } from '../../api/catalog'
import { Page } from '../../components/AppBar'
import { Dialog, DialogActions } from '../../components/Dialog'
import { Button, ErrorText, Hint, LoadError, Loading, Row, TextField } from '../../components/ui'
import { t } from '../../i18n/messages'
import { OnlineOnly } from '../../offline/online'

/**
 * "Items used before": the item history of a space, which feeds the suggestions in the add dialog and the
 * automatic category. Tap an item to rename it (e.g. a typo) or remove it. A search field filters the list.
 */
export function HistoryPage() {
  const { spaceId = '' } = useParams()
  // Opened from a list's menu, back leads to that list; otherwise to the space page.
  const back = (useLocation().state as { back?: string } | null)?.back ?? `/spaces/${spaceId}`
  const { data: entries, error, refetch } = useHistory(spaceId)
  const { data: catalog } = useCatalog(spaceId)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<HistoryEntry | null>(null)

  const query = filter.trim().toLowerCase()
  const shown = entries?.filter((entry) => entry.name.toLowerCase().includes(query)) ?? []
  const categoryName = (id: string | null) => catalog?.categories.find((c) => c.id === id)?.name

  return (
    <Page title={t('history.title')} back={back}>
      <OnlineOnly>
        <Hint>{t('history.explanation')}</Hint>
        {error && !entries && <LoadError error={error} onRetry={() => void refetch()} />}
        {!entries && !error && <Loading />}
        {entries && entries.length > 0 && (
          <TextField label={t('history.search')} type="search" value={filter} onChange={(e) => setFilter(e.target.value)} />
        )}
        {entries?.length === 0 && <p className="py-6 text-center text-muted">{t('history.empty')}</p>}
        <div className="mt-2">
          {shown.map((entry) => (
            <Row
              key={entry.name}
              onClick={() => setEditing(entry)}
              title={entry.name}
              hint={[categoryName(entry.categoryId), entry.unit].filter(Boolean).join(' · ')}
              chevron
            />
          ))}
        </div>
      </OnlineOnly>
      {editing && <HistoryEntryDialog spaceId={spaceId} entry={editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}

/** Rename (merged with an existing entry of the new name) or remove one remembered item. */
function HistoryEntryDialog({ spaceId, entry, onClose }: { spaceId: string; entry: HistoryEntry; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(entry.name)
  const change = useMutation({
    mutationFn: (call: () => Promise<HistoryEntry[]>) => call(),
    onSuccess: (entries) => {
      queryClient.setQueryData(catalogKeys.history(spaceId), entries)
      // suggestions and the usage counts (sorting) come from the history as well
      void queryClient.invalidateQueries({ queryKey: catalogKeys.allSuggestions(spaceId) })
      void queryClient.invalidateQueries({ queryKey: catalogKeys.catalog(spaceId) })
      onClose()
    },
  })
  const rename = () => {
    if (name.trim() && name.trim() !== entry.name) change.mutate(() => catalogApi.renameHistory(spaceId, entry.name, name.trim()))
    else onClose()
  }

  return (
    <Dialog title={entry.name} onClose={onClose} onSubmit={rename}>
      <TextField label={t('item.name')} required autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      <p className="text-sm text-muted">{t('history.renameHint')}</p>
      <ErrorText error={change.error} />
      <DialogActions>
        <Button variant="ghost" className="mr-auto text-danger" disabled={change.isPending} onClick={() => change.mutate(() => catalogApi.removeHistory(spaceId, entry.name))}>
          {t('history.remove')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!name.trim() || change.isPending}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
