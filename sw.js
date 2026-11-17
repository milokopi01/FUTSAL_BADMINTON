/* Karnival Sukan PK KBB 2026 - Service Worker (Bahagian 6, keluaran akhir)
 * - RANGKAIAN DAHULU untuk fail aplikasi: pengguna sentiasa mendapat versi terkini bila dalam talian,
 *   dan salinan terakhir dipaparkan bila luar talian (dewan tanpa liputan).
 * - Data Google Apps Script (script.google.com / googleusercontent.com) TIDAK PERNAH di-cache:
 *   skor & jadual sentiasa dibaca terus daripada Google Sheets.
 * - v1.36.0: isyarat Background Sync 'kbb-peti-keluar' -> minta halaman yang terbuka menghantar skor tertunda
 *   (data tertunda disimpan dalam LocalStorage halaman; service worker tidak membaca/menyimpan skor).
 * - Cache lama (futsal-pk-kbb-*, karnival-pk-kbb-* versi terdahulu) dibuang semasa aktivasi.
 */
const VERSI_SW = '1.44.2';  // v1.44.2: Mod Pengadil sentiasa memaparkan perlawanan yang sedia (gelanggang kosong diisi automatik pada telefon pengadil selepas keputusan disahkan) - Code.gs 1.25.1
// const VERSI_SW_1441 = '1.44.1';  // v1.44.1: Peti Kelulusan Urusetia kini menerima jaringan penalti yang dibetulkan pengadil walaupun peranti masih menyimpan keputusan lama SELESAI tanpa pemenang (cth. SM-38 0-0)
// const VERSI_SW_1440 = '1.44.0';  // v1.44.0: markah RALAT (seri kalah mati tanpa penalti) dipaparkan kepada pengadil bertanggungjawab - masukkan jaringan penalti; Master Admin boleh kemas kini (Code.gs 1.25.0)
// const VERSI_SW_1431 = '1.43.1';  // v1.43.1: baiki halaman kosong (ralat permulaan v1.43.0)
// const VERSI_SW_1430 = '1.43.0';  // v1.43.0: Urus Gelanggang - pilih kategori setiap gelanggang: SR + SM (Terbuka) / SR sahaja / SM sahaja (Futsal & Badminton)
// const VERSI_SW_1420 = '1.42.0';  // v1.42.0: Jana Susunan profesional - rehat pasukan dijamin, tiada perlawanan berturut-turut (back-to-back), Futsal & Badminton
// const VERSI_SW_1410 = '1.41.0';  // v1.41.0: enjin giliran seragam - P1, P2 ... ikut pusingan gelanggang (terbuka / dikunci kategori), Futsal & Badminton
// const VERSI_SW_1406 = '1.40.6';  // v1.40.6: markah RALAT hanya pengadil asal / Master Admin
// const VERSI_SW_1403 = '1.40.3';  // v1.40.3: kad Admin & Urusetia dan Undian X & Y kini lebar penuh
// const VERSI_SW_1401 = '1.40.1';  // v1.40.1: amaran rehat dipaparkan awal (kad gelanggang & senarai pengadil), tiada pop-up selepas tekan mula
// const VERSI_SW_1400 = '1.40.0';  // v1.40.0: Jana Susunan beri rehat satu pusingan + amaran rehat pasukan (masa tamat tepat) sebelum wisel / servis mula
// const VERSI_SW_1391 = '1.39.1';  // v1.39.1: cip giliran semasa di sebelah nama gelanggang Futsal
// const VERSI_SW_1383 = '1.38.3';  // v1.38.3: Paparan Pengadil memaparkan nombor giliran perlawanan (P1, P2 ...) setiap gelanggang
// const VERSI_SW_1382 = '1.38.2';  // v1.38.2: giliran Badminton ikut turutan P + diserlahkan dalam Simulasi Gelanggang
// const VERSI_SW_1381 = '1.38.1';  // v1.38.1: kunci penganjur (Separuh Akhir / Akhir) sentiasa dipatuhi
// const VERSI_SW_138 = '1.38.0';  // v1.38.0: semua gelanggang terbuka SR + SM + auto-isi gelanggang kosong
// const VERSI_SW_137 = '1.37.0';  // v1.37.0: Peti Kelulusan Badminton sentiasa segerak + auto-fit gelanggang swa-pulih
// const VERSI_SW_LAMA = '1.35.0';  // v1.35.0: cuba semula automatik + anti-bertindih (reqId) untuk Code.gs v1.22.0  // v1.34.1: pembaikan autosimpan pengadil Badminton  // v1.34.0: PRESTASI - Sahkan keputusan Badminton sepantas Futsal (tiada jem / lag)
const CACHE = 'karnival-pk-kbb-' + VERSI_SW;
const SHELL = ['./', './index.html', './admin-pasukan.js', './admin-jadual.js', './admin-skor.js', './peti-keluar.js', './manifest.json',
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

// v1.36.0: Background Sync - bila sambungan pulih, minta setiap tetingkap aplikasi menghantar peti keluar.
// (Chrome/Android menyokong; iPhone tidak - halaman masih mencuba semula sendiri: online / buka semula / setiap 10 s.)
self.addEventListener('sync', event => {
  if (event.tag !== 'kbb-peti-keluar') return;
  event.waitUntil((async () => {
    const senarai = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    senarai.forEach(c => c.postMessage({ type: 'kbb-flush-peti-keluar' }));
  })());
});
