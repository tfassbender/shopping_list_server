import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { ApiError } from '../api/client'
import { errorMessage, t } from '../i18n/messages'

/*
 * Small shared building blocks so pages look consistent. Touch targets are at least 44px high
 * (`min-h-11`), the recommended minimum for fingers on mobile.
 */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-green-600 text-white hover:bg-green-700 disabled:bg-green-400 dark:bg-green-700 dark:hover:bg-green-600',
  secondary:
    'border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400',
  ghost: 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-medium transition-colors disabled:cursor-not-allowed ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  )
}

export function TextField({
  label,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <input
        className="block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base focus:border-green-600 focus:ring-2 focus:ring-green-600/30 focus:outline-none dark:border-gray-600 dark:bg-gray-900"
        {...props}
      />
    </label>
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
    <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
      {children}
    </p>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${className}`}>
      {children}
    </div>
  )
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="text-2xl font-bold">{children}</h2>
      {action}
    </div>
  )
}

/** A failed load with a retry button (e.g. server unreachable and nothing cached yet). */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="space-y-2">
      <ErrorText error={error} />
      <Button variant="secondary" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  )
}

export function Loading() {
  return <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
}
