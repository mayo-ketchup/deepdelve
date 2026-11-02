/* Deepdelve - service worker: lets the game load offline after the first visit.
 * Network first: when online, players always get the newest version, and the copy in the cache
 * is refreshed. When offline, the cached copy is used. Only runs on a real website (https). */
const CACHE = 'deepdelve-v1';
const CORE = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './js/game.js', './js/sprites.js', './js/render.js', './js/save.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // drop caches from older versions of this file
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // keep a copy of anything that loaded (game files, Vue, fonts)
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});
