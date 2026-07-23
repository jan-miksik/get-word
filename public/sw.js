const VERSION = new URL(self.location.href).searchParams.get('build') || 'v1';
const STATIC_CACHE = `get-word-static-${VERSION}`;
const PAGES_CACHE = `get-word-pages-${VERSION}`;
const RUNTIME_CACHE = `get-word-runtime-${VERSION}`;
const ACTIVE_LIST_AUDIO_CACHE = 'get-word-active-list-audio-v1';
let audioCacheEnabled = true;

const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/get-word-logo.svg',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      try {
        await cache.addAll(PRECACHE_URLS);
      } catch {
        // Some requests (like '/') may fail during install depending on deploy/runtime.
        // This should never block install.
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('get-word-') || k.startsWith('wordlink-'))
          .filter((k) => k !== ACTIVE_LIST_AUDIO_CACHE)
          .map((k) => caches.delete(k))
      );
      const cache = await caches.open(STATIC_CACHE);
      try {
        await cache.addAll(PRECACHE_URLS);
      } catch {
        // Some requests may fail during activation depending on deploy/runtime.
        // This should never block the new worker from taking control.
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  // Sent by the client once it's safe to swap in the new build: when the page
  // already loaded the new bundle, or when a long-lived session returns to the
  // foreground. Installs stay passive, so updates never reload the page or
  // replay animations mid-interaction.
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data && event.data.type === 'GET_WORD_AUDIO_CACHE_PREFERENCE') {
    audioCacheEnabled = event.data.enabled !== false;
  }
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

// The Cache API rejects partial (206) responses and only stores basic/cors/
// default response types. Range requests (audio/video seeking) yield 206, so
// guard every cache.put with this to avoid unhandled "put on Cache" rejections.
function isCacheable(response) {
  return (
    !!response &&
    response.status === 200 &&
    response.type !== 'opaqueredirect' &&
    response.type !== 'partial'
  );
}

function isApiPath(pathname) {
  return pathname.startsWith('/api/') || pathname.startsWith('/api');
}

function isAudioApiPath(pathname) {
  return pathname.startsWith('/api/audio/');
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/speech/') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/favicon-') ||
    /\.(?:png|jpg|jpeg|webp|avif|gif|svg|ico|woff2?)$/.test(pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) {
    // Whole-list warming stores successful Arweave responses directly under
    // their gateway URLs. Media elements issue a new cross-origin request on
    // playback; without this branch that request bypasses Cache API and hits
    // the gateway again. Serve only real audio subresource requests here so
    // unrelated cross-origin traffic keeps the browser's default behavior.
    if (request.destination !== 'audio' || !audioCacheEnabled) return;
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open(ACTIVE_LIST_AUDIO_CACHE);
          const cached = await cache.match(request, { ignoreVary: true });
          if (cached) return cached;
        } catch {
          // Cache API can fail in private mode; keep normal media loading.
        }
        return fetch(request).catch(() => Response.error());
      })()
    );
    return;
  }
  if (isAudioApiPath(url.pathname)) {
    event.respondWith(
      (async () => {
        if (!audioCacheEnabled) {
          return fetch(request).catch(() => Response.error());
        }
        const cache = await caches.open(ACTIVE_LIST_AUDIO_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (isCacheable(response)) {
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          return Response.error();
        }
      })()
    );
    return;
  }
  if (isApiPath(url.pathname)) return;

  // Navigations: network-first, then cached page, then offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (isCacheable(response)) {
            const cache = await caches.open(PAGES_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cache = await caches.open(PAGES_CACHE);
          const cached = await cache.match(request);
          return cached || (await caches.match('/offline.html'));
        }
      })()
    );
    return;
  }

  // Static assets: cache-first.
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (isCacheable(response)) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })()
    );
    return;
  }

  // Everything else (same-origin GET): stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((response) => {
          if (isCacheable(response)) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      return cached || (await fetchPromise) || (await caches.match('/offline.html'));
    })()
  );
});
