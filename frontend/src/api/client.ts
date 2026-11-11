import { clearSession, getSession } from '../auth/session'

/** Error body returned by the backend for every failed request (see RestExceptionMapper). */
export interface ApiErrorBody {
  code: string
  message?: string
  errorId?: string
}

/** A failed API call. `code` is the stable backend error code, `status` the HTTP status (0 = network error). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.status = status
    this.code = code
  }
}

/**
 * Sends a JSON request to the backend and returns the parsed response body. Adds the session token if
 * logged in; a 401 on an authenticated request means the session is gone, so the user is logged out.
 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession()
  const authHeader: Record<string, string> = session ? { Authorization: `Bearer ${session.token}` } : {}
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...authHeader, ...init.headers },
    })
  } catch (error) {
    throw new ApiError(0, 'NETWORK_ERROR', error instanceof Error ? error.message : undefined)
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null
    if (response.status === 401 && session) {
      clearSession()
    }
    throw new ApiError(response.status, body?.code ?? `HTTP_${response.status}`, body?.message)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

/** Shorthands for JSON bodies. */
export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = void>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
}
