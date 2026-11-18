/* =========================================================
   v1.49.0: URUS JADUAL TERUS DARI PAPARAN JADUAL PENUH
   - SATU format jadual untuk SEMUA sukan (Futsal & Badminton).
   - Master Admin boleh ＋ Tambah, ✎ Edit dan 🗑 Padam perlawanan AKAN DATANG
     (belum bermula) terus di paparan Jadual Penuh. Perlawanan yang telah
     bermula / tamat dikunci.
   - Memerlukan Code.gs v1.26.0 (action urusJadual).
   ========================================================= */
(function () {
  'use strict';
  const VERSI_MIN = '1.26.0';
  const PERINGKAT = ['PERINGKAT KUMPULAN', 'PUSINGAN KEDUA', 'SUKU AKHIR', 'SEPARUH AKHIR', 'TEMPAT 3/4', 'AKHIR', 'PERLAWANAN PERSAHABATAN'];
  const FS_ID = /^(SR|SM)-\d{1,3}$/;
  const up = v => String(v == null ? '' : v).trim().toUpperCase();
  const str = v => String(v == null ? '' : v).trim();
  const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v)
    : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = (t, k, ms) => { try { showToast(t, k || 'info', ms); } catch (e) { console.log(t); } };
  let busy = false;
  let ctx = null;   // { sukan, op, id, asal }

  function bolehUrus() {
    try {
      if (typeof isShareView === 'function' && isShareView()) return false;
      return typeof canManageSystem === 'function' && canManageSystem();
    } catch (e) { return false; }
  }

  /* ---------------- Data setiap sukan ---------------- */
  function bmData() { try { return bmSource(); } catch (e) { return { teams: [], matches: [] }; } }
  function cariMatch(sukan, id) {
    id = up(id);
    if (sukan === 'FUTSAL') {
      const m = typeof getMatch === 'function' ? getMatch(id) : null;
      if (!m) return null;
      return { id: m.id, kat: m.kategori, peringkat: m.peringkat, kumpulan: m.kumpulan === '-' ? '' : (m.kumpulan || ''),
        gel: m.gelanggang, nama1: m.namaP1 || '', nama2: m.namaP2 || '', kod1: m.kodP1 || '', kod2: m.kodP2 || '',
        masa: m.masaJadual || '', status: m.status };
    }
    const m = (bmData().matches || []).find(x => up(x.id) === id);
    if (!m) return null;
    return { id: m.id, kat: m.kat, peringkat: m.peringkat, kumpulan: m.kumpulan || '', gel: m.gel, nama1: m.nama1 || '', nama2: m.nama2 || '',
      kod1: m.kod1 || '', kod2: m.kod2 || '', sing1: m.sing1 || '', sing2: m.sing2 || '', masa: m.masa || '', status: m.status };
  }
  function senaraiPasukan(sukan, kat) {
    if (sukan === 'FUTSAL') {
      return (typeof state !== 'undefined' && Array.isArray(state.teams) ? state.teams : [])
        .filter(t => t.kategori === kat && t.nama)
        .map(t => ({ nama: t.nama, kod: t.kod || '', kumpulan: t.kumpulan || '', sing: '' }));
    }
    return (bmData().teams || []).filter(t => t.kat === kat && t.status === 'AKTIF' && t.nama)
      .map(t => ({ nama: t.nama, kod: t.kod || '', kumpulan: t.kumpulan || '', sing: t.sing || '' }));
  }
  function senaraiGelanggang(sukan, kat) {
    let ids = [];
    if (sukan === 'FUTSAL') {
      try { ids = state.courts.filter(c => courtAccepts(c, kat)).map(c => c.id); } catch (e) { ids = []; }
      if (!ids.length) ids = ['A', 'B', 'C', 'D'];
    } else {
      try {
        if (typeof bmc !== 'undefined' && bmc && Array.isArray(bmc.cfg) && bmc.cfg.length) {
          ids = bmc.cfg.filter(g => g.aktif !== false && (g.kategori === 'SEMUA' || g.kategori === kat)).map(g => g.id);
        }
      } catch (e) { ids = []; }
      if (!ids.length) ids = Array.from(new Set((bmData().matches || []).map(m => str(m.gel)).filter(Boolean)));
      if (!ids.length) ids = ['1', '2', '3', '4', '5', '6'];
      ids.sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b));
    }
    return ids;
  }

  /* ---------------- Label & butang ---------------- */
  function kemasLabel() {
    const set = (id, t) => { const el = document.getElementById(id); if (el && el.textContent !== t) el.textContent = t; };
    let nf = 0, sr = 0, sm = 0, nb = 0, bsr = 0, bsm = 0;
    try { const ms = state.matches || []; nf = ms.length; sr = ms.filter(m => m.kategori === 'SR').length; sm = ms.filter(m => m.kategori === 'SM').length; } catch (e) { /* abaikan */ }
    try { const ms = bmData().matches || []; nb = ms.length; bsr = ms.filter(m => m.kat === 'SR').length; bsm = ms.filter(m => m.kat === 'SM').length; } catch (e) { /* abaikan */ }
    set('scheduleTitle', `⚽ Jadual Penuh Futsal (${nf} Perlawanan)`);
    set('scheduleSub', `${sr} perlawanan Sekolah Rendah · ${sm} perlawanan Sekolah Menengah`);
    set('bmScheduleTitle', `🏸 Jadual Penuh Badminton (${nb} Perlawanan)`);
    set('bmScheduleSub', `${bsr} perlawanan Sekolah Rendah · ${bsm} perlawanan Sekolah Menengah`);
    set('tabLblJadualFs', `Jadual Penuh (${nf} Match)`);
    set('tabLblJadualBm', `Jadual Penuh (${nb} Match)`);
    set('tabLblJadualSemua', `Jadual Penuh (${nf + nb} Match)`);
    set('statTotalMatches', String(nf));
    const boleh = bolehUrus();
    document.querySelectorAll('[data-jd-tambah]').forEach(b => b.classList.toggle('hidden', !boleh));
  }

  function aksiHtml(sukan, id, boleh) {
    if (!bolehUrus()) return '';
    if (!boleh) return '<span class="jd-lock" title="Perlawanan telah bermula / tamat - tidak boleh diubah">🔒 Terkunci</span>';
    const sid = String(id).replace(/[^A-Za-z0-9_-]/g, '');
    return `<div class="jd-act-btns"><button type="button" class="btn btn-sm" onclick="JadualUrus.ubah('${sukan}','${sid}')" title="Edit ${sid}">✎ Edit</button>` +
      `<button type="button" class="btn btn-sm btn-danger" onclick="JadualUrus.padam('${sukan}','${sid}')" title="Padam ${sid}">🗑 Padam</button></div>`;
  }

  /* ---------------- Tetingkap borang ---------------- */
  function binaModal() {
    let el = document.getElementById('jdModal');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'jdModal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'jdTitle');
    el.innerHTML = `
      <div class="modal modal-wide">
        <div class="modal-head">
          <div><h3 id="jdTitle">Tambah Perlawanan</h3><p id="jdSub"></p></div>
          <button type="button" class="modal-close" data-jd-tutup aria-label="Tutup">×</button>
        </div>
        <form id="jdForm" autocomplete="off" novalidate>
          <div class="jd-grid">
            <div class="field"><label for="jdKat">Kategori *</label>
              <select class="select" id="jdKat" name="kategori"><option value="SR">Sekolah Rendah (SR)</option><option value="SM">Sekolah Menengah (SM)</option></select></div>
            <div class="field"><label for="jdPeringkat">Peringkat *</label>
              <select class="select" id="jdPeringkat" name="peringkat">${PERINGKAT.map(p => `<option value="${p}">${p}</option>`).join('')}</select></div>
            <div class="field"><label for="jdKump">Kumpulan</label><input class="input" id="jdKump" name="kumpulan" maxlength="10" placeholder="cth. A (kosong untuk kalah mati)" /></div>
            <div class="field"><label for="jdGel">Gelanggang *</label><select class="select" id="jdGel" name="gelanggang"></select></div>
            <div class="field"><label for="jdP1">Pasukan 1 *</label><input class="input" id="jdP1" name="namaP1" list="jdTeams" maxlength="120" placeholder="Pilih / taip nama pasukan" /></div>
            <div class="field"><label for="jdP2">Pasukan 2 *</label><input class="input" id="jdP2" name="namaP2" list="jdTeams" maxlength="120" placeholder="Pilih / taip nama pasukan" /></div>
            <div class="field"><label for="jdK1">Kod Pasukan 1</label><input class="input mono" id="jdK1" name="kodP1" maxlength="30" placeholder="cth. A1 / JOHAN-A / MENANG-10" /></div>
            <div class="field"><label for="jdK2">Kod Pasukan 2</label><input class="input mono" id="jdK2" name="kodP2" maxlength="30" placeholder="cth. A2 / NJOHAN-B" /></div>
            <div class="field jd-wide"><label for="jdMasa">Masa Jadual (Malaysia)</label><input class="input" type="datetime-local" id="jdMasa" name="masaJadual" />
              <span class="field-hint">Pilihan. Giliran P1, P2, P3 … tetap disusun automatik ikut pusingan gelanggang. Untuk slot kalah mati, isi kod sahaja (cth. JOHAN-A) – nama diisi automatik bila keputusan disahkan.</span></div>
          </div>
          <datalist id="jdTeams"></datalist>
          <div class="form-msg" id="jdMsg" role="status" aria-live="polite"></div>
          <div class="modal-foot">
            <button type="button" class="btn" data-jd-tutup>Batal</button>
            <button type="submit" class="btn btn-primary" id="jdSave">💾 Simpan</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-jd-tutup]')) tutup(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('open')) tutup(); });
    const form = el.querySelector('#jdForm');
    form.addEventListener('submit', e => { e.preventDefault(); simpan(); });
    el.querySelector('#jdKat').addEventListener('change', () => isiPilihan(true));
    ['1', '2'].forEach(sd => {
      el.querySelector('#jdP' + sd).addEventListener('change', () => autoKod(sd));
    });
    return el;
  }
  function f(id) { return document.getElementById(id); }
  function msg(t, ralat) {
    const m = f('jdMsg'); if (!m) return;
    m.textContent = t || '';
    m.classList.toggle('error', !!ralat);
  }
  function tutup() {
    if (busy) return;
    const el = f('jdModal');
    if (el) el.classList.remove('open');
    ctx = null;
  }
  function isiPilihan(tukarKat) {
    if (!ctx) return;
    const kat = f('jdKat').value;
    const gel = f('jdGel');
    const kini = tukarKat ? '' : gel.value;
    const ids = senaraiGelanggang(ctx.sukan, kat);
    const pilih = kini || (ctx.asalData && ctx.asalData.gel) || '';
    if (pilih && !ids.includes(pilih)) ids.unshift(pilih);
    gel.innerHTML = ids.map(g => `<option value="${esc(g)}">Gelanggang ${esc(g)}</option>`).join('');
    if (pilih) gel.value = pilih;
    f('jdTeams').innerHTML = senaraiPasukan(ctx.sukan, kat).map(t => `<option value="${esc(t.nama)}">${esc([t.kod, t.kumpulan ? 'Kump. ' + t.kumpulan : ''].filter(Boolean).join(' · '))}</option>`).join('');
  }
  function autoKod(sd) {
    if (!ctx) return;
    const nama = up(f('jdP' + sd).value);
    const t = senaraiPasukan(ctx.sukan, f('jdKat').value).find(x => up(x.nama) === nama);
    if (!t) return;
    if (t.kod) f('jdK' + sd).value = t.kod;
    if (t.kumpulan && !str(f('jdKump').value) && f('jdPeringkat').value === 'PERINGKAT KUMPULAN') f('jdKump').value = t.kumpulan;
  }
  function masaKeInput(iso) {
    try { if (typeof masaJadualInput === 'function') return masaJadualInput(iso); } catch (e) { /* abaikan */ }
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 16);
  }

  function buka(sukan, op, id) {
    if (!bolehUrus()) { toast('Hanya Master Admin boleh mengurus jadual.', 'error'); return; }
    if (!(typeof getGasUrl === 'function' && getGasUrl())) { toast('URL Google Apps Script belum ditetapkan.', 'error'); return; }
    const el = binaModal();
    let data = null;
    if (op === 'ubah') {
      data = cariMatch(sukan, id);
      if (!data) { toast(`Perlawanan ${id} tidak dijumpai.`, 'error'); return; }
    }
    ctx = { sukan, op, id: data ? data.id : '', asalData: data };
    f('jdTitle').textContent = op === 'ubah' ? `✎ Edit Perlawanan ${data.id}` : `＋ Tambah Perlawanan ${sukan === 'FUTSAL' ? 'Futsal' : 'Badminton'}`;
    f('jdSub').textContent = op === 'ubah'
      ? `${sukan === 'FUTSAL' ? '⚽ Futsal' : '🏸 Badminton'} · hanya perlawanan yang belum bermula boleh diubah.`
      : `${sukan === 'FUTSAL' ? '⚽ Futsal' : '🏸 Badminton'} · ID & nombor perlawanan dijana automatik.`;
    f('jdKat').value = data ? (data.kat === 'SM' ? 'SM' : 'SR') : (typeof state !== 'undefined' && state.ui && state.ui.kategori === 'SM' ? 'SM' : 'SR');
    f('jdKat').disabled = op === 'ubah';   // ID bergantung pada kategori
    const per = data ? up(data.peringkat) || 'PERINGKAT KUMPULAN' : 'PERINGKAT KUMPULAN';
    const selP = f('jdPeringkat');
    if (!Array.from(selP.options).some(o => o.value === per)) selP.insertAdjacentHTML('beforeend', `<option value="${esc(per)}">${esc(per)}</option>`);
    selP.value = per;
    f('jdKump').value = data ? data.kumpulan : '';
    f('jdP1').value = data ? data.nama1 : '';
    f('jdP2').value = data ? data.nama2 : '';
    f('jdK1').value = data ? data.kod1 : '';
    f('jdK2').value = data ? data.kod2 : '';
    f('jdMasa').value = data ? masaKeInput(data.masa) : '';
    f('jdGel').innerHTML = '';   // pilihan gelanggang dibina semula ikut sukan
    isiPilihan(false);
    msg('');
    el.classList.add('open');
    setTimeout(() => { const x = op === 'ubah' ? f('jdP1') : f('jdKat'); if (x) x.focus(); }, 60);
  }

  async function simpan() {
    if (busy || !ctx) return;
    if (!bolehUrus()) { msg('Hanya Master Admin boleh mengurus jadual.', true); return; }
    const sukan = ctx.sukan, op = ctx.op;
    const v = {
      kategori: f('jdKat').value, peringkat: up(f('jdPeringkat').value), kumpulan: up(f('jdKump').value),
      gelanggang: up(f('jdGel').value), namaP1: str(f('jdP1').value), namaP2: str(f('jdP2').value),
      kodP1: up(f('jdK1').value), kodP2: up(f('jdK2').value), masaJadual: str(f('jdMasa').value)
    };
    if (!v.gelanggang) { msg('Pilih gelanggang.', true); return; }
    if (!(v.namaP1 || v.kodP1) || !(v.namaP2 || v.kodP2)) { msg('Isi nama (atau kod slot) bagi kedua-dua pasukan.', true); return; }
    if ((v.namaP1 && up(v.namaP1) === up(v.namaP2)) || (!v.namaP1 && !v.namaP2 && v.kodP1 === v.kodP2)) { msg('Pasukan 1 dan Pasukan 2 mesti berbeza.', true); return; }
    if (sukan === 'FUTSAL') {
      // Futsal menyimpan nama placeholder (cth. JOHAN KUMPULAN A) bagi slot kalah mati
      ['1', '2'].forEach(sd => { if (!v['namaP' + sd]) { let ph = null; try { ph = placeholderFor(v['kodP' + sd]); } catch (e) { ph = null; } v['namaP' + sd] = ph || v['kodP' + sd]; } });
    }
    if (v.masaJadual) {
      const d = new Date(v.masaJadual + ':00+08:00');
      if (isNaN(d.getTime())) { msg('Masa jadual tidak sah.', true); return; }
      v.masaJadual = d.toISOString();
    }
    const jadual = Object.assign({}, v);
    if (sukan === 'BADMINTON') {
      const tm = kod => senaraiPasukan(sukan, v.kategori).find(t => t.kod && t.kod === kod);
      ['1', '2'].forEach(sd => { const t = tm(v['kodP' + sd]); jadual['sing' + sd] = t && up(t.nama) === up(v['namaP' + sd]) ? t.sing : ''; });
    }
    const payload = { action: 'urusJadual', sukan, op, jadual };
    if (op === 'ubah') {
      payload.id = ctx.id;
      if (sukan === 'BADMINTON') {
        // Semakan data lapuk: nama asal seperti di Google Sheets
        const raw = ((typeof dash !== 'undefined' && dash.bm && dash.bm.data && dash.bm.data.matches) || []).find(x => up(x.id) === up(ctx.id));
        if (raw) payload.asal = { namaP1: raw.nama1 || '', namaP2: raw.nama2 || '' };
      }
    }
    await hantar(payload, v);
  }

  function setBusy(b) {
    busy = b;
    const el = f('jdModal');
    if (el) el.querySelectorAll('input,select,button').forEach(x => { if (x.id !== 'jdKat' || !ctx || ctx.op !== 'ubah') x.disabled = b; });
  }

  async function panggil(payload) {
    const key = await ensureAdminKey();
    if (!key) throw new Error('PIN Master Admin diperlukan.');
    const res = await callGas(Object.assign({ adminKey: key }, payload));
    if (!res || !res.ok) {
      const e = String((res && res.error) || 'Simpanan jadual gagal.');
      if (/tidak dikenali|khusus untuk FUTSAL/i.test(e)) throw new Error(`Google Sheets masih menjalankan Code.gs lama. Tampal Code.gs v${VERSI_MIN} > Deploy > Manage deployments > Edit > New version.`);
      throw new Error(e);
    }
    if (typeof cmpVersi === 'function' && cmpVersi(res.versi || '0', VERSI_MIN) < 0) {
      throw new Error(`Urus Jadual memerlukan Code.gs v${VERSI_MIN}. Sila deploy versi baharu.`);
    }
    return res;
  }

  async function hantar(payload, v) {
    setBusy(true);
    msg(payload.op === 'padam' ? 'Memadam…' : 'Menyimpan ke Google Sheets…');
    try {
      const res = await panggil(payload);
      const id = up(res.id || payload.id);
      if (payload.sukan === 'FUTSAL') terapFutsal(payload.op, id, v, res);
      else await muatBadminton();
      try { if (typeof window.umumkanPerubahan === 'function') window.umumkanPerubahan(payload.sukan, 'jadual'); } catch (e) { /* abaikan */ }
      const teks = payload.op === 'tambah' ? `✅ Perlawanan ${id} ditambah ke jadual ${payload.sukan === 'FUTSAL' ? 'Futsal' : 'Badminton'}.`
        : payload.op === 'ubah' ? `✅ Jadual ${id} dikemas kini.` : `🗑 Perlawanan ${id} dipadam daripada jadual.`;
      toast(teks, 'success', 4500);
      busy = false;
      tutup();
      return true;
    } catch (err) {
      msg((err && err.message) || 'Simpanan gagal; input dikekalkan.', true);
      if (payload.op === 'padam') toast((err && err.message) || 'Padam gagal.', 'error', 6000);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function muatBadminton() {
    try { if (typeof dash !== 'undefined' && dash.bm) dash.bm.at = 0; } catch (e) { /* abaikan */ }
    try { if (typeof dashRefresh === 'function') await dashRefresh(true, ['BADMINTON']); } catch (e) { console.warn('[JadualUrus] dashRefresh', e); }
    try { if (typeof renderBadmintonViews === 'function') renderBadmintonViews(); } catch (e) { /* abaikan */ }
  }

  /* ---------------- Futsal: state tempatan ---------------- */
  function fasaUntuk(peringkat) {
    try {
      const map = { 'PERINGKAT KUMPULAN': FASA.KUMPULAN, 'PUSINGAN KEDUA': FASA.SR_PUSINGAN_2, 'SUKU AKHIR': FASA.SM_SUKU_AKHIR,
        'SEPARUH AKHIR': FASA.SEPARUH_AKHIR, 'TEMPAT 3/4': FASA.TEMPAT_3_4, 'AKHIR': FASA.AKHIR };
      return map[up(peringkat)] || FASA.KUMPULAN;
    } catch (e) { return ''; }
  }
  function buangLokal(id) {
    const i = state.matches.findIndex(m => m.id === id);
    if (i < 0) return false;
    state.matches.splice(i, 1);
    (state.courts || []).forEach(c => {
      let sibuk = false;
      try { sibuk = isCourtBusy(c); } catch (e) { sibuk = false; }
      if (c.matchSemasa === id && !sibuk) c.matchSemasa = null;
      if (c.matchSeterusnya === id) c.matchSeterusnya = null;
    });
    if (state.courtSusunan) delete state.courtSusunan[id];
    if (state.courtKunciAcara) delete state.courtKunciAcara[id];
    return true;
  }
  function binaLokal(id, kat, no, v, extra) {
    const ev = (typeof EVENTS !== 'undefined' && EVENTS[kat]) || {};
    return Object.assign({
      id, eventId: ev.id || '', no: Number(no) || 0, kategori: kat, kategoriNama: ev.kategori || (kat === 'SR' ? 'SEKOLAH RENDAH' : 'SEKOLAH MENENGAH'),
      peringkat: v.peringkat || 'PERINGKAT KUMPULAN', kumpulan: v.kumpulan || '-',
      kodP1: v.kodP1 || '', namaP1: v.namaP1 || '', skorP1: null, skorP2: null, kodP2: v.kodP2 || '', namaP2: v.namaP2 || '',
      gelanggang: v.gelanggang, fasa: fasaUntuk(v.peringkat), status: MATCH_STATUS.MENUNGGU, pengesahan: 'MENUNGGU',
      pengadil: null, masaMula: null, masaTamat: null, disahkanOleh: null, disahkanPada: null, catatan: '',
      masaJadual: v.masaJadual || null, jadualVersi: 0
    }, extra || {});
  }
  function selepasUbahFutsal() {
    try { releaseMisplacedCourtMatches(); } catch (e) { /* abaikan */ }
    try { autoAssignCourts(null, { silent: true }); } catch (e) { console.warn('[JadualUrus] autoAssignCourts', e); }
    try { saveState(); } catch (e) { /* abaikan */ }
    try { refreshAllViews(); } catch (e) { console.warn('[JadualUrus] refreshAllViews', e); }
  }
  function terapFutsal(op, id, v, res) {
    if (op === 'padam') { buangLokal(id); selepasUbahFutsal(); return; }
    const jv = Number(res.jadualVersi) || Date.now();
    if (op === 'tambah') {
      if (!getMatch(id)) state.matches.push(binaLokal(id, v.kategori, res.no, v, { jadualVersi: jv }));
    } else {
      const m = getMatch(id);
      if (m) {
        Object.assign(m, { peringkat: v.peringkat, kumpulan: v.kumpulan || '-', kodP1: v.kodP1, namaP1: v.namaP1, kodP2: v.kodP2, namaP2: v.namaP2,
          gelanggang: v.gelanggang, fasa: fasaUntuk(v.peringkat), masaJadual: v.masaJadual || null, jadualVersi: jv });
      }
    }
    selepasUbahFutsal();
  }

  // Dipanggil setiap kali jadual Futsal dibaca daripada Google Sheets (semua peranti):
  // perlawanan baharu ditambah, perlawanan dipadam dibuang, suntingan Master Admin diterap.
  function segerakFutsal(data) {
    if (!data || !Array.isArray(data.matches) || typeof state === 'undefined' || !Array.isArray(state.matches)) return false;
    if (!Array.isArray(data.dipadam) && !data.jadualVersi) return false;   // Code.gs lama
    const dip = new Set((data.dipadam || []).map(up));
    const jv = data.jadualVersi || {};
    let ubah = false;
    state.matches.slice().forEach(m => {
      if (dip.has(up(m.id)) && m.status === MATCH_STATUS.MENUNGGU) { if (buangLokal(m.id)) ubah = true; }
    });
    data.matches.forEach(row => {
      const id = up(row.id);
      const versi = Number(jv[id]) || 0;
      if (!FS_ID.test(id) || dip.has(id) || !versi) return;
      const kat = id.slice(0, 2);
      const nm = (n, k) => { const s = str(n); if (s) return s; let ph = null; try { ph = placeholderFor(k); } catch (e) { ph = null; } return ph || up(k); };
      const v = {
        peringkat: up(row.peringkat) || 'PERINGKAT KUMPULAN', kumpulan: up(row.kumpulan) || '-',
        kodP1: up(row.kodP1), kodP2: up(row.kodP2), namaP1: nm(row.namaP1, row.kodP1), namaP2: nm(row.namaP2, row.kodP2),
        gelanggang: up(row.gelanggang), masaJadual: row.masaJadual || null
      };
      let m = getMatch(id);
      if (!m) {
        const st = srvStatus(row.status);
        const extra = { jadualVersi: versi };
        if (st && st !== MATCH_STATUS.MENUNGGU) {
          Object.assign(extra, { status: st, pengesahan: up(row.pengesahan) || 'MENUNGGU', skorP1: srvScore(row.skorP1), skorP2: srvScore(row.skorP2),
            masaMula: row.masaMula || null, masaTamat: row.masaTamat || null, disahkanOleh: row.disahkanOleh || null, disahkanPada: row.disahkanPada || null,
            pengadil: row.pengadil || null });
        }
        state.matches.push(binaLokal(id, kat, row.no, v, extra));
        ubah = true;
        return;
      }
      if (versi <= (Number(m.jadualVersi) || 0)) return;
      if (m.status === MATCH_STATUS.MENUNGGU) {
        let gelOk = false;
        try { gelOk = !!getCourt(v.gelanggang); } catch (e) { gelOk = false; }
        Object.assign(m, { peringkat: v.peringkat, kumpulan: v.kumpulan, kodP1: v.kodP1, kodP2: v.kodP2, namaP1: v.namaP1, namaP2: v.namaP2,
          fasa: fasaUntuk(v.peringkat), masaJadual: v.masaJadual }, gelOk ? { gelanggang: v.gelanggang } : {});
      }
      m.jadualVersi = versi;
      ubah = true;
    });
    if (ubah) selepasUbahFutsal();
    return ubah;
  }

  /* ---------------- API awam ---------------- */
  function padam(sukan, id) {
    if (!bolehUrus() || busy) return;
    const d = cariMatch(sukan, id);
    if (!d) { toast(`Perlawanan ${id} tidak dijumpai.`, 'error'); return; }
    const teks = `Padam perlawanan ${d.id}?\n\n${d.nama1 || d.kod1} lwn ${d.nama2 || d.kod2}\n${d.peringkat}${d.kumpulan ? ' · Kumpulan ' + d.kumpulan : ''} · Gelanggang ${d.gel}\n\nTindakan ini tidak boleh dibatalkan.`;
    if (!window.confirm(teks)) return;
    hantar({ action: 'urusJadual', sukan, op: 'padam', id: d.id }, null);
  }

  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-jd-tambah]');
    if (b) buka(b.dataset.jdTambah, 'tambah');
  });
  const mula = () => {
    try { kemasLabel(); } catch (e) { /* abaikan */ }
    // Lukis semula jadual supaya lajur Tindakan muncul (skrip ini dimuat selepas skrip utama)
    try { if (typeof renderSchedule === 'function') renderSchedule(); } catch (e) { /* abaikan */ }
    try { if (typeof renderBadmintonViews === 'function') renderBadmintonViews(); } catch (e) { /* abaikan */ }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mula); else mula();

  window.JadualUrus = {
    bolehUrus, aksiHtml, kemasLabel, segerakFutsal,
    tambah: sukan => buka(sukan, 'tambah'),
    ubah: (sukan, id) => buka(sukan, 'ubah', id),
    padam
  };
})();
