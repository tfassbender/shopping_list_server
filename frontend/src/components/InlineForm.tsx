import { useId, useState, type FormEvent } from 'react'
import { t } from '../i18n/messages'
import { Button } from './ui'

/**
 * A one-field form with a submit button (create / rename something), the label above the field. Clears
 * itself after submitting when `clearOnSubmit` is set - unless `onSubmit` returns false (value refused).
 */
export function InlineForm(props: {
  label: string
  submitLabel: string
  initialValue?: string
  maxLength?: number
  disabled?: boolean
  clearOnSubmit?: boolean
  onSubmit: (value: string) => void | boolean
  onCancel?: () => void
}) {
  const [value, setValue] = useState(props.initialValue ?? '')
  const id = useId()

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    const accepted = props.onSubmit(trimmed) !== false
    if (accepted && props.clearOnSubmit) setValue('')
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="mb-1 block text-sm text-muted">
          {props.label}
        </label>
        <input
          id={id}
          value={value}
          maxLength={props.maxLength ?? 60}
          onChange={(e) => setValue(e.target.value)}
          className="block min-h-12 w-full rounded-lg border border-line bg-raised px-3 text-base focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
        />
      </div>
      <Button type="submit" disabled={props.disabled || !value.trim()}>
        {props.submitLabel}
      </Button>
      {props.onCancel && (
        <Button variant="ghost" onClick={props.onCancel}>
          {t('common.cancel')}
        </Button>
      )}
    </form>
  )
}
