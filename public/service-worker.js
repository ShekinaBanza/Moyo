/*
 * Moyo service worker.
 * PRIVACY RULE: only public static resources are cached (compiled JS/CSS, icons, illustrations,
 * and the app shell HTML which is identical for everyone and contains no user data).
 * Anything under /api, /sanctum or any non-GET request always goes to the network and is NEVER stored.
 */
const VERSION = 'moyo-static-v3';
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

const isStaticAsset = (url) =>
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/build/') || url.pathname.startsWith('/images/') || url.pathname.startsWith('/icons/'));

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/sanctum/')) return; // network only, never cached

    if (request.mode === 'navigate') {
        // App shell: network first, cached shell when offline.
        event.respondWith(
            fetch(request)
                .then((res) => {
                    if (res.ok && res.headers.get('content-type')?.includes('text/html')) {
                        const copy = res.clone();
                        caches.open(VERSION).then((c) => c.put('/', copy));
                    }
                    return res;
                })
                .catch(async () => (await caches.match('/')) || (await caches.match('/offline.html'))),
        );
        return;
    }

    if (isStaticAsset(url)) {
        // /build/* files are content-hashed: cache first. Images and icons keep their name: stale-while-revalidate,
        // so an updated illustration reaches users on the next visit instead of being stuck in the cache.
        const hashed = url.pathname.startsWith('/build/');
        event.respondWith(
            caches.open(VERSION).then(async (cache) => {
                const hit = await cache.match(request);
                const network = fetch(request).then((res) => {
                    if (res.ok) cache.put(request, res.clone());
                    return res;
                });
                if (hit) {
                    if (!hashed) network.catch(() => undefined);
                    return hit;
                }
                return network;
            }),
        );
    }
});

// Allow the page to purge caches (used on logout / account deletion).
self.addEventListener('message', (event) => {
    if (event.data === 'purge') caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
});

// ---- Web Push (only fires if the server is configured with VAPID keys and the user subscribed) ----
// Payload carries title/body/link only: never health values.
self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
    event.waitUntil(
        self.registration.showNotification(data.title || 'Moyo', {
            body: data.body || '',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: data.id ? 'moyo-' + data.id : 'moyo',
            data: { link: data.link || '/app/notifications' },
        }),
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const link = (event.notification.data && event.notification.data.link) || '/app/notifications';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
            const w = wins.find((c) => 'focus' in c);
            if (w) { w.navigate(link); return w.focus(); }
            return self.clients.openWindow(link);
        }),
    );
});
