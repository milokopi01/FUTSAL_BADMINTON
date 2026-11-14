/** Bahagian 1: pengasingan storan; tidak mengubah aliran pengadil Futsal. */
function jenisSukan_(nilai, lalai) {
  if (nilai === undefined || nilai === null || nilai === '') return lalai || 'FUTSAL';
  const sukan = String(nilai).trim().toUpperCase();
  if (sukan !== 'FUTSAL' && sukan !== 'BADMINTON') throw new Error('Sukan tidak sah: pilih FUTSAL atau BADMINTON.');
  return sukan;
}

function tabSukan_(jenis, data) {
  const sukan = jenisSukan_(jenis);
  const tabs = {
    FUTSAL: { jadual: SHEET_JADUAL, pasukan: 'Pasukan_Futsal', peraturan: 'Peraturan_Futsal', log: SHEET_LOG },
    BADMINTON: { jadual: SHEET_BM_JADUAL, pasukan: SHEET_BM_PASUKAN, peraturan: SHEET_BM_PERATURAN, log: 'Log_Pengesahan_Badminton' }
  };
  if (!tabs[sukan][data]) throw new Error('Jenis data tidak sah.');
  return tabs[sukan][data];
}

function semakSukanRekod_(list, sukan) {
  if (!Array.isArray(list)) return;
  list.forEach(function (r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('Rekod tidak sah.');
    Object.keys(r).forEach(function (k) {
      if (normalizeKey_(k) === 'sukan' && jenisSukan_(r[k], sukan) !== sukan) {
        throw new Error('Data sukan bercampur. Hantar FUTSAL dan BADMINTON dalam permintaan berasingan.');
      }
    });
  });
}

function tajukJadualSukan_(sukan, field) {
  const bm = { id: 'ID_Match', no: 'No_Per', namaP1: 'Nama_Pasukan_1', namaP2: 'Nama_Pasukan_2' };
  return sukan === 'BADMINTON' ? (bm[field] || FIELDS[field][0].replace(/ /g, '_')) : FIELDS[field][0];
}

// Tambah hanya tajuk yang belum wujud; kekalkan susunan, nilai dan lajur tambahan.
function sediaTabSukan_(nama, diperlukan) {
  const sheet = getOrCreateSheet_(nama);
  const header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const kosong = header.every(function (v) { return !v; });
  const ada = header.map(normalizeKey_);
  const missing = diperlukan.filter(function (h) { return ada.indexOf(normalizeKey_(h)) < 0; });
  if (missing.length) {
    const start = kosong ? 1 : header.length + 1;
    if (sheet.getMaxColumns() < start + missing.length - 1) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), start + missing.length - 1 - sheet.getMaxColumns());
    }
    sheet.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight('bold');
  }
  sheet.setFrozenRows(1);
  return sheet;
}

const PASUKAN_SUKAN_HEADER = ['ID_Pasukan', 'ID_Event', 'Kategori', 'Kumpulan', 'Kod', 'Singkatan',
  'Nama_Pasukan', 'Nama_Sekolah', 'Pemain_1', 'Pemain_2', 'Status_Penyertaan', 'Kemaskini_Terakhir'];

function setupDuaSukan() {
  const tabs = [];
  ['FUTSAL', 'BADMINTON'].forEach(function (sukan) {
    const nama = tabSukan_(sukan, 'jadual');
    // Gunakan alias tajuk lama; jangan tambah lajur kedua bagi medan yang sama.
    getJadualSheet_(sukan);
    sediaTabSukan_(tabSukan_(sukan, 'pasukan'), PASUKAN_SUKAN_HEADER);
    sediaTabSukan_(tabSukan_(sukan, 'peraturan'), ['Bahagian', 'Kod', 'Nilai', 'Keterangan']);
    sediaTabSukan_(tabSukan_(sukan, 'log'), ['Masa', 'Match', 'Keputusan', 'Tindakan', 'Oleh']);
    tabs.push(nama, tabSukan_(sukan, 'pasukan'), tabSukan_(sukan, 'peraturan'), tabSukan_(sukan, 'log'));
  });
  sediaTabSukan_(SHEET_KEJOHANAN, ['ID_Event', 'Sukan', 'Nama_Event', 'Kategori']);
  sediaTabSukan_(SHEET_GELANGGANG_INFO, ['ID_Gelanggang', 'Sukan', 'Nama_Gelanggang', 'Kategori', 'Aktif']);
  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove(BM_CACHE_KEY);
  return { ok: true, versi: API_VERSI, tab: tabs };
}

// Kedua-dua tindakan ialah UPSERT; syncPasukan tidak memadam rekod yang tidak dihantar.
function simpanPasukanSukan_(body, sukan) {
  const list = Array.isArray(body.teams) ? body.teams : Array.isArray(body.pasukan) ? body.pasukan : [body.pasukan || body.team];
  if (!list.length) throw new Error('Tiada data pasukan diterima.');
  semakSukanRekod_(list, sukan);
  const clean = list.map(function (r) {
    const out = {};
    Object.keys(r).forEach(function (k) { out[normalizeKey_(k)] = r[k]; });
    const id = String(out.idpasukan || out.id || '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{0,59}$/.test(id)) throw new Error('ID pasukan diperlukan dan mesti sah.');
    out.idpasukan = id;
    out.kemaskiniterakhir = new Date();
    return out;
  });
  const sheet = sediaTabSukan_(tabSukan_(sukan, 'pasukan'), PASUKAN_SUKAN_HEADER);
  const values = sheet.getDataRange().getValues();
  const keys = values[0].map(normalizeKey_);
  const idCol = keys.indexOf('idpasukan');
  const index = {};
  for (let i = 1; i < values.length; i++) index[String(values[i][idCol]).trim().toUpperCase()] = i;
  let inserted = 0, updated = 0;
  clean.forEach(function (r) {
    let i = index[r.idpasukan];
    if (i === undefined) { i = values.length; values.push(new Array(keys.length).fill('')); index[r.idpasukan] = i; inserted++; }
    else updated++;
    keys.forEach(function (k, c) {
      if (r[k] === undefined) return;
      const v = r[k];
      // Elakkan input pasukan menjadi formula Sheets.
      values[i][c] = typeof v === 'string' && /^[=+@-]/.test(v) ? "'" + v : v === null ? '' : v;
    });
  });
  sheet.getRange(1, 1, values.length, keys.length).setValues(values);
  SpreadsheetApp.flush();
  if (sukan === 'BADMINTON') CacheService.getScriptCache().remove(BM_CACHE_KEY);
  return { ok: true, versi: API_VERSI, sukan: sukan, sheet: sheet.getName(), ditambah: inserted, dikemaskini: updated };
}

// Dipanggil hanya selepas pengesahan Master Admin, di bawah kunci doPost.
function simpanJadualSukan_(body, sukan) {
  const id = String(body.id || '').trim().toUpperCase();
  const sheet = getJadualSheet_(sukan);
  const table = readTable_(sheet);
  const rec = table.rows.find(function (r) { return String(r.data.id).toUpperCase() === id; });
  if (!rec) throw new Error('Perlawanan tidak dijumpai dalam jadual ' + sukan + '.');
  const d = rec.data;
  const status = statusBaris_(d);
  if (status !== 'MENUNGGU GILIRAN' && status !== '') throw new Error('Hanya jadual perlawanan yang belum bermula boleh diubah.');
  if (sukan === 'FUTSAL' && lockedMatchIds_()[id]) throw new Error('Perlawanan dikunci pengadil. Lepaskan kunci dahulu.');
  const fields = ['masaJadual', 'gelanggang', 'namaP1', 'namaP2', 'kodP1', 'kodP2'];
  const asal = body.asal;
  if (!asal || fields.concat(['kemaskini']).some(function (f) { return !samaNilai_(d[f], asal[f]); })) {
    return { ok: false, kod: 'LAPUK', error: 'Jadual telah berubah. Muat semula sebelum menyimpan.' };
  }
  const changes = body.jadual || {};
  const next = {};
  fields.forEach(function (f) {
    if (changes[f] === undefined) throw new Error('Data jadual tidak lengkap.');
    const value = String(changes[f] || '').trim();
    if (f === 'masaJadual') {
      if (value && (!/Z$|[+-]\d{2}:\d{2}$/.test(value) || isNaN(new Date(value).getTime()))) throw new Error('Masa jadual tidak sah.');
      next[f] = value ? new Date(value) : '';
    } else {
      if (value.length > 120 || /^[=+@]/.test(value)) throw new Error('Nilai jadual tidak sah.');
      next[f] = f === 'gelanggang' || f === 'kodP1' || f === 'kodP2' ? value.toUpperCase() : value;
    }
  });
  if (!next.gelanggang || !next.namaP1 || !next.namaP2) throw new Error('Gelanggang dan kedua-dua pasukan diperlukan.');
  if (next.namaP1.toUpperCase() === next.namaP2.toUpperCase()) throw new Error('Pasukan 1 dan Pasukan 2 mesti berbeza.');
  const row = table.values[rec.rowIndex].slice();
  fields.forEach(function (f) { row[table.colOf[f]] = next[f]; });
  row[table.colOf.kemaskini] = new Date();
  sheet.getRange(rec.rowIndex + 1, 1, 1, row.length).setValues([row]);
  SpreadsheetApp.flush();
  if (sukan === 'BADMINTON') CacheService.getScriptCache().remove(BM_CACHE_KEY);
  return { ok: true, versi: API_VERSI, sukan: sukan, id: id, sheet: sheet.getName() };
}

function simpanSkorSukan_(body, sukan) {
  const id = String(body.id || '').trim().toUpperCase();
  const sheet = getJadualSheet_(sukan);
  const table = readTable_(sheet);
  const rec = table.rows.find(function (r) { return String(r.data.id).toUpperCase() === id; });
  if (!rec) throw new Error('Perlawanan tidak dijumpai untuk ' + sukan + '.');
  const d = rec.data;
  if (sukan === 'FUTSAL' && lockedMatchIds_()[id]) throw new Error('Skor dikendalikan pengadil. Lepaskan kunci dahulu.');
  if (sukan === 'FUTSAL' && isRowFinal_(table.values[rec.rowIndex], table.colOf)) throw new Error('Keputusan Futsal disahkan: gunakan Pembetulan Markah sedia ada.');
  if (String(d.fasaMasa || '').toUpperCase() === 'REHAT KECEMASAN') throw new Error('Skor dibekukan semasa Rehat Kecemasan.');
  const fields = ['skorP1','skorP2','status','pengesahan','pemenangPenalti','kemaskini','namaP1','namaP2','versiPembetulan'];
  if (!body.asal || fields.some(function (f) { return !samaNilai_(d[f], body.asal[f]); })) return { ok:false, kod:'LAPUK', error:'Skor telah berubah. Muat semula sebelum menyimpan.' };
  const x = body.skor || {};
  const s1 = skorInt_(x.skorP1), s2 = skorInt_(x.skorP2);
  if (s1 === null || s2 === null) throw new Error('Skor mesti nombor bulat 0 hingga 99.');
  if (x.keputusan !== 'SEMENTARA' && x.keputusan !== 'DISAHKAN') throw new Error('Pilihan keputusan tidak sah.');
  const final = x.keputusan === 'DISAHKAN';
  if (!d.namaP1 || !d.namaP2 || isNamaPlaceholder_(d.namaP1) || isNamaPlaceholder_(d.namaP2)) throw new Error('Pasukan bertanding belum lengkap.');
  if (final && sukan === 'BADMINTON' && s1 === s2) throw new Error('Keputusan Badminton tidak boleh seri.');
  let penalti = '';
  if (final && sukan === 'FUTSAL' && isKnockoutStage_(d.peringkat) && s1 === s2) {
    if (x.pemenangPenalti !== 'P1' && x.pemenangPenalti !== 'P2') throw new Error('Pilih pemenang penalti bagi Futsal kalah mati yang seri.');
    penalti = x.pemenangPenalti === 'P1' ? d.namaP1 : d.namaP2;
  }
  // Rekod sudah disahkan tidak dibuka semula melalui simpanan sementara.
  if (String(d.pengesahan).toUpperCase() === 'DISAHKAN' && !final) throw new Error('Keputusan disahkan tidak boleh ditukar kepada sementara.');
  const now = new Date();
  const row = table.values[rec.rowIndex].slice();
  const set = function (f,v) { row[table.colOf[f]] = v; };
  set('skorP1',s1); set('skorP2',s2); set('pemenangPenalti',penalti); set('kemaskini',now);
  if (final) {
    set('status','SELESAI'); set('pengesahan','DISAHKAN'); set('fasaMasa','Tamat');
    set('disahkanOleh','Master Admin'); set('disahkanPada',now);
    if (!d.masaTamat) set('masaTamat',now);
  }
  sheet.getRange(rec.rowIndex+1,1,1,row.length).setValues([row]);
  tambahApprovalLog_([{masa:now.toISOString(),matchId:id,keputusan:s1+' - '+s2,tindakan:final?'SKOR ADMIN DISAHKAN':'SKOR ADMIN SEMENTARA',oleh:'Master Admin'}],sukan);
  SpreadsheetApp.flush();
  if (sukan === 'BADMINTON') CacheService.getScriptCache().remove(BM_CACHE_KEY);
  else if (final) { rombakJadualPelayan_(); lepasKunciMuktamad_(); }
  return {ok:true,versi:API_VERSI,sukan:sukan,id:id,skorP1:s1,skorP2:s2,keputusan:final?'DISAHKAN':'SEMENTARA'};
}