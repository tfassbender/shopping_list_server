import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { catalogApi, catalogKeys, useCatalog, type Catalog, type Category } from '../../api/catalog'
import { ColorPicker } from '../../components/ColorPicker'
import { ConfirmDialog } from '../../components/Dialog'
import { InlineForm } from '../../components/InlineForm'
import { SortableList } from '../../components/SortableList'
import { Page, useBackTo } from '../../components/AppBar'
import { Button, ErrorText, Loading, SectionTitle, TextField } from '../../components/ui'
import { t } from '../../i18n/messages'
import { OnlineOnly } from '../../offline/online'

/** Manage categories (name, color, order) and units of a space. */
export function CatalogPage() {
  const { spaceId = '' } = useParams()
  // Opened from a list or a shop, back leads there; otherwise to the space page.
  const back = useBackTo(`/spaces/${spaceId}`)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const { data: catalog, error } = useCatalog(spaceId)
  const queryClient = useQueryClient()
  // Every catalog call returns the new catalog: put it straight into the cache.
  const update = useMutation({
    mutationFn: (call: () => Promise<Catalog>) => call(),
    onSuccess: (updated) => queryClient.setQueryData(catalogKeys.catalog(spaceId), updated),
  })

  if (!catalog) {
    return (
      <Page title={t('catalog.title')} back={back}>
        {error ? <ErrorText error={error} /> : <Loading />}
      </Page>
    )
  }

  function reorder(ids: string[]) {
    // Show the new order immediately, then save it.
    const byId = new Map(catalog!.categories.map((c) => [c.id, c]))
    queryClient.setQueryData(catalogKeys.catalog(spaceId), { ...catalog!, categories: ids.map((id) => byId.get(id)!) })
    update.mutate(() => catalogApi.reorderCategories(spaceId, ids))
  }

  return (
    <Page title={t('catalog.title')} back={back}>
      <ErrorText error={update.error} />
      <OnlineOnly>
      <div className="space-y-6">
      <div className="space-y-3">
        <SectionTitle>{t('catalog.categories')}</SectionTitle>
        <p className="text-sm text-muted">{t('catalog.categoriesHint')}</p>
        <SortableList
          items={catalog.categories}
          getId={(c) => c.id}
          getLabel={(c) => c.name}
          onReorder={reorder}
          renderItem={(category) => (
            <CategoryRow
              category={category}
              onSave={(name, color) => update.mutate(() => catalogApi.updateCategory(spaceId, category.id, name, color))}
              onDelete={() => setDeleting(category)}
            />
          )}
        />
        <NewCategoryForm onAdd={(name, color) => update.mutate(() => catalogApi.addCategory(spaceId, name, color))} />
      </div>

      <UnitsEditor units={catalog.units} onChange={(units) => update.mutate(() => catalogApi.setUnits(spaceId, units))} />
      </div>
      </OnlineOnly>
      {deleting && (
        <ConfirmDialog
          title={t('common.deleteTitle', { name: deleting.name })}
          text={t('catalog.deleteCategoryText')}
          confirmLabel={t('common.delete')}
          onConfirm={() => update.mutate(() => catalogApi.deleteCategory(spaceId, deleting.id))}
          onClose={() => setDeleting(null)}
        />
      )}
    </Page>
  )
}

function CategoryRow({ category, onSave, onDelete }: { category: Category; onSave: (name: string, color: string) => void; onDelete: () => void }) {
  const [name, setName] = useState(category.name)
  return (
    <div className="flex items-center gap-2 py-1 pr-2">
      <ColorPicker label={t('catalog.color', { name: category.name })} value={category.color} onChange={(color) => onSave(category.name, color)} />
      <input
        aria-label={t('catalog.categoryName')}
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name.trim() !== category.name && onSave(name.trim(), category.color)}
        className="min-h-10 min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 hover:border-line focus:border-accent focus:outline-none"
      />
      <button onClick={onDelete} aria-label={t('catalog.deleteCategory', { name: category.name })} className="flex size-10 items-center justify-center text-muted hover:text-red-600">
        ✕
      </button>
    </div>
  )
}

const DEFAULT_NEW_COLOR = '#78909c'

function NewCategoryForm({ onAdd }: { onAdd: (name: string, color: string) => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_NEW_COLOR)
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim(), color)
    setName('')
  }
  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <ColorPicker label={t('catalog.newColor')} value={color} onChange={setColor} size="size-12" />
      <TextField className="min-w-0 flex-1" label={t('catalog.newCategory')} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" disabled={!name.trim()}>
        {t('common.create')}
      </Button>
    </form>
  )
}

function UnitsEditor({ units, onChange }: { units: string[]; onChange: (units: string[]) => void }) {
  return (
    <section className="space-y-3">
      <SectionTitle>{t('catalog.units')}</SectionTitle>
      <ul className="flex flex-wrap gap-2">
        {units.map((unit) => (
          <li key={unit} className="flex items-center gap-1 rounded-full bg-raised py-1 pr-1 pl-3">
            {unit}
            <button aria-label={t('catalog.removeUnit', { name: unit })} onClick={() => onChange(units.filter((u) => u !== unit))} className="flex size-8 items-center justify-center rounded-full hover:bg-raised">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <InlineForm label={t('catalog.newUnit')} submitLabel={t('common.create')} maxLength={20} clearOnSubmit onSubmit={(unit) => onChange([...units, unit])} />
    </section>
  )
}
