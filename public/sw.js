/* Braino Games — offline shell.
 *
 * Served from the root so its scope is the whole site. Hand-written and
 * hand-versioned: generating a precache manifest would mean a build plugin,
 * and the caching this needs is simple enough not to earn one.
 *
 * The strategy follows from how Vite names things:
 *
 *   /assets/*    content-hashed, so a given URL's bytes never change —
 *                cache-first, and a hit can be trusted forever.
 *   navigations  index.html is NOT hashed; it is the thing that points at the
 *                current hashed assets. Network-first, so an open app picks up
 *                a deploy on its next launch, with the cache as the offline
 *                fallback.
 *   /api/*       the leaderboard. Never cached, in either direction — a board
 *                served from disk would be a lie, and a queued submission
 *                would be a duplicate.
 *
 * Bump VERSION when this file changes; activate drops every cache that does
 * not match, which is the only thing that clears old entries.
 */

const VERSION = 'braino-v1'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`

/* The shell has to be here before the first offline launch, so it cannot wait
 * for someone to request it. Everything else populates as it is used. */
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // Individually, not addAll: one 404 would otherwise abort the whole
      // install and leave the app with no offline shell at all.
      .then((cache) =>
        Promise.all(
          PRECACHE.map((path) =>
            cache.add(new Request(path, { cache: 'reload' })).catch(() => {}),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !name.startsWith(VERSION))
            .map((name) => caches.delete(name)),
        ),
      )
      // Take over open pages now. Safe mid-round: whatever the page has
      // already loaded stays loaded, and nothing here reloads it.
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(cacheFirst(request))
})

/** Fresh if the network answers, last known good if it does not. */
async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL)
      // Under '/', because that is what the next cold start will ask for:
      // the route lives in the hash, which never reaches the server.
      cache.put('/', response.clone())
    }
    return response
  } catch {
    const cached = (await caches.match(request)) ?? (await caches.match('/'))
    if (cached) return cached
    throw new Error('offline, and no shell cached yet')
  }
}

/** A hit is authoritative; a miss is fetched and kept. */
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  // Only own, complete, successful responses. A 206 would poison the cache
  // with a fragment, and an opaque cross-origin one cannot be inspected.
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(ASSETS)
    cache.put(request, response.clone())
  }
  return response
}
