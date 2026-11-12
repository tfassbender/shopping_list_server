import { useEffect, useRef, type FormEvent, type ReactNode, type RefObject } from 'react'
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
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useDialogFocus(panel)

  const panelClass =
    'outline-none max-h-[90dvh] w-full space-y-4 overflow-y-auto rounded-t-2xl bg-surface px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-fg shadow-xl sm:max-w-md sm:rounded-2xl sm:pb-5'
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
          ref={panel as RefObject<HTMLFormElement>}
          tabIndex={-1}
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
        <div ref={panel as RefObject<HTMLDivElement>} tabIndex={-1} role={props.role ?? 'dialog'} aria-modal="true" aria-label={props.title} className={panelClass} onClick={(e) => e.stopPropagation()}>
          {content}
        </div>
      )}
    </div>,
    document.body,
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keyboard and screen-reader focus for a modal: moves into the dialog when it opens (unless a field has
 * `autoFocus`), Tab cycles inside it instead of reaching the page behind, and the element that opened
 * the dialog gets the focus back when it closes.
 */
function useDialogFocus(panel: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = panel.current
    if (element && !element.contains(document.activeElement)) element.focus({ preventScroll: true })

    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !element) return
      const focusable = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', trapTab)
    return () => {
      window.removeEventListener('keydown', trapTab)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [panel])
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
