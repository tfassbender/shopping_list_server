/*
 * Service worker: lets the app start without connection. Hand-written (no build plugin) because the
 * needs are small:
 * - page loads (navigation): network first, fall back to the cached app shell when offline,
 * - /assets/ (JS/CSS): cache first - their names contain a content hash, so they never change,
 * - other files (icons, manifest): network first, cached copy when offline,
 * - /api and /q are never cached (the app keeps its own offline data in IndexedDB).
 * Bump CACHE to drop old caches after incompatible changes.
 */
const CACHE = 'shoppinglist-shell-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('/')))
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
    event.respondWith(networkFirst(request, '/'))
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
  } else {
    // Icons, manifest, favicon: fixed names, so always try for the current version first.
    event.respondWith(networkFirst(request, request))
  }
})

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
