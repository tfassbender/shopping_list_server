import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useCatalog } from '../api/catalog'
import { useNavigate, useParams } from 'react-router'
import { listKeys, listsApi, newId, useList, type Item } from '../api/lists'
import { useSpace } from '../api/spaces'
import { useCurrentUser } from '../auth/useAuth'
import { InlineForm } from '../components/InlineForm'
import { Button, ErrorText, Loading } from '../components/ui'
import { t } from '../i18n/messages'
import { BackLink } from '../pages/space/MembersPage'
import { ItemEditor } from './ItemEditor'
import { useListChanges } from './listChanges'
import { QuickAdd } from './QuickAdd'
import { amountText, groupItems, sortItems, type ItemSection } from './sortItems'

const UNDO_TIMEOUT_MS = 5000

export function ListPage() {
  const { spaceId = '', listId = '' } = useParams()
  const { data: list, error: loadError } = useList(spaceId, listId)
  const { data: space } = useSpace(spaceId)
  const { data: user } = useCurrentUser()
  const { data: catalog } = useCatalog(spaceId)
  const { apply, error } = useListChanges(spaceId, listId)
  const [editing, setEditing] = useState<Item | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [undo, setUndo] = useState<Item | null>(null)

  // The undo hint disappears after a few seconds.
  useEffect(() => {
    if (!undo) return
    const timer = window.setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [undo])

  if (loadError) return <ErrorText error={loadError} />
  if (!list) return <Loading />

  const checkedToEnd = user?.settings.checkedItemsToEnd ?? true
  const sections = groupItems(sortItems(list.items, checkedToEnd), catalog?.categories ?? [], checkedToEnd)
  const checkedCount = list.items.filter((i) => i.checked).length

  function toggle(item: Item) {
    if (item.checked) {
      apply({ type: 'uncheck', itemId: item.id })
    } else {
      apply({ type: 'check', itemId: item.id })
      setUndo(item)
    }
  }

  return (
    <section className="space-y-4 pb-24">
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <InlineForm
            label={t('common.name')}
            submitLabel={t('common.save')}
            initialValue={list.name}
            onSubmit={(name) => {
              apply({ type: 'rename', name })
              setRenaming(false)
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button className="text-left text-2xl font-bold" onClick={() => setRenaming(true)} title={t('list.rename')}>
            {list.name}
          </button>
        )}
        <BackLink to={`/spaces/${spaceId}`} />
      </div>

      <QuickAdd spaceId={spaceId} categories={catalog?.categories ?? []} onAdd={(item) => apply({ type: 'addItem', item: { id: newId(), ...item } })} />
      <ErrorText error={error} />

      {list.items.length === 0 && <p className="text-gray-500 dark:text-gray-400">{t('list.empty')}</p>}
      {sections.map((section) => (
        <Section key={section.key} section={section} onToggle={toggle} onEdit={setEditing} />
      ))}

      <div className="flex flex-wrap gap-2">
        {checkedCount > 0 && (
          <Button variant="secondary" onClick={() => window.confirm(t('list.removeCheckedConfirm', { count: checkedCount })) && apply({ type: 'removeChecked' })}>
            {t('list.removeChecked', { count: checkedCount })}
          </Button>
        )}
        {space?.myRole === 'OWNER' && <DeleteListButton spaceId={spaceId} listId={listId} name={list.name} />}
      </div>

      {editing && (
        <ItemEditor
          item={editing}
          catalog={catalog}
          onSave={(fields) => apply({ type: 'editItem', itemId: editing.id, fields })}
          onDelete={() => apply({ type: 'deleteItem', itemId: editing.id })}
          onClose={() => setEditing(null)}
        />
      )}
      {undo && (
        <UndoBar
          text={t('list.checked', { name: undo.name })}
          onUndo={() => {
            apply({ type: 'uncheck', itemId: undo.id })
            setUndo(null)
          }}
        />
      )}
    </section>
  )
}

/** A block of items under a header: category name with its color, "Other" or "Checked". */
function Section({ section, onToggle, onEdit }: { section: ItemSection; onToggle: (item: Item) => void; onEdit: (item: Item) => void }) {
  const title = section.category?.name ?? (section.kind === 'checked' ? t('list.section.checked') : t('list.section.other'))
  const color = section.category?.color
  return (
    <div>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
        {color && <span className="size-3 rounded-full" style={{ backgroundColor: color }} />}
        {title}
      </h3>
      <ul aria-label={title} className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {section.items.map((item) => (
          <ItemRow key={item.id} item={item} color={color} onToggle={() => onToggle(item)} onEdit={() => onEdit(item)} />
        ))}
      </ul>
    </div>
  )
}

/** One item: the large left part toggles "checked" on tap, the pencil opens the editor. */
export function ItemRow({ item, onToggle, onEdit, color }: { item: Item; onToggle: () => void; onEdit: () => void; color?: string }) {
  const amount = amountText(item)
  return (
    <li className="flex items-stretch bg-white dark:bg-gray-900" style={color ? { borderLeft: `6px solid ${color}` } : undefined}>
      <button role="checkbox" aria-checked={item.checked} aria-label={item.name} onClick={onToggle} className="flex min-h-14 flex-1 items-center gap-3 px-3 text-left">
        <span
          aria-hidden="true"
          className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${item.checked ? 'border-green-600 bg-green-600 text-white' : 'border-gray-400'}`}
        >
          {item.checked && '✓'}
        </span>
        <span className={`min-w-0 ${item.checked ? 'text-gray-400 line-through dark:text-gray-500' : ''}`}>
          {amount && <span className="mr-1 font-semibold">{amount}</span>}
          <span>{item.name}</span>
          {item.note && <span className="block truncate text-sm text-gray-500 dark:text-gray-400">{item.note}</span>}
        </span>
      </button>
      <button onClick={onEdit} aria-label={t('item.editNamed', { name: item.name })} className="flex w-12 items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
        ✎
      </button>
    </li>
  )
}

function UndoBar({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <div role="status" className="fixed inset-x-0 bottom-4 z-10 mx-auto flex w-[calc(100%-2rem)] max-w-md items-center justify-between rounded-lg bg-gray-900 px-4 py-2 text-white shadow-lg dark:bg-gray-700">
      <span className="truncate">{text}</span>
      <button onClick={onUndo} className="min-h-11 px-2 font-semibold text-green-400 uppercase">
        {t('list.undo')}
      </button>
    </div>
  )
}

function DeleteListButton({ spaceId, listId, name }: { spaceId: string; listId: string; name: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const remove = useMutation({
    mutationFn: () => listsApi.delete(spaceId, listId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: listKeys.detail(spaceId, listId) })
      queryClient.invalidateQueries({ queryKey: listKeys.all(spaceId) })
      navigate(`/spaces/${spaceId}`)
    },
  })
  return (
    <>
      <Button variant="danger" onClick={() => window.confirm(t('common.confirmDelete', { name })) && remove.mutate()}>
        {t('list.delete')}
      </Button>
      <ErrorText error={remove.error} />
    </>
  )
}
