import { vi } from 'vitest'
import { ApiError, apiRequest } from './client'

describe('apiRequest', () => {
  it('returns the parsed JSON body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ a: 1 }), { status: 200 }))

    await expect(apiRequest('/api/x')).resolves.toEqual({ a: 1 })
  })

  it('throws ApiError with the backend error code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'NOT_A_MEMBER', message: 'no' }), { status: 403 }),
    )

    await expect(apiRequest('/api/x')).rejects.toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
  })

  it('throws a NETWORK_ERROR when the server is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await apiRequest('/api/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('NETWORK_ERROR')
  })
})
