import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Catalog } from '../api/catalog'
import type { EditableField, Item } from '../api/lists'
import { Button, TextField } from '../components/ui'
import { t } from '../i18n/messages'

/**
 * Dialog to edit one item. On phones it is a bottom sheet (thumb-friendly), on larger screens a centered
 * box. Only changed fields are sent, so concurrent edits of other fields by others are not overwritten.
 */
export function ItemEditor(props: {
  item: Item
  catalog?: Catalog
  onSave: (changed: Partial<Record<EditableField, string | null>>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const { item } = props
  const [values, setValues] = useState<EditValues>({
    name: item.name,
    quantity: item.quantity ?? '',
    unit: item.unit ?? '',
    note: item.note ?? '',
    categoryId: item.categoryId ?? '',
  })
  const setValue = (field: EditableField, value: string) => setValues((v) => ({ ...v, [field]: value }))

  function submit(event: FormEvent) {
    event.preventDefault()
    const changed: Partial<Record<EditableField, string | null>> = {}
    for (const field of Object.keys(values) as EditableField[]) {
      const original = item[field] ?? ''
      if (values[field].trim() !== original) changed[field] = values[field].trim() || null
    }
    if (Object.keys(changed).length > 0) props.onSave(changed)
    props.onClose()
  }

  return (
    <Dialog title={t('item.edit')} onClose={props.onClose}>
      <form onSubmit={submit} className="space-y-3">
        <TextField label={t('item.name')} required maxLength={100} value={values.name} onChange={(e) => setValue('name', e.target.value)} />
        <div className="flex gap-2">
          <TextField label={t('item.quantity')} className="flex-1" maxLength={20} inputMode="decimal" value={values.quantity} onChange={(e) => setValue('quantity', e.target.value)} />
          {/* `list` links to the <datalist>: the browser suggests the space's units but allows free text. */}
          <TextField label={t('item.unit')} className="flex-1" maxLength={20} list="unit-options" value={values.unit} onChange={(e) => setValue('unit', e.target.value)} />
          <datalist id="unit-options">
            {props.catalog?.units.map((unit) => <option key={unit} value={unit} />)}
          </datalist>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('item.category')}</span>
          <select
            value={values.categoryId}
            onChange={(e) => setValue('categoryId', e.target.value)}
            className="block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 dark:border-gray-600 dark:bg-gray-900"
          >
            <option value="">{t('item.noCategory')}</option>
            {props.catalog?.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <TextField label={t('item.note')} maxLength={200} value={values.note} onChange={(e) => setValue('note', e.target.value)} />
        <div className="flex justify-between gap-2 pt-2">
          <Button
            variant="danger"
            onClick={() => {
              props.onDelete()
              props.onClose()
            }}
          >
            {t('common.delete')}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={props.onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}

export type EditValues = Record<EditableField, string>

/**
 * Simple modal: dark backdrop (click or Escape closes), panel at the bottom on phones, centered from `sm`
 * up. `aria-modal` tells screen readers that the page behind is inactive.
 */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-md sm:rounded-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-lg font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  )
}
