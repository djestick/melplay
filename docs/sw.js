const CACHE_NAME = 'melplay-cache-v2'
const registrationUrl = new URL(self.registration.scope)
const scopePath = registrationUrl.pathname.endsWith('/')
  ? registrationUrl.pathname
  : `${registrationUrl.pathname}/`
const AUTH_PATH_PREFIXES = ['__/auth', '__/firebase', 'firebase-auth-sw.js']

const OFFLINE_URLS = [
  self.registration.scope,
  `${self.registration.scope}index.html`,
  `${self.registration.scope}manifest.webmanifest`,
  `${self.registration.scope}icons/melplay-icon.svg`,
  `${self.registration.scope}icons/apple-touch-icon.png`,
  `${self.registration.scope}vite.svg`,
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  const requestURL = new URL(event.request.url)
  const requestPath = requestURL.pathname

  if (requestURL.origin !== self.location.origin) {
    return
  }

  const shouldBypassCache = AUTH_PATH_PREFIXES.some((prefix) => {
    const scopedPrefix = `${scopePath}${prefix}`
    if (requestPath.startsWith(scopedPrefix)) {
      return true
    }

    if (scopePath !== '/' && requestPath.startsWith(`/${prefix}`)) {
      return true
    }

    return false
  })

  if (shouldBypassCache) {
    return
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(`${self.registration.scope}index.html`)),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached
      }

      return fetch(event.request)
        .then((response) => {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
          return response
        })
        .catch(() => caches.match(event.request))
    }),
  )
})
