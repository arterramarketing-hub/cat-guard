/* Princess Kitty Defender: offline support.
   Everything is kept on the device. The game page opens straight from the saved copy (no waiting on the
   network); a fresh copy is fetched in the background, and if it's a newer version the game is told so it
   can offer "new version ready". Three.js, fonts and icons come straight from the cache. */
const CACHE = 'pkd-v4';
const CORE = [
  './', './index.html', './apple-touch-icon.png', './icon-512.png', './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/objects/Reflector.js',
];
const buildOf = txt => { const m = txt.match(/const BUILD = '([^']+)'/); return m ? m[1] : ''; };
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u =>
    fetch(u, u.startsWith('http') ? { mode: 'cors' } : { cache: 'no-cache' }).then(r => { if (r && r.ok) return c.put(u, r); }).catch(() => {})))));   // (only a good copy is kept: a failed download never gets stuck in the cache)
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
let refreshing = null;                                                // one background page refresh at a time
function refreshPage(c, oldBuild) {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const r = await fetch('./index.html', { cache: 'no-cache', credentials: 'same-origin' });   // (no-cache: skip the browser's 10-minute copy right after an update)
      if (!r || !r.ok) return;
      const txt = await r.clone().text(), nb = buildOf(txt);
      if (!nb) return;                                                // not the game page (a captive wifi page etc.): keep the good copy
      await c.put('./index.html', r);
      if (oldBuild && nb !== oldBuild) for (const cl of await self.clients.matchAll({ type: 'window' })) cl.postMessage({ type: 'pkd-update', build: nb });
    } catch (err) {} finally { refreshing = null; }
  })();
  return refreshing;
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.cache === 'no-store' || new URL(req.url).searchParams.has('check')) return;   // 'Check for updates' always asks the network
  const isPage = req.mode === 'navigate' || (req.destination === 'document');
  e.respondWith(caches.open(CACHE).then(async c => {
    if (isPage) {                                                     // the saved copy first: opens instantly, even on a slow connection
      const hit = (await c.match('./index.html')) || (await c.match('./'));
      if (hit) {
        const oldBuild = buildOf(await hit.clone().text());
        e.waitUntil(refreshPage(c, oldBuild));                        // ...and quietly fetch the latest for next time
        return hit;
      }
      try { const r = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }); if (r && r.ok) c.put('./index.html', r.clone()); return r; }
      catch (err) { return Response.error(); }
    }
    const hit = await c.match(req, { ignoreSearch: true });            // cache first for scripts, fonts and pictures
    if (hit) return hit;
    try { const r = await fetch(req); if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }
    catch (err) { return Response.error(); }
  }));
});
self.addEventListener('message', e => {                               // the game asks "is there a newer copy saved?" once it's ready to listen
  if (!e.data || e.data.type !== 'pkd-ask') return;
  e.waitUntil(caches.open(CACHE).then(async c => {
    if (refreshing) await refreshing;
    const hit = await c.match('./index.html'); if (!hit) return;
    const b = buildOf(await hit.text());
    if (b && b !== e.data.build && e.source) e.source.postMessage({ type: 'pkd-update', build: b });
  }));
});
