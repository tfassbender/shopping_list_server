import { useState } from 'react'
import type { Catalog } from '../api/catalog'
import type { EditableField, Item } from '../api/lists'
import { Dialog, DialogActions } from '../components/Dialog'
import { Button, SelectField, Switch, TextField } from '../components/ui'
import { t } from '../i18n/messages'
import { useOnline } from '../offline/online'
import { AmountUnitFields } from './AmountUnitFields'

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
  const [quantity, setQuantity] = useState(item.quantity ?? '')
  const [unit, setUnit] = useState(item.unit ?? '')
  const [categoryId, setCategoryId] = useState(item.categoryId ?? '')
  const [note, setNote] = useState(item.note ?? '')
  // Favorites are saved on the server right away (not via the offline sync), so they need a connection.
  const online = useOnline()

  function save() {
    if (!name.trim()) return // only spaces: the name would be rejected by the server
    const values: Record<EditableField, string> = { name, note, categoryId, quantity, unit }
    const changed: Partial<Record<EditableField, string | null>> = {}
    for (const field of Object.keys(values) as EditableField[]) {
      if (values[field].trim() !== (item[field] ?? '')) changed[field] = values[field].trim() || null
    }
    if (Object.keys(changed).length > 0) props.onSave(changed)
    props.onClose()
  }

  return (
    <Dialog title={item.name} onClose={props.onClose} onSubmit={save}>
      <AmountUnitFields quantity={quantity} unit={unit} units={props.catalog?.units ?? []} onQuantityChange={setQuantity} onUnitChange={setUnit} />
      <TextField label={t('item.name')} required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      <SelectField label={t('item.category')} value={categoryId} onChange={setCategoryId}>
        <option value="">{t('item.noCategory')}</option>
        {props.catalog?.categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </SelectField>
      <TextField label={t('item.note')} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      {props.shopName && props.onToggleFavorite && (
        <label className="flex min-h-12 items-center justify-between gap-3">
          <span>
            {t('item.favoriteAt', { shop: props.shopName })}
            {!online && <span className="block text-sm text-muted">{t('item.favoriteOffline')}</span>}
          </span>
          <Switch checked={!!props.favorite} disabled={!online} onChange={props.onToggleFavorite} label={t('item.favoriteAt', { shop: props.shopName })} />
        </label>
      )}
      <DialogActions>
        <Button
          variant="ghost"
          className="mr-auto text-danger"
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
        <Button type="submit" disabled={!name.trim()}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
