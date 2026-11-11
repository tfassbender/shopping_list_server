import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useCatalog, type Category } from '../../api/catalog'
import { layoutKeys, layoutsApi, useLayouts, type LayoutMode, type ShopLayout } from '../../api/layouts'
import { listsApi, useLists } from '../../api/lists'
import { InlineForm } from '../../components/InlineForm'
import { SortableList } from '../../components/SortableList'
import { Button, Card, ErrorText, Loading, PageTitle } from '../../components/ui'
import { t, tDynamic } from '../../i18n/messages'
import { Checkbox } from '../SettingsPage'
import { BackLink } from './MembersPage'

/** Overview of the shop layouts of a space. */
export function LayoutsPage() {
  const { spaceId = '' } = useParams()
  const { data: layouts, error } = useLayouts(spaceId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: (name: string) => layoutsApi.create(spaceId, name, 'CATEGORIES'),
    onSuccess: (layout) => {
      queryClient.invalidateQueries({ queryKey: layoutKeys.all(spaceId) })
      navigate(`/spaces/${spaceId}/layouts/${layout.id}`)
    },
  })

  return (
    <section className="space-y-4">
      <PageTitle action={<BackLink to={`/spaces/${spaceId}`} />}>{t('layouts.title')}</PageTitle>
      <p className="text-sm text-gray-600 dark:text-gray-400">{t('layouts.explanation')}</p>
      <ErrorText error={error ?? create.error} />
      {layouts?.length === 0 && <p className="text-gray-500 dark:text-gray-400">{t('layouts.empty')}</p>}
      <ul className="space-y-2">
        {layouts?.map((layout) => (
          <li key={layout.id}>
            <Link to={`/spaces/${spaceId}/layouts/${layout.id}`} className="block">
              <Card className="flex items-center justify-between hover:border-green-500">
                <span className="text-lg font-medium">{layout.name}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{tDynamic(`layouts.mode.${layout.mode}`)}</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <InlineForm label={t('layouts.newName')} submitLabel={t('common.create')} clearOnSubmit disabled={create.isPending} onSubmit={(name) => create.mutate(name)} />
    </section>
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

  // Each call returns the updated layout; it replaces the cached one (instant UI update).
  const update = useMutation({
    mutationFn: (call: () => Promise<ShopLayout>) => call(),
    onMutate: () => queryClient.cancelQueries({ queryKey: layoutKeys.all(spaceId) }),
    onSuccess: (updated) => replaceCached(updated),
    onError: () => queryClient.invalidateQueries({ queryKey: layoutKeys.all(spaceId) }),
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
    <section className="space-y-6">
      <PageTitle action={<BackLink to={`/spaces/${spaceId}/layouts`} />}>{layout.name}</PageTitle>
      <ErrorText error={update.error ?? remove.error} />

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
            <input type="radio" name="mode" className="size-5 accent-green-600" checked={layout.mode === mode} onChange={() => setMode(mode)} />
            <span>
              {tDynamic(`layouts.mode.${mode}`)}
              <span className="block text-xs text-gray-500 dark:text-gray-400">{tDynamic(`layouts.modeHint.${mode}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {layout.mode === 'CATEGORIES' ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('layouts.dragHint')}</p>
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
        </div>
      ) : (
        <ItemOrderEditor spaceId={spaceId} layout={layout} onChange={setItemOrder} />
      )}

      <ConnectedLists spaceId={spaceId} layout={layout} onChange={replaceCached} />

      <Button variant="danger" onClick={() => window.confirm(t('common.confirmDelete', { name: layout.name })) && remove.mutate()}>
        {t('layouts.delete')}
      </Button>
    </section>
  )
}

/** Mode ITEMS: an ordered list of item names, filled by hand or from the items of the connected lists. */
function ItemOrderEditor({ spaceId, layout, onChange }: { spaceId: string; layout: ShopLayout; onChange: (names: string[]) => void }) {
  const [importError, setImportError] = useState<unknown>(null)
  const known = new Set(layout.itemOrder.map((n) => n.toLowerCase()))

  async function importFromLists() {
    setImportError(null)
    try {
      const lists = await Promise.all(layout.listIds.map((id) => listsApi.get(spaceId, id)))
      // Names not yet in the order, each only once (case-insensitive).
      const added = new Map<string, string>()
      for (const name of lists.flatMap((l) => l.items.map((i) => i.name))) {
        const key = name.toLowerCase()
        if (!known.has(key) && !added.has(key)) added.set(key, name)
      }
      if (added.size > 0) onChange([...layout.itemOrder, ...added.values()])
    } catch (e) {
      setImportError(e)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600 dark:text-gray-400">{t('layouts.itemsHint')}</p>
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
                className="flex size-10 items-center justify-center text-gray-500 hover:text-red-600"
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
        onSubmit={(name) => !known.has(name.toLowerCase()) && onChange([...layout.itemOrder, name])}
      />
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
    <Card className="space-y-1">
      <h3 className="text-lg font-semibold">{t('layouts.connectedLists')}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">{t('layouts.connectedHint')}</p>
      {lists.map((list) => (
        <Checkbox
          key={list.id}
          label={list.name}
          checked={layout.listIds.includes(list.id)}
          onChange={(connect) => toggle.mutate({ listId: list.id, connect })}
        />
      ))}
      <ErrorText error={toggle.error} />
    </Card>
  )
}
