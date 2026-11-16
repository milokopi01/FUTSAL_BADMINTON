/* Karnival Sukan PK KBB 2026 - peti-keluar.js (v1.36.0)
 * 1) PETI KELUAR (LocalStorage fallback): skor pengadil yang GAGAL dihantar kerana pelayan sibuk
 *    (kod SIBUK) atau internet terputus disimpan dalam telefon dan DIHANTAR SEMULA secara
 *    automatik (bila internet pulih, bila aplikasi dibuka semula, setiap 10 s, atau isyarat
 *    Background Sync daripada sw.js). Setiap item membawa reqId yang SAMA untuk semua cubaan
 *    -> Code.gs v1.22.0+ tidak menulis dua kali.
 *    - Satu item sahaja bagi setiap gelanggang+perlawanan (Futsal) / perlawanan (Badminton):
 *      skor terbaharu menggantikan skor lama -> skor lama TIDAK PERNAH menimpa skor baharu.
 *    - Kunci Master Admin TIDAK disimpan dalam telefon (dibaca semula semasa menghantar).
 *    - Item lebih 6 jam dibuang (sepadan tempoh anti-bertindih Code.gs v1.22.1).
 * 2) PENGAWAL KLIK (anti "spam klik"): butang yang ditekan dikunci dengan label
 *    "⏳ Menyimpan..." sehingga Google Sheets membalas.
 * Fail ini tidak bergantung pada DOM ketika diuji dalam Node (lihat ujian-peti-keluar.js).
 */
(function (root) {
  'use strict';

  const KUNCI_SIMPANAN = 'karnival_peti_keluar_v1';
  const KUNCI_PAJAKAN = 'karnival_peti_keluar_pajakan';
  const HAD_UMUR_MS = 6 * 60 * 60 * 1000;   // 6 jam
  const HAD_ITEM = 60;
  const HAD_CUBAAN_MS = 25000;
  const MESEJ_DIBARIS = 'Pelayan sibuk / tiada sambungan. Data DISIMPAN dalam telefon ini dan akan dihantar semula secara automatik.';

  // Tindakan yang boleh dibariskan + kunci gabungan (satu item bagi setiap kunci)
  function kunciBaris(p) {
    if (!p || typeof p !== 'object') return '';
    if (p.action === 'skorLive') {
      if (p.tangguh === true || p.tangguh === 'true') return '';   // tangguh = keputusan segera, bukan skor
      if (!p.gelanggang || !p.matchId) return '';
      return 'skorLive|' + p.gelanggang + '|' + p.matchId;
    }
    if (p.action === 'skorPengadilBadminton') {
      if (!p.id) return '';
      return 'bm|' + String(p.id).toUpperCase();
    }
    return '';
  }

  function isMuktamad(p) {
    if (!p) return false;
    if (p.action === 'skorPengadilBadminton') return String(p.jenis || '').toUpperCase() === 'TAMAT';
    return !!(p.lepas || p.sahkan) || /TAMAT/i.test(String(p.status || ''));
  }

  function perluCubaLagi(res) {
    if (!res || res.ok !== false) return false;
    if (res.kod === 'SIBUK' || res.cubaLagi === true || res.networkError === true) return true;
    return /Pelayan sibuk|Too many simultaneous|Service invoked too many/i.test(String(res.error || ''));
  }

  function janaIdAsas() {
    try { if (root.crypto && typeof root.crypto.randomUUID === 'function') return 'r-' + root.crypto.randomUUID(); } catch (e) { /* abaikan */ }
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  }

  /* ---------------- PETI KELUAR ---------------- */
  function ciptaPetiKeluar(deps) {
    const d = Object.assign({
      simpanan: null,                       // objek serupa localStorage
      sekali: null,                         // (payload, hadMs) => Promise<res> (SATU cubaan)
      sesi: () => null,                     // => { userId, token }
      adminKey: () => '',
      janaReqId: janaIdAsas,
      now: () => Date.now(),
      rawak: Math.random,
      bolehHantar: () => true,              // cth. navigator.onLine
      maklum: () => {},                     // (mesej, jenis)
      bilBerubah: () => {},                 // (bil)
      terhantar: () => {},                  // (senaraiItem)
      dibariskan: () => {},                 // (item) item baharu disimpan dalam telefon
      tabId: janaIdAsas()
    }, deps || {});

    let memori = { v: 1, items: [] };       // sandaran jika localStorage tiada / penuh
    let sedangFlush = null;
    const dalamHantar = new Map();          // kunci -> Promise (item sedang dihantar)

    function baca() {
      try {
        if (!d.simpanan) return memori;
        const t = d.simpanan.getItem(KUNCI_SIMPANAN);
        if (!t) return { v: 1, items: [] };
        const o = JSON.parse(t);
        return o && Array.isArray(o.items) ? o : { v: 1, items: [] };
      } catch (e) { return memori; }
    }
    function tulis(o) {
      memori = o;
      try {
        if (d.simpanan) {
          if (o.items.length) d.simpanan.setItem(KUNCI_SIMPANAN, JSON.stringify(o));
          else d.simpanan.removeItem(KUNCI_SIMPANAN);
        }
      } catch (e) { console.warn('[peti-keluar] simpanan penuh / tidak tersedia', e); }
      try { d.bilBerubah(o.items.length); } catch (e) { /* abaikan */ }
    }
    function buangLuput(o) {
      const now = d.now();
      const sebelum = o.items.length;
      o.items = o.items.filter(it => now - (Number(it.dibuat) || 0) < HAD_UMUR_MS);
      const buang = sebelum - o.items.length;
      if (buang > 0) d.maklum(`⚠ ${buang} data skor tertunda melebihi 6 jam dan dibuang. Semak skor dalam Google Sheets.`, 'warn');
      return o;
    }

    function bersihPayload(p) {
      const salin = Object.assign({}, p);
      const perluAdmin = !!salin.adminKey;
      delete salin.adminKey;                // kunci Master Admin tidak disimpan dalam telefon
      return { salin, perluAdmin };
    }

    function gabungSkor(sasaran, sumber) {
      ['skorP1', 'skorP2'].forEach(f => { if (sumber[f] !== undefined) sasaran[f] = sumber[f]; });
      if (sumber.fasaMulaPada !== undefined && sasaran.action === 'skorLive' && !isMuktamad(sasaran)) sasaran.fasaMulaPada = sumber.fasaMulaPada;
    }

    // Dipanggil SEBELUM penghantaran terus bagi tindakan yang boleh dibariskan.
    // - Item tertunda yang SAMA kunci digantikan oleh penghantaran baharu (lebih terkini).
    // - Pengecualian: item tertunda ialah keputusan AKHIR tetapi penghantaran baharu bukan ->
    //   item akhir dikekalkan & dikemas kini dengan skor terbaharu (niat "Tamat" tidak hilang).
    // - Menunggu item sama kunci yang sedang dihantar oleh peti keluar (susunan terjamin).
    async function sebelumHantar(payload) {
      const k = kunciBaris(payload);
      if (!k) return;
      const o = baca();
      const i = o.items.findIndex(it => it.kunci === k);
      if (i >= 0) {
        const lama = o.items[i];
        if (isMuktamad(lama.payload) && !isMuktamad(payload)) {
          gabungSkor(lama.payload, payload);
          lama.reqId = d.janaReqId();       // kandungan berubah -> reqId baharu
          lama.seterusnya = d.now() + 2000; // hantar selepas penghantaran terus ini
        } else {
          o.items.splice(i, 1);
        }
        tulis(o);
      }
      const jalan = dalamHantar.get(k);
      if (jalan) { try { await jalan; } catch (e) { /* abaikan */ } }
    }

    // Simpan payload yang gagal ke peti keluar. Pulangkan respons yang menerangkan status.
    function baris(payload, res) {
      const k = kunciBaris(payload);
      if (!k || !perluCubaLagi(res)) return res;
      const s = d.sesi() || {};
      const { salin, perluAdmin } = bersihPayload(payload);
      const reqId = salin.reqId || (res && res.reqId) || d.janaReqId();
      salin.reqId = reqId;
      const o = buangLuput(baca());
      const i = o.items.findIndex(it => it.kunci === k);
      const now = d.now();
      const item = { kunci: k, action: salin.action, payload: salin, reqId, perluAdmin, userId: s.userId || '',
        dibuat: now, cubaan: 0, seterusnya: now + 3000, ralat: String((res && (res.kod || res.error)) || '') };
      if (i >= 0) {
        const lama = o.items[i];
        if (isMuktamad(lama.payload) && !isMuktamad(salin)) {
          gabungSkor(lama.payload, salin);
          lama.reqId = d.janaReqId();
          lama.seterusnya = now + 3000;
        } else {
          item.dibuat = Math.min(Number(lama.dibuat) || now, now);
          o.items[i] = item;
        }
      } else {
        o.items.push(item);
        while (o.items.length > HAD_ITEM) o.items.shift();
      }
      tulis(o);
      try { d.dibariskan(item); } catch (e) { /* abaikan */ }
      return Object.assign({}, res, { ok: false, networkError: true, dibariskan: true, reqId,
        error: MESEJ_DIBARIS, ralatAsal: res && res.error });
    }

    function dapatPajakan() {
      if (!d.simpanan) return true;
      try {
        const now = d.now();
        const p = JSON.parse(d.simpanan.getItem(KUNCI_PAJAKAN) || 'null');
        if (p && p.tab !== d.tabId && Number(p.sampai) > now) return false;   // tab lain sedang menghantar
        d.simpanan.setItem(KUNCI_PAJAKAN, JSON.stringify({ tab: d.tabId, sampai: now + 40000 }));
        return true;
      } catch (e) { return true; }
    }
    function lepasPajakan() {
      if (!d.simpanan) return;
      try {
        const p = JSON.parse(d.simpanan.getItem(KUNCI_PAJAKAN) || 'null');
        if (p && p.tab === d.tabId) d.simpanan.removeItem(KUNCI_PAJAKAN);
      } catch (e) { /* abaikan */ }
    }

    function backoff(n) {
      return Math.min(60000, 2000 * Math.pow(2, Math.max(0, n - 1))) + Math.floor(d.rawak() * 1500);
    }

    async function hantarSatu(item) {
      const p = Object.assign({}, item.payload, { reqId: item.reqId });
      const s = d.sesi();
      if (s && s.token && item.userId && s.userId === item.userId && 'token' in p) p.token = s.token;   // token sesi terkini
      if (item.perluAdmin) {
        const kunci = d.adminKey();
        if (!kunci) return { langkau: true };
        p.adminKey = kunci; p.admin = true;
      }
      return d.sekali(p, HAD_CUBAAN_MS);
    }

    async function flushDalaman(paksa) {
      const hasil = { dihantar: 0, ditolak: 0, baki: 0 };
      if (!d.bolehHantar()) { hasil.baki = baca().items.length; return hasil; }
      if (!dapatPajakan()) { hasil.baki = baca().items.length; return hasil; }
      const berjaya = [];
      try {
        let o = buangLuput(baca()); tulis(o);
        const giliran = o.items.slice().sort((a, b) => a.dibuat - b.dibuat);
        for (const asal of giliran) {
          o = baca();
          const item = o.items.find(it => it.kunci === asal.kunci && it.reqId === asal.reqId);
          if (!item) continue;
          if (!paksa && Number(item.seterusnya) > d.now()) continue;
          let selesai;
          const jalan = hantarSatu(item);
          dalamHantar.set(item.kunci, jalan.then(() => {}, () => {}));
          let res;
          try { res = await jalan; } catch (e) { res = { ok: false, networkError: true, error: String(e && e.message || e) }; }
          finally { dalamHantar.delete(item.kunci); }
          if (res && res.langkau) continue;
          // baca semula: item mungkin telah digantikan oleh penghantaran terus semasa menunggu
          o = baca();
          const idx = o.items.findIndex(it => it.kunci === item.kunci && it.reqId === item.reqId);
          if (res && res.ok) {
            if (idx >= 0) o.items.splice(idx, 1);
            tulis(o); hasil.dihantar++; berjaya.push(item);
            selesai = true;
          } else if (perluCubaLagi(res)) {
            if (idx >= 0) {
              const it = o.items[idx];
              it.cubaan = (Number(it.cubaan) || 0) + 1;
              it.seterusnya = d.now() + backoff(it.cubaan);
              it.ralat = String((res && (res.kod || res.error)) || '');
              tulis(o);
            }
            break;   // pelayan masih sibuk / luar talian -> jangan asak item lain
          } else {
            if (idx >= 0) o.items.splice(idx, 1);
            tulis(o); hasil.ditolak++;
            d.maklum(`⚠ Skor tertunda ${item.kunci.split('|').slice(1).join(' · ')} ditolak oleh Google Sheets: ${(res && res.error) || 'ralat tidak diketahui'}`, 'error');
          }
          if (selesai) continue;
        }
      } finally {
        lepasPajakan();
      }
      hasil.baki = baca().items.length;
      if (berjaya.length) { try { d.terhantar(berjaya); } catch (e) { console.warn('[peti-keluar] terhantar', e); } }
      return hasil;
    }

    function flush(paksa) {
      if (sedangFlush) return sedangFlush;
      sedangFlush = flushDalaman(!!paksa).finally(() => { sedangFlush = null; });
      return sedangFlush;
    }

    function adaPerluHantar() {
      const now = d.now();
      return baca().items.some(it => Number(it.seterusnya) <= now);
    }

    return {
      kunciBaris, isMuktamad, perluCubaLagi, sebelumHantar, baris, flush, adaPerluHantar,
      bil: () => baca().items.length,
      senarai: () => baca().items.slice(),
      kosongkan: () => tulis({ v: 1, items: [] })
    };
  }

  /* ---------------- PENGAWAL KLIK (anti spam klik) ---------------- */
  // Tindakan latar (autosimpan / tinjauan / bacaan) TIDAK mengunci butang supaya klik +1
  // berturut-turut masih pantas.
  const TINDAKAN_LATAR = new Set(['ping', 'statusGelanggang', 'senaraiPengadil', 'senaraiSandaran', 'senaraiUrusetia',
    'semakUrusetia', 'syncAll', 'updateMatch', 'updateMatches', 'live', 'read']);
  const TINDAKAN_PROSES = new Set(['loginPengadil', 'loginUrusetia', 'logKeluarPengadil', 'logKeluarUrusetia']);

  function isLatar(p) {
    const a = p && p.action;
    if (!a || TINDAKAN_LATAR.has(a)) return true;
    if (a === 'skorLive') return !(p.lepas || p.sahkan || p.tangguh);
    if (a === 'skorPengadilBadminton') return String(p.jenis || '').toUpperCase() !== 'TAMAT';
    if (a === 'kunciGelanggang') return !!p.perbaharui;
    return false;
  }

  function ciptaPengawalKlik(doc, opts) {
    const o = Object.assign({ tetingkapMs: 1500, now: () => Date.now() }, opts || {});
    let klik = null;
    const aktif = new Map();

    function catat(el) { klik = { el, t: o.now() }; }
    if (doc && doc.addEventListener) {
      doc.addEventListener('click', e => {
        const t = e.target;
        const b = t && t.closest ? t.closest('button, input[type="submit"], input[type="button"], [role="button"]') : null;
        if (!b) return;
        // Butang dialog pengesahan (uiConfirm / uiPrompt): kekalkan butang asal yang membuka dialog
        if (b.classList && (b.classList.contains('ux-btn') || (b.closest && b.closest('.ux-ov')))) {
          if (klik && o.now() - klik.t < 120000) klik.t = o.now();
          return;
        }
        catat(b);
      }, true);
      doc.addEventListener('submit', e => {
        const b = e.submitter || (e.target && e.target.querySelector && e.target.querySelector('[type="submit"]'));
        if (b) catat(b);
      }, true);
    }

    function label(el) { return el.tagName === 'INPUT' ? el.value : el.innerHTML; }
    function setLabel(el, v) { if (el.tagName === 'INPUT') el.value = v; else el.innerHTML = v; }

    // Kunci butang yang baru ditekan. Pulangkan fungsi pelepas (atau null).
    function kunci(payload) {
      if (!klik || isLatar(payload)) return null;
      if (o.now() - klik.t > o.tetingkapMs) return null;
      const b = klik.el;
      if (!b || b.isConnected === false) return null;
      let st = aktif.get(b);
      if (!st) {
        if (b.disabled) return null;        // pengendali sendiri sudah mengunci butang
        const teks = TINDAKAN_PROSES.has(payload.action) ? '⏳ Memproses...' : '⏳ Menyimpan...';
        st = { n: 0, asal: label(b), teks };
        b.disabled = true;
        if (b.setAttribute) b.setAttribute('aria-busy', 'true');
        if (b.classList) b.classList.add('kbb-menyimpan');
        setLabel(b, teks);
        aktif.set(b, st);
      }
      st.n++;
      let dilepas = false;
      return function lepas() {
        if (dilepas) return; dilepas = true;
        st.n--;
        if (st.n > 0) return;
        aktif.delete(b);
        if (b.removeAttribute) b.removeAttribute('aria-busy');
        if (b.classList) b.classList.remove('kbb-menyimpan');
        // Pulihkan HANYA jika pengendali tidak mengubah butang semasa menunggu
        if (label(b) === st.teks) { setLabel(b, st.asal); b.disabled = false; }
      };
    }
    return { kunci, isLatar, _klik: () => klik };
  }

  /* ---------------- PAPARAN & PENCETUS (pelayar sahaja) ---------------- */
  function pasangPelayar(peti, opts) {
    const doc = root.document;
    if (!doc) return;
    const css = doc.createElement('style');
    css.textContent = '.kbb-menyimpan{opacity:.75;cursor:progress!important}' +
      '#kbbPetiKeluar{position:fixed;left:12px;bottom:12px;z-index:9998;max-width:calc(100vw - 24px);' +
      'background:#7c2d12;color:#fff7ed;border:1px solid #fb923c;border-radius:12px;padding:8px 12px;' +
      'font:600 13px/1.3 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer}' +
      '#kbbPetiKeluar[hidden]{display:none}#kbbPetiKeluar small{display:block;font-weight:500;opacity:.85}';
    (doc.head || doc.documentElement).appendChild(css);
    const lencana = doc.createElement('button');
    lencana.type = 'button'; lencana.id = 'kbbPetiKeluar'; lencana.hidden = true;
    lencana.setAttribute('aria-live', 'polite');
    const pasangLencana = () => { if (doc.body && !lencana.isConnected) doc.body.appendChild(lencana); };
    if (doc.body) pasangLencana(); else doc.addEventListener('DOMContentLoaded', pasangLencana);
    let sibukTekan = false;
    lencana.addEventListener('click', async () => {
      if (sibukTekan) return; sibukTekan = true;
      lencana.innerHTML = '⏳ Menghantar data tertunda...';
      try { await peti.flush(true); } finally { sibukTekan = false; kemasLencana(peti.bil()); }
    });
    function kemasLencana(n) {
      lencana.hidden = !n;
      if (n) lencana.innerHTML = `📤 ${n} skor menunggu dihantar<small>Disimpan dalam telefon · dihantar automatik · ketik untuk cuba sekarang</small>`;
    }
    opts.kemasLencana = kemasLencana;
    kemasLencana(peti.bil());

    const cuba = paksa => { if (peti.bil()) peti.flush(paksa).catch(e => console.warn('[peti-keluar]', e)); };
    root.addEventListener('online', () => setTimeout(() => cuba(true), 800));
    doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') cuba(true); });
    root.addEventListener('focus', () => cuba(false));
    root.addEventListener('storage', e => { if (e.key === KUNCI_SIMPANAN) kemasLencana(peti.bil()); });
    setInterval(() => { if (peti.adaPerluHantar()) cuba(false); }, 10000);
    setTimeout(() => cuba(true), 3000);
    if (root.navigator && root.navigator.serviceWorker) {
      root.navigator.serviceWorker.addEventListener('message', e => {
        if (e.data && e.data.type === 'kbb-flush-peti-keluar') cuba(false);   // hormati jadual backoff
      });
    }
  }

  // Background Sync hanya didaftar bila LUAR TALIAN & paling kerap sekali setiap 30 s
  // (didaftar semasa dalam talian -> 'sync' berbunyi serta-merta -> gelung tanpa faedah).
  let syncTerakhir = 0;
  function daftarSyncLatar() {
    try {
      if (!(root.navigator && root.navigator.onLine === false)) return;
      if (Date.now() - syncTerakhir < 30000) return;
      syncTerakhir = Date.now();
      const sw = root.navigator && root.navigator.serviceWorker;
      if (!sw) return;
      sw.ready.then(r => (r && r.sync ? r.sync.register('kbb-peti-keluar') : null)).catch(() => {});
    } catch (e) { /* Background Sync tidak disokong (cth. iPhone) -> pencetus lain masih berfungsi */ }
  }

  const api = { ciptaPetiKeluar, ciptaPengawalKlik, kunciBaris, isMuktamad, perluCubaLagi, isLatar, HAD_UMUR_MS, KUNCI_SIMPANAN, MESEJ_DIBARIS };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  // Pemasangan pelayar: index.html memanggil KBBPetiKeluar.mula({...}) selepas callGasSekali wujud.
  root.KBBPetiKeluarLib = api;
  root.KBBPengawalKlik = ciptaPengawalKlik(root.document);
  root.KBBPetiKeluarMula = function (deps) {
    const opts = {};
    const peti = ciptaPetiKeluar(Object.assign({
      simpanan: (() => { try { return root.localStorage; } catch (e) { return null; } })(),
      bolehHantar: () => !(root.navigator && root.navigator.onLine === false),
      bilBerubah: n => { if (opts.kemasLencana) opts.kemasLencana(n); },
      dibariskan: () => daftarSyncLatar()
    }, deps));
    root.KBBPetiKeluar = peti;
    try { pasangPelayar(peti, opts); } catch (e) { console.warn('[peti-keluar] paparan', e); }
    return peti;
  };
})(typeof window !== 'undefined' ? window : globalThis);
