import { vi } from 'vitest'
import { parseSse, startLiveUpdates, type SpaceEvent } from './liveUpdates'

describe('parseSse', () => {
  it('returns complete events and keeps the unfinished rest', () => {
    const { data, rest } = parseSse('data: {"a":1}\n\n: comment\ndata: {"b":2}\r\n\r\ndata: {"c"')
    expect(data).toEqual(['{"a":1}', '{"b":2}'])
    expect(rest).toBe('data: {"c"')
  })

  it('joins multi-line data and skips events without data', () => {
    expect(parseSse('event: x\n\ndata: line1\ndata: line2\n\n').data).toEqual(['line1\nline2'])
  })
})

/** A fake streaming response whose chunks the test pushes. */
function streamingResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) })
  const encoder = new TextEncoder()
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    send: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  }
}

describe('startLiveUpdates', () => {
  it('delivers events with the bearer token and reconnects after the stream ends', async () => {
    const first = streamingResponse()
    const second = streamingResponse()
    const fetchImpl = vi.fn().mockResolvedValueOnce(first.response).mockResolvedValueOnce(second.response)
    const events: SpaceEvent[] = []
    const onConnected = vi.fn()
    const stop = startLiveUpdates({ getToken: () => 'jwt', onEvent: (e) => events.push(e), onConnected, fetchImpl, minDelayMs: 1 })

    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1))
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt')
    first.send('data: {"type":"SPACE_CHANGED","spaceId":"s1","seq":3}\n\ndata: {"type":"PI')
    first.send('NG"}\n\n')
    await vi.waitFor(() => expect(events).toEqual([{ type: 'SPACE_CHANGED', spaceId: 's1', seq: 3 }, { type: 'PING' }]))

    first.close()
    await vi.waitFor(() => expect(onConnected).toHaveBeenCalledTimes(2)) // reconnected
    stop()
  })

  it('backs off after network errors and stops on 401', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('', { status: 401 }))
    startLiveUpdates({ getToken: () => 'jwt', onEvent: () => {}, fetchImpl, minDelayMs: 1 })

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fetchImpl).toHaveBeenCalledTimes(2) // no more attempts after 401
  })

  it('does not connect without a session', async () => {
    const fetchImpl = vi.fn()
    startLiveUpdates({ getToken: () => null, onEvent: () => {}, fetchImpl })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
