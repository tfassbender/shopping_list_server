import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useCatalog, type Category } from '../../api/catalog'
import { layoutKeys, layoutsApi, useLayouts, type LayoutMode, type ShopLayout } from '../../api/layouts'
import { listsApi, useLists } from '../../api/lists'
import { InlineForm } from '../../components/InlineForm'
import { SortableList } from '../../components/SortableList'
import { Page, useBackTo } from '../../components/AppBar'
import { ConfirmDialog } from '../../components/Dialog'
import { Icon } from '../../components/Icon'
import { Button, ErrorText, Fab, Hint, Loading, Row, SectionTitle, Switch } from '../../components/ui'
import { t, tDynamic } from '../../i18n/messages'
import { OnlineOnly, useOnline } from '../../offline/online'
import { normalizeName } from '../../lists/sortForLayout'
import { NameDialog } from './SpaceDialogs'

/** Overview of the shop layouts of a space; + creates one. */
export function LayoutsPage() {
  const { spaceId = '' } = useParams()
  const { data: layouts, error } = useLayouts(spaceId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const online = useOnline()
  // Opened from a list, back leads there; otherwise to the space page.
  const back = useBackTo(`/spaces/${spaceId}`)
  const [creating, setCreating] = useState(false)
  const create = useMutation({
    mutationFn: (name: string) => layoutsApi.create(spaceId, name, 'CATEGORIES'),
    onSuccess: (layout) => {
      queryClient.invalidateQueries({ queryKey: layoutKeys.all(spaceId) })
      navigate(`/spaces/${spaceId}/layouts/${layout.id}`)
    },
  })

  return (
    <Page title={t('layouts.title')} back={back}>
      <Hint>{t('layouts.explanation')}</Hint>
      <ErrorText error={error} />
      {layouts?.length === 0 && <p className="py-6 text-center text-muted">{t('layouts.emptyHint')}</p>}
      {layouts?.map((layout) => (
        <Row
          key={layout.id}
          onClick={() => navigate(`/spaces/${spaceId}/layouts/${layout.id}`)}
          title={<span className="text-lg font-semibold">{layout.name}</span>}
          hint={tDynamic(`layouts.mode.${layout.mode}`)}
          chevron
        />
      ))}
      <Fab label={t('layouts.new')} onClick={() => setCreating(true)} disabled={!online} />
      {creating && (
        <NameDialog
          title={t('layouts.new')}
          submitLabel={t('common.create')}
          pending={create.isPending}
          error={create.error}
          onSubmit={(name) => create.mutate(name)}
          onClose={() => setCreating(false)}
        />
      )}
    </Page>
  )
}

/** Category order of a layout for display: its own order (existing categories only), then new ones. */
export function categoriesInLayoutOrder(layout: ShopLayout, categories: Category[]): Category[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const ordered = layout.categoryOrder.flatMap((id) => byId.get(id) ?? [])
  return [...ordered, ...categories.filter((c) => !layout.categoryOrder.includes(c.id))]
}

export function LayoutEditorPage() {
  const { spaceId = '', layoutId = '' } = useParams()
  const { data: layouts } = useLayouts(spaceId)
  const { data: catalog } = useCatalog(spaceId)
  const layout = layouts?.find((l) => l.id === layoutId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copying, setCopying] = useState(false)

  // Each call returns the updated layout; it replaces the cached one (instant UI update).
  const update = useMutation({
    mutationFn: (call: () => Promise<ShopLayout>) => call(),
    onMutate: () => queryClient.cancelQueries({ queryKey: layoutKeys.all(spaceId) }),
    onSuccess: (updated) => replaceCached(updated),
    onError: () => queryClient.invalidateQueries({ queryKey: layoutKeys.all(spaceId) }),
  })
  const copy = useMutation({
    mutationFn: (name: string) => layoutsApi.copy(spaceId, layoutId, name),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: layoutKeys.all(spaceId) })
      setCopying(false)
      navigate(`/spaces/${spaceId}/layouts/${created.id}`)
    },
  })
  const remove = useMutation({
    mutationFn: () => layoutsApi.delete(spaceId, layoutId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: layoutKeys.all(spaceId) })
      navigate(`/spaces/${spaceId}/layouts`)
    },
  })

  function replaceCached(updated: ShopLayout) {
    queryClient.setQueryData<ShopLayout[]>(layoutKeys.all(spaceId), (all) => all?.map((l) => (l.id === updated.id ? updated : l)))
  }

  if (!layouts || !catalog) return <Loading />
  if (!layout) return <p>{t('error.LAYOUT_NOT_FOUND')}</p>

  function setMode(mode: LayoutMode) {
    update.mutate(() => layoutsApi.update(spaceId, layoutId, layout!.name, mode))
  }

  function reorderCategories(ids: string[]) {
    replaceCached({ ...layout!, categoryOrder: ids })
    update.mutate(() => layoutsApi.setCategoryOrder(spaceId, layoutId, ids))
  }

  function setItemOrder(names: string[]) {
    replaceCached({ ...layout!, itemOrder: names })
    update.mutate(() => layoutsApi.setItemOrder(spaceId, layoutId, names))
  }

  return (
    <Page title={layout.name} back={`/spaces/${spaceId}/layouts`}>
      <ErrorText error={update.error ?? remove.error} />
      <OnlineOnly>
      <div className="space-y-6 pt-4">
      <InlineForm
        key={layout.name}
        label={t('common.name')}
        submitLabel={t('common.rename')}
        initialValue={layout.name}
        onSubmit={(name) => update.mutate(() => layoutsApi.update(spaceId, layoutId, name, layout.mode))}
      />

      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium">{t('layouts.sortBy')}</legend>
        {(['CATEGORIES', 'ITEMS'] as const).map((mode) => (
          <label key={mode} className="flex min-h-11 items-center gap-3">
            <input type="radio" name="mode" className="size-5 accent-accent" checked={layout.mode === mode} onChange={() => setMode(mode)} />
            <span>
              {tDynamic(`layouts.mode.${mode}`)}
              <span className="block text-xs text-muted">{tDynamic(`layouts.modeHint.${mode}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {layout.mode === 'CATEGORIES' ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">{t('layouts.dragHint')}</p>
          <SortableList
            items={categoriesInLayoutOrder(layout, catalog.categories)}
            getId={(c) => c.id}
            getLabel={(c) => c.name}
            onReorder={reorderCategories}
            renderItem={(c) => (
              <span className="flex min-h-12 items-center gap-2 pr-3">
                <span className="size-3 rounded-full" style={{ backgroundColor: c.color }} />
                {c.name}
              </span>
            )}
          />
          {/* back from the categories leads to this shop again */}
          <Button variant="secondary" onClick={() => navigate(`/spaces/${spaceId}/catalog`, { state: { back: `/spaces/${spaceId}/layouts/${layoutId}` } })}>
            <Icon name="categories" />
            {t('layouts.editCategories')}
          </Button>
        </div>
      ) : (
        <ItemOrderEditor spaceId={spaceId} layout={layout} onChange={setItemOrder} />
      )}

      <ConnectedLists spaceId={spaceId} layout={layout} onChange={replaceCached} />

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setCopying(true)}>
          <Icon name="copy" />
          {t('layouts.copy')}
        </Button>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          {t('layouts.delete')}
        </Button>
      </div>
      </div>
      </OnlineOnly>
      {copying && (
        <NameDialog
          title={t('layouts.copy')}
          // the server allows 60 characters; a long name is cut so the suggestion is always valid
          initialValue={t('layouts.copyName', { name: layout.name }).slice(0, 60)}
          submitLabel={t('common.create')}
          pending={copy.isPending}
          error={copy.error}
          onSubmit={(name) => copy.mutate(name)}
          onClose={() => setCopying(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={t('common.deleteTitle', { name: layout.name })}
          text={t('layouts.deleteText')}
          confirmLabel={t('layouts.delete')}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </Page>
  )
}

/** Mode ITEMS: an ordered list of item names, filled by hand or from the items of the connected lists. */
function ItemOrderEditor({ spaceId, layout, onChange }: { spaceId: string; layout: ShopLayout; onChange: (names: string[]) => void }) {
  const [importError, setImportError] = useState<unknown>(null)
  const [duplicate, setDuplicate] = useState<string | null>(null)
  // Same normalization as the server, which refuses entries that differ only in case or spaces.
  const known = new Set(layout.itemOrder.map(normalizeName))

  function add(name: string) {
    if (known.has(normalizeName(name))) {
      setDuplicate(name)
      return false // keep the text, so the user sees what was refused
    }
    setDuplicate(null)
    onChange([...layout.itemOrder, name])
  }

  async function importFromLists() {
    setImportError(null)
    try {
      const lists = await Promise.all(layout.listIds.map((id) => listsApi.get(spaceId, id)))
      // Names not yet in the order, each only once (case-insensitive).
      const added = new Map<string, string>()
      for (const name of lists.flatMap((l) => l.items.map((i) => i.name))) {
        const key = normalizeName(name)
        if (!known.has(key) && !added.has(key)) added.set(key, name)
      }
      if (added.size > 0) onChange([...layout.itemOrder, ...added.values()])
    } catch (e) {
      setImportError(e)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">{t('layouts.itemsHint')}</p>
      {layout.itemOrder.length > 0 && (
        <SortableList
          items={layout.itemOrder}
          getId={(name) => name}
          getLabel={(name) => name}
          onReorder={onChange}
          renderItem={(name) => (
            <span className="flex min-h-12 items-center justify-between pr-1">
              {name}
              <button
                aria-label={t('layouts.removeEntry', { name })}
                onClick={() => onChange(layout.itemOrder.filter((n) => n !== name))}
                className="flex size-10 items-center justify-center text-muted hover:text-red-600"
              >
                ✕
              </button>
            </span>
          )}
        />
      )}
      <InlineForm
        label={t('layouts.newEntry')}
        submitLabel={t('list.add')}
        maxLength={100}
        clearOnSubmit
        onSubmit={add}
      />
      {duplicate && <p role="status" className="text-sm text-muted">{t('layouts.entryExists', { name: duplicate })}</p>}
      {layout.listIds.length > 0 && (
        <Button variant="secondary" onClick={importFromLists}>
          {t('layouts.importItems')}
        </Button>
      )}
      <ErrorText error={importError} />
    </div>
  )
}

/** Which lists offer this shop in their shop selector. */
function ConnectedLists({ spaceId, layout, onChange }: { spaceId: string; layout: ShopLayout; onChange: (layout: ShopLayout) => void }) {
  const { data: lists } = useLists(spaceId)
  const toggle = useMutation({
    mutationFn: ({ listId, connect }: { listId: string; connect: boolean }) =>
      connect ? layoutsApi.connect(spaceId, layout.id, listId) : layoutsApi.disconnect(spaceId, layout.id, listId),
    onSuccess: onChange,
  })
  if (!lists || lists.length === 0) return null
  return (
    <section>
      <SectionTitle>{t('layouts.connectedLists')}</SectionTitle>
      <p className="text-sm text-muted">{t('layouts.connectedHint')}</p>
      {lists.map((list) => (
        <label key={list.id} className="flex min-h-14 items-center gap-3 border-b border-line px-2">
          <span className="flex-1">{list.name}</span>
          <Switch label={list.name} checked={layout.listIds.includes(list.id)} onChange={(connect) => toggle.mutate({ listId: list.id, connect })} />
        </label>
      ))}
      <ErrorText error={toggle.error} />
    </section>
  )
}
