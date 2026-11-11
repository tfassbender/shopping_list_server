/** A notification from `GET /api/events`. */
export interface SpaceEvent {
  type: 'SPACE_CHANGED' | 'PING'
  spaceId?: string
  seq?: number
}

/**
 * Splits a server-sent-events text buffer into complete events (separated by a blank line) and returns
 * their `data:` payloads plus the unfinished rest of the buffer.
 */
export function parseSse(buffer: string): { data: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const blocks = normalized.split('\n\n')
  const rest = blocks.pop() ?? ''
  const data = blocks
    .map((block) =>
      block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n'),
    )
    .filter((payload) => payload.length > 0)
  return { data, rest }
}

export interface LiveUpdateOptions {
  url?: string
  getToken: () => string | null
  onEvent: (event: SpaceEvent) => void
  /** Called after every (re)connect - events may have been missed while disconnected. */
  onConnected?: () => void
  fetchImpl?: typeof fetch
  minDelayMs?: number
  maxDelayMs?: number
}

/**
 * Listens to the live update stream. The browser's `EventSource` can't send an `Authorization` header,
 * so the stream is read with `fetch` instead. When the connection drops it reconnects with growing
 * delays (1 s, 2 s, 4 s ... max 30 s). Returns a function that stops listening.
 */
export function startLiveUpdates(options: LiveUpdateOptions): () => void {
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis)
  const minDelay = options.minDelayMs ?? 1000
  const maxDelay = options.maxDelayMs ?? 30_000
  let stopped = false
  let controller: AbortController | null = null
  let delay = minDelay

  async function readStream(response: Response) {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      const parsed = parseSse(buffer)
      buffer = parsed.rest
      for (const payload of parsed.data) {
        try {
          options.onEvent(JSON.parse(payload) as SpaceEvent)
        } catch {
          // ignore malformed events
        }
      }
    }
  }

  async function run() {
    while (!stopped) {
      const token = options.getToken()
      if (!token) return
      controller = new AbortController()
      try {
        const response = await fetchImpl(options.url ?? '/api/events', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        })
        if (response.status === 401 || response.status === 403) return // logged out / not allowed
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
        delay = minDelay
        options.onConnected?.()
        await readStream(response)
      } catch {
        // network error or aborted - retry below unless stopped
      }
      if (stopped) return
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay = Math.min(delay * 2, maxDelay)
    }
  }

  void run()
  return () => {
    stopped = true
    controller?.abort()
  }
}
