import { useEffect, useSyncExternalStore } from 'react'

/*
 * "Keep the screen on": while the app is open and visible, the phone doesn't dim or lock the screen
 * (handy with a list in one hand and the trolley in the other). Uses the browser's Screen Wake Lock API.
 * The setting is per device (stored in the browser, not in the account): whether the screen should stay
 * on depends on the phone, not the person. Default: on.
 */

const STORAGE_KEY = 'shoppinglist.keepScreenOn'
const listeners = new Set<() => void>()

/** Browsers without the API (or outside HTTPS) don't offer the setting at all. */
export function isKeepScreenOnSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

export function keepScreenOnEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true // storage unavailable (private mode): default
  }
}

export function setKeepScreenOn(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    // storage unavailable: applies until the page is reloaded
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The setting as React state; changes (e.g. from the settings page) take effect at once. */
export function useKeepScreenOnSetting(): boolean {
  return useSyncExternalStore(subscribe, keepScreenOnEnabled)
}

/**
 * Holds the wake lock while the setting is on. The browser releases the lock whenever the page is hidden
 * (other app, screen off), so it is requested again each time the page becomes visible.
 */
export function KeepScreenOn() {
  const enabled = useKeepScreenOnSetting()
  useEffect(() => {
    if (!enabled || !isKeepScreenOnSupported()) return
    let sentinel: WakeLockSentinel | null = null
    let active = true
    const request = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (active) sentinel = lock
        else void lock.release() // the setting was switched off while the request was running
      } catch {
        // refused (e.g. battery saver): the screen just behaves as usual
      }
    }
    void request()
    document.addEventListener('visibilitychange', request)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', request)
      void sentinel?.release()
    }
  }, [enabled])
  return null
}
