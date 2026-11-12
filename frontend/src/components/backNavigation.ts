import { useEffect } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'

/*
 * The back arrow in the header should behave like the browser/Android back button where it can: if the
 * page before this one in the history is where the arrow leads, it goes back (no new history entry, so
 * a later system back doesn't lead "forward" into the page just left). Otherwise (deep link, or the
 * arrow leads elsewhere) it replaces the current entry with the target.
 *
 * The router doesn't expose the history, so the app remembers per history entry (`location.key`) which
 * path came before it.
 */
const previousPathOf = new Map<string, string>()
let last: { key: string; path: string } | null = null

/** Records the history entries; called once in the app frame. */
export function useTrackHistory() {
  const location = useLocation()
  const type = useNavigationType()
  useEffect(() => {
    if (last?.key === location.key) return
    if (last && type === 'PUSH') previousPathOf.set(location.key, last.path)
    if (last && type === 'REPLACE') {
      const before = previousPathOf.get(last.key)
      if (before !== undefined) previousPathOf.set(location.key, before)
    }
    last = { key: location.key, path: location.pathname }
  }, [location.key, location.pathname, type])
}

/** Navigates "back" to [target] as described above. */
export function useGoBack(target: string): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    if (previousPathOf.get(location.key) === target) navigate(-1)
    else navigate(target, { replace: true })
  }
}
