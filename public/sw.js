// Network first, cache fallback. Keeps the app shell and the catalogue usable offline.
const CACHE = 'nerva-v3';
const SHELL = ['/', '/index.html', '/items', '/items.html', '/item.html', '/labels.html', '/app.css', '/app.js', '/parse.js', '/search.js', '/manifest.json', '/icon.svg', '/api/catalogue.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const key = url.pathname.startsWith('/i/') ? '/item.html' : url.pathname === '/items' ? '/items.html'
    : url.pathname === '/labels' ? '/labels.html' : e.request;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && url.origin === location.origin) caches.open(CACHE).then(c => c.put(key, r.clone()));
    return r;
  }).catch(() => caches.match(key)));
});
