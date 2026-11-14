/* Bahagian 3: masa dirancang berasingan daripada masa sepak mula sebenar. */
const JADUAL_FIELDS = ['masaJadual', 'gelanggang', 'namaP1', 'namaP2', 'kodP1', 'kodP2'];
function masaJadualInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 16);
}
function binaPayloadJadual(sukan, match, values, adminKey) {
  if (!['FUTSAL','BADMINTON'].includes(sukan) || !adminKey) throw new Error('Sukan dan PIN Master Admin diperlukan.');
  const jadual = {};
  JADUAL_FIELDS.forEach(f => { jadual[f] = String(values[f] || '').trim(); });
  if (jadual.masaJadual) {
    const d = new Date(jadual.masaJadual + ':00+08:00');
    if (isNaN(d.getTime())) throw new Error('Masa jadual tidak sah.');
    jadual.masaJadual = d.toISOString();
  }
  if (!jadual.gelanggang || !jadual.namaP1 || !jadual.namaP2) throw new Error('Gelanggang dan kedua-dua pasukan diperlukan.');
  if (jadual.namaP1.toUpperCase() === jadual.namaP2.toUpperCase()) throw new Error('Pasukan bertanding mesti berbeza.');
  const asal = {};
  JADUAL_FIELDS.concat(['kemaskini']).forEach(f => { asal[f] = match[f] ?? ''; });
  return { action:'simpanJadual', sukan, adminKey, id:match.id, asal, jadual };
}
function initAdminJadual() {
  const form = document.getElementById('adminScheduleForm');
  if (!form) return;
  const sport = document.getElementById('adminScheduleSport');
  const rows = document.getElementById('adminScheduleRows');
  const status = document.getElementById('adminScheduleStatus');
  const refresh = document.getElementById('adminScheduleRefresh');
  const title = document.getElementById('adminScheduleEditTitle');
  const cancel = document.getElementById('adminScheduleCancel');
  let seq = 0, selected = null, busy = false;
  const msg = (text, error=false) => { status.textContent=text; status.classList.toggle('team-error',error); };
  const close = () => { selected=null; form.classList.add('hidden'); };
  const editable = m => !m.status || ['MENUNGGU GILIRAN','BELUM BERMULA','MENUNGGU'].includes(String(m.status).toUpperCase());
  function render(list) {
    rows.replaceChildren();
    list.forEach(m => {
      const tr = document.createElement('tr');
      const time = masaJadualInput(m.masaJadual).replace('T',' ') || '—';
      [m.id,m.kategori,time,m.gelanggang,m.namaP1,m.namaP2,m.status].forEach(v=>{
        const td=document.createElement('td'); td.textContent=String(v||'—'); tr.append(td);
      });
      const td=document.createElement('td');
      const edit=document.createElement('button'); edit.type='button'; edit.className='btn btn-sm'; edit.textContent='✎ Edit'; edit.disabled=!editable(m)||busy; edit.dataset.editable=editable(m)?'1':'0';
      edit.addEventListener('click',()=>{
        if (!canManageSystem() || busy) return;
        selected={...m}; title.textContent=sport.value+' · '+m.id;
        JADUAL_FIELDS.forEach(f=>{ form.elements.namedItem(f).value=f==='masaJadual'?masaJadualInput(m[f]):String(m[f]||''); });
        form.classList.remove('hidden'); form.scrollIntoView({block:'center',behavior:'smooth'}); form.elements.namedItem('gelanggang').focus({preventScroll:true});
      }); td.append(edit); tr.append(td); rows.append(tr);
    });
    if (!list.length) { const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=8; td.textContent='Tiada jadual dalam Google Sheets untuk sukan ini.'; tr.append(td); rows.append(tr); }
  }
  async function read(sukan) {
    const data=await dashFetch('read&sukan='+sukan);
    if (!data.ok || data.sukan!==sukan || !Array.isArray(data.matches) || cmpVersi(data.versi||'0','1.13.0')<0) throw new Error(data.error||'Jadual memerlukan Code.gs dan Sukan.gs 1.13.0 yang telah di-deploy.');
    return data.matches;
  }
  async function reload() {
    if (!canManageSystem() || busy) return;
    close(); rows.replaceChildren(); const s=sport.value; const current=++seq;
    if (!s) {msg('');return;}
    msg('Membaca jadual '+s+'…');
    try { const list=await read(s); if(current!==seq)return; render(list);msg(list.length+' perlawanan '+s+'.'); }
    catch(e){if(current===seq)msg(e.message,true);}
  }
  sport.addEventListener('change',reload); refresh.addEventListener('click',reload); cancel.addEventListener('click',close);
  form.addEventListener('submit',async event=>{
    event.preventDefault(); if(busy||!selected)return;
    if(!canManageSystem()){msg('Hanya Master Admin boleh mengubah jadual.',true);return;}
    const values=Object.fromEntries(new FormData(form).entries()); const s=sport.value; const match=selected;
    busy=true; ++seq; sport.disabled=true; refresh.disabled=true;
    const controls=Array.from(form.querySelectorAll('input,button')); controls.forEach(el=>el.disabled=true);
    rows.querySelectorAll('button').forEach(el=>el.disabled=true);
    try {
      const key=await ensureAdminKey(); const payload=binaPayloadJadual(s,match,values,key);
      const result=await callGas(payload);
      if(!result.ok||result.sukan!==s||cmpVersi(result.versi||'0','1.13.0')<0)throw new Error(result.error||'Simpanan jadual gagal.');
      const list=await read(s); const saved=list.find(m=>String(m.id)===String(match.id));
      if(!saved||JADUAL_FIELDS.some(f=>String(saved[f]||'').toUpperCase()!==String(payload.jadual[f]||'').toUpperCase()))throw new Error('Jadual belum dapat disahkan. Semak semula sebelum mencuba lagi.');
      close(); render(list); msg('Jadual '+s+' · '+match.id+' disimpan dan dibaca semula dari Google Sheets. Dashboard awam dikemas kini secara automatik.');
      if(typeof window.umumkanPerubahan==='function')window.umumkanPerubahan(s,'jadual'); // Bahagian 5
    } catch(e){msg(e.message||'Simpanan gagal; input dikekalkan.',true);}
    finally {busy=false;sport.disabled=false;refresh.disabled=false;controls.forEach(el=>el.disabled=false);rows.querySelectorAll('button[data-editable]').forEach(el=>{el.disabled=el.dataset.editable!=='1';});}
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initAdminJadual);else initAdminJadual();