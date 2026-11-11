/**
 * All user-facing texts in one place. German/English support (Phase 10) will replace this module with a
 * real i18n library; components only use `t(...)`, so they won't need to change.
 */
const en = {
  appName: 'Shopping List',
  'home.title': 'Welcome',
  'home.subtitle': 'Your shared shopping lists - coming soon.',
  'health.checking': 'Checking connection...',
  'health.online': 'Connected to server (version {version})',
  'health.offline': 'Server not reachable',
  'notFound.title': 'Page not found',
  'notFound.back': 'Back to start',
} as const

export type MessageKey = keyof typeof en

/** Returns the text for `key`, replacing `{name}` placeholders with values from `params`. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return en[key].replace(/\{(\w+)}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}
