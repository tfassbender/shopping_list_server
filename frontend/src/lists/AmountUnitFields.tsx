import { SelectField, TextField } from '../components/ui'
import { t } from '../i18n/messages'
import { isValidAmount } from './amount'

/** The server accepts at most 20 characters for the quantity. */
const MAX_LENGTH = 20

/**
 * What the field accepts while typing: digits and decimal separators; other characters are ignored. A
 * second separator ("1.2.3") is kept as typed and marked invalid - dropping it would silently turn the
 * input into another number ("1.23").
 */
const TYPED_INPUT = /^[\d.,]*$/

/**
 * Amount and unit side by side. The amount takes only numbers (`inputMode` brings up the number keyboard
 * on phones); an invalid number is marked and blocks saving (see `isValidAmount`). The unit is picked from
 * the units configured for the space ("Categories & units"); a unit the item already has but which is not
 * in that list stays selectable, so editing an item never drops it silently.
 */
export function AmountUnitFields(props: {
  quantity: string
  unit: string
  units: string[]
  onQuantityChange: (value: string) => void
  onUnitChange: (value: string) => void
}) {
  const units = props.unit && !props.units.includes(props.unit) ? [props.unit, ...props.units] : props.units
  const invalid = !isValidAmount(props.quantity)
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <TextField
          className="min-w-0 flex-1"
          label={t('item.amount')}
          inputMode="decimal"
          autoComplete="off"
          maxLength={MAX_LENGTH}
          value={props.quantity}
          aria-invalid={invalid}
          onChange={(e) => TYPED_INPUT.test(e.target.value) && props.onQuantityChange(e.target.value)}
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
      {invalid && (
        <p role="alert" className="text-sm text-danger">
          {t('item.invalidAmount')}
        </p>
      )}
    </div>
  )
}
