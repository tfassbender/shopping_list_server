import { useSyncExternalStore } from 'react'
import { de } from './de'
import { en, type MessageKey } from './en'

export type { MessageKey } from './en'
export type Language = 'en' | 'de'

/**
 * All user-facing texts go through `t(...)`. The language is a small observable value: it comes from the
 * user's settings once logged in, before that from the last choice on this device or the browser.
 * The app re-renders on change (see `useLanguage` in App).
 */
const dictionaries: Record<Language, Record<MessageKey, string>> = { en, de }
const STORAGE_KEY = 'shoppinglist.language'
const listeners = new Set<() => void>()
let current: Language = detectLanguage()

function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'de') return stored
  } catch {
    // storage unavailable
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'
}

export function getLanguage(): Language {
  return current
}

export function setLanguage(language: Language) {
  if (language === current) return
  current = language
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // not remembered - fine
  }
  document.documentElement.lang = language
  listeners.forEach((listener) => listener())
}

/** The current language; components using it re-render when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getLanguage,
  )
}

/** Returns the text for `key`, replacing `{name}` placeholders with values from `params`. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return dictionaries[current][key].replace(/\{(\w+)}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/** Text for a backend error code (`error.<CODE>`), falling back to a generic message. */
export function errorMessage(code: string): string {
  const key = `error.${code}`
  return key in en ? t(key as MessageKey) : t('error.unknown')
}

/** For dynamic keys like `settings.theme.${value}`; falls back to the key itself if it is missing. */
export function tDynamic(key: string, params: Record<string, string | number> = {}): string {
  return key in en ? t(key as MessageKey, params) : key
}
