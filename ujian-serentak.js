const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(require('path').join(__dirname,'Code.gs'),'utf8');
let clock=1_700_000_000_000;
const store={}; let lockHeld=false; let lockAlwaysBusy=false; let flushes=0;
const FakeDate=class extends Date{ constructor(...a){ super(...(a.length?a:[clock])); } static now(){return clock;} };
const ctx={console:{log(){},warn(){},error(){}},Date:FakeDate,JSON,Math,String,Number,Object,Array,Error,RegExp,
 ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:t=>({t,setMimeType(){return this}})},
 CacheService:{getScriptCache:()=>({get:k=>store[k]??null,put:(k,v)=>{store[k]=String(v)},remove:k=>{delete store[k]},
   getAll:ks=>Object.fromEntries(ks.filter(k=>k in store).map(k=>[k,store[k]])),removeAll:ks=>ks.forEach(k=>delete store[k])})},
 LockService:{getScriptLock:()=>({tryLock(ms){ if(lockAlwaysBusy||lockHeld){clock+=ms;return false;} lockHeld=true; return true;},
   releaseLock(){lockHeld=false;}, waitLock(){ if(lockHeld) throw new Error('busy'); lockHeld=true; }})},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>store['P_'+k]??null,setProperty:(k,v)=>{store['P_'+k]=v}})},
 Utilities:{sleep:ms=>{clock+=ms}},
 SpreadsheetApp:{flush:()=>{flushes++}},
};
vm.createContext(ctx); vm.runInContext(src,ctx);
const post=o=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(o)}}).t);
let pass=0,fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('PASS',m)} else {fail++;console.log('FAIL',m)} };

// 1. ping
let r=post({action:'ping',reqId:'test-ping-0001'});
ok(r.ok && r.versi==='1.22.1' && r.giliran, 'ping ok, versi 1.22.1, statistik giliran');
ok(!lockHeld,'kunci dilepaskan selepas permintaan');
// 2. anti-bertindih: prosesPost_ dikira
let calls=0; const asal=ctx.prosesPost_;
ctx.prosesPost_=(b,c)=>{calls++; c.ubahPapan=false; return ctx.output_({ok:true,versi:'1.22.0',bil:calls});};
r=post({action:'skorLive',reqId:'req-dup-000001'}); let r2=post({action:'skorLive',reqId:'req-dup-000001'});
ok(calls===1 && r2.ulangan===true && r2.bil===1,'reqId sama dihantar 2x -> ditulis SEKALI sahaja');
post({action:'skorLive',reqId:'req-dup-000002'}); ok(calls===2,'reqId berbeza -> diproses');
// 3. gagal tidak di-cache
ctx.prosesPost_=(b,c)=>{calls++; return ctx.output_({ok:false,error:'x'});};
post({action:'skorLive',reqId:'req-fail-00001'}); post({action:'skorLive',reqId:'req-fail-00001'});
ok(calls===4,'respons gagal boleh diulang (tidak di-cache)');
// 4. ralat sementara -> cuba semula sekali
let n=0; ctx.prosesPost_=(b,c)=>{n++; if(n===1) throw new Error('Service Spreadsheets timed out while accessing document'); c.ubahPapan=false; return ctx.output_({ok:true});};
r=post({action:'skorLive',reqId:'req-trans-0001'}); ok(r.ok && n===2,'ralat sementara Google Sheets dicuba semula & berjaya');
n=0; ctx.prosesPost_=(b,c)=>{n++; throw new Error('Service Spreadsheets timed out');};
r=post({action:'skorLive'}); ok(!r.ok && n===2 && r.cubaLagi===true,'ralat sementara berulang -> gagal dengan cubaLagi (tidak gelung tanpa had)');
ok(!lockHeld,'kunci dilepaskan walaupun ralat');
// 5. giliran penuh -> SIBUK, tiada tulisan
lockAlwaysBusy=true; calls=0; ctx.prosesPost_=(b,c)=>{calls++; return ctx.output_({ok:true});};
const t0=clock; r=post({action:'skorLive',reqId:'req-busy-00001'});
ok(r.kod==='SIBUK' && r.cubaLagi && calls===0,'giliran penuh -> kod SIBUK, data tidak ditulis');
ok(clock-t0>=18000 && clock-t0<19500,'menunggu dalam bajet ~18 s dengan beberapa cubaan ('+(clock-t0)+' ms)');
lockAlwaysBusy=false; r=post({action:'skorLive',reqId:'req-busy-00001'}); ok(r.ok && calls===1,'cubaan semula selepas sibuk berjaya');
// 6. papan: rebuild di luar kunci + versi
ctx.prosesPost_=asal; let binaKunci=null;
ctx.papanLive_=()=>{binaKunci=lockHeld; return {ok:true,gelanggang:[]};};
flushes=0; post({action:'updateMatch'}); // will error (no sheets) - check path handles
ctx.prosesPost_=(b,c)=>ctx.output_({ok:true});
post({action:'skorLive',reqId:'req-papan-0001'});
ok(binaKunci===false,'papan live dibina SELEPAS kunci dilepaskan (giliran tidak tersekat)');
const cached=JSON.parse(store['PAPAN_LIVE_V197']); ok(cached.verPapan===store['PAPAN_LIVE_VER'],'papan dalam cache sepadan versi terkini');
ok(flushes>=1,'flush dipanggil sebelum kunci dilepaskan');
// versi basi: binaan lama tidak menulis ganti
const v1=ctx.naikVersiPapan_(); ctx.naikVersiPapan_(); store['PAPAN_LIVE_V197']='{"lama":1}';
ctx.segarkanPapan_(v1); ok(store['PAPAN_LIVE_V197']==='{"lama":1}','binaan papan basi (versi lama) tidak disimpan');
// 7. pembaca papan tidak guna kunci skrip
lockHeld=true; const p=ctx.papanLiveCached_(); ok(p.ok,'papan live boleh dibaca walaupun giliran pengadil sedang memegang kunci'); lockHeld=false;
ok(vm.runInContext('IDEM_SAAT',ctx)===21600,'v1.22.1: reqId anti-bertindih disimpan 6 jam (peti keluar telefon)');
console.log(`\n${pass} lulus, ${fail} gagal`); process.exit(fail?1:0);
