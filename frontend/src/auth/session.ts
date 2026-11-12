/**
 * The login session (JWT) in localStorage, so it survives reloads. A tiny observable store: React reads it
 * with `useSyncExternalStore` (see useSession) and re-renders when it changes, e.g. on logout after a 401.
 */
export interface Session {
  token: string
  expiresAt: string
  /** When this token was received - used to refresh it about once a day ("sliding session"). */
  receivedAt: string
}

const STORAGE_KEY = 'shoppinglist.session'
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

type Listener = () => void
const listeners = new Set<Listener>()
let current: Session | null = load()
/** Where to go after a deliberate logout (see RequireAuth); null after an expired/revoked session. */
let logoutTarget: string | null = null

function load(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function notify() {
  listeners.forEach((listener) => listener())
}

export function getSession(): Session | null {
  return current
}

export function setSession(token: string, expiresAt: string, now = new Date()) {
  current = { token, expiresAt, receivedAt: now.toISOString() }
  logoutTarget = null
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  notify()
}

/**
 * Ends the session. `then` is set for a deliberate logout: the login guard goes there instead of to
 * `/login?redirect=<current page>` (which is meant for an expired session).
 */
export function clearSession(options: { then?: string } = {}) {
  if (current === null) return
  current = null
  logoutTarget = options.then ?? null
  localStorage.removeItem(STORAGE_KEY)
  notify()
}

export function getLogoutTarget(): string | null {
  return logoutTarget
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isExpired(session: Session, now = new Date()): boolean {
  return new Date(session.expiresAt).getTime() <= now.getTime()
}

/** True if the token is older than a day: then the app exchanges it for a fresh one. */
export function shouldRefresh(session: Session, now = new Date()): boolean {
  return !isExpired(session, now) && now.getTime() - new Date(session.receivedAt).getTime() > REFRESH_AFTER_MS
}

/** Test helper: re-read localStorage (the module caches the session). */
export function reloadSessionForTests() {
  current = load()
  notify()
}
