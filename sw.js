// ANGEPASST: Cache-Name für die neue App-Version
const APP_CACHE_NAME = 'thixx-pps-robust-v10';
const DOC_CACHE_NAME = 'thixx-docs-v1';

/*
 * WICHTIG: Sicherstellen, dass alle hier gelisteten Pfade erreichbar sind.
 * Fehlende Dateien können die Service Worker-Installation beeinträchtigen,
 * auch wenn safeCacheAddAll einzelne Fehler abfängt.
 */
// ANGEPASST: Alle Pfade auf den neuen Scope /THiXX-PPS/ aktualisiert
const APP_ASSETS_TO_CACHE = [
    '/THiXX-PPS/index.html',
    '/THiXX-PPS/offline.html',
    '/THiXX-PPS/assets/style.css',
    '/THiXX-PPS/assets/app.js',
    '/THiXX-PPS/assets/theme-bootstrap.js',
    '/THiXX-PPS/config.json',
    '/THiXX-PPS/assets/THiXX_Icon_Grau6C6B66_Transparent_192x192.png', // Fallback-Icon
    '/THiXX-PPS/assets/THiXX_Icon_Grau6C6B66_Transparent_512x512.png', // Fallback-Icon
    '/THiXX-PPS/assets/icon-192.png', // O.Thimm Icon (Beispiel)
    '/THiXX-PPS/assets/icon-512.png', // O.Thimm Icon (Beispiel)
    '/THiXX-PPS/assets/PP-192x192.png', // Peter Pohl Icon
    '/THiXX-PPS/assets/PP-512x512.png', // Peter Pohl Icon
    '/THiXX-PPS/lang/de.json',
    '/THiXX-PPS/lang/en.json',
    '/THiXX-PPS/lang/es.json',
    '/THiXX-PPS/lang/fr.json'
];

async function safeCacheAddAll(cache, urls) {
  console.log('[Service Worker] Starting robust caching of assets.');
  const promises = urls.map(url => {
    return cache.add(url).catch(err => {
      console.warn(`[Service Worker] Skipping asset: ${url} failed to cache.`, err);
    });
  });
  await Promise.all(promises);
  console.log(`[Service Worker] Robust caching finished.`);
}

self.addEventListener('install', (event) => {
    // Hinzugefügt: Peter Pohl Icons in die Cache-Liste aufgenommen
    // (Annahme: Die Liste oben wird korrekt gepflegt)
    event.waitUntil(
        caches.open(APP_CACHE_NAME)
            .then((cache) => safeCacheAddAll(cache, APP_ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== APP_CACHE_NAME && cacheName !== DOC_CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // KORREKTUR (PRIO 1): PDF-Caching für 'no-cors' Anfragen (opaque responses).
    // (Keine Änderung an dieser Logik nötig)
    if (url.pathname.endsWith('.pdf')) {
        event.respondWith(
            caches.open(DOC_CACHE_NAME).then(async (cache) => {
                const noCorsRequest = new Request(request.url, { mode: 'no-cors' });
                try {
                    const networkResponse = await fetch(noCorsRequest);
                    cache.put(noCorsRequest, networkResponse.clone());
                    return networkResponse;
                } catch (error) {
                    console.log('[Service Worker] Network fetch for PDF failed, trying cache.');
                    const cachedResponse = await cache.match(noCorsRequest);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    throw error;
                }
            })
        );
        return;
    }
    
    // ÄNDERUNG: "Cache First" für Navigationen
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
          const cachedResponse = await caches.match(request, { ignoreSearch: true });
          if (cachedResponse) {
            return cachedResponse;
          }

          try {
            const networkResponse = await fetch(request);
            return networkResponse;
          } catch (error) {
            console.log('[Service Worker] Navigate fetch failed, falling back to offline page.');
            // ANGEPASST: Pfad zur Offline-Seite im neuen Scope
            return await caches.match('/THiXX-PPS/offline.html');
          }
        })());
        return;
    }

    // Standard-Strategie "Stale-While-Revalidate" für alle anderen Assets
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            const fetchPromise = fetch(request).then(networkResponse => {
                caches.open(APP_CACHE_NAME).then(cache => {
                    if (networkResponse.ok) {
                        cache.put(request, networkResponse.clone());
                    }
                });
                return networkResponse;
            });
            return cachedResponse || fetchPromise;
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'cache-doc') {
        event.waitUntil(
            caches.open(DOC_CACHE_NAME)
                .then(cache => cache.add(new Request(event.data.url, { mode: 'no-cors' })))
                .catch(err => console.error('[Service Worker] Failed to cache doc:', err))
        );
    } else if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
