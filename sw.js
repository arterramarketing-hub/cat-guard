/* Princess Kitty Defender: offline support.
   The game page is fetched fresh whenever there's a connection (so updates show up right away) and
   kept as a fallback; everything else (Three.js, fonts, icons) comes straight from the cache. */
const CACHE = 'pkd-v2';
const CORE = [
  './', './index.html', './apple-touch-icon.png', './icon-512.png', './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/objects/Reflector.js',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u =>
    fetch(u, u.startsWith('http') ? { mode: 'no-cors' } : {}).then(r => c.put(u, r)).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.cache === 'no-store' || new URL(req.url).searchParams.has('check')) return;   // 'Check for updates' always asks the network
  const isPage = req.mode === 'navigate' || (req.destination === 'document');
  e.respondWith(caches.open(CACHE).then(async c => {
    if (isPage) {                                                     // network first: always the latest version when online
      try { const r = await fetch(req); if (r && r.ok) c.put('./index.html', r.clone()); return r; }
      catch (err) { return (await c.match('./index.html')) || (await c.match('./')) || Response.error(); }
    }
    const hit = await c.match(req, { ignoreSearch: true });            // cache first for scripts, fonts and pictures
    if (hit) return hit;
    try { const r = await fetch(req); if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }
    catch (err) { return Response.error(); }
  }));
});
