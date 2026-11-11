import { useState } from 'react'
import type { Catalog } from '../api/catalog'
import type { EditableField, Item } from '../api/lists'
import { Dialog, DialogActions } from '../components/Dialog'
import { Button, SelectField, Switch, TextField } from '../components/ui'
import { t } from '../i18n/messages'
import { formatAmount, parseAmount } from './amount'

/**
 * Details of one item (opened with ⋯). Only changed fields are sent, so concurrent edits of other fields
 * by others are not overwritten. With a shop selected, the item can be marked as personal favorite there.
 */
export function ItemEditor(props: {
  item: Item
  catalog?: Catalog
  shopName?: string
  favorite?: boolean
  onToggleFavorite?: () => void
  onSave: (changed: Partial<Record<EditableField, string | null>>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const { item } = props
  const [name, setName] = useState(item.name)
  const [amount, setAmount] = useState(formatAmount(item))
  const [categoryId, setCategoryId] = useState(item.categoryId ?? '')
  const [note, setNote] = useState(item.note ?? '')

  function save() {
    const values: Record<EditableField, string> = { name, note, categoryId, ...toText(parseAmount(amount)) }
    const changed: Partial<Record<EditableField, string | null>> = {}
    for (const field of Object.keys(values) as EditableField[]) {
      if (values[field].trim() !== (item[field] ?? '')) changed[field] = values[field].trim() || null
    }
    if (Object.keys(changed).length > 0) props.onSave(changed)
    props.onClose()
  }

  return (
    <Dialog title={item.name} onClose={props.onClose} onSubmit={save}>
      <TextField label={t('item.name')} required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <TextField className="min-w-36 flex-1" label={t('item.amount')} maxLength={41} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <SelectField className="min-w-36 flex-1" label={t('item.category')} value={categoryId} onChange={setCategoryId}>
          <option value="">{t('item.noCategory')}</option>
          {props.catalog?.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField label={t('item.note')} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      {props.shopName && props.onToggleFavorite && (
        <label className="flex min-h-12 items-center justify-between gap-3">
          <span>{t('item.favoriteAt', { shop: props.shopName })}</span>
          <Switch checked={!!props.favorite} onChange={props.onToggleFavorite} label={t('item.favoriteAt', { shop: props.shopName })} />
        </label>
      )}
      <DialogActions>
        <Button
          variant="ghost"
          className="mr-auto pl-0 text-danger"
          onClick={() => {
            props.onDelete()
            props.onClose()
          }}
        >
          {t('common.delete')}
        </Button>
        <Button variant="ghost" onClick={props.onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit">{t('common.save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

function toText(amount: { quantity: string | null; unit: string | null }) {
  return { quantity: amount.quantity ?? '', unit: amount.unit ?? '' }
}
