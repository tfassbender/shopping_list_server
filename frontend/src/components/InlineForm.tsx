import { useState, type FormEvent } from 'react'
import { t } from '../i18n/messages'
import { Button } from './ui'

/**
 * A one-field form with a submit button (create / rename something). Clears itself after submitting
 * when `clearOnSubmit` is set.
 */
export function InlineForm(props: {
  label: string
  submitLabel: string
  initialValue?: string
  maxLength?: number
  disabled?: boolean
  clearOnSubmit?: boolean
  onSubmit: (value: string) => void
  onCancel?: () => void
}) {
  const [value, setValue] = useState(props.initialValue ?? '')

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    props.onSubmit(trimmed)
    if (props.clearOnSubmit) setValue('')
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        aria-label={props.label}
        placeholder={props.label}
        value={value}
        maxLength={props.maxLength ?? 60}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-base focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
      />
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
