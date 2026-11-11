import { SelectField, TextField } from '../components/ui'
import { t } from '../i18n/messages'

/** The server accepts at most 20 characters for the quantity. */
const MAX_LENGTH = 20

/** Digits with at most one decimal separator ("2", "0,5", "1.25") - also every intermediate state while typing. */
const NUMBER_INPUT = /^\d*(?:[.,]\d*)?$/

/**
 * Amount and unit side by side. The amount takes only numbers (other input is ignored; `inputMode`
 * brings up the number keyboard on phones). The unit is picked from the units configured for the space
 * ("Categories & units"); a unit the item already has but which is not in that list stays selectable,
 * so editing an item never drops it silently.
 */
export function AmountUnitFields(props: {
  quantity: string
  unit: string
  units: string[]
  onQuantityChange: (value: string) => void
  onUnitChange: (value: string) => void
}) {
  const units = props.unit && !props.units.includes(props.unit) ? [props.unit, ...props.units] : props.units
  return (
    <div className="flex gap-2">
      <TextField
        className="min-w-0 flex-1"
        label={t('item.amount')}
        inputMode="decimal"
        autoComplete="off"
        maxLength={MAX_LENGTH}
        value={props.quantity}
        onChange={(e) => NUMBER_INPUT.test(e.target.value) && props.onQuantityChange(e.target.value)}
      />
      <SelectField className="min-w-0 flex-1" label={t('item.unit')} value={props.unit} onChange={props.onUnitChange}>
        <option value="">{t('item.noUnit')}</option>
        {units.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </SelectField>
    </div>
  )
}
