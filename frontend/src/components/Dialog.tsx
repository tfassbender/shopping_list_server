import { useEffect, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n/messages'
import { Button } from './ui'

/**
 * Modal dialog: a sheet sliding up from the bottom on phones (thumb-friendly), a centered box from `sm`
 * up. A click on the dark backdrop or Escape closes it; `aria-modal` tells screen readers that the page
 * behind is inactive. With `onSubmit` the content is a form (Enter submits).
 *
 * The dialog is rendered into <body> (a React portal), not where it is used: a dialog opened from inside a
 * form would otherwise be a form inside a form (invalid HTML, the inner one breaks), and a moved parent
 * (e.g. a sortable row with a CSS transform) would shift its `position: fixed`.
 */
export function Dialog(props: {
  title: string
  onClose: () => void
  children: ReactNode
  onSubmit?: () => void
  role?: 'dialog' | 'alertdialog'
}) {
  const { onClose } = props
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const panelClass =
    'max-h-[90dvh] w-full space-y-4 overflow-y-auto rounded-t-2xl bg-surface px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-fg shadow-xl sm:max-w-md sm:rounded-2xl sm:pb-5'
  const content = (
    <>
      <h2 className="text-xl font-bold">{props.title}</h2>
      {props.children}
    </>
  )
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      {props.onSubmit ? (
        <form
          role={props.role ?? 'dialog'}
          aria-modal="true"
          aria-label={props.title}
          className={panelClass}
          onClick={(e) => e.stopPropagation()}
          onSubmit={(event: FormEvent) => {
            event.preventDefault() // React handles the form; no page reload
            // React passes events up the component tree even across the portal: without this, a form
            // around the place where the dialog is used would be submitted as well.
            event.stopPropagation()
            props.onSubmit!()
          }}
        >
          {content}
        </form>
      ) : (
        <div role={props.role ?? 'dialog'} aria-modal="true" aria-label={props.title} className={panelClass} onClick={(e) => e.stopPropagation()}>
          {content}
        </div>
      )}
    </div>,
    document.body,
  )
}

/** Buttons at the bottom of a dialog, right-aligned. */
export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2 pt-1">{children}</div>
}

/**
 * Confirmation for destructive actions (delete, remove, leave). Replaces the browser's `confirm()`,
 * which looks foreign and can't be styled.
 */
export function ConfirmDialog(props: {
  title: string
  text: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog title={props.title} onClose={props.onClose} role="alertdialog">
      <p className="text-muted">{props.text}</p>
      <DialogActions>
        <Button variant="ghost" onClick={props.onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            props.onConfirm()
            props.onClose()
          }}
        >
          {props.confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
