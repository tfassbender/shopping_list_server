import { useState, type FormEvent, type ReactNode } from 'react'
import type { EditableField, Item } from '../api/lists'
import { Button, TextField } from '../components/ui'
import { t } from '../i18n/messages'

/**
 * Dialog to edit one item. On phones it is a bottom sheet (thumb-friendly), on larger screens a centered
 * box. Only changed fields are sent, so concurrent edits of other fields by others are not overwritten.
 */
export function ItemEditor(props: {
  item: Item
  /** Extra fields (e.g. the category picker in Phase 4). */
  extraFields?: (values: EditValues, setValue: (field: EditableField, value: string) => void) => ReactNode
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
          <TextField label={t('item.unit')} className="flex-1" maxLength={20} value={values.unit} onChange={(e) => setValue('unit', e.target.value)} />
        </div>
        {props.extraFields?.(values, setValue)}
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

/** Simple modal: dark backdrop (click closes), panel at the bottom on phones, centered from `sm` up. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
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
