/**
 * Service Worker for Yoga Vasishtha PWA
 * Provides offline functionality and install prompts
 */

const CACHE_NAME = 'yoga-vasishtha-core-v1';
const RUNTIME_CACHE = 'yoga-vasishtha-runtime-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/app.css',
  '/manifest.json',
  '/assets/icon.png',
  // Include gsync files for offline support but use network-first strategy
  // TrueHeart cloud sync files (replaced gsync)
  '/trueheart-integration.js',
  '/trueheart-ui.js',
  '/trueheart-style.css',
  '/trueheart-loader.js'
];

// Files to preload for full offline use
const DATA_PRELOAD = [
  '/Yoga-Vasishtha-Devanagari-Lexicon.json',
  '/Yoga-Vasishtha-IAST-Lexicon.json',
  '/Yoga-Vasishtha-Sanskrit-Passages.json',
  '/Yoga-Vasishtha-Words-Passages-Mapping.json'
];

const EPUB_PRELOAD = [
  '/epub/Yoga-Vasishtha-V1.epub',
  '/epub/Yoga-Vasishtha-V2-P1of2.epub',
  '/epub/Yoga-Vasishtha-V2-P2of2.epub',
  '/epub/Yoga-Vasishtha-V3-P1of2.epub',
  '/epub/Yoga-Vasishtha-V3-P2of2.epub',
  '/epub/Yoga-Vasishtha-V4-P1of2.epub',
  '/epub/Yoga-Vasishtha-V4-P2of2.epub'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('📦 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('📦 Caching app resources');
        await cache.addAll(urlsToCache.map(url => (url === '/' ? '/index.html' : url)));
        // Attempt to preload data files and epubs into runtime cache (non-fatal)
        try {
          const runtime = await caches.open(RUNTIME_CACHE);
          // preload data
          await Promise.all(DATA_PRELOAD.map(async (p) => {
            try {
              const r = await fetch(p);
              if (r && r.status === 200) {
                await runtime.put(p, r.clone());
                console.log('💾 Preloaded data file:', p);
              }
            } catch (e) {
              console.warn('⚠️ Failed to preload data file', p, e && e.message);
            }
          }));
          // preload epubs (may be large) - fire-and-forget to avoid blocking install
          (function preloadEpubs() {
            Promise.all(EPUB_PRELOAD.map(async (p) => {
              try {
                const r = await fetch(p);
                if (r && r.status === 200) {
                  await runtime.put(p, r.clone());
                  console.log('💾 Preloaded epub:', p);
                }
              } catch (e) {
                console.warn('⚠️ Failed to preload epub', p, e && e.message);
              }
            })).catch(e => console.warn('⚠️ EPUB preloading failed', e && e.message));
          })();
        } catch (e) {
          console.warn('⚠️ Preloading step failed', e && e.message);
        }
      })
      .catch((error) => {
        console.error('📦 Cache installation failed:', error);
        // Continue installation even if some resources fail to cache
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('🔄 Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip external URLs (Google APIs, etc.)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Check if this is a sync-related file that should use network-first strategy
        const url = event.request.url;
        const isSyncFile = url.includes('trueheart-') || url.includes('sync');

        if (isSyncFile) {
          // Network-first strategy for sync files to ensure fresh auth state
          console.log('🌐 Network-first for sync file:', url);
          return fetch(event.request)
            .then((networkResponse) => {
              // Cache the fresh response
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => {
                    cache.put(event.request, responseToCache);
                    console.log('💾 Updated sync file cache:', url);
                  });
              }
              return networkResponse;
            })
            .catch(() => {
              // Offline fallback: serve from cache if available
              if (response) {
                console.log('📱 Offline: serving sync file from cache:', url);
                return response;
              } else {
                console.log('❌ Offline: sync file not cached, sync features unavailable');
                // Return a minimal response that disables sync gracefully
                return new Response('// Sync unavailable offline', {
                  status: 200,
                  headers: { 'Content-Type': 'application/javascript' }
                });
              }
            });
        }

        // Cache-first strategy for other resources
        if (response) {
          console.log('📱 Serving from cache:', event.request.url);
          return response;
        }

        // Fetch from network
        console.log('🌐 Fetching from network:', event.request.url);
        return fetch(event.request)
          .then((response) => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone response for caching
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
                console.log('💾 Cached new resource:', event.request.url);
              });

            return response;
          })
          .catch((error) => {
            console.log('❌ Network fetch failed:', event.request.url, error);
            
            // Return offline page for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            
            throw error;
          });
      })
  );
});

// Handle messages from main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('🔄 Skipping waiting, activating new service worker');
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

// Background sync for Google Drive when online
self.addEventListener('sync', (event) => {
  if (event.tag === 'trueheart-sync') {
    console.log('🔄 Background sync triggered for TrueHeart');
    event.waitUntil(
      // Trigger a sync operation when back online
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'BACKGROUND_SYNC',
            action: 'trueheart-sync'
          });
        });
      })
    );
  }
});

// Push notifications (for future cloud sync notifications)
self.addEventListener('push', (event) => {
  console.log('📬 Push notification received');
  
  const options = {
    body: 'Your reading progress has been synced to cloud storage',
    icon: '/assets/icon.png',
    badge: '/assets/icon.png',
    tag: 'sync-notification'
  };

  event.waitUntil(
    self.registration.showNotification('Yoga Vasishtha', options)
  );
});

console.log('🚀 Service Worker loaded successfully');
