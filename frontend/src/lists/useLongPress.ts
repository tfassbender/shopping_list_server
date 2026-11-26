import { useEffect, useRef, type PointerEvent } from 'react'

/** How long a press must last to count as a long press. */
export const LONG_PRESS_MS = 500

/** A finger moving further than this is scrolling, not pressing. */
const MOVE_TOLERANCE_PX = 10

/**
 * Tap → `onClick`, press and hold → `onLongPress` (fired while the finger is still down, like Android's
 * long press). Spread the returned handlers on a button. Keyboard use (Enter / Space) stays a normal click.
 *
 * Pointer events cover mouse, touch and pen alike. Scrolling a touch screen makes the browser send
 * `pointercancel`, which stops the timer, so scrolling a list never opens anything.
 */
export function useLongPress(onLongPress: () => void, onClick: () => void) {
  const timer = useRef<number | undefined>(undefined)
  const start = useRef<{ x: number; y: number } | null>(null)

  const cancel = () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    start.current = null
  }
  useEffect(() => cancel, [])

  return {
    onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return // only the main mouse button (touch and pen also report 0)
      cancel()
      start.current = { x: event.clientX, y: event.clientY }
      timer.current = window.setTimeout(() => {
        cancel()
        swallowClickOfThisPress()
        navigator.vibrate?.(30) // short haptic feedback where supported (Android)
        onLongPress()
      }, LONG_PRESS_MS)
    },
    onPointerMove(event: PointerEvent) {
      if (!start.current) return
      if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > MOVE_TOLERANCE_PX) cancel()
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    // A long touch would otherwise open the browser's own menu (copy, share, ...).
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    onClick,
  }
}

/**
 * Lifting the finger after a long press can still produce a click. It must neither check the item nor hit
 * the backdrop of the dialog that just opened (which would close it again). So the next click is caught
 * before anything else sees it (capture phase on `window`) - but only until shortly after the release:
 * touch browsers often send no click at all after a long press, and a later real tap must still work.
 */
function swallowClickOfThisPress() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', swallow, true)
  const release = () => {
    window.removeEventListener('pointerup', release, true)
    window.removeEventListener('pointercancel', release, true)
    window.setTimeout(() => window.removeEventListener('click', swallow, true), 100)
  }
  window.addEventListener('pointerup', release, true)
  window.addEventListener('pointercancel', release, true)
}
