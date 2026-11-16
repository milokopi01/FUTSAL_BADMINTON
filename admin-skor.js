/* Bahagian 4: skor Admin berasingan mengikut sukan. Bahagian 5: simpanan dimaklumkan ke Dashboard. */
const SKOR_ASAL_FIELDS = ['skorP1','skorP2','status','pengesahan','pemenangPenalti'];
function binaPayloadSkor(sukan,match,values,adminKey) {
  if (!['FUTSAL','BADMINTON'].includes(sukan)||!adminKey) throw new Error('Sukan dan PIN Master Admin diperlukan.');
  const skor = {keputusan:values.keputusan,pemenangPenalti:values.pemenangPenalti||''};
  ['skorP1','skorP2'].forEach(f=>{
    if(String(values[f]??'').trim()==='')throw new Error('Kedua-dua skor diperlukan.');
    const n=Number(values[f]); if(!Number.isInteger(n)||n<0||n>99)throw new Error('Skor mesti nombor bulat 0 hingga 99.'); skor[f]=n;
  });
  // v1.27.2: DITOLAK = Master Admin menolak keputusan Badminton dari Peti Kelulusan (kembali kepada pengadil)
  if(!['SEMENTARA','DISAHKAN','DITOLAK'].includes(skor.keputusan))throw new Error('Pilih jenis keputusan.');
  if(skor.keputusan==='DITOLAK'){if(sukan!=='BADMINTON')throw new Error('Tolak keputusan Futsal melalui Peti Kelulusan.');skor.catatan=String(values.catatan||'Skor perlu disemak semula').trim().slice(0,200);}
  if(sukan==='BADMINTON'&&skor.keputusan==='DISAHKAN'&&skor.skorP1===skor.skorP2)throw new Error('Keputusan Badminton tidak boleh seri.');
  const asal={};SKOR_ASAL_FIELDS.forEach(f=>{asal[f]=match[f]??'';});
  return {action:'simpanSkorSukan',sukan,id:match.id,adminKey,asal,skor};
}
function initAdminSkor() {
  const form=document.getElementById('adminScoreForm');if(!form)return;
  const sport=document.getElementById('adminScoreSport'), rows=document.getElementById('adminScoreRows'), status=document.getElementById('adminScoreStatus');
  const refresh=document.getElementById('adminScoreRefresh'), cancel=document.getElementById('adminScoreCancel');
  let seq=0,busy=false,selected=null;
  const msg=(text,error=false)=>{status.textContent=text;status.classList.toggle('team-error',error);};
  const close=()=>{selected=null;form.classList.add('hidden');};
  async function read(s) {
    const data=await dashFetch('read&sukan='+s);
    if(!data.ok||data.sukan!==s||!Array.isArray(data.matches)||cmpVersi(data.versi||'0','1.14.0')<0)throw new Error(data.error||'Skor memerlukan Code.gs dan Sukan.gs 1.14.0 yang telah di-deploy.');
    return data.matches;
  }
  function render(list) {
    rows.replaceChildren();
    list.forEach(m=>{
      const tr=document.createElement('tr');
      [m.id,m.namaP1,m.skorP1??'—',m.skorP2??'—',m.namaP2,(m.pengesahan||m.status)+(m.sahPengadil?' · dihantar '+m.sahPengadil:(m.pengadil?' · '+m.pengadil:''))].forEach(v=>{const td=document.createElement('td');td.textContent=String(v||v===0?v:'—');tr.append(td);});
      const td=document.createElement('td'),edit=document.createElement('button');edit.type='button';edit.className='btn btn-sm';edit.textContent='✎ Skor';
      const finalFutsal=sport.value==='FUTSAL'&&m.pengesahan==='DISAHKAN'&&m.status==='SELESAI';edit.disabled=busy||finalFutsal;
      edit.title=finalFutsal?'Gunakan Pembetulan Markah':'Kemas kini skor';edit.dataset.final=finalFutsal?'1':'0';
      edit.addEventListener('click',()=>{
        if(busy||!canManageSystem())return; selected={...m};form.reset();
        document.getElementById('adminScoreTitle').textContent=sport.value+' · '+m.id+' · '+m.namaP1+' lawan '+m.namaP2;
        document.getElementById('scoreLabel1').textContent=m.namaP1;document.getElementById('scoreLabel2').textContent=m.namaP2;
        form.elements.namedItem('skorP1').value=m.skorP1??'';form.elements.namedItem('skorP2').value=m.skorP2??'';
        form.elements.namedItem('keputusan').value=m.pengesahan==='DISAHKAN'?'DISAHKAN':'SEMENTARA';
        document.getElementById('adminScorePenalty').classList.toggle('hidden',sport.value!=='FUTSAL');
        form.classList.remove('hidden');form.scrollIntoView({block:'center',behavior:'smooth'});form.elements.namedItem('skorP1').focus({preventScroll:true});
      });td.append(edit);tr.append(td);rows.append(tr);
    });
    if(!list.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent='Tiada perlawanan dalam Google Sheets.';tr.append(td);rows.append(tr);}
  }
  async function reload(){if(busy||!canManageSystem())return;close();rows.replaceChildren();const s=sport.value,current=++seq;if(!s){msg('');return;}msg('Membaca skor '+s+'…');try{const list=await read(s);if(seq!==current)return;render(list);msg(list.length+' perlawanan '+s+'.');}catch(e){if(seq===current)msg(e.message,true);}}
  sport.addEventListener('change',reload);refresh.addEventListener('click',reload);cancel.addEventListener('click',close);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!selected)return;if(!canManageSystem()){msg('Hanya Master Admin dibenarkan.',true);return;}
    const values=Object.fromEntries(new FormData(form).entries()),s=sport.value,m=selected;
    busy=true;++seq;sport.disabled=true;refresh.disabled=true;const controls=Array.from(form.querySelectorAll('input,select,button'));controls.forEach(el=>el.disabled=true);rows.querySelectorAll('button').forEach(el=>el.disabled=true);
    try{
      const payload=binaPayloadSkor(s,m,values,await ensureAdminKey());msg('Menyimpan skor '+s+'…');
      const result=await callGas(payload);if(!result.ok||result.sukan!==s||cmpVersi(result.versi||'0','1.14.0')<0)throw new Error(result.error||'Simpanan skor gagal.');
      const list=await read(s),saved=list.find(x=>x.id===m.id);
      if(!saved||Number(saved.skorP1)!==payload.skor.skorP1||Number(saved.skorP2)!==payload.skor.skorP2||(payload.skor.keputusan==='DISAHKAN'&&(saved.pengesahan!=='DISAHKAN'||saved.status!=='SELESAI')))throw new Error('Skor belum dapat disahkan; muat semula sebelum mencuba lagi.');
      close();render(list);msg('Skor '+s+' · '+m.id+' disimpan dan dibaca semula dari Google Sheets. Dashboard awam dikemas kini secara automatik.');
      if(typeof window.umumkanPerubahan==='function')window.umumkanPerubahan(s,'skor'); // Bahagian 5
    }catch(e){msg(e.message||'Simpanan gagal; input dikekalkan.',true);}finally{busy=false;sport.disabled=false;refresh.disabled=false;controls.forEach(el=>el.disabled=false);rows.querySelectorAll('button[data-final]').forEach(el=>{el.disabled=el.dataset.final==='1';});}
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initAdminSkor);else initAdminSkor();