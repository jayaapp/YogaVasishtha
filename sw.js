/**
 * Service Worker for Yoga Vasishtha PWA
 * Provides offline functionality and install prompts
 */

const CACHE_NAME = 'yoga-vasishtha-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/app.css',
  '/manifest.json',
  '/assets/icon.png',
  // Include gsync files for offline support but use network-first strategy
  '/gsync-minimal.js',
  '/gsync-ui.js',
  '/gsync-style.css',
  '/gsync-integration.js',
  '/gsync-loader.js',
  // EPUB files
  '/epub/yoga-vasishtha-1.epub',
  '/epub/yoga-vasishtha-2.epub',
  '/epub/yoga-vasishtha-3.epub',
  '/epub/yoga-vasishtha-4.epub',
  '/epub/yoga-vasishtha-5.epub',
  '/epub/yoga-vasishtha-6.epub'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('📦 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching app resources');
        return cache.addAll(urlsToCache.map(url => {
          // Handle both root and index.html
          return url === '/' ? '/index.html' : url;
        }));
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
        const isSyncFile = url.includes('gsync-') || url.includes('sync');

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
  if (event.tag === 'google-drive-sync') {
    console.log('🔄 Background sync triggered for Google Drive');
    event.waitUntil(
      // This would trigger a sync operation when back online
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'BACKGROUND_SYNC',
            action: 'google-drive-sync'
          });
        });
      })
    );
  }
});

// Push notifications (for future Google Drive sync notifications)
self.addEventListener('push', (event) => {
  console.log('📬 Push notification received');
  
  const options = {
    body: 'Your reading progress has been synced to Google Drive',
    icon: '/assets/icon.png',
    badge: '/assets/icon.png',
    tag: 'sync-notification'
  };

  event.waitUntil(
    self.registration.showNotification('Yoga Vasishtha', options)
  );
});

console.log('🚀 Service Worker loaded successfully');
