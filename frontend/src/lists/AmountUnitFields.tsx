import { useId } from 'react'
import { TextField } from '../components/ui'
import { t } from '../i18n/messages'

/** The server accepts at most 20 characters for quantity and unit each. */
const MAX_LENGTH = 20

/**
 * Amount and unit side by side. The unit is free text; the units of the space ("Categories & units") are
 * offered as suggestions via a <datalist>, which the browser shows as a dropdown while typing.
 */
export function AmountUnitFields(props: {
  quantity: string
  unit: string
  units: string[]
  onQuantityChange: (value: string) => void
  onUnitChange: (value: string) => void
}) {
  const unitListId = useId()
  return (
    <div className="flex gap-2">
      <TextField className="min-w-0 flex-1" label={t('item.amount')} maxLength={MAX_LENGTH} value={props.quantity} onChange={(e) => props.onQuantityChange(e.target.value)} />
      <TextField className="min-w-0 flex-1" label={t('item.unit')} list={unitListId} autoComplete="off" maxLength={MAX_LENGTH} value={props.unit} onChange={(e) => props.onUnitChange(e.target.value)} />
      <datalist id={unitListId}>
        {props.units.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
    </div>
  )
}
