/* Karnival Sukan PK KBB 2026 - Service Worker (Bahagian 6, keluaran akhir)
 * - RANGKAIAN DAHULU untuk fail aplikasi: pengguna sentiasa mendapat versi terkini bila dalam talian,
 *   dan salinan terakhir dipaparkan bila luar talian (dewan tanpa liputan).
 * - Data Google Apps Script (script.google.com / googleusercontent.com) TIDAK PERNAH di-cache:
 *   skor & jadual sentiasa dibaca terus daripada Google Sheets.
 * - Cache lama (futsal-pk-kbb-*, karnival-pk-kbb-* versi terdahulu) dibuang semasa aktivasi.
 */
const VERSI_SW = '1.17.0';
const CACHE = 'karnival-pk-kbb-' + VERSI_SW;
const SHELL = ['./', './index.html', './admin-pasukan.js', './admin-jadual.js', './admin-skor.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Fail yang tiada (cth. ikon) tidak menggagalkan pemasangan
    await Promise.allSettled(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.allSettled(keys
      .filter(k => k !== CACHE && (k.startsWith('futsal-pk-kbb-') || k.startsWith('karnival-pk-kbb-')))
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // Google Sheets, fon, CDN: terus ke rangkaian
  if (url.searchParams.has('action')) return;            // jaga-jaga: permintaan API tidak di-cache
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = (await cache.match('./index.html')) || (await cache.match('./'));
        if (shell) return shell;
      }
      return new Response('Luar talian', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
