/* Jadual universal: tiada andaian tentang kaedah skor setiap sukan. */
(function(root){
  'use strict';
  const HEADERS=['ID Acara','Nama Acara','Sukan','ID Perlawanan','Giliran','Kategori','Peringkat','Kumpulan','Tarikh','Masa','Lokasi','Peserta','Catatan'];
  function validate(input){
    if(!Array.isArray(input)||!input.length)throw new Error('Jadual kosong. Isi sekurang-kurangnya satu perlawanan.');
    if(input.length>5000)throw new Error('Fail melebihi 5000 perlawanan.');
    const ids=new Set();
    return input.map((row,i)=>{
      const r={}; HEADERS.forEach(h=>{r[h]=String(row[h]??'').trim();if(r[h].length>2000||/^[=+@-]/.test(r[h]))throw new Error('Baris '+(i+2)+': nilai '+h+' tidak sah.');});
      ['ID Acara','Nama Acara','Sukan','ID Perlawanan','Giliran','Lokasi','Peserta'].forEach(h=>{if(!r[h])throw new Error('Baris '+(i+2)+': '+h+' diperlukan.');});
      const key=r['ID Acara'].toUpperCase()+'|'+r.Sukan.toUpperCase()+'|'+r['ID Perlawanan'].toUpperCase();
      if(ids.has(key))throw new Error('Baris '+(i+2)+': ID Perlawanan berulang dalam acara dan sukan yang sama.'); ids.add(key);
      if(!/^\d+$/.test(r.Giliran)||Number(r.Giliran)<1)throw new Error('Baris '+(i+2)+': Giliran mesti nombor bulat positif.');
      if(r.Tarikh){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(r.Tarikh);const d=m?new Date(r.Tarikh+'T00:00:00Z'):null;if(!d||isNaN(d.getTime())||d.toISOString().slice(0,10)!==r.Tarikh)throw new Error('Baris '+(i+2)+': Tarikh mesti YYYY-MM-DD dan sah.');}
      if(r.Masa&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.Masa))throw new Error('Baris '+(i+2)+': Masa mesti HH:MM (24 jam).');
      if(r.Masa&&!r.Tarikh)throw new Error('Baris '+(i+2)+': Tarikh diperlukan apabila Masa diisi.');
      const participants=r.Peserta.split('|').map(s=>s.trim());
      if(participants.some(s=>!s)||new Set(participants.map(s=>s.toUpperCase())).size!==participants.length)throw new Error('Baris '+(i+2)+': Peserta kosong atau berulang.');
      r.Peserta=participants.join(' | ');return r;
    });
  }
  const api={HEADERS,validate}; root.JadualUniversal=api;
  if(typeof module!=='undefined')module.exports=api;
  if(typeof document==='undefined')return;
  function init(){
    const section=document.getElementById('universalAdmin');if(!section)return;
    let pending=null,current={rows:[],version:''},busy=false,backedUpVersion=null;
    const $=id=>document.getElementById(id);
    const msg=(text,error=false)=>{$('universalStatus').textContent=text;$('universalStatus').classList.toggle('team-error',error);};
    const run=async fn=>{if(busy)return;if(!canManageSystem()){msg('Hanya Master Admin dibenarkan.',true);return;}busy=true;section.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);try{await fn();}catch(e){msg(e.message,true);}finally{busy=false;section.querySelectorAll('button,input,select').forEach(e=>e.disabled=false);$('universalSave').disabled=!pending;}};
    function render(target,rows){target.replaceChildren();rows.forEach(r=>{const tr=document.createElement('tr');HEADERS.forEach(h=>{const td=document.createElement('td');td.textContent=r[h]||'—';td.dataset.label=h;tr.append(td);});target.append(tr);});}
    async function read(){const data=await dashFetch('jadualuniversal');if(!data.ok||!Array.isArray(data.rows)||typeof data.version!=='string')throw new Error(data.error||'Tampal Code.gs terkini dan Deploy New version dahulu.');current=data;render($('universalRows'),data.rows);return data;}
    function excel(rows,name){if(!root.XLSX)throw new Error('Pembaca Excel tidak tersedia.');const wb=XLSX.utils.book_new();const sheet=XLSX.utils.aoa_to_sheet([HEADERS,...rows.map(r=>HEADERS.map(h=>r[h]||''))]);sheet['!cols']=HEADERS.map(h=>({wch:h==='Peserta'?50:22}));XLSX.utils.book_append_sheet(wb,sheet,'Jadual');XLSX.writeFile(wb,name,{compression:true});}
    $('universalTemplate').addEventListener('click',()=>{const a=document.createElement('a');a.href='Templat-Jadual-Universal.xlsx';a.download='Templat-Jadual-Universal.xlsx';a.click();});
    $('universalRefresh').addEventListener('click',()=>run(async()=>{await read();msg(current.rows.length+' perlawanan universal.');}));
    $('universalFile').addEventListener('change',()=>run(async()=>{
      pending=null;render($('universalPreview'),[]);const file=$('universalFile').files[0];if(!file)return;
      if(!/\.xlsx$/i.test(file.name)||file.size>10*1024*1024)throw new Error('Pilih fail .xlsx tidak melebihi 10 MB.');
      if(!root.XLSX)throw new Error('Pembaca Excel tidak tersedia.');
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});const sh=wb.Sheets.Jadual;if(!sh)throw new Error('Tab Jadual tidak ditemui. Gunakan templat yang disediakan.');
      const grid=XLSX.utils.sheet_to_json(sh,{header:1,defval:'',raw:false,blankrows:false});
      if(!grid.length||HEADERS.some((h,i)=>String(grid[0][i]||'').trim()!==h))throw new Error('Tajuk atau susunan lajur berubah. Gunakan templat asal.');
      Object.keys(sh).forEach(k=>{if(k[0]!=='!'&&sh[k].f)throw new Error('Formula tidak dibenarkan dalam tab Jadual: '+k);});
      const rows=grid.slice(1).filter(r=>r.some(v=>String(v).trim())).map(r=>Object.fromEntries(HEADERS.map((h,i)=>[h,r[i]||''])));
      const checked=validate(rows);await read();pending=checked;render($('universalPreview'),pending);msg(pending.length+' perlawanan sah. Jadual semasa belum diubah.');
    }));
    $('universalSave').addEventListener('click',()=>run(async()=>{
      if(!pending)return;const key=await ensureAdminKey();if(!key)return;
      if(backedUpVersion!==current.version)throw new Error('Tekan Sandaran Semua Jadual dahulu sebelum mengganti jadual.');
      if(!await uiConfirm('Simpan '+pending.length+' perlawanan universal? Jadual universal semasa akan disandarkan sebelum diganti. Jadual Futsal/Badminton lama akan dikeluarkan daripada jadual aktif.'))return;
      const expected=JSON.stringify(pending);const res=await callGas({action:'simpanJadualUniversal',adminKey:key,rows:pending,version:current.version,backupConfirmed:true});if(!res.ok)throw new Error(res.error||'Gagal menyimpan jadual.');
      const result=await read();if(JSON.stringify(result.rows)!==expected)throw new Error('Simpanan belum sepadan dengan bacaan semula; muat semula jadual.');pending=null;backedUpVersion=null;await publicRead();render($('universalPreview'),[]);msg('Jadual disimpan dan dibaca semula. Sandaran: '+(res.backup||'tiada jadual lama')+'.');
    }));
    $('universalExport').addEventListener('click',()=>run(async()=>{
      const key=await ensureAdminKey();if(!key)return;
      const data=await callGas({action:'eksportJadualUniversal',adminKey:key});if(!data.ok)throw new Error(data.error||'Gagal membaca sandaran.');
      if(!root.XLSX)throw new Error('Pembaca Excel tidak tersedia.');
      const wb=XLSX.utils.book_new();const sheet=XLSX.utils.aoa_to_sheet([HEADERS,...data.rows.map(r=>HEADERS.map(h=>r[h]||''))]);sheet['!cols']=HEADERS.map(h=>({wch:h==='Peserta'?50:22}));XLSX.utils.book_append_sheet(wb,sheet,'Jadual');
      data.tables.forEach(t=>{XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(t.values),t.name.slice(0,31));});
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Jenis','Sandaran jadual sahaja; tab asal menyimpan butiran skor untuk rujukan.'],['Muat naik semula','Tab Jadual dipaparkan semula; skor arkib tidak diaktifkan dalam mod pengadil.']]),'Maklumat Sandaran');
      XLSX.writeFile(wb,'Sandaran-Semua-Jadual-'+new Date().toISOString().replace(/[:.]/g,'-')+'.xlsx',{compression:true});
      backedUpVersion=data.version;current.version=data.version;msg('Sandaran semua jadual dimuat turun. Jadual baharu kini boleh disimpan.');
    }));
    $('universalBackups').addEventListener('click',()=>run(async()=>{
      const key=await ensureAdminKey();if(!key)return;const res=await callGas({action:'senaraiJadualUniversal',adminKey:key});if(!res.ok)throw new Error(res.error||'Gagal membaca sandaran.');const sel=$('universalBackupSelect');sel.replaceChildren();res.backups.forEach(b=>{const o=document.createElement('option');o.value=b;o.textContent=b;sel.append(o);});msg(res.backups.length+' sandaran universal ditemui.');
    }));
    $('universalRestore').addEventListener('click',()=>run(async()=>{
      const id=$('universalBackupSelect').value;if(!id)throw new Error('Pilih sandaran dahulu.');await read();const key=await ensureAdminKey();if(!key)return;if(!await uiConfirm('Pulihkan '+id+'? Jadual universal semasa akan disandarkan dahulu.'))return;
      if(backedUpVersion!==current.version)throw new Error('Tekan Sandaran Semua Jadual dahulu sebelum memulihkan.');
      const res=await callGas({action:'pulihJadualUniversal',adminKey:key,backup:id,version:current.version,backupConfirmed:true});if(!res.ok)throw new Error(res.error||'Gagal memulihkan.');await read();await publicRead();pending=null;backedUpVersion=null;render($('universalPreview'),[]);msg('Sandaran dipulihkan: '+current.rows.length+' perlawanan.');
    }));
    const publicSection=document.getElementById('universalPublic');
    async function publicRead(){try{const res=await dashFetch('jadualuniversal');if(!res.ok||!Array.isArray(res.rows))return;publicSection.hidden=!res.active;document.body.classList.toggle('jadual-universal-active',!!res.active);render(document.getElementById('universalPublicRows'),res.rows);if(res.active&&typeof state!=='undefined'){state.matches=[];state.courts.forEach(c=>{c.matchSemasa=null;c.skorLiveP1=0;c.skorLiveP2=0;});}}catch(e){/* Kekalkan bacaan terakhir jika luar talian. */}}
    publicRead();setInterval(()=>{if(!document.hidden)publicRead();},60000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window==='undefined'?globalThis:window);
