/*
 * Service worker: lets the app start without connection. Hand-written (no build plugin) because the
 * needs are small:
 * - page loads (navigation): network first, fall back to the cached app shell when offline. Every new
 *   index.html is cached together with the JS/CSS it references (old ones are dropped): the worker is
 *   registered only after the first page load, so it never saw those requests itself,
 * - /assets/ (JS/CSS): cache first - their names contain a content hash, so they never change,
 * - other files (icons, manifest): network first, cached copy when offline,
 * - /api and /q are never cached (the app keeps its own offline data in IndexedDB).
 * Bump CACHE to drop old caches after incompatible changes.
 */
const CACHE = 'shoppinglist-shell-v3'

self.addEventListener('install', (event) => {
  event.waitUntil(fetch('/').then((response) => (response.ok ? cacheShell(response) : undefined)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/q/')) return

  if (request.mode === 'navigate') {
    // Every route serves the same index.html (SPA), so one cached copy under '/' covers all of them.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) event.waitUntil(cacheShell(response.clone()))
          return response
        })
        .catch(() => caches.match('/')),
    )
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
  } else {
    // Icons, manifest, favicon: fixed names, so always try for the current version first.
    event.respondWith(networkFirst(request, request))
  }
})

/** Caches index.html under '/' plus the hashed assets it references; drops assets of older builds. */
async function cacheShell(indexResponse) {
  const html = await indexResponse.clone().text()
  const assets = [...new Set(html.match(/\/assets\/[^"']+/g) ?? [])]
  const cache = await caches.open(CACHE)
  const missing = []
  for (const asset of assets) if (!(await cache.match(asset))) missing.push(asset)
  await cache.addAll(missing)
  await cache.put('/', indexResponse)
  const keep = new Set(assets)
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname
    if (path.startsWith('/assets/') && !keep.has(path)) await cache.delete(request)
  }
}

/** Network first; the answer is cached under [cacheKey], which is used when the network fails. */
function networkFirst(request, cacheKey) {
  return fetch(request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(cacheKey, copy))
      }
      return response
    })
    .catch(() => caches.match(cacheKey))
}

function cacheFirst(request) {
  return caches.match(request).then(
    (cached) =>
      cached ||
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      }),
  )
}
