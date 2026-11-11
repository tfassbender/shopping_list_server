import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { newId } from '../../api/lists'
import { spaceKeys, spacesApi, type Space } from '../../api/spaces'
import { Dialog, DialogActions } from '../../components/Dialog'
import { Button, ErrorText, TextField } from '../../components/ui'
import { t } from '../../i18n/messages'
import { syncEngine } from '../../offline/engine'

/**
 * New list: name plus the space (as buttons, only when there are several spaces). Works offline: the
 * list is created locally and synced later. Opens the new list right away.
 */
export function NewListDialog({ spaces, defaultSpaceId, onClose }: { spaces: Space[]; defaultSpaceId?: string; onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [spaceId, setSpaceId] = useState(defaultSpaceId ?? spaces[0]?.id ?? '')

  function create() {
    if (!name.trim() || !spaceId) return
    const listId = newId()
    syncEngine.enqueue(spaceId, { type: 'CREATE_LIST', listId, name: name.trim() })
    onClose()
    navigate(`/spaces/${spaceId}/lists/${listId}`)
  }

  return (
    <Dialog title={t('newList.title')} onClose={onClose} onSubmit={create}>
      <TextField label={t('common.name')} required autoFocus maxLength={60} placeholder={t('newList.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      {spaces.length > 1 && (
        <div className="space-y-2">
          <span className="block text-sm text-muted">{t('newList.space')}</span>
          <div role="group" aria-label={t('newList.space')} className="flex flex-wrap gap-2">
            {spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                aria-pressed={space.id === spaceId}
                onClick={() => setSpaceId(space.id)}
                className="min-h-11 rounded-full border border-line px-4 aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:font-semibold aria-pressed:text-brand-ink"
              >
                {space.name}
              </button>
            ))}
          </div>
          <span className="block text-sm text-muted">{t('newList.spaceHint')}</span>
        </div>
      )}
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {t('common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** A text field dialog for creating or renaming something (space, list, display name). */
export function NameDialog(props: {
  title: string
  label?: string
  initialValue?: string
  placeholder?: string
  submitLabel: string
  maxLength?: number
  pending?: boolean
  error?: unknown
  onSubmit: (name: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(props.initialValue ?? '')
  return (
    <Dialog title={props.title} onClose={props.onClose} onSubmit={() => value.trim() && props.onSubmit(value.trim())}>
      <TextField
        label={props.label ?? t('common.name')}
        required
        autoFocus
        maxLength={props.maxLength ?? 60}
        placeholder={props.placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <ErrorText error={props.error} />
      <DialogActions>
        <Button variant="ghost" onClick={props.onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!value.trim() || props.pending}>
          {props.submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** New space (needs a connection). Calls `onCreated` with the new space. */
export function NewSpaceDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: (space: Space) => void }) {
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: spacesApi.create,
    onSuccess: (space) => {
      void queryClient.invalidateQueries({ queryKey: spaceKeys.all })
      onClose()
      onCreated?.(space)
    },
  })
  return (
    <NameDialog
      title={t('spaces.new')}
      placeholder={t('spaces.namePlaceholder')}
      submitLabel={t('common.create')}
      pending={create.isPending}
      error={create.error}
      onSubmit={(name) => create.mutate(name)}
      onClose={onClose}
    />
  )
}
