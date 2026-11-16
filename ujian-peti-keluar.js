// Ujian peti keluar (LocalStorage fallback) & anti spam klik - jalankan: node ujian-peti-keluar.js
const L = require('./peti-keluar.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
function storan() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m }; }
let jam = 1_700_000_000_000, n = 0;
function cipta(o = {}) {
  const st = o.simpanan || storan();
  const log = { hantar: [], maklum: [], terhantar: [] };
  const balas = o.balas || (() => ({ ok: true }));
  const peti = L.ciptaPetiKeluar(Object.assign({
    simpanan: st, now: () => jam, rawak: () => 0, janaReqId: () => 'r-uji-' + (++n),
    sesi: () => ({ userId: 'REF-001', token: 'tok-baru' }), adminKey: () => '',
    sekali: async p => { log.hantar.push(p); return balas(p); },
    maklum: (m, t) => log.maklum.push([m, t]), terhantar: it => log.terhantar.push(...it)
  }, o.deps || {}));
  return { peti, st, log };
}
const SIBUK = { ok: false, kod: 'SIBUK', cubaLagi: true, error: 'Pelayan sibuk' };
const bm = (s1, s2, jenis = 'SEMASA', reqId = 'r-asal-1') => ({ action: 'skorPengadilBadminton', sukan: 'BADMINTON', token: 'tok-lama', id: 'BM-01', skorP1: s1, skorP2: s2, jenis, reqId });
const live = (s1, s2, x = {}) => Object.assign({ action: 'skorLive', token: 'tok-lama', gelanggang: 'A', matchId: 'SR-01', skorP1: s1, skorP2: s2, status: 'LIVE', reqId: 'r-live-1' }, x);

(async () => {
  // 1. hanya skor yang dibariskan & hanya ralat sementara
  ok(L.kunciBaris(live(1, 0)) === 'skorLive|A|SR-01' && L.kunciBaris(bm(1, 0)) === 'bm|BM-01', 'kunci baris skor Futsal & Badminton');
  ok(L.kunciBaris({ action: 'loginPengadil' }) === '' && L.kunciBaris(live(0, 0, { tangguh: true })) === '', 'login / tangguh TIDAK dibariskan');
  let { peti, st, log } = cipta();
  let r = peti.baris(bm(2, 1), { ok: false, kod: 'MUKTAMAD', error: 'telah disahkan' });
  ok(r.kod === 'MUKTAMAD' && peti.bil() === 0, 'ralat kekal (MUKTAMAD) tidak disimpan dalam telefon');
  r = peti.baris(bm(2, 1), SIBUK);
  ok(r.dibariskan && r.networkError && r.reqId === 'r-asal-1' && peti.bil() === 1, 'SIBUK -> disimpan dalam telefon dengan reqId asal');
  ok(/telefon/.test(r.error), 'mesej memberitahu data disimpan dalam telefon');
  ok(JSON.parse(st.getItem(L.KUNCI_SIMPANAN)).items.length === 1, 'item ditulis ke LocalStorage');
  peti.baris(bm(3, 1, 'SEMASA', 'r-asal-2'), { ok: false, networkError: true });
  ok(peti.bil() === 1 && peti.senarai()[0].payload.skorP1 === 3 && peti.senarai()[0].reqId === 'r-asal-2', 'skor lebih baharu menggantikan skor lama (satu item sahaja)');

  // 2. flush berjaya: reqId sama, token terkini, item dibuang
  jam += 5000;
  let h = await peti.flush(false);
  ok(h.dihantar === 1 && peti.bil() === 0 && log.hantar[0].reqId === 'r-asal-2', 'dihantar semula dengan reqId SAMA (tiada tulisan berganda)');
  ok(log.hantar[0].token === 'tok-baru', 'token sesi terkini digunakan semasa menghantar semula');
  ok(log.terhantar.length === 1, 'pemanggil dimaklumkan selepas berjaya');
  ok(st.getItem(L.KUNCI_SIMPANAN) === null, 'LocalStorage dikosongkan');

  // 3. pelayan masih sibuk -> kekal + backoff, berhenti asak
  let sibuk = true;
  ({ peti, st, log } = cipta({ balas: () => (sibuk ? SIBUK : { ok: true }) }));
  peti.baris(bm(1, 0), SIBUK);
  peti.baris(live(2, 2), SIBUK);
  jam += 5000;
  h = await peti.flush(false);
  ok(h.dihantar === 0 && peti.bil() === 2 && log.hantar.length === 1, 'pelayan sibuk -> item kekal, item lain tidak diasak');
  const it = peti.senarai().find(x => x.cubaan === 1);
  ok(it && it.seterusnya > jam, 'jadual cuba semula (backoff) ditetapkan');
  h = await peti.flush(false);
  ok(log.hantar.length === 2 && log.hantar[1].action === 'skorLive', 'item yang sedang backoff tidak dihantar sebelum masanya (item lain boleh)');
  sibuk = false; jam += 70000;
  h = await peti.flush(false);
  ok(h.dihantar === 2 && peti.bil() === 0, 'pelayan lancar -> semua item dihantar');

  // 4. ditolak kekal -> dibuang + amaran
  ({ peti, log } = cipta({ balas: () => ({ ok: false, kod: 'HILANG', error: 'dikunci oleh pengadil lain' }) }));
  peti.baris(live(1, 1), SIBUK); jam += 5000;
  h = await peti.flush(true);
  ok(h.ditolak === 1 && peti.bil() === 0 && log.maklum.some(m => m[1] === 'error'), 'ditolak pelayan -> dibuang & pengguna dimaklumkan');

  // 5. penghantaran terus menggantikan item tertunda; keputusan akhir dikekalkan
  ({ peti } = cipta());
  peti.baris(live(1, 0), SIBUK);
  await peti.sebelumHantar(live(2, 0));
  ok(peti.bil() === 0, 'penghantaran terus skor terkini membuang skor tertunda yang lama');
  peti.baris(bm(21, 15, 'TAMAT'), SIBUK);
  const reqLama = peti.senarai()[0].reqId;
  await peti.sebelumHantar(bm(21, 16, 'SEMASA', 'r-x'));
  const akhir = peti.senarai()[0];
  ok(peti.bil() === 1 && akhir.payload.jenis === 'TAMAT' && akhir.payload.skorP2 === 16 && akhir.reqId !== reqLama, 'keputusan TAMAT tertunda tidak hilang; dikemas kini dengan skor terbaharu + reqId baharu');

  // 6. susunan: penghantaran terus menunggu item sama kunci yang sedang dihantar
  let lepasJawapan; const susunan = [];
  ({ peti } = cipta({ balas: p => new Promise(res => { lepasJawapan = () => { susunan.push('flush:' + p.skorP1); res({ ok: true }); }; }) }));
  peti.baris(live(1, 0), SIBUK); jam += 5000;
  const f = peti.flush(true);
  await new Promise(r => setImmediate(r));
  let terusMula = false;
  const terus = peti.sebelumHantar(live(2, 0)).then(() => { terusMula = true; susunan.push('terus:2'); });
  await new Promise(r => setImmediate(r));
  ok(!terusMula, 'penghantaran terus MENUNGGU skor lama yang sedang dihantar');
  lepasJawapan(); await f; await terus;
  ok(susunan.join(',') === 'flush:1,terus:2', 'skor lama tiba dahulu, skor baharu terakhir (tiada tulis ganti oleh skor lama)');

  // 7. kunci Master Admin tidak disimpan dalam telefon
  ({ peti, st, log } = cipta());
  peti.baris(live(1, 0, { adminKey: '101010', admin: true }), SIBUK);
  ok(!st.getItem(L.KUNCI_SIMPANAN).includes('101010'), 'kunci Master Admin TIDAK ditulis ke LocalStorage');
  jam += 5000; h = await peti.flush(true);
  ok(log.hantar.length === 0 && peti.bil() === 1, 'tanpa kunci Admin dalam sesi -> item menunggu (tidak dihantar)');

  // 8. luput 6 jam
  ({ peti, log } = cipta());
  peti.baris(bm(1, 1), SIBUK); jam += L.HAD_UMUR_MS + 1;
  await peti.flush(true);
  ok(peti.bil() === 0 && log.hantar.length === 0 && log.maklum.length === 1, 'item lebih 6 jam dibuang dengan amaran');

  // 9. pajakan antara tab: hanya satu tab menghantar
  const kongsi = storan();
  const a = cipta({ simpanan: kongsi, deps: { tabId: 'A', sekali: () => new Promise(() => {}) } });
  const b = cipta({ simpanan: kongsi, deps: { tabId: 'B' } });
  a.peti.baris(bm(5, 5), SIBUK); jam += 5000;
  a.peti.flush(true); await new Promise(r => setImmediate(r));
  h = await b.peti.flush(true);
  ok(h.dihantar === 0 && b.log.hantar.length === 0, 'tab kedua tidak menghantar serentak (pajakan LocalStorage)');

  // 10. pengawal klik
  const pendengar = {};
  const doc = { addEventListener: (t, fn) => { pendengar[t] = fn; } };
  function butang(teks) { return { tagName: 'BUTTON', innerHTML: teks, disabled: false, isConnected: true, attrs: {}, cls: new Set(),
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    classList: { add() {}, remove() {}, contains: () => false }, closest(sel) { return /ux-ov/.test(sel) ? null : this; } }; }
  let t = 0; const pg = L.ciptaPengawalKlik(doc, { now: () => t });
  const btn = butang('💾 Simpan');
  pendengar.click({ target: btn });
  const lepas = pg.kunci({ action: 'simpanPasukan' });
  ok(btn.disabled && btn.innerHTML === '⏳ Menyimpan...', 'butang dikunci "⏳ Menyimpan..." semasa menunggu');
  const lepas2 = pg.kunci({ action: 'simpanJadual' });
  lepas(); ok(btn.disabled, 'kekal dikunci selagi permintaan kedua belum selesai');
  lepas2(); ok(!btn.disabled && btn.innerHTML === '💾 Simpan', 'butang dipulihkan selepas jawapan');
  const plus = butang('+1'); pendengar.click({ target: plus });
  ok(pg.kunci(live(1, 0)) === null && !plus.disabled, 'klik +1 (autosimpan skor) TIDAK dikunci - skor pantas kekal');
  const tamat = butang('Tamat'); pendengar.click({ target: tamat });
  const lt = pg.kunci(live(3, 1, { lepas: true })); ok(tamat.disabled, 'butang Tamat / hantar keputusan dikunci');
  tamat.innerHTML = '✅ Dihantar'; lt(); ok(tamat.innerHTML === '✅ Dihantar', 'label yang diubah oleh pengendali tidak ditimpa');
  const lain = butang('Log masuk'); pendengar.click({ target: lain }); t += 5000;
  ok(pg.kunci({ action: 'loginPengadil' }) === null, 'panggilan lewat (tiada klik baharu) tidak mengunci butang lama');

  console.log(`\n${pass} lulus, ${fail} gagal`); process.exit(fail ? 1 : 0);
})();
