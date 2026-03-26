const CACHE_NAME = 'lexora-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://api.fontshare.com/v2/css?f[]=clash-display@400,600,700&f[]=cabinet-grotesk@300,400,500,700&display=swap',
];

// ── Installation : mise en cache des assets statiques ─────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// ── Activation : suppression des anciens caches ───────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch : stratégie Network First pour l'API, Cache First pour le reste
self.addEventListener('fetch', event => {
  // Ignorer les requêtes non-HTTP (chrome-extension://, etc.)
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // Les appels API ne sont jamais mis en cache
  if (url.pathname.startsWith('/api') || url.hostname.includes('onrender.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Les fonts Fontshare : cache first
  if (url.hostname === 'api.fontshare.com' || url.hostname.includes('fontshare.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Le reste : network first, fallback cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Message pour forcer la mise à jour ───────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
