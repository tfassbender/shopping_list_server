import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useCatalog, type Category } from '../api/catalog'
import { layoutKeys, layoutsApi, rememberedLayout, rememberLayout, useFavorites, useLayouts, type ShopLayout } from '../api/layouts'
import { listsApi, newId, type Item } from '../api/lists'
import { useSpace } from '../api/spaces'
import { useCurrentUser } from '../auth/useAuth'
import { InlineForm } from '../components/InlineForm'
import { Button, ErrorText, Loading } from '../components/ui'
import { t } from '../i18n/messages'
import { BackLink } from '../pages/space/MembersPage'
import { ItemEditor } from './ItemEditor'
import { syncEngine, useLocalList } from '../offline/engine'
import { useListActions } from './listChanges'
import { QuickAdd } from './QuickAdd'
import { normalizeName, sortForLayout } from './sortForLayout'
import { amountText, groupItems, groupSorted, sortItems, type ItemSection } from './sortItems'

const UNDO_TIMEOUT_MS = 5000

export function ListPage() {
  const { spaceId = '', listId = '' } = useParams()
  const { data: layouts } = useLayouts(spaceId)
  const [chosenLayoutId, setChosenLayoutId] = useState<string | null>(() => rememberedLayout(listId))
  // A remembered layout may have been deleted by someone else in the meantime.
  const layout = layouts?.find((l) => l.id === chosenLayoutId) ?? null

  // Lists come from the offline-first sync engine; everything else from the (persisted) query cache.
  const list = useLocalList(spaceId, listId)
  const { data: space } = useSpace(spaceId)
  const { data: user } = useCurrentUser()
  const { data: catalog } = useCatalog(spaceId)
  const { data: favoriteNames } = useFavorites(spaceId, layout?.id ?? null)
  const { apply } = useListActions(spaceId, listId)
  const [editing, setEditing] = useState<Item | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [undo, setUndo] = useState<Item | null>(null)
  const toggleFavorite = useToggleFavorite(spaceId, layout?.id ?? null)

  // The undo hint disappears after a few seconds.
  useEffect(() => {
    if (!undo) return
    const timer = window.setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [undo])

  if (list === undefined) return <Loading />
  if (list === null) {
    return (
      <section className="space-y-3">
        <p>{t('error.LIST_NOT_FOUND')}</p>
        <BackLink to={`/spaces/${spaceId}`} />
      </section>
    )
  }

  const categories = catalog?.categories ?? []
  const checkedToEnd = user?.settings.checkedItemsToEnd ?? true
  const favorites = new Set(favoriteNames ?? [])
  const isFavorite = (item: Item) => favorites.has(normalizeName(item.name))
  const sections = layout
    ? groupSorted(sortForLayout(list.items, layout, categories, favorites, catalog?.usage ?? {}, checkedToEnd), categories, layout.mode, checkedToEnd)
    : groupItems(sortItems(list.items, checkedToEnd), categories, checkedToEnd)
  const checkedCount = list.items.filter((i) => i.checked).length

  function chooseLayout(layoutId: string | null) {
    setChosenLayoutId(layoutId)
    rememberLayout(listId, layoutId)
  }

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

      <ShopSelector spaceId={spaceId} listId={listId} layouts={layouts ?? []} selected={layout?.id ?? null} onSelect={chooseLayout} />
      <QuickAdd spaceId={spaceId} categories={categories} onAdd={(item) => apply({ type: 'addItem', item: { id: newId(), ...item } })} />
      <ErrorText error={toggleFavorite.error} />

      {list.items.length === 0 && <p className="text-gray-500 dark:text-gray-400">{t('list.empty')}</p>}
      {sections.map((section) => (
        <Section
          key={section.key}
          section={section}
          categories={categories}
          onToggle={toggle}
          onEdit={setEditing}
          isFavorite={isFavorite}
          onFavorite={layout ? (item) => toggleFavorite.mutate({ name: item.name, favorite: isFavorite(item) }) : undefined}
        />
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

/**
 * "Where am I shopping?" - picks the shop layout the list is sorted by. Layouts connected to this list
 * are offered first; the others of the space follow under "More shops".
 */
function ShopSelector(props: { spaceId: string; listId: string; layouts: ShopLayout[]; selected: string | null; onSelect: (id: string | null) => void }) {
  if (props.layouts.length === 0) {
    return (
      <Link to={`/spaces/${props.spaceId}/layouts`} className="block text-sm text-green-700 underline dark:text-green-400">
        {t('shop.createHint')}
      </Link>
    )
  }
  const connected = props.layouts.filter((l) => l.listIds.includes(props.listId))
  const others = props.layouts.filter((l) => !l.listIds.includes(props.listId))
  return (
    <label className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('shop.label')}</span>
      <select
        value={props.selected ?? ''}
        onChange={(e) => props.onSelect(e.target.value || null)}
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900"
      >
        <option value="">{t('shop.none')}</option>
        {connected.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
        {others.length > 0 && (
          <optgroup label={connected.length > 0 ? t('shop.more') : t('shop.all')}>
            {others.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  )
}

/** Toggles a personal favorite in the current shop; star and order update at once (needs a connection). */
function useToggleFavorite(spaceId: string, layoutId: string | null) {
  const queryClient = useQueryClient()
  const key = layoutKeys.favorites(spaceId, layoutId ?? '')
  return useMutation({
    mutationFn: ({ name, favorite }: { name: string; favorite: boolean }) =>
      favorite ? layoutsApi.removeFavorite(spaceId, layoutId!, name) : layoutsApi.addFavorite(spaceId, layoutId!, name),
    onMutate: ({ name, favorite }) =>
      queryClient.setQueryData<string[]>(key, (names = []) =>
        favorite ? names.filter((n) => n !== normalizeName(name)) : [...names, normalizeName(name)],
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

/** A block of items under a header: category name with its color, "Other" or "Checked" (none in item mode). */
function Section(props: {
  section: ItemSection
  categories: Category[]
  onToggle: (item: Item) => void
  onEdit: (item: Item) => void
  isFavorite: (item: Item) => boolean
  onFavorite?: (item: Item) => void
}) {
  const { section } = props
  const title =
    section.category?.name ??
    (section.kind === 'checked' ? t('list.section.checked') : section.kind === 'items' ? t('list.section.items') : t('list.section.other'))
  const colorOf = (item: Item) => section.category?.color ?? props.categories.find((c) => c.id === item.categoryId)?.color
  return (
    <div>
      {section.kind !== 'items' && (
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-400">
          {section.category && <span className="size-3 rounded-full" style={{ backgroundColor: section.category.color }} />}
          {title}
        </h3>
      )}
      <ul aria-label={title} className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {section.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            favorite={props.isFavorite(item)}
            color={colorOf(item)}
            onToggle={() => props.onToggle(item)}
            onEdit={() => props.onEdit(item)}
            onFavorite={props.onFavorite && (() => props.onFavorite!(item))}
          />
        ))}
      </ul>
    </div>
  )
}

/** One item: the large left part toggles "checked" on tap; star (with a shop selected) and pencil on the right. */
export function ItemRow(props: {
  item: Item
  onToggle: () => void
  onEdit: () => void
  onFavorite?: () => void
  favorite?: boolean
  color?: string
}) {
  const { item } = props
  const amount = amountText(item)
  return (
    <li className="flex items-stretch bg-white dark:bg-gray-900" style={props.color ? { borderLeft: `6px solid ${props.color}` } : undefined}>
      <button role="checkbox" aria-checked={item.checked} aria-label={item.name} onClick={props.onToggle} className="flex min-h-14 flex-1 items-center gap-3 px-3 text-left">
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
      {props.onFavorite && (
        <button
          onClick={props.onFavorite}
          aria-pressed={!!props.favorite}
          aria-label={t('item.favoriteNamed', { name: item.name })}
          className={`flex w-11 items-center justify-center text-xl ${props.favorite ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-600'}`}
        >
          {props.favorite ? '★' : '☆'}
        </button>
      )}
      <button onClick={props.onEdit} aria-label={t('item.editNamed', { name: item.name })} className="flex w-12 items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
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
      void syncEngine.sync(spaceId)
      queryClient.invalidateQueries({ queryKey: ['spaces', spaceId, 'lists'] })
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
