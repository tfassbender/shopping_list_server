import { useSyncExternalStore, type ReactNode } from 'react'
import { t } from '../i18n/messages'
import { syncEngine } from './engine'

function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  const unsubscribeEngine = syncEngine.subscribe(callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
    unsubscribeEngine()
  }
}

/**
 * True if the server is presumably reachable: the browser reports a network and the last sync attempt
 * didn't fail with a network error. (`navigator.onLine` alone is optimistic - a WLAN without internet
 * counts as online.)
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine && syncEngine.status !== 'offline')
}

/**
 * Wraps screens that need the server (space management, categories, shops, settings). Offline, all its
 * form controls are disabled - a disabled `<fieldset>` does that for every input and button inside -
 * and a short hint explains why.
 */
export function OnlineOnly({ children }: { children: ReactNode }) {
  const online = useOnline()
  return (
    <>
      {!online && (
        <p role="note" className="mb-3 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {t('offline.needsConnection')}
        </p>
      )}
      <fieldset disabled={!online} className="min-w-0 disabled:opacity-60">
        {children}
      </fieldset>
    </>
  )
}
