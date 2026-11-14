/* Bahagian 2: borang pasukan menggunakan API Bahagian 1, tanpa mengubah jadual. */
// Bahagian 6: crypto.randomUUID tiada pada pelayar lama / sambungan bukan HTTPS -> sandaran selamat
function idRawak() {
  try { if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID().toUpperCase(); } catch (e) { /* sandaran */ }
  const b = new Uint8Array(16);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}
function binaPayloadPasukan(values, adminKey, id) {
  const sukan = values.sukan;
  if (!['FUTSAL', 'BADMINTON'].includes(sukan)) throw new Error('Sila pilih Futsal atau Badminton.');
  const nama = String(values.nama || '').trim();
  if (!nama) throw new Error('Nama pasukan diperlukan.');
  if (!['SR', 'SM'].includes(values.kategori)) throw new Error('Sila pilih kategori.');
  if (!adminKey) throw new Error('PIN Master Admin diperlukan.');
  return {
    action: 'simpanPasukan', sukan, adminKey,
    pasukan: {
      ID_Pasukan: id, Sukan: sukan, Kategori: values.kategori,
      Nama_Pasukan: nama, Nama_Sekolah: String(values.sekolah || '').trim(),
      Kod: String(values.kod || '').trim().toUpperCase(),
      Kumpulan: String(values.kumpulan || '').trim().toUpperCase(),
      Singkatan: String(values.singkatan || '').trim(),
      Pemain_1: sukan === 'BADMINTON' ? String(values.pemain1 || '').trim() : '',
      Pemain_2: sukan === 'BADMINTON' ? String(values.pemain2 || '').trim() : '',
      Status_Penyertaan: 'AKTIF'
    }
  };
}

function initAdminPasukan() {
  const form = document.getElementById('adminTeamForm');
  if (!form) return;
  const sukanInput = document.getElementById('adminTeamSport');
  const status = document.getElementById('adminTeamStatus');
  const body = document.getElementById('adminTeamRows');
  const save = document.getElementById('adminTeamSave');
  const refresh = document.getElementById('adminTeamRefresh');
  const playerFields = document.getElementById('adminTeamPlayers');
  const fields = Array.from(form.querySelectorAll('input, select'));
  let busy = false;
  let readSeq = 0;
  let draftId = '';
  let draftSport = '';
  const message = (text, error = false) => {
    status.textContent = text;
    status.classList.toggle('team-error', error);
  };
  const lock = (value) => {
    busy = value;
    save.disabled = value;
    refresh.disabled = value;
    fields.forEach(el => { el.disabled = value; });
    save.textContent = value ? 'Menyimpan…' : '＋ Daftar Pasukan';
  };
  async function readTeams(sukan) {
    const data = await dashFetch('pasukan&sukan=' + encodeURIComponent(sukan));
    if (!data || !data.ok || !Array.isArray(data.pasukan) || data.sukan !== sukan || cmpVersi(data.versi || '0', '1.12.0') < 0) {
      throw new Error((data && data.error) || 'Pendaftaran pasukan memerlukan Code.gs dan Sukan.gs versi 1.12.0 yang telah di-deploy.');
    }
    return data.pasukan;
  }
  function render(rows) {
    body.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td'); td.colSpan = 5; td.textContent = 'Tiada pasukan berdaftar dalam Google Sheets.';
      tr.append(td); body.append(tr); return;
    }
    rows.forEach(row => {
      const key = {};
      Object.keys(row).forEach(k => { key[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = row[k]; });
      const tr = document.createElement('tr');
      ['idpasukan', 'namapasukan', 'kategori', 'kod', 'kumpulan'].forEach(k => {
        const td = document.createElement('td'); td.textContent = String(key[k] || '—'); tr.append(td);
      });
      body.append(tr);
    });
  }
  async function reload() {
    if (!canManageSystem() || busy) return;
    const sukan = sukanInput.value;
    const seq = ++readSeq;
    body.replaceChildren();
    if (!sukan) { message(''); return; }
    message('Membaca pasukan ' + sukan + '…');
    refresh.disabled = true;
    try {
      const rows = await readTeams(sukan);
      if (seq !== readSeq || sukanInput.value !== sukan) return;
      render(rows); message(rows.length + ' pasukan ' + sukan + ' dalam Google Sheets.');
    } catch (err) {
      if (seq === readSeq) message(err.message || 'Bacaan pasukan gagal.', true);
    } finally { if (seq === readSeq) refresh.disabled = false; }
  }
  sukanInput.addEventListener('change', () => {
    playerFields.classList.toggle('hidden', sukanInput.value !== 'BADMINTON');
    draftId = ''; draftSport = '';
    reload();
  });
  refresh.addEventListener('click', reload);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    if (!canManageSystem()) { message('Hanya Master Admin boleh mendaftar pasukan.', true); return; }
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    lock(true);
    ++readSeq;
    try {
      const adminKey = await ensureAdminKey();
      if (!adminKey) throw new Error('Pendaftaran dibatalkan: PIN Master Admin diperlukan.');
      // Periksa sokongan API sebelum menghantar; jangan terima kejayaan palsu daripada skrip lama.
      await readTeams(values.sukan);
      if (!draftId || draftSport !== values.sukan) {
        draftSport = values.sukan;
        draftId = (values.sukan === 'FUTSAL' ? 'F-' : 'B-') + idRawak();
      }
      const payload = binaPayloadPasukan(values, adminKey, draftId);
      const result = await callGas(payload);
      if (!result || !result.ok || result.sukan !== payload.sukan || cmpVersi(result.versi || '0', '1.12.0') < 0) {
        throw new Error((result && result.error) || 'Simpanan belum disahkan. Cuba semula dengan data yang sama.');
      }
      const rows = await readTeams(payload.sukan);
      const exists = rows.some(row => Object.keys(row).some(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === 'idpasukan' && String(row[k]).toUpperCase() === draftId));
      if (!exists) throw new Error('Pasukan belum dapat dibaca semula. Cuba semula; ID yang sama akan digunakan.');
      render(rows);
      form.reset(); sukanInput.value = payload.sukan;
      playerFields.classList.toggle('hidden', payload.sukan !== 'BADMINTON');
      message(payload.pasukan.Nama_Pasukan + ' didaftarkan untuk ' + payload.sukan + ' dan disahkan dalam Google Sheets.');
      draftId = ''; draftSport = '';
      if (typeof window.umumkanPerubahan === 'function') window.umumkanPerubahan(payload.sukan, 'pasukan'); // Bahagian 5
    } catch (err) { message(err.message || 'Pendaftaran gagal. Data borang dikekalkan.', true); }
    finally { lock(false); }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAdminPasukan);
else initAdminPasukan();