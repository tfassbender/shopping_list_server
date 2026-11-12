import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { ApiError } from '../api/client'
import { errorMessage, t } from '../i18n/messages'
import { Icon } from './Icon'

/*
 * Small shared building blocks so pages look consistent. Touch targets are at least 44px high
 * (`min-h-11` and up), the recommended minimum for fingers on mobile. Colors come from the theme tokens
 * in index.css (`brand`, `muted`, `line`, ...), which switch with dark mode by themselves.
 */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-ink hover:brightness-95 disabled:opacity-50',
  secondary: 'border border-line bg-surface hover:bg-raised disabled:opacity-50',
  danger: 'bg-danger text-white hover:brightness-95 disabled:opacity-50',
  ghost: 'hover:bg-raised disabled:opacity-50',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition disabled:cursor-not-allowed ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  )
}

const inputClass =
  'block min-h-12 w-full rounded-lg border border-line bg-raised px-3 text-base text-fg focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none'

/*
 * Fields get a <label> linked by id (`htmlFor`) instead of wrapping the control: a wrapped <select> would
 * otherwise get its option texts added to its accessible name.
 */
export function TextField({
  label,
  className = '',
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <div className={`block ${className}`}>
      <label htmlFor={inputId} className="mb-1 block text-sm text-muted">
        {label}
      </label>
      <input id={inputId} className={inputClass} {...props} />
    </div>
  )
}

export function SelectField(props: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; className?: string }) {
  const id = useId()
  return (
    <div className={`block ${props.className ?? ''}`}>
      <label htmlFor={id} className="mb-1 block text-sm text-muted">
        {props.label}
      </label>
      <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value)} className={inputClass}>
        {props.children}
      </select>
    </div>
  )
}

/** Shows a translated message for a failed request (or nothing). */
export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  const text = error instanceof ApiError ? errorMessage(error.code) : t('error.unknown')
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {text}
    </p>
  )
}

export function SuccessText({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg bg-raised px-3 py-2 text-sm text-accent">
      {children}
    </p>
  )
}

/** A failed load with a retry button (e.g. server unreachable and nothing cached yet). */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="space-y-2 py-4">
      <ErrorText error={error} />
      <Button variant="secondary" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  )
}

export function Loading() {
  return <p className="py-4 text-muted">{t('common.loading')}</p>
}

/** Small uppercase heading above a group of rows ("Members", "Display", a category, ...). */
export function SectionTitle({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <h2 className="mt-6 mb-1 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
      {color && <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </h2>
  )
}

/** Muted explanation text between rows. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="py-3 text-muted">{children}</p>
}

/**
 * One full-width row of a page (settings, members, spaces): a main text with an optional hint below, and
 * something at the end (value, chevron, button). With `onClick` the whole row is a button.
 */
export function Row(props: {
  title: ReactNode
  hint?: ReactNode
  start?: ReactNode
  end?: ReactNode
  onClick?: () => void
  danger?: boolean
  chevron?: boolean
}) {
  const content = (
    <>
      {props.start}
      {/*
        * The text keeps at least 45% of the row, so a long value at the end (email, name) is cut off
        * instead of squeezing the label word by word; long words wrap anywhere instead of overflowing.
        */}
      <span className={`flex-1 wrap-anywhere ${props.end ? 'min-w-[45%]' : 'min-w-0'}`}>
        <span className={`block ${props.danger ? 'text-danger' : ''}`}>{props.title}</span>
        {props.hint && <span className="block text-sm text-muted">{props.hint}</span>}
      </span>
      {props.end}
      {props.chevron && <ChevronRight />}
    </>
  )
  const className = 'flex min-h-15 w-full items-center gap-3 border-b border-line px-2 py-2 text-left'
  return props.onClick ? (
    <button type="button" onClick={props.onClick} className={`${className} hover:bg-raised`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  )
}

export function ChevronRight() {
  return (
    <Icon name="next" className="shrink-0 text-muted" />
  )
}

/** A round initial (members, spaces). */
export function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-raised font-bold text-accent">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

/**
 * A few exclusive choices side by side (language, theme, access). `aria-pressed` tells screen readers
 * which one is chosen.
 */
export function Segmented<T extends string>(props: { label: string; options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div role="group" aria-label={props.label} className="flex rounded-xl border border-line bg-raised p-0.5">
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === props.value}
          onClick={() => props.onChange(option.value)}
          className="min-h-11 flex-1 rounded-[10px] px-2 aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:shadow-sm"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** On/off switch: a styled checkbox, so keyboard and screen readers work as usual. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <span className={`relative inline-block h-[30px] w-[52px] shrink-0 ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-line transition peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent" />
      <span className="pointer-events-none absolute top-[3px] left-[3px] size-6 rounded-full bg-white shadow transition peer-checked:translate-x-[22px]" />
    </span>
  )
}

/**
 * The round + button at the bottom right of the content column: the one way to add something on a page
 * (item, space, token).
 */
export function Fab({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10">
      <div className="mx-auto flex max-w-2xl justify-end px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg hover:brightness-95 disabled:opacity-50"
        >
          <Icon name="add" className="text-[1.6rem]" />
        </button>
      </div>
    </div>
  )
}
