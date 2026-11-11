import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useCatalog, type Category } from '../api/catalog'
import { layoutKeys, layoutsApi, rememberedLayout, rememberLayout, useFavorites, useLayouts, type ShopLayout } from '../api/layouts'
import { listsApi, newId, type Item } from '../api/lists'
import { useSpace } from '../api/spaces'
import { iconButtonClass, Page } from '../components/AppBar'
import { ConfirmDialog, Dialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { ErrorText, Fab, Hint, Loading, SectionTitle } from '../components/ui'
import { t } from '../i18n/messages'
import { syncEngine, useLocalList } from '../offline/engine'
import { NameDialog } from '../pages/space/SpaceDialogs'
import { AddItemDialog } from './AddItemDialog'
import { ItemEditor } from './ItemEditor'
import { setLastList } from './lastList'
import { useListActions } from './listChanges'
import { normalizeName, sortForLayout } from './sortForLayout'
import { amountText, groupItems, groupSorted, sortItems, type ItemSection } from './sortItems'

type DialogName = 'add' | 'shop' | 'rename' | 'delete' | null

/**
 * A shopping list. Tap an item to check it (greyed out, struck through), tap again to uncheck - checked
 * items stay where they are. The sort button moves the checked ones to the end, on demand. The + button
 * adds items; everything rare is in the ⋮ menu.
 */
export function ListPage() {
  const { spaceId = '', listId = '' } = useParams()
  const navigate = useNavigate()
  const { data: layouts } = useLayouts(spaceId)
  const [chosenLayoutId, setChosenLayoutId] = useState<string | null>(() => rememberedLayout(listId))
  // A remembered layout may have been deleted by someone else in the meantime.
  const layout = layouts?.find((l) => l.id === chosenLayoutId) ?? null

  // Lists come from the offline-first sync engine; everything else from the (persisted) query cache.
  const list = useLocalList(spaceId, listId)
  const { data: space } = useSpace(spaceId)
  const { data: catalog } = useCatalog(spaceId)
  const { data: favoriteNames } = useFavorites(spaceId, layout?.id ?? null)
  const { apply } = useListActions(spaceId, listId)
  const toggleFavorite = useToggleFavorite(spaceId, layout?.id ?? null)
  const deleteList = useMutation({
    mutationFn: () => listsApi.delete(spaceId, listId),
    onSuccess: () => {
      void syncEngine.sync(spaceId)
      navigate('/')
    },
  })
  const [dialog, setDialog] = useState<DialogName>(null)
  const [editing, setEditing] = useState<Item | null>(null)
  // Ids of the items the sort button moved to the end (kept while the page is open).
  const [movedToEnd, setMovedToEnd] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (list) setLastList({ spaceId, listId })
  }, [list, spaceId, listId])

  if (list === undefined) return <Page title={t('appName')} back="/"><Loading /></Page>
  if (list === null) {
    return (
      <Page title={t('appName')} back="/">
        <Hint>{t('error.LIST_NOT_FOUND')}</Hint>
      </Page>
    )
  }

  const categories = catalog?.categories ?? []
  const favorites = new Set(favoriteNames ?? [])
  const isFavorite = (item: Item) => favorites.has(normalizeName(item.name))
  const sections = layout
    ? groupSorted(sortForLayout(list.items, layout, categories, favorites, catalog?.usage ?? {}, false), categories, layout.mode, movedToEnd)
    : groupItems(sortItems(list.items), categories, movedToEnd)
  const checked = list.items.filter((i) => i.checked)

  function toggle(item: Item) {
    apply({ type: item.checked ? 'uncheck' : 'check', itemId: item.id })
  }

  function chooseLayout(layoutId: string | null) {
    setChosenLayoutId(layoutId)
    rememberLayout(listId, layoutId)
    setDialog(null)
  }

  const shopLine = (
    <button type="button" onClick={() => setDialog('shop')} className="flex items-center gap-1 text-[0.9rem] opacity-85">
      {layout ? t('list.sortedFor', { shop: layout.name }) : t('list.unsorted')}
      <Icon name="dropdown" className="text-xs" />
    </button>
  )

  return (
    <Page
      title={list.name}
      back="/"
      sub={shopLine}
      actions={
        <button
          type="button"
          aria-label={t('list.sortChecked')}
          title={t('list.sortChecked')}
          disabled={checked.length === 0}
          onClick={() => setMovedToEnd(new Set(checked.map((i) => i.id)))}
          className={iconButtonClass}
        >
          <Icon name="sortChecked" className="text-[1.3rem]" />
        </button>
      }
      menu={[
        { label: t('list.menu.rename'), icon: 'rename', onSelect: () => setDialog('rename') },
        { label: t('list.menu.removeChecked', { count: checked.length }), icon: 'removeChecked', onSelect: () => apply({ type: 'removeChecked' }), disabled: checked.length === 0 },
        'divider',
        { label: t('space.catalog'), icon: 'categories', onSelect: () => navigate(`/spaces/${spaceId}/catalog`, { state: { back: `/spaces/${spaceId}/lists/${listId}` } }) },
        { label: t('space.layouts'), icon: 'shops', onSelect: () => navigate(`/spaces/${spaceId}/layouts`) },
        // The history page leads back here instead of to the space page (see HistoryPage).
        { label: t('history.title'), icon: 'history', onSelect: () => navigate(`/spaces/${spaceId}/history`, { state: { back: `/spaces/${spaceId}/lists/${listId}` } }) },
        ...(space?.myRole === 'OWNER' ? ['divider' as const, { label: t('list.delete'), icon: 'delete' as const, danger: true, onSelect: () => setDialog('delete') }] : []),
      ]}
    >
      <ErrorText error={toggleFavorite.error ?? deleteList.error} />
      {list.items.length === 0 && <p className="py-10 text-center text-lg text-muted">{t('list.empty')}</p>}
      {sections.map((section) => (
        <ItemSectionView key={section.key} section={section} categories={categories} onToggle={toggle} onEdit={setEditing} />
      ))}

      <Fab label={t('addItem.title')} onClick={() => setDialog('add')} />

      {dialog === 'add' && (
        <AddItemDialog
          spaceId={spaceId}
          catalog={catalog}
          onAdd={(item) => apply({ type: 'addItem', item: { id: newId(), ...item } })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'shop' && (
        <ShopDialog spaceId={spaceId} listId={listId} layouts={layouts ?? []} selected={layout?.id ?? null} onSelect={chooseLayout} onClose={() => setDialog(null)} />
      )}
      {dialog === 'rename' && (
        <NameDialog
          title={t('list.menu.rename')}
          initialValue={list.name}
          submitLabel={t('common.save')}
          onSubmit={(name) => {
            apply({ type: 'rename', name })
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title={t('list.deleteTitle', { name: list.name })}
          text={t('list.deleteText')}
          confirmLabel={t('list.delete')}
          onConfirm={() => deleteList.mutate()}
          onClose={() => setDialog(null)}
        />
      )}
      {editing && (
        <ItemEditor
          item={editing}
          catalog={catalog}
          shopName={layout?.name}
          favorite={isFavorite(editing)}
          onToggleFavorite={layout ? () => toggleFavorite.mutate({ name: editing.name, favorite: isFavorite(editing) }) : undefined}
          onSave={(fields) => apply({ type: 'editItem', itemId: editing.id, fields })}
          onDelete={() => apply({ type: 'deleteItem', itemId: editing.id })}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  )
}

/**
 * "Where are you shopping?" - picks the shop layout the list is sorted by. Shops connected to this list
 * come first. The choice is remembered on this device.
 */
function ShopDialog(props: {
  spaceId: string
  listId: string
  layouts: ShopLayout[]
  selected: string | null
  onSelect: (id: string | null) => void
  onClose: () => void
}) {
  const connected = props.layouts.filter((l) => l.listIds.includes(props.listId))
  const others = props.layouts.filter((l) => !l.listIds.includes(props.listId))
  const option = (id: string | null, label: string, hint: string) => (
    <button
      key={id ?? 'none'}
      type="button"
      aria-pressed={props.selected === id}
      onClick={() => props.onSelect(id)}
      className="flex w-full items-center justify-between gap-3 border-b border-line py-3 text-left text-lg"
    >
      <span>
        {label}
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      {props.selected === id && (
        <Icon name="check" className="text-xl text-accent" />
      )}
    </button>
  )
  return (
    <Dialog title={t('shop.title')} onClose={props.onClose}>
      <div>
        {option(null, t('shop.none'), t('shop.noneHint'))}
        {[...connected, ...others].map((l) => option(l.id, l.name, t('shop.layoutHint')))}
      </div>
      {props.layouts.length === 0 && <p className="text-muted">{t('shop.noShops')}</p>}
      <Link to={`/spaces/${props.spaceId}/layouts`} className="inline-block py-2 font-semibold text-accent underline">
        {t('shop.manage')}
      </Link>
    </Dialog>
  )
}

/** Toggles a personal favorite in the current shop; the order updates at once (needs a connection). */
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
function ItemSectionView(props: { section: ItemSection; categories: Category[]; onToggle: (item: Item) => void; onEdit: (item: Item) => void }) {
  const { section } = props
  const title =
    section.category?.name ??
    (section.kind === 'checked' ? t('list.section.checked') : section.kind === 'items' ? t('list.section.items') : t('list.section.other'))
  return (
    <section>
      {section.kind !== 'items' && <SectionTitle color={section.category?.color}>{title}</SectionTitle>}
      <ul aria-label={title} className={section.kind === 'items' ? 'mt-3' : ''}>
        {section.items.map((item) => (
          <ItemRow key={item.id} item={item} onToggle={() => props.onToggle(item)} onEdit={() => props.onEdit(item)} />
        ))}
      </ul>
    </section>
  )
}

/** One item: tapping the row checks/unchecks it; ⋯ opens the details. No checkbox - checked = struck through. */
function ItemRow(props: { item: Item; onToggle: () => void; onEdit: () => void }) {
  const { item } = props
  const amount = amountText(item)
  return (
    <li className="flex items-stretch border-b border-line hover:bg-raised">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.checked}
        aria-label={item.name}
        onClick={props.onToggle}
        className="flex min-h-14 min-w-0 flex-1 items-center px-2 py-3 text-left text-lg"
      >
        <span className={`min-w-0 ${item.checked ? 'text-muted line-through' : ''}`}>
          {amount && <span className={`mr-1.5 ${item.checked ? '' : 'font-semibold'}`}>{amount}</span>}
          <span className={item.checked ? '' : 'font-semibold'}>{item.name}</span>
          {item.note && <span className="block truncate text-[0.9rem] text-muted">{item.note}</span>}
        </span>
      </button>
      <button type="button" onClick={props.onEdit} aria-label={t('item.editNamed', { name: item.name })} className="flex w-12 shrink-0 items-center justify-center text-muted hover:text-fg">
        <Icon name="edit" className="text-base" />
      </button>
    </li>
  )
}
