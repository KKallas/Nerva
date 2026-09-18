// Network first, cache fallback. Keeps the app shell and the catalogue usable offline.
const CACHE = 'nerva-v11';
const SHELL = ['/', '/index.html', '/items', '/items.html', '/item.html', '/labels.html', '/settings.html', '/locations.html', '/place.html', '/sticker.html', '/loans.html', '/person.html', '/overview.html', '/help.html', '/log.js', '/app.css', '/paint.js', '/scan.js', '/jsqr.js', '/app.js', '/parse.js', '/search.js', '/manifest.json', '/icon.svg', '/api/catalogue.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Only the catalogue is kept offline. Other API answers are someone's
  // loans, users or cards, and a shared phone must not hand them on.
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/catalogue.json') return;
  const key = url.pathname.startsWith('/i/') ? '/item.html' : url.pathname === '/items' ? '/items.html'
    : url.pathname === '/labels' ? '/labels.html' : url.pathname === '/settings' ? '/settings.html'
    : url.pathname === '/locations' ? '/locations.html' : url.pathname.startsWith('/l/') ? '/place.html'
    : url.pathname === '/sticker' ? '/sticker.html' : url.pathname === '/loans' ? '/loans.html' : url.pathname.startsWith('/u/') ? '/person.html'
    : url.pathname === '/overview' ? '/overview.html' : url.pathname === '/help' ? '/help.html' : e.request;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && url.origin === location.origin) caches.open(CACHE).then(c => c.put(key, r.clone()));
    return r;
  }).catch(() => caches.match(key)));
});
