import { vi } from 'vitest'

type Handler = (body: unknown, url: URL) => { status?: number; body?: unknown } | unknown

/**
 * Mocks `fetch` with a route table like `{ 'POST /api/auth/login': () => ({ ... }) }`. A handler returns
 * the response body (status 200), or `{ status, body }` for other statuses. Unknown routes return 404.
 * Returns the spy, so tests can inspect the calls.
 */
export function mockApi(routes: Record<string, Handler | object>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    const route = routes[`${method} ${url.pathname}`]
    if (route === undefined) {
      return json(404, { code: 'NOT_FOUND', message: `${method} ${url.pathname} not mocked` })
    }
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined
    const result = typeof route === 'function' ? (route as Handler)(requestBody, url) : route
    if (isStatusResult(result)) {
      return result.status === 204 ? new Response(null, { status: 204 }) : json(result.status, result.body)
    }
    return json(200, result)
  })
}

function isStatusResult(value: unknown): value is { status: number; body?: unknown } {
  return typeof value === 'object' && value !== null && 'status' in value && typeof (value as { status: unknown }).status === 'number'
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body ?? null), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Request bodies sent to `METHOD path`, in order. */
export function sentBodies(spy: ReturnType<typeof mockApi>, method: string, path: string): unknown[] {
  return spy.mock.calls
    .filter(([input, init]) => (init?.method ?? 'GET') === method && new URL(String(input), 'http://localhost').pathname === path)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined))
}

export const testUser = {
  id: 'u1',
  email: 'anna@example.com',
  displayName: 'Anna',
  emailVerified: true,
  settings: { language: 'en', theme: 'SYSTEM', checkedItemsToEnd: true, ignoreMergeWarnings: false },
}
