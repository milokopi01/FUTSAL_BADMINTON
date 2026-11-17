/*
AMARAN WAJIB UNTUK AI / PENYELENGGARA — JANGAN PADAM
Sebelum mengeluarkan kemas kini:
1. Baca AGENTS.md. Semak URL deployment AKTIF dengan ?action=ping.
2. Bandingkan versi respons sebenar dengan API_VERSI (Code.gs) dan GAS_MIN_VERSI (index.html).
3. Simpan / tampal Code.gs TIDAK menerbitkan versi Web App. Pemilik perlu Deploy > Manage deployments > Edit > Version: New version > Deploy pada URL yang sama.
4. Jangan sembunyikan amaran versi lama, jangan tukar URL deployment secara senyap, dan jangan mendakwa deployment terkini tanpa respons langsung yang mengesahkannya.
5. Jika tiada akses deployment, nyatakan pengesahan deployment BELUM SELESAI. Jangan janjikan isu tidak akan berulang.
6. Untuk perubahan sync, uji skor pengadil ke dashboard, pertukaran fasa, pemulihan selepas reload dan jawapan lama yang tiba lewat; semua peranti mesti menggunakan URL yang sama.
Amaran ini ialah arahan penyelenggaraan untuk AI, bukan kod yang boleh menerbitkan Google Apps Script secara automatik.
*/

/**
 * =========================================================
 *  LIVE FUTSAL PENDIDIKAN KHAS KBB 2026 - GOOGLE APPS SCRIPT
 *  Fail: Code.gs   (Extensions > Apps Script dalam Google Sheets)
 *
 *  doGet(e)  : Baca data perlawanan daripada tab Jadual_Perlawanan (JSON / JSONP)
 *  doPost(e) : Kemas kini skor, fasa masa, status perlawanan, status pengesahan
 *              urusetia dan nama pengadil ke dalam tab Jadual_Perlawanan.
 *              + PANGKALAN DATA PENGADIL (tab Senarai_Pengadil):
 *                Master Admin cipta / ubah / gantung / padam akaun pengadil
 *                (nama ringkas + kata laluan). Pengadil log masuk dengan nama
 *                ringkas & kata laluan sendiri.
 *              * Sistem kata laluan khas setiap gelanggang (PENGADIL-A..D) telah DIBUANG.
 *              + FASA 2 - KUNCI GELANGGANG (tab Kunci_Gelanggang):
 *                Pengadil log masuk -> pilih gelanggang -> tekan "Sepak Mula".
 *                Gelanggang DIKUNCI kepada pengadil tersebut; pengadil lain tidak
 *                boleh memberi markah (skor) di gelanggang itu sehingga kunci dilepaskan.
 *
 *              + FASA 3 - KAWALAN PERLAWANAN & PAPARAN AWAM:
 *                "Tangguh Perlawanan" (salah tekan Sepak Mula) -> perlawanan kembali
 *                MENUNGGU GILIRAN, boleh tukar pengadil. Setiap tangguhan dicatat di
 *                tab Log_Tangguh. GET ?action=live -> papan live awam (gelanggang,
 *                pasukan, skor, fasa, masa mula & NAMA PENGADIL).
 *
 *              + FASA 4 - PEMBETULAN MARKAH (MASTER ADMIN SAHAJA) & ROMBAKAN AUTOMATIK:
 *                { action: 'pembetulanSkor', adminKey, matchId, skorP1, skorP2,
 *                  pemenangPenalti, sebab, mod, susulan:[...] }
 *                - Hanya kunci Master Admin diterima. Token pengadil / Urusetia DITOLAK.
 *                - Keputusan DISAHKAN (SELESAI) dikunci: syncAll / updateMatch / skorLive
 *                  TIDAK boleh mengubah skor, pemenang, status atau pasukan baris tersebut.
 *                - Setiap pembetulan diberi "Versi Pembetulan" -> peranti lama (data basi)
 *                  tidak boleh menulis ganti markah yang telah dibaiki.
 *                - Selepas simpan: Carta_Liga dikira semula DI PELAYAN, slot Johan / Naib
 *                  Johan / Menang / Kalah perlawanan susulan dirombak automatik, dan
 *                  setiap pembetulan dicatat dalam tab Log_Pembetulan.
 *
 *              + FASA 4.1 - PAUTAN PENGADIL <-> GOOGLE SHEETS:
 *                - ?action=ping kini memulangkan 'versi' & 'ciri' supaya aplikasi boleh
 *                  mengesan jika Code.gs yang di-deploy masih versi LAMA.
 *                - Tindakan yang tidak dikenali dipulangkan dengan jelas (kod TINDAKAN_TIDAK_DIKENALI).
 *                - simpanPengadil / syncPengadil memaksa tulisan (flush) & mengesahkan
 *                  rekod benar-benar wujud dalam tab Senarai_Pengadil sebelum memulangkan ok.
 *
 *              + FASA 5 - REHAT KECEMASAN (PENANGGUHAN SEMENTARA) & AMBIL ALIH PENGADIL:
 *                { action: 'rehatKecemasan', token, gelanggang, matchId, skorP1, skorP2,
 *                  fasaSebelum, elapsedMs, sebab }      -> pengadil pemegang kunci sahaja
 *                { action: 'ambilAlihGelanggang', token, gelanggang } -> pengadil baharu
 *                { action: 'sambungPerlawanan', token, gelanggang, matchId } -> pemegang kunci
 *                - Perlawanan kekal LIVE; Fasa Masa = "Rehat Kecemasan". Skor DIBEKUKAN:
 *                  skorLive / syncAll / updateMatch tidak boleh mengubah markah semasa rehat.
 *                - Semasa rehat, kunci boleh dilepaskan / diambil alih oleh pengadil lain
 *                  (tanpa menunggu 15 minit). Status rehat KEKAL walaupun kunci dilepaskan.
 *                - Sambung Perlawanan: skor diambil daripada Jadual_Perlawanan (sumber sah),
 *                  fasa & masa fasa disambung. Semua tindakan dicatat dalam Log_Tangguh.
 *
 *              + FASA 6 - PENGESAHAN PENGADIL (MOD TELEFON):
 *                - Pengadil WAJIB mengesahkan keputusan sebelum dihantar ke Urusetia.
 *                  { action: 'skorLive', ..., status: 'TAMAT - TUNGGU SAH', lepas: true, sahkan: true }
 *                - Nama pengadil diambil daripada TOKEN SESI (bukan daripada peranti) dan
 *                  ditulis ke lajur "Disahkan Pengadil" & "Masa Sah Pengadil" dalam
 *                  Jadual_Perlawanan, serta dicatat dalam tab Log_Sah_Pengadil.
 *                - Lajur ini hanya boleh ditulis melalui skorLive (pengadil) atau Master Admin.
 *                  Tangguh perlawanan mengosongkan pengesahan.
 *
 *              + v1.9.8 - BACKUP & RESTORE (MASTER ADMIN SAHAJA, tab Sandaran_Data):
 *                { action: 'simpanSandaran', adminKey, catatan, oleh, data: '<JSON>' }
 *                { action: 'senaraiSandaran', adminKey }
 *                { action: 'ambilSandaran', adminKey, id }
 *                { action: 'padamSandaran', adminKey, id }
 *                - Data aplikasi penuh disimpan dalam beberapa sel (had 50,000 aksara/sel).
 *                - 20 sandaran terkini disimpan; yang paling lama dipadam automatik.
 *
 *              + FASA 7 - PETI KELULUSAN URUSETIA / MASTER ADMIN:
 *                - Peranti Urusetia / Master Admin membaca GET ?action=read setiap 15 saat
 *                  supaya keputusan "TAMAT - TUNGGU SAH" daripada telefon pengadil muncul
 *                  dalam Peti Kelulusan.
 *                - Sahkan / Tolak dihantar terus: { action: 'updateMatches', matches:[...],
 *                  logBaharu:[...] }. 'logBaharu' DITAMBAH ke tab Log_Pengesahan (tidak
 *                  memadam log sedia ada).
 *                - Keputusan DITOLAK mengosongkan "Disahkan Pengadil" supaya pengadil
 *                  perlu mengesahkan semula.
 *
 *              + v1.9.0 - PAPAN LIVE PANTAS:
 *                - GET ?action=live kini dibaca daripada CacheService (beberapa ratus ms)
 *                  dan cache dibuang automatik selepas setiap doPost (sepak mula, gol, tamat).
 *                - { action: 'kunciGelanggang', ..., mula: true } terus menanda perlawanan
 *                  LIVE dalam panggilan yang sama -> dashboard memaparkan LIVE serta-merta.
 *                - PENTING: selepas menampal fail ini, Deploy > Manage deployments >
 *                  Edit > Version: New version > Deploy (URL kekal sama).
 *
 *              + v1.9.2 - PAPARAN PROJEKTOR TIDAK LAGI TERSEKAT:
 *                - Papan live (?action=live) memilih perlawanan semasa setiap gelanggang
 *                  mengikut keutamaan: (1) perlawanan pada kunci gelanggang (LIVE / rehat /
 *                  dikunci belum sepak mula), (2) perlawanan LIVE terkini, (3) perlawanan yang
 *                  baru ditangguhkan. Keputusan TAMAT / SELESAI TIDAK PERNAH dipaparkan
 *                  sebagai perlawanan semasa. Baris LIVE "terbiar" (tiada kunci & tiada
 *                  kemas kini > 40 minit) diabaikan supaya tidak menutup perlawanan baharu.
 *                - KEPUTUSAN LEWAT: keputusan akhir pengadil (TAMAT - TUNGGU SAH) diterima
 *                  walaupun kunci gelanggang telah dilepaskan / beralih ke perlawanan baharu
 *                  (cth. hantar semula selepas internet terputus). Hantar semula keputusan
 *                  yang sudah diterima dipulangkan ok (tiada mesej "gagal" palsu).
 *                - Bacaan papan live tidak lagi menulis format ke tab Kunci_Gelanggang
 *                  (lebih pantas & kurang kuota). Isyarat aktif pengadil tidak membuang cache.
 *
 *              + v1.9.3 - PAPAN LIVE SEGERA (GOL TERUS KELUAR):
 *                - Selepas setiap penulisan (gol, sepak mula, tamat) papan live DIBINA SEMULA
 *                  terus ke dalam cache (write-through). Paparan projektor / penonton sentiasa
 *                  membaca cache (pantas) dan tidak lagi menunggu Google Sheets dibaca semula.
 *                - Bila cache lama (> 30 s), hanya SATU permintaan membina semula; yang lain
 *                  terus menerima data terakhir -> tiada lagi "Google Sheets lambat bertindak balas".
 *                - Kemas kini skor pengadil hanya menulis BARIS perlawanan yang berubah
 *                  (bukan seluruh jadual) -> penghantaran gol lebih pantas.
 *
 *              + v1.9.9 - URUS GELANGGANG (MASTER ADMIN SAHAJA):
 *                { action: 'urusGelanggang', adminKey, versi, senarai:[{id,nama,kategori,aktif}],
 *                  matches:[{id, gelanggang}] }
 *                - Tambah gelanggang baharu (cth. E), Aktifkan atau Tutup gelanggang.
 *                - Senarai disimpan dalam Script Properties (SENARAI_GELANGGANG) & dikongsi
 *                  kepada semua peranti melalui ?action=live / read / kunci / ping.
 *                - Gelanggang DITUTUP: baki perlawanan (MENUNGGU GILIRAN) dipindahkan ke
 *                  gelanggang AKTIF sahaja (kategori yang sama). Gelanggang yang sedang LIVE /
 *                  dikunci pengadil / Rehat Kecemasan tidak boleh ditutup.
 *                - Pengadil tidak boleh "Sepak Mula" di gelanggang yang ditutup.
 *
 *              + v1.24.0 - KATEGORI GELANGGANG DIPILIH MASTER ADMIN:
 *                - SEMUA_GELANGGANG_TERBUKA = false: setiap gelanggang (Futsal & Badminton) boleh
 *                  ditetapkan 'SEMUA' (SR + SM Terbuka), 'SR' sahaja atau 'SM' sahaja.
 *                - Auto-isi gelanggang kosong, Sepak Mula & pindahan baki perlawanan hanya
 *                  menerima perlawanan kategori yang dibenarkan oleh gelanggang itu.
 *                - Senarai lalai (tiada senarai disimpan / selepas reset) kekal Terbuka.
 *              + v1.23.0 - SEMUA GELANGGANG TERBUKA & AUTO-ISI GELANGGANG KOSONG:
 *                - SEMUA_GELANGGANG_TERBUKA = true: setiap gelanggang (Futsal & Badminton)
 *                  sentiasa berkategori 'SEMUA' -> menerima perlawanan Sekolah Rendah & Menengah.
 *                - AUTO_ISI_GELANGGANG = true: selepas keputusan dihantar / disahkan / ditangguh /
 *                  kunci dilepaskan, gelanggang AKTIF yang kosong (tiada LIVE, tiada pengadil, tiada
 *                  baki perlawanan sedia dimainkan) terus diisi dengan baki perlawanan seterusnya
 *                  daripada gelanggang lain (ikut urutan Jana Susunan / No. perlawanan).
 *                  Syarat: kedua-dua pasukan sudah ditentukan, pasukan tidak sedang bermain /
 *                  dipanggil di gelanggang lain, perlawanan tidak dikunci (Separuh Akhir / Akhir)
 *                  ke gelanggang lain, dan perlawanan seterusnya gelanggang yang menunggu pengadil
 *                  tidak diambil.
 *                - Sepak Mula diterima untuk perlawanan yang baru dipindahkan ke gelanggang ini.
 *                - Giliran papan live: perlawanan yang SEDIA dimainkan didahulukan.
 *              + v1.23.4 - AUTO-ISI BADMINTON LEBIH CEPAT:
 *                - Auto-isi kini juga dijalankan bila pengadil Badminton MULA perlawanan (skor
 *                  pertama). Saat gelanggang lain mula bermain, perlawanan seterusnya gelanggang itu
 *                  terus boleh diambil oleh gelanggang yang kosong (sebelum ini hanya selepas
 *                  keputusan dihantar / disahkan).
 *                - Gelanggang yang kosong tetapi tidak dapat diisi kini dicatat dalam log
 *                  (Executions) bersama sebabnya: pasukan bertembung / belum ditentukan / dikunci.
 *                - Fungsi manual semakAutoIsiBadminton(): jalankan dari editor untuk isi gelanggang
 *                  kosong serta-merta & lihat sebabnya.
 *                - Peraturan kekal: satu pasukan tidak boleh dijadualkan di dua gelanggang serentak,
 *                  dan perlawanan seterusnya gelanggang yang sedang menunggu (tiada perlawanan
 *                  berlangsung) tidak diambil - kerana pasukannya akan bermain di sana sekarang.
 *              + v1.23.1 - KUNCI PENGANJUR SENTIASA DIPATUHI:
 *                - Perlawanan yang dikunci penganjur (Urus Gelanggang > kunci Separuh Akhir /
 *                  Tempat 3/4 / Akhir) TIDAK PERNAH diambil oleh gelanggang lain semasa auto-isi.
 *                - Jika perlawanan berkunci berada di gelanggang lain, ia dikembalikan secara
 *                  automatik ke gelanggang kuncinya.
 *                - Sepak Mula perlawanan berkunci di gelanggang lain DITOLAK (kod DIKUNCI_PENGANJUR).
 *                - Kunci kepada gelanggang yang DITUTUP diabaikan (perlawanan boleh dimainkan di mana-mana).
 *              + v1.10.0 - JANA SUSUNAN & GELANGGANG TERBUKA (MASTER ADMIN SAHAJA):
 *                - Kategori gelanggang boleh 'SEMUA' (terbuka kepada SR & SM).
 *                - 'Jana Susunan' (aplikasi) membuka semua gelanggang kepada semua kategori
 *                  dan mengagih semula baki perlawanan (MENUNGGU GILIRAN) secara sekata.
 *                  Perlawanan LIVE / Tunggu Sah / Rehat Kecemasan tidak diubah.
 *                - senaraiGelanggang kini membawa 'susunan' {matchId: urutan} (giliran
 *                  setiap gelanggang) & 'kunciAcara' {matchId: gelanggang} (Separuh Akhir /
 *                  Tempat 3/4 / Akhir dikunci ke gelanggang tertentu sebelum dijana).
 *
 *              + v1.11.0 - DATA BADMINTON (BACA SAHAJA, UNTUK DASHBOARD UTAMA):
 *                GET ?action=badminton -> { ok, versi, masa, acara, pasukan, jadual, peraturan, gelanggang }
 *                - Dibaca daripada tab Jadual_Badminton, Pasukan_Badminton, Peraturan_Badminton,
 *                  Kejohanan (Sukan = BADMINTON) & Gelanggang. Tiada penulisan ke Google Sheets.
 *                - Disimpan dalam CacheService selama 20 saat (jimat kuota).
 *                - Fungsi futsal, pengadil, kunci gelanggang & Master Admin TIDAK berubah.
 *
 *              + v1.19.0 - AKAUN URUSETIA & SUB ADMIN (tab Senarai_Urusetia):
 *                { action: 'loginUrusetia', nama, password }          -> semua (token sesi urusetia)
 *                { action: 'semakUrusetia', tokenUrusetia }          -> status & lantikan terkini
 *                { action: 'logKeluarUrusetia', tokenUrusetia }
 *                { action: 'senaraiUrusetia', adminKey }             -> Master Admin
 *                { action: 'simpanUrusetia', adminKey, urusetia:{id,nama,password,subAdmin,status} }
 *                { action: 'padamUrusetia', adminKey, id }           -> Master Admin
 *                - Urusetia log masuk dengan NAMA + KATA LALUAN (wajib kedua-duanya).
 *                - Master Admin boleh MELANTIK urusetia sebagai SUB ADMIN. Hanya Master Admin
 *                  dan Sub Admin boleh Sahkan / Tolak keputusan (Peti Kelulusan). Permintaan
 *                  sumber 'PETI-KELULUSAN' tanpa kunci Master Admin / token Sub Admin DITOLAK.
 *
 *              + v1.20.0 - URUS GELANGGANG BADMINTON (MASTER ADMIN SAHAJA):
 *                { action: 'urusGelanggangBadminton', sukan: 'BADMINTON', adminKey, versi,
 *                  senarai:[{id,nama,kategori,aktif}], susunan:{matchId:urutan},
 *                  kunciAcara:{matchId:gelanggang}, matches:[{id, gelanggang}] }
 *                - Sama seperti Urus Gelanggang Futsal: tambah / aktif / tutup gelanggang,
 *                  kategori SR / SM / SEMUA (terbuka), Jana Susunan & kunci gelanggang
 *                  Suku Akhir / Separuh Akhir / Tempat 3/4 / Akhir.
 *                - Senarai disimpan dalam Script Properties (SENARAI_GELANGGANG_BM).
 *                - Hanya perlawanan Badminton yang BELUM BERMULA dipindahkan (lajur Gelanggang
 *                  dalam tab Jadual_Badminton). Perlawanan sedang berlangsung / menunggu
 *                  pengesahan tidak disentuh. Gelanggang yang sedang digunakan tidak boleh ditutup.
 *                - GET ?action=badminton & ?action=read&sukan=BADMINTON kini membawa
 *                  'senaraiGelanggang' (senarai, susunan & kunciAcara Badminton).
 *
 *              + v1.20.1 - RESET EVENT (HARI SEBENAR) UNTUK KEDUA-DUA SUKAN:
 *                { action: 'resetAcara', adminKey, bmAsal:[{id,gelanggang,peringkat,kodP1,kodP2,namaP1,namaP2}] }
 *                - FUTSAL   : kosongkan Jadual_Perlawanan, Carta_Liga, log, kunci, tangguh,
 *                             pembetulan & sah pengadil (aplikasi menghantar semula jadual asal).
 *                - BADMINTON: semua skor / status / pengadil / pengesahan dalam Jadual_Badminton
 *                             dikosongkan, gelanggang dikembalikan kepada jadual ASAL, slot kalah
 *                             mati dikembalikan kepada kod asal, Log_Pengesahan_Badminton dikosongkan.
 *                - URUS GELANGGANG (kedua-dua sukan): senarai gelanggang kembali kepada lalai,
 *                  susunan Jana Susunan & kunci Separuh Akhir / Akhir DIPADAM. Versi baharu
 *                  ditulis supaya SEMUA peranti menerima susunan asal.
 *                - Pasukan, pengadil, urusetia, peraturan & Sandaran_Data DIKEKALKAN.
 *
 *              + v1.22.0 - KETAHANAN SERENTAK (100 PENGADIL SERENTAK, TIADA JEM / DATA BERTINDIH):
 *                - SISTEM GILIRAN: setiap doPost beratur melalui LockService.getScriptLock().
 *                  Kunci diperoleh dengan CUBAAN SEMULA berperingkat (backoff + jitter) dalam
 *                  bajet KUNCI_BAJET_MS. Jika giliran masih penuh -> { ok:false, kod:'SIBUK',
 *                  cubaLagi:true, cubaSelepasMs } dan TIADA data ditulis (selamat dihantar semula).
 *                - BAHAGIAN KRITIKAL DIPENDEKKAN: kunci dipegang hanya semasa membaca + menulis
 *                  Google Sheets + flush. Binaan papan live & isyarat Dashboard dibuat SELEPAS
 *                  kunci dilepaskan (dilindungi nombor versi cache -> binaan lama tidak disimpan).
 *                  -> giliran bergerak jauh lebih pantas bila ramai pengadil menekan serentak.
 *                - ANTI-BERTINDIH (idempotensi): setiap POST boleh membawa 'reqId' unik. Respons
 *                  berjaya disimpan 6 jam (v1.22.1; asal 10 minit); hantar semula dengan reqId sama (internet putus,
 *                  tamat masa, cubaan semula automatik) TIDAK menulis dua kali -> { ulangan:true }.
 *                - CUBA SEMULA RALAT SEMENTARA: ralat Google Sheets sementara (cth. "Service
 *                  Spreadsheets timed out") dicuba semula sekali di dalam giliran yang sama.
 *                - Papan live awam (doGet) TIDAK LAGI mengambil kunci skrip -> bacaan penonton /
 *                  projektor tidak pernah melambatkan giliran pengadil.
 *                - SpreadsheetApp.flush() SENTIASA dipanggil sebelum kunci dilepaskan supaya
 *                  pengadil seterusnya dalam giliran membaca data terkini.
 *                - ?action=ping membawa 'giliran' (statistik ringkas: bil. SIBUK, tunggu terakhir).
 *
 *  Lajur dikesan melalui NAMA TAJUK (baris 1), jadi susunan lajur Bahagian 1
 *  boleh dikekalkan. Lajur yang tiada akan ditambah automatik di hujung.
 * =========================================================
 */

const SHEET_JADUAL = 'Jadual_Perlawanan';
const SHEET_CARTA = 'Carta_Liga';
const SHEET_LOG = 'Log_Pengesahan';
const SHEET_PENGADIL = 'Senarai_Pengadil';
const SHEET_KUNCI = 'Kunci_Gelanggang';
const SHEET_TANGGUH = 'Log_Tangguh';
const TANGGUH_HEADER = ['Masa', 'Gelanggang', 'ID Match', 'Pasukan', 'Pengadil', 'Sebab', 'Tindakan', 'Oleh'];
const SHEET_PEMBETULAN = 'Log_Pembetulan';
const PEMBETULAN_HEADER = ['Masa', 'Versi', 'ID Match', 'Kategori', 'Peringkat', 'Perlawanan', 'Skor Lama', 'Skor Baharu',
  'Penalti Lama', 'Penalti Baharu', 'Sebab', 'Mod Rombakan', 'Perlawanan Terkesan', 'Oleh'];
const TIMEZONE = 'Asia/Kuala_Lumpur';
// FASA 4.1: versi API (aplikasi menyemak nilai ini untuk mengesan Code.gs lama)
const API_VERSI = '1.24.1';  // v1.24.1: baiki gelung RALAT penalti (nama pasukan diterima sebagai pemenang penalti)
// const API_VERSI_LAMA = '1.24.0';  // v1.24.0: Master Admin pilih kategori setiap gelanggang - SR + SM (Terbuka) / SR sahaja / SM sahaja (Futsal & Badminton); auto-isi, Sepak Mula & Jana Susunan mematuhi kategori
// const API_VERSI_1238 = '1.23.8';  // v1.23.8: auto-isi gelanggang kosong MEMATUHI REHAT PASUKAN - pasukan yang baru tamat (< 20 minit / menunggu pengesahan) tidak diambil (tiada back-to-back)
// const API_VERSI_LAMA = '1.23.7';  // v1.23.7: markah RALAT hanya boleh dikemas kini pengadil asal / Master Admin
// const API_VERSI_LAMA = '1.23.6';  // v1.23.6: pengadil DITOLAK hantar seri kalah mati tanpa penalti + baris rosak dikembalikan kepada pengadil (bukan Urusetia)
// const API_VERSI_LAMA = '1.23.5';  // v1.23.5: Futsal kalah mati SERI tanpa pemenang penalti tidak boleh disahkan (SELESAI) - Akhir / Tempat 3/4 tidak tersekat
// const API_VERSI_LAMA = '1.23.4';  // v1.23.4: auto-isi gelanggang Badminton juga berjalan bila perlawanan BARU BERMULA + log sebab gelanggang tidak diisi
// const API_VERSI_LAMA = '1.23.3';  // v1.23.3: bacaan pengadil menyertakan No. Perlawanan Keseluruhan (P1, P2 ...) supaya Paparan Pengadil tulis giliran
// const API_VERSI_LAMA = '1.23.1';  // v1.23.1: KUNCI PENGANJUR (Separuh Akhir / Akhir) sentiasa dipatuhi oleh auto-isi & Sepak Mula
// const API_VERSI_LAMA = '1.23.0';  // v1.23.0: SEMUA gelanggang TERBUKA (SR + SM) + AUTO-ISI gelanggang kosong dengan baki perlawanan
// const API_VERSI_LAMA = '1.22.1';  // v1.22.1: anti-bertindih reqId disimpan 6 jam (peti keluar telefon pengadil, index.html v1.36.0)
// const API_VERSI_LAMA = '1.22.0';  // v1.22.0: KETAHANAN SERENTAK - giliran LockService + cuba semula + anti-bertindih (reqId)
// const API_VERSI_LAMA = '1.21.1';  // v1.21.0: PRESTASI - Sahkan / Tolak keputusan Badminton sepantas Futsal (tiada jem / lag)
// const API_VERSI_LAMA = '1.20.2';  // v1.20.2: Kalah mati Badminton - nama pasukan diisi automatik (butang pengadil aktif)
// const API_VERSI_LAMA = '1.20.1';  // v1.20.1: Reset Event (Hari Sebenar) kini reset FUTSAL + BADMINTON + Urus Gelanggang & susunan
// const API_VERSI_LAMA = '1.20.0';  // v1.20.0: Urus Gelanggang Badminton (tambah / tutup / Jana Susunan / kunci Separuh Akhir & Akhir)
// const API_VERSI_LAMA = '1.19.1';  // v1.19.0: akaun Urusetia (nama + kata laluan) di tab Senarai_Urusetia & lantikan Sub Admin (sahkan markah)
// const API_VERSI_LAMA = '1.18.1';  // v1.18.1: Master Admin boleh Tolak keputusan Badminton dari Peti Kelulusan (simpanSkorSukan keputusan DITOLAK)
// const API_VERSI_LAMA = '1.18.0';  // v1.18.0: pengadil Badminton memberi skor perlawanan Badminton sahaja (pengadil Futsal = Futsal sahaja)
// const API_VERSI_170 = '1.17.0';  // v1.17.0: akaun pengadil ikut sukan (FUTSAL / BADMINTON) + pilihan sukan semasa log masuk
// const API_VERSI_161 = '1.16.1';  // v1.16.1: fungsi Sukan.gs digabung ke Code.gs
// const API_VERSI_B6 = '1.16.0';  // Bahagian 6: keluaran akhir (semakan pepijat & kemasan)
// const API_VERSI_B5 = '1.15.0';  // Bahagian 5: isyarat perubahan masa nyata untuk Dashboard awam
// const API_VERSI_B4 = '1.14.0';  // Bahagian 4: skor dan keputusan mengikut sukan
// const API_VERSI_LAMA = '1.10.0';  // v1.10.0: Jana Susunan (gelanggang terbuka semua kategori + kunci Separuh Akhir / Akhir)
const GILIRAN_MAX = 6;                     // bil. perlawanan seterusnya dipaparkan per gelanggang
const API_CIRI = ['pengadil', 'kunciGelanggang', 'tangguh', 'pembetulan', 'rehatKecemasan', 'sahPengadil', 'petiKelulusan', 'giliranStandby', 'papanCache', 'sepakMulaTerus', 'papanPintar', 'keputusanLewat', 'papanSegera', 'sandaran', 'urusGelanggang', 'janaSusunan', 'badminton', 'duaSukan', 'tulisBadminton', 'pasukanSukan', 'isyaratPerubahan', 'pengadilSukan', 'skorPengadilBadminton', 'urusetiaSubAdmin', 'urusGelanggangBadminton', 'resetDuaSukan', 'bmSahPantas', 'giliranSerentak', 'antiBertindih', 'petiKeluar', 'gelanggangTerbuka', 'autoIsiGelanggang', 'rehatPasukan'];
// v1.9.0: Papan live disimpan dalam CacheService supaya ?action=live sangat pantas
// (paparan dashboard boleh disegerak setiap beberapa saat). Cache dibuang serta-merta
// setiap kali ada penulisan (doPost), jadi data tidak pernah ketinggalan lebih ~1 tinjauan.
const PAPAN_CACHE_KEY = 'PAPAN_LIVE_V197';
const PAPAN_CACHE_VER = 'PAPAN_LIVE_VER';
const PAPAN_CACHE_SAAT = 30;               // v1.9.3: umur 'segar' cache (suntingan manual di Sheets muncul dalam <= 30 s)
const PAPAN_CACHE_MAX_SAAT = 600;          // v1.9.3: salinan terakhir disimpan untuk dipakai semasa dibina semula
const UPSERT_TULIS_BARIS_MAX = 6;          // v1.9.3: <= 6 baris berubah -> tulis baris itu sahaja
const LIVE_TERBIAR_MINIT = 40;             // v1.9.2: baris LIVE tanpa kunci & tanpa kemas kini -> diabaikan di papan
const TANGGUH_PAPAN_MINIT = 20;            // v1.9.2: perlawanan ditangguh dipaparkan sebagai 'semasa' selama ini
// v1.9.2: tindakan yang tidak mengubah papan live -> cache tidak dibuang
const ACTIONS_TANPA_UBAH_PAPAN = ['ping', 'loginpengadil', 'loginurusetia', 'semakurusetia', 'logkeluarurusetia',
  'senaraiurusetia', 'simpanurusetia', 'padamurusetia', 'statusgelanggang', 'senaraipengadil', 'logpembetulan',
  'simpansandaran', 'senaraisandaran', 'ambilsandaran', 'padamsandaran', 'senaraigelanggang'];
// Bahagian 5: isyarat perubahan masa nyata. Setiap penulisan yang mengubah data awam
// menyimpan cap masa baharu per sukan. Dashboard membaca cap masa ini (sangat ringan,
// turut disertakan dalam ?action=live) dan hanya membaca data penuh bila cap masa berubah.
const ACTIONS_TANPA_ISYARAT = ACTIONS_TANPA_UBAH_PAPAN.concat(['logkeluarpengadil', 'simpanpengadil', 'padampengadil', 'syncpengadil']);
const ISYARAT_KEY = 'ISYARAT_UBAH_';       // + FUTSAL / BADMINTON
const ISYARAT_CACHE_SAAT = 21600;
// FASA 6: log pengesahan keputusan oleh pengadil (tambah sahaja, tidak ditulis ganti)
const SHEET_SAH_PENGADIL = 'Log_Sah_Pengadil';
const SAH_PENGADIL_HEADER = ['Masa', 'ID Match', 'Gelanggang', 'Pasukan 1', 'Skor', 'Pasukan 2', 'Menang Penalti', 'Pengadil', 'ID Pengadil'];
// Medan yang HANYA boleh ditulis oleh pengadil (skorLive) atau Master Admin
const PENGADIL_ONLY_FIELDS = ['sahPengadil', 'sahPengadilPada'];
// Tindakan perlawanan yang sah (selain PENGADIL_ACTIONS)
const MATCH_ACTIONS = ['', 'syncall', 'updatematch', 'updatematches'];

/**
 * Pilihan keselamatan: isi API_TOKEN (cth: 'kbb2026rahsia') untuk hanya menerima
 * POST yang membawa { token: 'kbb2026rahsia' }. Biarkan kosong untuk aplikasi
 * semasa (aplikasi tidak menghantar token).
 */
const API_TOKEN = '';

/**
 * KUNCI MASTER ADMIN (untuk urus akaun pengadil melalui aplikasi).
 * Mesti sama dengan PIN Master Admin dalam aplikasi (lalai: 101010).
 * Untuk menukar tanpa ubah kod: Project Settings > Script Properties >
 * tambah MASTER_ADMIN_PIN = <PIN baharu>. Script Property mengatasi nilai lalai ini.
 */
const MASTER_ADMIN_PIN_DEFAULT = '101010';

/** Lajur tab Senarai_Pengadil (ikut susunan ini). */
// v1.17.0: lajur 'Sukan' (FUTSAL / BADMINTON) ditambah di HUJUNG; akaun lama tanpa nilai = FUTSAL.
const PENGADIL_HEADER = ['ID Pengadil', 'Nama Ringkas', 'Kata Laluan', 'Status', 'Dicipta Pada', 'Dikemaskini Pada', 'Log Masuk Terakhir', 'Sukan'];
const PENGADIL_ACTIONS = [
  'loginpengadil', 'senaraipengadil', 'simpanpengadil', 'padampengadil', 'syncpengadil',
  // Fasa 2: kunci gelanggang
  'logkeluarpengadil', 'statusgelanggang', 'kuncigelanggang', 'lepasgelanggang', 'skorlive',
  // Fasa 3: tangguh oleh Master Admin / Urusetia
  'tangguhadmin',
  // Fasa 4: pembetulan markah (Master Admin sahaja)
  'pembetulanskor', 'logpembetulan',
  // Fasa 5: rehat kecemasan & ambil alih pengadil
  'rehatkecemasan', 'ambilalihgelanggang', 'sambungperlawanan',
  // v1.9.8: Backup & Restore (Master Admin sahaja)
  'simpansandaran', 'senaraisandaran', 'ambilsandaran', 'padamsandaran',
  // v1.9.9: Urus Gelanggang (Master Admin sahaja) & senarai gelanggang (semua)
  'urusgelanggang', 'senaraigelanggang',
  // Reset Event (Master Admin sahaja) - kosongkan markah ujian sebelum hari sebenar
  'resetacara'
];
const PENGADIL_LOGIN_MAX_GAGAL = 5;        // cubaan gagal sebelum dikunci
const PENGADIL_LOGIN_KUNCI_SAAT = 300;     // tempoh kunci (5 minit)

/* ---------- FASA 2: SESI PENGADIL & KUNCI GELANGGANG ---------- */
// v1.9.9: senarai gelanggang kini DINAMIK (Master Admin boleh tambah / aktif / tutup).
// Nilai lalai di bawah dipakai sehingga Master Admin menyimpan senarai baharu.
const GELANGGANG_LALAI = [
  { id: 'A', nama: 'Gelanggang A', kategori: 'SEMUA', aktif: true },   // v1.23.0: semua gelanggang terbuka
  { id: 'B', nama: 'Gelanggang B', kategori: 'SEMUA', aktif: true },
  { id: 'C', nama: 'Gelanggang C', kategori: 'SEMUA', aktif: true },
  { id: 'D', nama: 'Gelanggang D', kategori: 'SEMUA', aktif: true }
];
const PROP_GELANGGANG = 'SENARAI_GELANGGANG';   // Script Properties (JSON)
const GELANGGANG_MAX = 12;
const KUNCI_HEADER = ['Gelanggang', 'ID Pengadil', 'Nama Pengadil', 'ID Match', 'Dikunci Pada', 'Aktiviti Terakhir',
  'Status Kunci', 'Data Rehat'];   // FASA 5: lajur 7 & 8 (Rehat Kecemasan)
const KUNCI_STATUS_REHAT = 'REHAT KECEMASAN';
const FASA_REHAT_LABEL = 'Rehat Kecemasan';
// Fasa yang boleh disambung selepas rehat kecemasan (kod aplikasi -> label Sheets)
const FASA_SAMBUNG = { 'SEPARUH 1': 'Separuh 1', 'REHAT': 'Rehat', 'SEPARUH 2': 'Separuh 2' };
const REHAT_MAX_MS = 3 * 3600 * 1000;   // had masa fasa yang direkod (3 jam)
// Kunci dianggap "tidak aktif" jika tiada aktiviti / isyarat daripada peranti pengadil
// selama tempoh ini. Hanya kunci tidak aktif boleh diambil alih oleh pengadil lain.
const KUNCI_BASI_SAAT = 900;               // 15 minit
const SESI_PREFIX = 'SESI_';               // Script Properties: SESI_<token>
const SESI_TEMPOH_JAM = 24;                // sesi log masuk pengadil sah selama 24 jam
// Medan markah yang HANYA boleh diubah oleh pengadil pemegang kunci gelanggang
const LOCK_PROTECTED_FIELDS = ['fasaMulaPada', 'skorP1', 'skorP2', 'fasaMasa', 'status', 'pengesahan', 'pengadil', 'pemenangPenalti', 'masaTamat',
  'sahPengadil', 'sahPengadilPada'];

/* ---------- FASA 4: PEMBETULAN MARKAH ---------- */
// Medan keputusan yang DIKUNCI selepas perlawanan DISAHKAN (SELESAI).
// Hanya Master Admin (adminKey sah) boleh mengubahnya.
const FINAL_PROTECTED_FIELDS = ['fasaMulaPada', 'skorP1', 'skorP2', 'pemenangPenalti', 'status', 'pengesahan', 'namaP1', 'namaP2', 'kodP1', 'kodP2'];
const GROUP_STAGES = ['PERINGKAT KUMPULAN', 'PUSINGAN KEDUA'];
const KNOCKOUT_STAGES = ['SUKU AKHIR', 'SEPARUH AKHIR', 'TEMPAT 3/4', 'AKHIR'];
// Medan perlawanan susulan yang boleh dihantar bersama pembetulan (hasil rombakan aplikasi)
const SUSULAN_FIELDS = ['namaP1', 'namaP2', 'skorP1', 'skorP2', 'status', 'pengesahan', 'pemenangPenalti',
  'fasaMasa', 'masaMula', 'masaTamat', 'disahkanOleh', 'disahkanPada', 'pengadil', 'catatan', 'sahPengadil', 'sahPengadilPada'];
const ADMIN_MAX_GAGAL = 8;                 // cubaan kunci Master Admin salah sebelum disekat
const ADMIN_KUNCI_SAAT = 600;              // tempoh sekatan (10 minit)

/**
 * Medan data -> [Tajuk lajur lalai, ...alias tajuk yang diterima].
 * Alias dibandingkan tanpa huruf besar/kecil, ruang atau simbol.
 */
const FIELDS = {
  id:              ['ID Match', 'id', 'idmatch', 'matchid', 'idperlawanan', 'kodmatch'],
  kategori:        ['Kategori', 'kategori'],
  no:              ['No', 'no', 'bil', 'nomatch', 'noperlawanan', 'noper'],
  peringkat:       ['Peringkat', 'peringkat'],
  kumpulan:        ['Kumpulan', 'kumpulan', 'kump'],
  kodP1:           ['Kod P1', 'kodp1', 'kodpasukan1'],
  namaP1:          ['Pasukan 1', 'namap1', 'pasukan1', 'pasukana', 'tuanrumah', 'namapasukan1'],
  skorP1:          ['Skor P1', 'skorp1', 'skor1', 'skorpasukan1', 'golp1'],
  skorP2:          ['Skor P2', 'skorp2', 'skor2', 'skorpasukan2', 'golp2'],
  namaP2:          ['Pasukan 2', 'namap2', 'pasukan2', 'pasukanb', 'pelawat', 'namapasukan2'],
  kodP2:           ['Kod P2', 'kodp2', 'kodpasukan2'],
  gelanggang:      ['Gelanggang', 'gelanggang', 'gel', 'court'],
  fasa:            ['Fasa', 'fasa', 'fasakejohanan'],
  fasaMasa:        ['Fasa Masa', 'fasamasa', 'separuh', 'masaperlawanan'],
  fasaMulaPada:    ['Masa Mula Fasa', 'fasamulapada'],
  status:          ['Status Perlawanan', 'status', 'statusperlawanan', 'statusmatch'],
  pengesahan:      ['Status Pengesahan', 'pengesahan', 'statuspengesahan', 'pengesahanurusetia'],
  pengadil:        ['Nama Pengadil', 'pengadil', 'namapengadil'],
  // FASA 6: pengadil yang mengesahkan keputusan (nama daripada token sesi)
  sahPengadil:     ['Disahkan Pengadil', 'disahkanpengadil', 'sahpengadil', 'pengesahanpengadil'],
  sahPengadilPada: ['Masa Sah Pengadil', 'masasahpengadil', 'sahpengadilpada'],
  pemenangPenalti: ['Menang Penalti', 'pemenangpenalti', 'menangpenalti', 'penalti'],
  masaMula:        ['Masa Mula', 'masamula'],
  masaJadual:      ['Masa Jadual', 'masajadual'],
  masaTamat:       ['Masa Tamat', 'masatamat'],
  disahkanOleh:    ['Disahkan Oleh', 'disahkanoleh'],
  disahkanPada:    ['Disahkan Pada', 'disahkanpada'],
  catatan:         ['Catatan', 'catatan', 'nota'],
  kemaskini:       ['Kemaskini Terakhir', 'kemaskini', 'kemaskiniterakhir', 'updatedat'],
  // FASA 4: cop versi pembetulan (teks). Hanya ditulis oleh pembetulanSkor_ (Master Admin).
  versiPembetulan: ['Versi Pembetulan', 'versipembetulan', 'versi']
};

// Medan yang dibenarkan dikemas kini oleh doPost (selain medan pengenalan)
const UPDATABLE = [
  'kategori', 'no', 'peringkat', 'kumpulan', 'kodP1', 'namaP1', 'skorP1', 'skorP2', 'namaP2', 'kodP2',
  'gelanggang', 'fasa', 'fasaMasa', 'fasaMulaPada', 'status', 'pengesahan', 'pengadil', 'pemenangPenalti',
  'masaMula', 'masaTamat', 'disahkanOleh', 'disahkanPada', 'catatan', 'sahPengadil', 'sahPengadilPada'
];
const DATE_FIELDS = ['fasaMulaPada', 'masaMula', 'masaJadual', 'masaTamat', 'disahkanPada', 'kemaskini', 'sahPengadilPada'];

const STATUS_MAP = {
  'BELUMBERMULA': 'MENUNGGU GILIRAN', 'MENUNGGU': 'MENUNGGU GILIRAN', 'MENUNGGUGILIRAN': 'MENUNGGU GILIRAN',
  'LIVE': 'LIVE', 'SEDANGBERLANGSUNG': 'LIVE',
  'TAMAT': 'TAMAT - TUNGGU SAH', 'TAMATTUNGGUSAH': 'TAMAT - TUNGGU SAH',
  'SELESAI': 'SELESAI', 'DISAHKAN': 'SELESAI'
};
const PENGESAHAN_MAP = { 'MENUNGGU': 'MENUNGGU', 'DISAHKAN': 'DISAHKAN', 'DITOLAK': 'DITOLAK', 'LULUS': 'DISAHKAN', 'SAH': 'DISAHKAN' };
const FASA_MASA_MAP = {
  'SEPARUH1': 'Separuh 1', 'REHAT': 'Rehat', 'SEPARUH2': 'Separuh 2',
  'TAMAT': 'Tamat', 'SEDIA': 'Belum Bermula', 'BELUMBERMULA': 'Belum Bermula',
  'DITANGGUHKAN': 'Ditangguhkan', 'TANGGUH': 'Ditangguhkan',
  'REHATKECEMASAN': 'Rehat Kecemasan'
};

/* =========================================================
   doGet(e) - BACA DATA
   ?action=read (lalai) | ?action=ping
   ?action=kunci       -> status kunci gelanggang A..D (tanpa token / kata laluan)
   ?action=live        -> papan live awam: perlawanan semasa setiap gelanggang + pengadil
   ?id=SR-01           -> satu perlawanan
   ?kategori=SR|SM     -> tapis kategori
   ?gelanggang=A..D    -> tapis gelanggang
   ?action=gelanggang  -> senarai gelanggang (aktif / ditutup) - v1.9.9
   ?action=badminton   -> data badminton (pasukan, jadual, peraturan) - v1.11.0 (baca sahaja)
   ?callback=namaFungsi -> JSONP
   ========================================================= */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    const action = String(p.action || 'read').toLowerCase();
    // Bahagian 5: isyarat perubahan (tiada data sulit; sangat pantas daripada cache)
    if (action === 'perubahan' || action === 'isyarat') return output_(isyaratPerubahan_(), p.callback);
    const sukan = jenisSukan_(p.sukan, action === 'badminton' || action === 'databadminton' ? 'BADMINTON' : 'FUTSAL');
    if ((action === 'badminton' || action === 'databadminton') && sukan !== 'BADMINTON') throw new Error('Tindakan badminton memerlukan sukan BADMINTON.');
    if (action === 'pasukan') return output_({ ok: true, versi: API_VERSI, sukan: sukan,
      pasukan: bacaObjekSheet_(tabSukan_(sukan, 'pasukan')) || [] }, p.callback);
    if (sukan === 'BADMINTON' && ['read', 'badminton', 'databadminton', 'ping'].indexOf(action) < 0) {
      throw new Error('Tindakan ini masih khusus untuk FUTSAL.');
    }
    if (action === 'ping') {
      return output_({ ok: true, message: 'Live Futsal PK KBB API aktif', versi: API_VERSI, ciri: API_CIRI,
        sheetPengadil: SHEET_PENGADIL, senaraiGelanggang: bacaGelanggang_(), giliran: statGiliran_(), masa: new Date().toISOString() }, p.callback);
    }
    if (action === 'gelanggang' || action === 'senaraigelanggang') {
      return output_({ ok: true, senaraiGelanggang: bacaGelanggang_(), masa: new Date().toISOString() }, p.callback);
    }
    if (action === 'live' || action === 'papanlive') {
      const papan = papanLiveCached_();
      // Bahagian 5: isyarat perubahan dihantar bersama papan live -> tiada permintaan tambahan
      if (papan && papan.ok) { try { papan.isyarat = isyaratRingkas_(); } catch (errI) { /* pilihan sahaja */ } }
      return output_(papan, p.callback);
    }
    if (action === 'kunci' || action === 'statusgelanggang') {
      return output_({ ok: true, masa: new Date().toISOString(), basiSaat: KUNCI_BASI_SAAT, kunci: statusKunci_(),
        senaraiGelanggang: bacaGelanggang_() }, p.callback);
    }
    if (action === 'badminton' || action === 'databadminton') {   // v1.11.0 (baca sahaja)
      return output_(dataBadminton_(), p.callback);
    }
    if (action !== 'read') {
      return output_({ ok: false, error: 'Tindakan tidak dikenali: ' + action }, p.callback);
    }

    const sheet = getJadualSheet_(sukan);
    const table = readTable_(sheet);
    // v1.20.2: isi slot kalah mati Badminton yang sudah layak (pengadil terus nampak butang Adili)
    // v1.21.0 PRESTASI: sebelum ini SETIAP bacaan (pengadil setiap 20 s, Peti Kelulusan, Admin)
    // mengambil kunci skrip sehingga 4 s & membaca tab pasukan -> beratur dengan Sahkan (doPost).
    // Kini: paling kerap sekali setiap 45 s, kunci dicuba 300 ms sahaja (bacaan tidak pernah tersekat).
    if (sukan === 'FUTSAL') {
      const kunciP = LockService.getScriptLock();
      if (kunciP.tryLock(300)) {
        try { baikiSeriTanpaPenalti_(sheet, table); }
        catch (errP) { console.warn('baikiSeriTanpaPenalti_', errP); }
        finally { kunciP.releaseLock(); }
      }
    }
    if (sukan === 'BADMINTON' && bmRombakBacaPerlu_()) {
      const kunciBaca = LockService.getScriptLock();
      if (kunciBaca.tryLock(300)) {
        try { rombakJadualBadminton_(sheet, table); }
        catch (errR) { console.warn('rombakJadualBadminton_', errR); }
        finally { kunciBaca.releaseLock(); }
      }
    }
    // v1.23.3: No. Perlawanan Keseluruhan (P1, P2, P3 ...) disertakan dalam bacaan supaya
    // Paparan Pengadil boleh memaparkan "perlawanan ke berapa" bagi setiap gelanggang.
    // Lajur ini hanya dibaca (bukan medan FIELDS -> tidak pernah ditulis / ditambah lajur).
    const colP = sukan === 'BADMINTON' ? (table.values[0] || []).map(normalizeKey_).findIndex(function (k) {
      return k === 'noperkeseluruhan' || (k.indexOf('no') === 0 && k.indexOf('keseluruhan') >= 0);
    }) : -1;
    let rows = table.rows.map(function (r) {
      const d = Object.assign({}, r.data, { sukan: sukan });
      if (colP >= 0) d.noPerkeseluruhan = String(table.values[r.rowIndex][colP] || '').trim();
      return d;
    });

    if (p.id) rows = rows.filter(function (r) { return String(r.id).toUpperCase() === String(p.id).toUpperCase(); });
    if (p.kategori) rows = rows.filter(function (r) { return String(r.kategori).toUpperCase() === String(p.kategori).toUpperCase(); });
    if (p.gelanggang) rows = rows.filter(function (r) { return String(r.gelanggang).toUpperCase() === String(p.gelanggang).toUpperCase(); });

    return output_({
      ok: true,
      sheet: sheet.getName(),
      versi: API_VERSI,
      sukan: sukan,
      count: rows.length,
      dikemaskini: new Date().toISOString(),
      senaraiGelanggang: sukan === 'FUTSAL' ? bacaGelanggang_() : bacaGelanggangBm_(),   // v1.20.0
      matches: p.id ? undefined : rows,
      match: p.id ? (rows[0] || null) : undefined
    }, p.callback);
  } catch (err) {
    return output_({ ok: false, versi: API_VERSI, error: String(err && err.message || err) }, p.callback);
  }
}

/* =========================================================
   v1.11.0 - DATA BADMINTON (BACA SAHAJA)
   Dashboard Utama membaca tab badminton melalui GET ?action=badminton.
   Tajuk lajur (baris 1) dipulangkan apa adanya, cth. ID_Match, Skor_P1, Status_Pengesahan.
   ========================================================= */
const SHEET_BM_JADUAL = 'Jadual_Badminton';
const SHEET_BM_PASUKAN = 'Pasukan_Badminton';
const SHEET_BM_PERATURAN = 'Peraturan_Badminton';
const SHEET_KEJOHANAN = 'Kejohanan';
const SHEET_GELANGGANG_INFO = 'Gelanggang';
const BM_CACHE_KEY = 'DATA_BADMINTON_V120';   // v1.20.0: + senaraiGelanggang
const BM_CACHE_SAAT = 20;

function bacaObjekSheet_(nama) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nama);
  if (!sheet) return null;
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  const header = values[0].map(function (h) { return String(h === null || h === undefined ? '' : h).trim(); });
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row[0] === '' || row[0] === null || row[0] === undefined) continue;
    const o = {};
    header.forEach(function (h, i) {
      if (!h) return;
      let v = row[i];
      if (v instanceof Date) v = v.toISOString();
      o[h] = v;
    });
    out.push(o);
  }
  return out;
}

function dataBadminton_() {
  let cache = null;
  try {
    cache = CacheService.getScriptCache();
    const c = cache.get(BM_CACHE_KEY);
    if (c) { const d = JSON.parse(c); d.cache = true; return d; }
  } catch (err) { cache = null; }
  const jadual = bacaObjekSheet_(SHEET_BM_JADUAL);
  const pasukan = bacaObjekSheet_(SHEET_BM_PASUKAN);
  if (!jadual || !pasukan) {
    return { ok: false, kod: 'TIADA_TAB_BADMINTON', versi: API_VERSI,
      error: 'Tab ' + SHEET_BM_JADUAL + ' / ' + SHEET_BM_PASUKAN + ' tidak dijumpai dalam Google Sheets.' };
  }
  const sukanIni = function (r) { return String(r.Sukan || '').trim().toUpperCase() === 'BADMINTON'; };
  const data = {
    ok: true,
    sukan: 'BADMINTON',
    versi: API_VERSI,
    masa: new Date().toISOString(),
    acara: (bacaObjekSheet_(SHEET_KEJOHANAN) || []).filter(sukanIni),
    pasukan: pasukan,
    jadual: jadual,
    peraturan: bacaObjekSheet_(SHEET_BM_PERATURAN) || [],
    gelanggang: (bacaObjekSheet_(SHEET_GELANGGANG_INFO) || []).filter(sukanIni),
    senaraiGelanggang: bacaGelanggangBm_()   // v1.20.0: Urus Gelanggang Badminton
  };
  try {
    const s = JSON.stringify(data);
    if (cache && s.length < 95000) cache.put(BM_CACHE_KEY, s, BM_CACHE_SAAT);
  } catch (err) { /* abaikan: cache pilihan sahaja */ }
  return data;
}

/* =========================================================
   v1.22.0 - KETAHANAN SERENTAK (GILIRAN, CUBA SEMULA & ANTI-BERTINDIH)
   Had Google Apps Script yang perlu difahami:
   - Maks ~30 pelaksanaan serentak bagi satu skrip. Permintaan yang menunggu kunci turut
     dikira. Lebihan ditolak oleh Google SENDIRI (sebelum doPost berjalan) -> aplikasi
     (callGas dalam index.html) mencuba semula secara automatik dengan reqId yang sama.
   - LockService.getScriptLock() = SATU giliran untuk SEMUA penulis. Hanya satu permintaan
     menulis pada satu masa -> tiada baris bertindih / tulis ganti separuh jalan.
   ========================================================= */
const KUNCI_BAJET_MS = 18000;                       // jumlah masa maks menunggu giliran (< 30 s had aplikasi)
const KUNCI_CUBAAN_MS = [1500, 2500, 3500, 4500, 6000];   // tempoh setiap cubaan tryLock (berperingkat)
const IDEM_PREFIX = 'REQ_V122_';                    // cache respons mengikut reqId
const IDEM_SAAT = 21600;                            // v1.22.1: 6 jam (maks CacheService) - peti keluar telefon boleh hantar semula lewat
const IDEM_MAX_AKSARA = 90000;                      // had nilai CacheService ~100 KB
const RALAT_SEMENTARA_RE = /Service Spreadsheets|timed out|Service error|Service unavailable|Internal error|Too many simultaneous|Rate exceeded|try again later|Server error|Lock timeout|Perkhidmatan/i;
const RALAT_SEMENTARA_CUBA_MAX = 1;                 // cuba semula sekali di dalam giliran yang sama
const STAT_GILIRAN_KEY = 'STAT_GILIRAN_V122';

function reqIdSah_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim();
  return /^[A-Za-z0-9_\-:.]{8,80}$/.test(s) ? s : '';
}

// Dapatkan kunci skrip dengan CUBAAN SEMULA berperingkat (backoff + jitter).
// Pulangkan { lock, cubaan, tungguMs } atau null jika giliran masih penuh selepas bajet.
function dapatKunciGiliran_(bajetMs) {
  const bajet = Math.max(500, Number(bajetMs) || KUNCI_BAJET_MS);
  const mula = Date.now();
  let lock = null;
  let cubaan = 0;
  while (Date.now() - mula < bajet) {
    cubaan++;
    try { if (!lock) lock = LockService.getScriptLock(); } catch (errL) { lock = null; }
    const baki = bajet - (Date.now() - mula);
    const slot = Math.max(100, Math.min(baki, KUNCI_CUBAAN_MS[Math.min(cubaan - 1, KUNCI_CUBAAN_MS.length - 1)]));
    let dapat = false;
    try { dapat = !!(lock && lock.tryLock(slot)); }
    catch (errT) { console.warn('tryLock cubaan ' + cubaan, errT); dapat = false; }   // ralat LockService sementara
    if (dapat) return { lock: lock, cubaan: cubaan, tungguMs: Date.now() - mula };
    // Rehat rawak pendek (jitter) supaya permintaan yang gagal tidak berebut serentak lagi
    const rehat = Math.min(bajet - (Date.now() - mula), 40 + Math.floor(Math.random() * 120 * cubaan));
    if (rehat > 0) Utilities.sleep(rehat);
  }
  return null;
}

function ambilResponsIdem_(reqId) {
  if (!reqId) return null;
  try {
    const c = CacheService.getScriptCache().get(IDEM_PREFIX + reqId);
    if (!c) return null;
    const obj = JSON.parse(c);
    obj.ulangan = true;   // permintaan ini telah diproses sebelum ini -> tiada tulisan kedua
    return obj;
  } catch (err) { return null; }
}

function simpanResponsIdem_(reqId, obj) {
  if (!reqId || !obj || !obj.ok) return;   // hanya respons BERJAYA (gagal = selamat diulang)
  try {
    let s = JSON.stringify(obj);
    if (s.length > IDEM_MAX_AKSARA) {
      // respons besar: simpan ringkasan sahaja (cukup untuk mengesahkan 'sudah diterima')
      s = JSON.stringify({ ok: true, versi: API_VERSI, ringkas: true, message: 'Permintaan telah diproses.', masa: obj.masa || new Date().toISOString() });
    }
    CacheService.getScriptCache().put(IDEM_PREFIX + reqId, s, IDEM_SAAT);
  } catch (err) { /* cache pilihan sahaja */ }
}

function isRalatSementara_(err) {
  return RALAT_SEMENTARA_RE.test(String(err && err.message || err));
}

// Statistik giliran ringkas (anggaran, bukan atom) -> dipaparkan dalam ?action=ping
function catatStatGiliran_(jenis, tungguMs) {
  try {
    const cache = CacheService.getScriptCache();
    const st = JSON.parse(cache.get(STAT_GILIRAN_KEY) || '{}');
    st.sibuk = Number(st.sibuk) || 0;
    st.berjaya = Number(st.berjaya) || 0;
    st.ulangan = Number(st.ulangan) || 0;
    st.tungguMaksMs = Number(st.tungguMaksMs) || 0;
    if (jenis === 'sibuk') { st.sibuk++; st.sibukTerakhir = new Date().toISOString(); }
    else if (jenis === 'ulangan') st.ulangan++;
    else st.berjaya++;
    if (tungguMs !== undefined) {
      st.tungguTerakhirMs = tungguMs;
      st.tungguMaksMs = Math.max(st.tungguMaksMs, tungguMs);
    }
    st.dikemaskini = new Date().toISOString();
    cache.put(STAT_GILIRAN_KEY, JSON.stringify(st), 21600);
  } catch (err) { /* abaikan */ }
}

function statGiliran_() {
  try {
    const st = JSON.parse(CacheService.getScriptCache().get(STAT_GILIRAN_KEY) || '{}');
    st.bajetMs = KUNCI_BAJET_MS;
    return st;
  } catch (err) { return { bajetMs: KUNCI_BAJET_MS }; }
}

function sibukRespons_() {
  return {
    ok: false, kod: 'SIBUK', cubaLagi: true, versi: API_VERSI,
    cubaSelepasMs: 600 + Math.floor(Math.random() * 1400),
    error: 'Pelayan sibuk (giliran penuh). Data BELUM disimpan - sedang cuba lagi secara automatik.'
  };
}

/* =========================================================
   doPost(e) - KEMAS KINI DATA
   Format diterima (Content-Type text/plain atau application/json):
   1) Sync penuh daripada aplikasi (butang "Sync ke Google Sheets"):
      { action: 'syncAll', matches: [ {...}, ... ], standings: [...], approvalLog: [...] }
   2) Kemas kini satu perlawanan:
      { action: 'updateMatch', id: 'SR-01', skorP1: 2, skorP2: 1, fasaMasa: 'Separuh 2',
        status: 'LIVE', pengesahan: 'MENUNGGU', pengadil: 'Cikgu Ahmad' }
   3) Kemas kini beberapa perlawanan: { action: 'updateMatches', matches: [ ... ] }
   4) Pangkalan data pengadil (lihat bahagian PANGKALAN DATA PENGADIL di bawah):
      { action: 'loginPengadil',   nama, password }                 -> semua
      { action: 'senaraiPengadil', adminKey }                       -> Master Admin
      { action: 'simpanPengadil',  adminKey, pengadil: {...} }      -> Master Admin
      { action: 'padamPengadil',   adminKey, id }                   -> Master Admin
      { action: 'syncPengadil',    adminKey, pengadil: [ ... ] }    -> Master Admin
   5) Kunci gelanggang (Fasa 2) - token diperoleh daripada loginPengadil:
      { action: 'statusGelanggang' }                                -> semua
      { action: 'kunciGelanggang', token, gelanggang, matchId }     -> Sepak Mula (kunci)
      { action: 'kunciGelanggang', token, gelanggang, perbaharui: true } -> isyarat aktif
      { action: 'skorLive', token, gelanggang, matchId, skorP1, skorP2, fasaMasa, status, ..., lepas }
      { action: 'lepasGelanggang', token, gelanggang }              -> pengadil lepaskan
      { action: 'lepasGelanggang', adminKey, gelanggang }           -> Master Admin paksa lepas
      { action: 'logKeluarPengadil', token }                        -> tamat sesi & lepas kunci
   * Perlawanan di gelanggang yang DIKUNCI: medan markah (skor, fasa, status...) tidak
     boleh ditulis ganti oleh syncAll / updateMatch. Hanya skorLive daripada pengadil
     pemegang kunci diterima.
   ========================================================= */
function doPost(e) {
  // v1.22.0: badan permintaan dihurai SEBELUM beratur -> masa memegang kunci lebih singkat
  let body;
  try { body = parseBody_(e); }
  catch (err) { return output_({ ok: false, versi: API_VERSI, error: String(err && err.message || err) }); }
  const reqId = reqIdSah_(body && (body.reqId || body.idPermintaan));

  // ANTI-BERTINDIH (laluan pantas): permintaan yang sama sudah diproses -> pulangkan respons asal
  const ulangPantas = ambilResponsIdem_(reqId);
  if (ulangPantas) { catatStatGiliran_('ulangan'); return output_(ulangPantas); }

  // SISTEM GILIRAN: tunggu giliran menulis dengan cubaan semula berperingkat
  const giliran = dapatKunciGiliran_(KUNCI_BAJET_MS);
  if (!giliran) {
    catatStatGiliran_('sibuk', KUNCI_BAJET_MS);
    return output_(sibukRespons_());
  }
  const lock = giliran.lock;
  const ctx = {
    ubahPapan: true,    // v1.9.2: bina semula papan live hanya bila data papan mungkin berubah
    tandaSukan: ''      // Bahagian 5: sukan yang datanya berubah -> isyarat kepada Dashboard
  };
  let out = null;
  let verPapan = '';
  let berjaya = false;
  try {
    // Semak semula SELEPAS mendapat giliran: salinan pendua yang menunggu di belakang
    // permintaan asal tidak akan menulis kali kedua.
    const ulang = ambilResponsIdem_(reqId);
    if (ulang) { ctx.ubahPapan = false; ctx.tandaSukan = ''; catatStatGiliran_('ulangan', giliran.tungguMs); out = output_(ulang); return out; }

    let cubaRalat = 0;
    while (true) {
      try {
        out = prosesPost_(body, ctx);
        break;
      } catch (err) {
        // CUBA SEMULA: ralat Google Sheets sementara -> cuba sekali lagi dalam giliran yang sama
        if (isRalatSementara_(err) && cubaRalat < RALAT_SEMENTARA_CUBA_MAX) {
          cubaRalat++;
          console.warn('doPost ralat sementara, cuba semula #' + cubaRalat, err);
          try { SpreadsheetApp.flush(); } catch (errF) { /* abaikan */ }
          Utilities.sleep(250 + Math.floor(Math.random() * 500));
          continue;
        }
        console.error(err);
        out = output_({ ok: false, versi: API_VERSI, error: String(err && err.message || err),
          cubaLagi: isRalatSementara_(err) || undefined });
        break;
      }
    }
    berjaya = RESPONS_OK_;
    // v1.23.0: AUTO-ISI gelanggang kosong (masih DI DALAM giliran / kunci skrip)
    if (berjaya) { try { autoIsiSelepasPost_(body, ctx); } catch (errA) { console.warn('autoIsiSelepasPost_', errA); } }
    if (berjaya) simpanResponsIdem_(reqId, RESPONS_OBJ_);
    catatStatGiliran_('berjaya', giliran.tungguMs);
    return out;
  } finally {
    // Semua tulisan DIKOMIT sebelum giliran diserahkan -> pengadil seterusnya membaca data terkini
    try { SpreadsheetApp.flush(); } catch (errF) { console.warn('flush', errF); }
    // Naikkan versi papan DI DALAM kunci: binaan papan yang bermula sebelum tulisan ini dibuang
    if (ctx.ubahPapan) { try { verPapan = naikVersiPapan_(); } catch (errV) { verPapan = ''; } }
    try { lock.releaseLock(); } catch (errR) { console.warn('releaseLock', errR); }
    // --- DI LUAR KUNCI (giliran sudah bergerak) ---
    // v1.9.3: papan dibina semula terus ke cache -> dashboard / projektor nampak gol serta-merta
    try { if (ctx.ubahPapan) segarkanPapan_(verPapan); } catch (errP) { console.warn('segarkanPapan_', errP); }
    // Bahagian 5: cap masa ditulis SELEPAS data & cache disegarkan -> Dashboard tidak membaca data lama
    try { if (ctx.tandaSukan && berjaya) tandaPerubahan_(ctx.tandaSukan); } catch (errI) { console.warn('tandaPerubahan_', errI); }
  }
}

// v1.22.0: logik tindakan doPost (dijalankan DI DALAM giliran / kunci skrip).
// Pulangkan output_(...). ctx.ubahPapan / ctx.tandaSukan dikemas kini di sini.
function prosesPost_(body, ctx) {
  ctx.ubahPapan = true;
  ctx.tandaSukan = '';
  if (API_TOKEN && body.token !== API_TOKEN) {
    return output_({ ok: false, error: 'Token tidak sah.' });
  }

  const action = String(body.action || '').toLowerCase();
  const sukan = jenisSukan_(body.sukan);
  if (ACTIONS_TANPA_ISYARAT.indexOf(action) < 0 &&
      !(action === 'kuncigelanggang' && (body.perbaharui === true || body.perbaharui === 'true'))) {
    ctx.tandaSukan = sukan;
  }
  // Tolak seluruh permintaan bercampur sebelum sebarang tulisan.
  semakSukanRekod_(body.matches, sukan);
  semakSukanRekod_(body.teams || body.pasukan, sukan);
  semakSukanRekod_([body.match || body], sukan);
  if (sukan === 'BADMINTON') ctx.ubahPapan = false;
  // v1.19.0: akaun Urusetia & Sub Admin
  if (URUSETIA_ACTIONS.indexOf(action) >= 0) {
    ctx.ubahPapan = false;
    return output_(handleUrusetia_(action, body));
  }
  if (action === 'simpanskorsukan') {
    // v1.19.1: Sub Admin boleh Mula Perlawanan, Simpan Skor Sementara, Sahkan & Tolak keputusan
    const subSah = !isMasterAdmin_(body) ? sesiSubAdmin_(body.tokenUrusetia) : null;
    if (!isMasterAdmin_(body) && !(subSah && subSah.ok)) {
      return output_({ ok: false, kod: subSah ? subSah.kod : 'BUKAN_ADMIN', error: subSah ? subSah.error : 'Hanya Master Admin atau Sub Admin boleh menyimpan skor.' });
    }
    return output_(simpanSkorSukan_(body, sukan, subSah && subSah.ok ? 'Sub Admin: ' + subSah.u.nama : 'Master Admin'));
  }
  if (action === 'simpanjadual') {
    if (!isMasterAdmin_(body)) return output_({ ok: false, kod: 'BUKAN_ADMIN', error: 'Hanya Master Admin boleh mengubah jadual.' });
    return output_(simpanJadualSukan_(body, sukan));
  }
  if (action === 'simpanpasukan' || action === 'syncpasukan') {
    ctx.ubahPapan = false;
    if (!isMasterAdmin_(body)) return output_({ ok: false, kod: 'BUKAN_ADMIN', error: 'Hanya Master Admin boleh menyimpan pasukan.' });
    return output_(simpanPasukanSukan_(body, sukan));
  }
  // v1.18.0: skor Badminton oleh PENGADIL BADMINTON sahaja (token sesi). Pengadil Futsal ditolak.
  if (action === 'skorpengadilbadminton') {
    ctx.ubahPapan = false;
    if (sukan !== 'BADMINTON') return output_({ ok: false, kod: 'SUKAN_LAIN', versi: API_VERSI, error: 'Skor pengadil Badminton mesti dihantar untuk sukan BADMINTON sahaja.' });
    return output_(skorPengadilBadminton_(body));
  }
  // v1.20.0: Urus Gelanggang Badminton (Master Admin sahaja)
  if (action === 'urusgelanggangbadminton') {
    ctx.ubahPapan = false;
    if (sukan !== 'BADMINTON') return output_({ ok: false, kod: 'SUKAN_LAIN', versi: API_VERSI, error: 'Urus Gelanggang Badminton mesti dihantar dengan sukan BADMINTON.' });
    if (!isMasterAdmin_(body)) return output_({ ok: false, kod: 'BUKAN_ADMIN', versi: API_VERSI, error: 'Hanya Master Admin boleh mengurus gelanggang Badminton.' });
    return output_(urusGelanggangBm_(body));
  }
  if (sukan === 'BADMINTON' && MATCH_ACTIONS.indexOf(action) < 0 && action !== 'ping') {
    throw new Error('Tindakan ini masih khusus untuk FUTSAL.');
  }
  const petiSubBm_ = sukan === 'BADMINTON' && !isMasterAdmin_(body) && String(body.sumber || '').toUpperCase() === 'PETI-KELULUSAN' &&
    MATCH_ACTIONS.indexOf(action) >= 0 && sesiSubAdmin_(body.tokenUrusetia).ok;   // v1.21.1: Sub Admin Peti Kelulusan Badminton
  if (sukan === 'BADMINTON' && !isMasterAdmin_(body) && !petiSubBm_ && action !== 'ping') {
    return output_({ ok: false, kod: 'BUKAN_ADMIN', error: 'Tulisan Badminton memerlukan kunci Master Admin.' });
  }
  // v1.19.0: Sahkan / Tolak daripada Peti Kelulusan -> Master Admin ATAU Sub Admin sahaja
  if (String(body.sumber || '').toUpperCase() === 'PETI-KELULUSAN' && MATCH_ACTIONS.indexOf(action) >= 0 && !isMasterAdmin_(body)) {
    const sub = sesiSubAdmin_(body.tokenUrusetia);
    if (!sub.ok) return output_({ ok: false, kod: sub.kod, versi: API_VERSI, error: sub.error });
  }
  if (ACTIONS_TANPA_UBAH_PAPAN.indexOf(action) >= 0 ||
      (action === 'kuncigelanggang' && (body.perbaharui === true || body.perbaharui === 'true'))) {
    ctx.ubahPapan = false;
  }

  // Pangkalan data pengadil
  if (PENGADIL_ACTIONS.indexOf(action) >= 0) {
    return output_(handlePengadil_(action, body));
  }
  if (action === 'ping') {
    return output_({ ok: true, message: 'Live Futsal PK KBB API aktif', versi: API_VERSI, ciri: API_CIRI, giliran: statGiliran_(), masa: new Date().toISOString() });
  }
  if (MATCH_ACTIONS.indexOf(action) < 0) {
    return output_({ ok: false, kod: 'TINDAKAN_TIDAK_DIKENALI', versi: API_VERSI, error: 'Tindakan tidak dikenali: ' + action });
  }

  let list = [];
  if (Array.isArray(body.matches)) list = body.matches;
  else if (action === 'updatematch' || body.id) list = [body.match || body];
  if (!list.length) return output_({ ok: false, error: 'Tiada data perlawanan diterima.' });

  // FASA 4: hanya kunci Master Admin yang sah boleh mengubah keputusan DISAHKAN
  const admin = isMasterAdmin_(body);
  const result = upsertMatches_(list, { admin: admin, sukan: sukan });
  // v1.9.4: perlawanan yang telah DISAHKAN -> lepaskan kunci gelanggang supaya
  // gelanggang boleh terus ke perlawanan seterusnya.
  // v1.9.5: hanya bila ada keputusan DISAHKAN dalam penghantaran ini (elak bacaan jadual setiap gol)
  const adaSah = list.some(function (x) {
    return x && String(x.pengesahan || '').toUpperCase() === 'DISAHKAN';
  });
  if (adaSah && sukan === 'FUTSAL') { try { lepasKunciMuktamad_(); } catch (errK) { console.warn('lepasKunciMuktamad_', errK); } }

  // Carta Liga dikira semula DI PELAYAN daripada Jadual_Perlawanan (bukan dipercayai
  // bulat-bulat daripada peranti) supaya peranti dengan data lama tidak merosakkan carta.
  if (sukan === 'FUTSAL') {
    const carta = kiraCartaPelayan_(readTable_(getJadualSheet_()));
    if (carta.length) writeStandings_(carta);
    else if (Array.isArray(body.standings) && body.standings.length) writeStandings_(body.standings);
  }
  if (Array.isArray(body.approvalLog) && body.approvalLog.length) writeApprovalLog_(body.approvalLog, sukan);
  // FASA 7: log Sahkan / Tolak daripada Peti Kelulusan -> ditambah, bukan ditulis ganti
  if (Array.isArray(body.logBaharu) && body.logBaharu.length) tambahApprovalLog_(body.logBaharu, sukan);
  if (sukan === 'BADMINTON') {
    SpreadsheetApp.flush();
    // v1.21.1: keputusan DISAHKAN melalui Peti Kelulusan -> isi slot kalah mati serta-merta (butang pengadil muncul tanpa tunggu 45 s)
    if (adaSah) { try { rombakJadualBadminton_(); } catch (errR) { console.warn('rombakJadualBadminton_', errR); } }
    CacheService.getScriptCache().remove(BM_CACHE_KEY);
  }

  return output_({
    ok: true,
    sheet: tabSukan_(sukan, 'jadual'),
    sukan: sukan,
    versi: API_VERSI,
    dikemaskini: result.updated,
    ditambah: result.inserted,
    ditolak: result.skipped,
    dilindungi: result.protectedRows,   // perlawanan dikunci pengadil (markah tidak ditulis ganti)
    idDilindungi: result.idDilindungi || [],   // v1.9.6: ID yang tidak ditulis (peranti kembalikan ke Peti Kelulusan)
    dimuktamad: result.finalRows,       // keputusan DISAHKAN yang cuba diubah tanpa kunci Master Admin
    lapuk: result.staleRows,            // data peranti lama (versi pembetulan tidak sepadan)
    masa: new Date().toISOString()
  });
}

/* =========================================================
   LOGIK UTAMA: UPSERT BARIS PERLAWANAN
   ========================================================= */
// opts.abaikanKunci = true -> hanya untuk skorLive (pengadil pemegang kunci yang telah disahkan)
// opts.admin = true        -> Master Admin disahkan (adminKey). Satu-satunya cara mengubah
//                             keputusan yang telah DISAHKAN (FASA 4).
function upsertMatches_(list, opts) {
  opts = opts || {};
  const admin = opts.admin === true;
  const sukan = jenisSukan_(opts.sukan);
  semakSukanRekod_(list, sukan);
  const lockedMatches = opts.abaikanKunci || sukan === 'BADMINTON' ? {} : lockedMatchIds_();
  const sheet = getJadualSheet_(sukan);
  const table = readTable_(sheet);
  const values = table.values;            // termasuk baris tajuk
  const colOf = table.colOf;              // medan -> indeks lajur (0-based)
  const width = values[0].length;
  const index = {};
  table.rows.forEach(function (r) { index[String(r.data.id).toUpperCase()] = r.rowIndex; });

  const now = new Date();
  let updated = 0, inserted = 0, skipped = 0, protectedRows = 0, finalRows = 0, staleRows = 0;
  const idDilindungi = [];   // v1.9.6: ID perlawanan yang tidak ditulis kerana dikunci pengadil
  const seriTanpaPenalti = [];   // v1.23.5: kalah mati seri tanpa pemenang penalti (pengesahan ditolak)
  const barisBerubah = {};   // v1.9.3: indeks baris yang disentuh

  list.forEach(function (m) {
    const id = String(m && m.id || '').trim().toUpperCase();
    if (!(sukan === 'FUTSAL' ? /^(SR|SM)-\d{1,2}$/ : /^[A-Z0-9][A-Z0-9_-]{0,59}$/).test(id)) { skipped++; return; }

    let rowIdx = index[id];
    if (rowIdx === undefined) {
      const blank = new Array(width).fill('');
      blank[colOf.id] = id;
      blank[colOf.kategori] = sukan === 'FUTSAL' ? id.slice(0, 2) : String(m.kategori || '');
      values.push(blank);
      rowIdx = values.length - 1;
      index[id] = rowIdx;
      inserted++;
    } else {
      updated++;
    }
    const row = values[rowIdx];
    // v1.9.4: keputusan telah dihantar pengadil (TAMAT - TUNGGU SAH) -> kunci gelanggang
    // tidak lagi melindungi baris supaya Sahkan / Tolak Urusetia benar-benar ditulis.
    const sudahDihantar = String(row[colOf.status] || '').toUpperCase() === 'TAMAT - TUNGGU SAH';
    const dikunci = !!lockedMatches[id] && !sudahDihantar;
    let dilindungi = false;
    // FASA 4: keputusan DISAHKAN dikunci; versi pembetulan menghalang data peranti lama
    const muktamad = isRowFinal_(row, colOf);
    const versiBaris = colOf.versiPembetulan !== undefined ? String(row[colOf.versiPembetulan] || '') : '';
    const versiSepadan = !versiBaris || String(m.versiPembetulan || '') === versiBaris;
    let ditolakMuktamad = false, ditolakLapuk = false;
    const asalBaris = row.slice();   // v1.23.5: salinan sebelum tulisan (untuk pengesahan seri kalah mati)

    UPDATABLE.forEach(function (field) {
      if (!(field in m) || m[field] === undefined) return;
      // FASA 6: pengesahan pengadil hanya melalui skorLive (token pengadil) atau Master Admin
      if (PENGADIL_ONLY_FIELDS.indexOf(field) >= 0 && !admin && !opts.abaikanKunci) return;
      // Gelanggang dikunci pengadil: markah hanya boleh diubah oleh pengadil tersebut
      if (dikunci && LOCK_PROTECTED_FIELDS.indexOf(field) >= 0) { dilindungi = true; return; }
      const nilai = cleanValue_(field, m[field]);
      if (!admin && FINAL_PROTECTED_FIELDS.indexOf(field) >= 0 && !samaNilai_(row[colOf[field]], nilai)) {
        // Pengadil / Urusetia / peranti lain tidak boleh mengubah keputusan muktamad
        if (muktamad) { ditolakMuktamad = true; return; }
        // Baris yang telah dibetulkan: hanya peranti yang memegang versi terkini diterima
        // (skorLive pengadil pemegang kunci dikecualikan untuk perlawanan main semula)
        if (!versiSepadan && !opts.abaikanKunci) { ditolakLapuk = true; return; }
      }
      row[colOf[field]] = nilai;
    });
    // FASA 7: keputusan DITOLAK -> pengesahan pengadil dikosongkan (perlu disahkan semula)
    if (!ditolakMuktamad && !dilindungi && String(row[colOf.pengesahan] || '').toUpperCase() === 'DITOLAK' &&
        cleanValue_('pengesahan', m.pengesahan || '') === 'DITOLAK') {
      if (colOf.sahPengadil !== undefined) row[colOf.sahPengadil] = '';
      if (colOf.sahPengadilPada !== undefined) row[colOf.sahPengadilPada] = '';
    }
    if (admin && m.versiPembetulan !== undefined && colOf.versiPembetulan !== undefined) {
      row[colOf.versiPembetulan] = String(m.versiPembetulan || '').slice(0, 60);
    }
    // v1.23.5: Futsal kalah mati SERI tanpa pemenang penalti tidak boleh menjadi SELESAI / DISAHKAN.
    // Baris dikembalikan seperti sebelum tulisan (kekal dalam Peti Kelulusan) supaya Urusetia menolak
    // & pengadil memilih pemenang penalti. Dahulu SM-38 0-0 disahkan tanpa pemenang -> Akhir tersekat.
    if (sukan === 'FUTSAL' && !muktamad && isRowFinal_(row, colOf)) {
      const peringkatBaris = colOf.peringkat !== undefined ? row[colOf.peringkat] : m.peringkat;
      const a = skorInt_(row[colOf.skorP1]), b = skorInt_(row[colOf.skorP2]);
      const pen = colOf.pemenangPenalti !== undefined ? String(row[colOf.pemenangPenalti] || '').trim() : '';
      if (isKnockoutStage_(peringkatBaris) && a !== null && a === b &&
          !penaltiSah_(pen, colOf.namaP1 !== undefined ? row[colOf.namaP1] : m.namaP1, colOf.namaP2 !== undefined ? row[colOf.namaP2] : m.namaP2)) {
        for (let i = 0; i < width; i++) row[i] = asalBaris[i];
        seriTanpaPenalti.push(id);
      }
    }
    if (dilindungi) { protectedRows++; idDilindungi.push(id); }
    if (ditolakMuktamad) finalRows++;
    if (ditolakLapuk) staleRows++;
    row[colOf.kemaskini] = now;
    barisBerubah[rowIdx] = true;
  });

  // v1.9.3: sedikit baris berubah (cth. gol pengadil) -> tulis baris itu sahaja (lebih pantas).
  // Banyak baris / baris baharu -> tulis semula sekaligus seperti sebelum ini.
  const senarai = Object.keys(barisBerubah).map(Number);
  if (!inserted && senarai.length && senarai.length <= UPSERT_TULIS_BARIS_MAX) {
    senarai.forEach(function (i) {
      if (colOf.versiPembetulan !== undefined && String(values[i][colOf.versiPembetulan] || '') !== '') {
        sheet.getRange(i + 1, colOf.versiPembetulan + 1).setNumberFormat('@');
      }
      sheet.getRange(i + 1, 1, 1, width).setValues([values[i]]);
    });
    return { updated: updated, inserted: inserted, skipped: skipped, protectedRows: protectedRows, finalRows: finalRows, staleRows: staleRows, idDilindungi: idDilindungi, seriTanpaPenalti: seriTanpaPenalti };
  }
  if (colOf.versiPembetulan !== undefined) {
    sheet.getRange(1, colOf.versiPembetulan + 1, values.length, 1).setNumberFormat('@');
  }
  sheet.getRange(1, 1, values.length, width).setValues(values);
  formatDateColumns_(sheet, colOf, values.length);
  return { updated: updated, inserted: inserted, skipped: skipped, protectedRows: protectedRows, finalRows: finalRows, staleRows: staleRows, idDilindungi: idDilindungi, seriTanpaPenalti: seriTanpaPenalti };
}

// Baris perlawanan telah DISAHKAN (SELESAI) -> keputusan muktamad
function isRowFinal_(row, colOf) {
  const st = String(row[colOf.status] || '').toUpperCase();
  const sah = String(row[colOf.pengesahan] || '').toUpperCase();
  return st === 'SELESAI' && sah === 'DISAHKAN';
}

function samaNilai_(a, b) {
  const x = (a === null || a === undefined) ? '' : a;
  const y = (b === null || b === undefined) ? '' : b;
  if (x instanceof Date || y instanceof Date) return toIso_(x) === toIso_(y);
  return String(x) === String(y);
}

function cleanValue_(field, v) {
  if (v === null) return '';
  const key = String(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  switch (field) {
    case 'skorP1':
    case 'skorP2': {
      if (v === '') return '';
      const n = Math.round(Number(v));
      return isNaN(n) ? '' : Math.max(0, Math.min(99, n));
    }
    case 'no': {
      const n = Number(v);
      return isNaN(n) ? v : n;
    }
    case 'status': return STATUS_MAP[key] || String(v);
    case 'pengesahan': return PENGESAHAN_MAP[key] || String(v);
    case 'fasaMasa': return FASA_MASA_MAP[key] || String(v);
    case 'gelanggang': return String(v).toUpperCase();
    default:
      if (DATE_FIELDS.indexOf(field) >= 0) {
        const d = new Date(v);
        return isNaN(d.getTime()) ? '' : d;
      }
      return String(v).slice(0, 500);
  }
}

/* =========================================================
   TAB TAMBAHAN: CARTA LIGA & LOG PENGESAHAN
   ========================================================= */
function writeStandings_(standings) {
  const sheet = getOrCreateSheet_(SHEET_CARTA);
  const header = ['Kategori', 'Kumpulan', 'Kedudukan', 'Kod', 'Pasukan', 'P', 'M', 'S', 'K', 'J', 'B', 'PG', 'Mata', 'Kemaskini'];
  const now = new Date();
  const rows = standings.map(function (r) {
    return [r.kategori, r.kumpulan, r.pos, r.kod, r.nama, r.P, r.M, r.S, r.K, r.J, r.B, r.PG, r.Mata, now];
  });
  sheet.clearContents();
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  if (rows.length) sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  sheet.setFrozenRows(1);
}

function writeApprovalLog_(log, sukan) {
  const sheet = getOrCreateSheet_(tabSukan_(sukan, 'log'));
  const header = ['Masa', 'Match', 'Keputusan', 'Tindakan', 'Oleh'];
  const rows = log.map(function (l) {
    const d = new Date(l.masa);
    return [isNaN(d.getTime()) ? '' : d, l.matchId || '', l.keputusan || '', l.tindakan || '', l.oleh || ''];
  });
  sheet.clearContents();
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
    sheet.getRange(2, 1, rows.length, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  }
  sheet.setFrozenRows(1);
}

// FASA 7: tambah baris log pengesahan (Sahkan / Tolak) tanpa memadam log sedia ada
function tambahApprovalLog_(log, sukan) {
  const sheet = getOrCreateSheet_(tabSukan_(sukan, 'log'));
  const header = ['Masa', 'Match', 'Keputusan', 'Tindakan', 'Oleh'];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  const rows = log.slice(0, 50).map(function (l) {
    const d = new Date(l && l.masa);
    return [isNaN(d.getTime()) ? new Date() : d, String(l && l.matchId || '').slice(0, 20),
      String(l && l.keputusan || '').slice(0, 300), String(l && l.tindakan || '').slice(0, 300), String(l && l.oleh || '').slice(0, 100)];
  });
  if (!rows.length) return;
  const start = sheet.getLastRow() + 1;
  sheet.getRange(start, 1, rows.length, header.length).setValues(rows);
  sheet.getRange(start, 1, rows.length, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
}

/* =========================================================
   PANGKALAN DATA PENGADIL (tab Senarai_Pengadil)
   - Master Admin sahaja boleh cipta / ubah / gantung / padam akaun.
   - Kata laluan disimpan supaya Master Admin boleh melihat & mengurusnya.
     Jangan kongsi Google Sheet ini kepada orang lain.
   ========================================================= */
function handlePengadil_(action, body) {
  // Tindakan pengadil (disahkan dengan token sesi masing-masing)
  switch (action) {
    case 'loginpengadil':     return loginPengadil_(body);
    case 'logkeluarpengadil': return logKeluarPengadil_(body);
    case 'statusgelanggang':  return { ok: true, masa: new Date().toISOString(), basiSaat: KUNCI_BASI_SAAT, kunci: statusKunci_() };
    case 'kuncigelanggang':   return kunciGelanggang_(body);
    case 'lepasgelanggang':   return lepasGelanggang_(body);
    case 'skorlive':          return skorLive_(body);
    case 'tangguhadmin':      return tangguhAdmin_(body);
    // FASA 5
    case 'rehatkecemasan':      return rehatKecemasan_(body);
    case 'ambilalihgelanggang': return ambilAlihGelanggang_(body);
    case 'sambungperlawanan':   return sambungPerlawanan_(body);
    // v1.9.9: senarai gelanggang (semua peranti, tiada data sulit)
    case 'senaraigelanggang':   return { ok: true, senaraiGelanggang: bacaGelanggang_() };
  }

  // FASA 4: sekat cubaan meneka PIN Master Admin
  const cache = CacheService.getScriptCache();
  const gagalAdmin = Number(cache.get('admingagal') || 0);
  if (gagalAdmin >= ADMIN_MAX_GAGAL) {
    return { ok: false, kod: 'DISEKAT', error: 'Terlalu banyak cubaan kunci Master Admin yang salah. Cuba lagi selepas 10 minit.' };
  }
  if (!isMasterAdmin_(body)) {
    if (body && body.adminKey) cache.put('admingagal', String(gagalAdmin + 1), ADMIN_KUNCI_SAAT);
    return { ok: false, kod: 'BUKAN_ADMIN', error: 'Akses ditolak: hanya Master Admin dibenarkan. Kunci Master Admin tidak sah.' };
  }
  if (gagalAdmin) cache.remove('admingagal');
  switch (action) {
    case 'pembetulanskor':  return pembetulanSkor_(body);
    case 'logpembetulan':   return { ok: true, log: bacaLogPembetulan_(100) };
    case 'senaraipengadil': return { ok: true, pengadil: readPengadil_().list.map(publicPengadilAdmin_) };
    case 'simpanpengadil':  return simpanPengadil_(body.pengadil || {});
    case 'padampengadil':   return padamPengadil_(body.id || (body.pengadil && body.pengadil.id));
    case 'syncpengadil':    return syncPengadil_(body.pengadil);
    // v1.9.8: Backup & Restore
    case 'simpansandaran':  return simpanSandaran_(body);
    case 'senaraisandaran': return senaraiSandaran_();
    case 'ambilsandaran':   return ambilSandaran_(body.id);
    case 'padamsandaran':   return padamSandaran_(body.id);
    // v1.9.9: Urus Gelanggang
    case 'urusgelanggang':  return urusGelanggang_(body);
    case 'resetacara':      return resetAcara_(body);
    default:                return { ok: false, error: 'Tindakan pengadil tidak dikenali.' };
  }
}

/* =========================================================
   v1.9.8: BACKUP & RESTORE (tab Sandaran_Data) - Master Admin sahaja
   - Setiap baris = satu sandaran penuh data aplikasi (JSON).
   - JSON dipecah kepada cebisan <= SANDARAN_CEBISAN aksara (had sel Sheets 50,000).
   - Setiap cebisan diawali '~' supaya Sheets tidak menganggapnya formula / nombor.
   ========================================================= */
const SHEET_SANDARAN = 'Sandaran_Data';
const SANDARAN_HEADER = ['Masa', 'ID Sandaran', 'Catatan', 'Oleh', 'Saiz (aksara)', 'Bil. Cebisan'];
const SANDARAN_CEBISAN = 45000;
const SANDARAN_MAX_CEBISAN = 200;          // ~9 juta aksara
const SANDARAN_SIMPAN_MAX = 20;            // bil. sandaran terkini yang disimpan
const SANDARAN_AWALAN = '~';

function getSandaranSheet_() {
  const sheet = getOrCreateSheet_(SHEET_SANDARAN);
  const first = sheet.getRange(1, 1, 1, SANDARAN_HEADER.length).getValues()[0];
  if (first.join('') === '') {
    sheet.getRange(1, 1, 1, SANDARAN_HEADER.length).setValues([SANDARAN_HEADER]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function simpanSandaran_(body) {
  const raw = body && body.data;
  const json = typeof raw === 'string' ? raw : JSON.stringify(raw || null);
  if (!json || json === 'null') return { ok: false, error: 'Tiada data sandaran diterima.' };
  try {
    const p = JSON.parse(json);
    if (!p || !Array.isArray(p.matches) || !Array.isArray(p.teams)) throw new Error('x');
  } catch (err) {
    return { ok: false, error: 'Format data sandaran tidak sah.' };
  }
  const cebisan = [];
  for (let i = 0; i < json.length; i += SANDARAN_CEBISAN) cebisan.push(SANDARAN_AWALAN + json.substr(i, SANDARAN_CEBISAN));
  if (cebisan.length > SANDARAN_MAX_CEBISAN) return { ok: false, error: 'Data sandaran terlalu besar.' };

  const sheet = getSandaranSheet_();
  const lebar = SANDARAN_HEADER.length + cebisan.length;
  if (sheet.getMaxColumns() < lebar) sheet.insertColumnsAfter(sheet.getMaxColumns(), lebar - sheet.getMaxColumns());

  const now = new Date();
  let id = 'SB-' + Utilities.formatDate(now, TIMEZONE, 'yyyyMMdd-HHmmss');
  if (cariBarisSandaran_(sheet, id) > 0) id += '-' + Math.floor(Math.random() * 900 + 100);
  const catatan = String((body && body.catatan) || '').slice(0, 200);
  const oleh = String((body && body.oleh) || 'Master Admin').slice(0, 80);
  const baris = sheet.getLastRow() + 1;
  if (sheet.getMaxRows() < baris) sheet.insertRowsAfter(sheet.getMaxRows(), baris - sheet.getMaxRows());
  const julat = sheet.getRange(baris, 1, 1, lebar);
  julat.setNumberFormat('@');
  julat.setValues([[Utilities.formatDate(now, TIMEZONE, 'dd/MM/yyyy HH:mm:ss'), id, catatan, oleh, String(json.length), String(cebisan.length)].concat(cebisan)]);

  // Simpan hanya SANDARAN_SIMPAN_MAX sandaran terkini (baris paling atas = paling lama)
  const jumlah = sheet.getLastRow() - 1;
  if (jumlah > SANDARAN_SIMPAN_MAX) sheet.deleteRows(2, jumlah - SANDARAN_SIMPAN_MAX);
  SpreadsheetApp.flush();
  if (cariBarisSandaran_(sheet, id) < 0) return { ok: false, error: 'Sandaran gagal disahkan dalam Google Sheets. Cuba lagi.' };
  return { ok: true, id: id, masa: now.toISOString(), saiz: json.length, cebisan: cebisan.length };
}

function cariBarisSandaran_(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2 || !id) return -1;
  const ids = sheet.getRange(2, 2, last - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function senaraiSandaran_() {
  const sheet = getSandaranSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true, sandaran: [] };
  const rows = sheet.getRange(2, 1, last - 1, SANDARAN_HEADER.length).getDisplayValues();
  const list = rows.filter(function (r) { return r[1]; }).map(function (r) {
    return { masa: masaSandaranIso_(r[0]), id: r[1], catatan: r[2], oleh: r[3], saiz: Number(r[4]) || 0, cebisan: Number(r[5]) || 0 };
  });
  list.reverse();   // terkini dahulu
  return { ok: true, sandaran: list };
}

function masaSandaranIso_(v) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(v || ''));
  if (!m) return String(v || '');
  return m[3] + '-' + m[2] + '-' + m[1] + 'T' + m[4] + ':' + m[5] + ':' + m[6] + '+08:00';
}

function ambilSandaran_(id) {
  const sheet = getSandaranSheet_();
  const baris = cariBarisSandaran_(sheet, id);
  if (baris < 0) return { ok: false, error: 'Sandaran ' + id + ' tidak ditemui.' };
  const meta = sheet.getRange(baris, 1, 1, SANDARAN_HEADER.length).getDisplayValues()[0];
  const n = Number(meta[5]) || 0;
  if (!n) return { ok: false, error: 'Sandaran ' + id + ' kosong.' };
  const cebisan = sheet.getRange(baris, SANDARAN_HEADER.length + 1, 1, n).getValues()[0];
  const json = cebisan.map(function (c) {
    const t = String(c == null ? '' : c);
    return t.charAt(0) === SANDARAN_AWALAN ? t.slice(1) : t;
  }).join('');
  if (Number(meta[4]) && json.length !== Number(meta[4])) {
    return { ok: false, error: 'Sandaran ' + id + ' tidak lengkap (saiz tidak sepadan).' };
  }
  try { JSON.parse(json); } catch (err) { return { ok: false, error: 'Sandaran ' + id + ' rosak (JSON tidak sah).' }; }
  return { ok: true, id: id, masa: masaSandaranIso_(meta[0]), catatan: meta[2], oleh: meta[3], data: json };
}

function padamSandaran_(id) {
  const sheet = getSandaranSheet_();
  const baris = cariBarisSandaran_(sheet, id);
  if (baris < 0) return { ok: false, error: 'Sandaran ' + id + ' tidak ditemui.' };
  sheet.deleteRow(baris);
  SpreadsheetApp.flush();
  return { ok: true, id: id };
}

function getMasterAdminKey_() {
  const v = PropertiesService.getScriptProperties().getProperty('MASTER_ADMIN_PIN');
  return String(v || MASTER_ADMIN_PIN_DEFAULT);
}

function isMasterAdmin_(body) {
  const key = String((body && body.adminKey) || '');
  return key !== '' && key === getMasterAdminKey_();
}

function refNameKey_(nama) {
  return String(nama || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function getPengadilSheet_() {
  const sheet = getOrCreateSheet_(SHEET_PENGADIL);
  const first = sheet.getRange(1, 1, 1, PENGADIL_HEADER.length).getValues()[0];
  if (first.join('') === '') {
    sheet.getRange(1, 1, 1, PENGADIL_HEADER.length).setValues([PENGADIL_HEADER]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (String(first[7] || '') === '') {
    // v1.17.0: tab lama -> tambah tajuk lajur Sukan sahaja (data sedia ada tidak diubah)
    sheet.getRange(1, 8).setValue('Sukan').setFontWeight('bold');
  }
  // Lajur Kata Laluan sebagai teks biasa (kekalkan sifar di hadapan, cth: 0123)
  sheet.getRange(1, 3, sheet.getMaxRows(), 1).setNumberFormat('@');
  return sheet;
}

function readPengadil_() {
  const sheet = getPengadilSheet_();
  const last = sheet.getLastRow();
  const list = [];
  if (last >= 2) {
    const values = sheet.getRange(2, 1, last - 1, PENGADIL_HEADER.length).getValues();
    values.forEach(function (r, i) {
      if (!r[0] && !r[1]) return;
      list.push({
        row: i + 2,
        id: String(r[0]).trim(),
        nama: String(r[1]).trim(),
        password: String(r[2]),
        status: String(r[3] || 'AKTIF').toUpperCase() === 'DIGANTUNG' ? 'DIGANTUNG' : 'AKTIF',
        dicipta: toIso_(r[4]),
        dikemaskini: toIso_(r[5]),
        loginTerakhir: toIso_(r[6]),
        sukan: sukanPengadil_(r[7])
      });
    });
  }
  return { sheet: sheet, list: list };
}

function writePengadil_(sheet, list) {
  const last = sheet.getLastRow();
  if (last >= 2) sheet.getRange(2, 1, last - 1, PENGADIL_HEADER.length).clearContent();
  if (!list.length) return;
  const rows = list.map(function (p) {
    return [p.id, p.nama, String(p.password), p.status, toDate_(p.dicipta), toDate_(p.dikemaskini), toDate_(p.loginTerakhir), sukanPengadil_(p.sukan)];
  });
  sheet.getRange(2, 3, rows.length, 1).setNumberFormat('@');
  sheet.getRange(2, 1, rows.length, PENGADIL_HEADER.length).setValues(rows);
  sheet.getRange(2, 5, rows.length, 3).setNumberFormat('dd/MM/yyyy HH:mm:ss');
}

// Semak & bersihkan satu rekod pengadil. Pulangkan { error } atau { data }.
function validatePengadil_(p, existing) {
  const nama = String(p.nama || '').replace(/\s+/g, ' ').trim();
  const password = String(p.password === undefined || p.password === null ? '' : p.password);
  if (nama.length < 2 || nama.length > 30) return { error: 'Nama ringkas mesti 2 hingga 30 aksara.' };
  if (!/^\S{4,20}$/.test(password)) return { error: 'Kata laluan mesti 4 hingga 20 aksara tanpa ruang (' + nama + ').' };
  const dup = existing.some(function (e) { return e.id !== p.id && refNameKey_(e.nama) === refNameKey_(nama); });
  if (dup) return { error: 'Nama "' + nama + '" telah digunakan oleh pengadil lain.' };
  const sukanTxt = String(p.sukan || '').trim().toUpperCase();
  if (sukanTxt && sukanTxt !== 'FUTSAL' && sukanTxt !== 'BADMINTON') return { error: 'Sukan pengadil mesti FUTSAL atau BADMINTON (' + nama + ').' };
  return {
    data: {
      id: String(p.id || '').trim().toUpperCase(),
      nama: nama,
      password: password,
      status: String(p.status || 'AKTIF').toUpperCase() === 'DIGANTUNG' ? 'DIGANTUNG' : 'AKTIF',
      dicipta: p.dicipta || null,
      dikemaskini: p.dikemaskini || null,
      loginTerakhir: p.loginTerakhir || null,
      sukan: sukanPengadil_(sukanTxt)
    }
  };
}

// v1.17.0: sukan akaun pengadil. Kosong / tidak dikenali = FUTSAL (akaun lama).
function sukanPengadil_(v) {
  return String(v || '').trim().toUpperCase() === 'BADMINTON' ? 'BADMINTON' : 'FUTSAL';
}

function labelSukan_(sukan) {
  return sukan === 'BADMINTON' ? 'Badminton' : 'Futsal';
}

// v1.17.0: sesi pengadil untuk kawalan gelanggang FUTSAL (kunci, skor live, rehat, ambil alih).
function sahkanSesiFutsal_(token) {
  const sesi = sahkanSesi_(token);
  if (sesi.ok && sesi.ref.sukan !== 'FUTSAL') {
    return { ok: false, kod: 'SUKAN_LAIN', error: 'Akaun ' + sesi.ref.nama + ' ialah pengadil ' + labelSukan_(sesi.ref.sukan) + '. Hanya pengadil Futsal boleh mengawal gelanggang Futsal.' };
  }
  return sesi;
}

function nextPengadilId_(list) {
  let max = 0;
  list.forEach(function (p) {
    const m = /^REF-(\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'REF-' + String(max + 1).padStart(3, '0');
}

function simpanPengadil_(p) {
  const db = readPengadil_();
  const v = validatePengadil_(p, db.list);
  if (v.error) return { ok: false, error: v.error };
  const now = new Date().toISOString();
  const data = v.data;
  const idx = data.id ? db.list.findIndex(function (e) { return e.id === data.id; }) : -1;
  if (idx >= 0) {
    const old = db.list[idx];
    data.dicipta = old.dicipta || data.dicipta || now;
    data.loginTerakhir = old.loginTerakhir || data.loginTerakhir;
    data.dikemaskini = now;
    db.list[idx] = data;
  } else {
    if (!/^REF-\d+$/.test(data.id) || db.list.some(function (e) { return e.id === data.id; })) data.id = nextPengadilId_(db.list);
    data.dicipta = data.dicipta || now;
    data.dikemaskini = now;
    db.list.push(data);
  }
  writePengadil_(db.sheet, db.list);
  SpreadsheetApp.flush();
  // Sahkan rekod benar-benar wujud dalam tab Senarai_Pengadil
  const semak = readPengadil_().list.find(function (e) { return e.id === data.id; });
  if (!semak || refNameKey_(semak.nama) !== refNameKey_(data.nama) || semak.password !== String(data.password)) {
    return { ok: false, kod: 'GAGAL_TULIS', error: 'Akaun ' + data.nama + ' gagal ditulis ke tab ' + SHEET_PENGADIL + '. Cuba lagi.' };
  }
  kemasKunciPengadil_(data);
  if (data.sukan !== 'FUTSAL') lepasKunciPengadil_(data.id);   // v1.17.0: bukan pengadil Futsal -> lepaskan kunci gelanggang Futsal
  return { ok: true, disahkan: true, sheet: SHEET_PENGADIL, jumlah: db.list.length, pengadil: publicPengadilAdmin_(data) };
}

function padamPengadil_(id) {
  const key = String(id || '').trim().toUpperCase();
  if (!key) return { ok: false, error: 'ID pengadil diperlukan.' };
  const db = readPengadil_();
  const next = db.list.filter(function (e) { return e.id !== key; });
  if (next.length === db.list.length) return { ok: false, error: 'Pengadil ' + key + ' tidak dijumpai.' };
  writePengadil_(db.sheet, next);
  SpreadsheetApp.flush();
  lepasKunciPengadil_(key);
  return { ok: true, dipadam: key };
}

// Gantikan keseluruhan senarai (butang "Hantar ke Sheets" dalam aplikasi)
function syncPengadil_(list) {
  if (!Array.isArray(list)) return { ok: false, error: 'Senarai pengadil tidak sah.' };
  const db = readPengadil_();
  const clean = [];
  const ids = {};
  for (let i = 0; i < list.length; i++) {
    const v = validatePengadil_(list[i] || {}, clean);
    if (v.error) return { ok: false, error: v.error };
    if (!/^REF-\d+$/.test(v.data.id) || ids[v.data.id]) v.data.id = nextPengadilId_(clean.concat(db.list));
    ids[v.data.id] = true;
    v.data.dicipta = v.data.dicipta || new Date().toISOString();
    v.data.dikemaskini = v.data.dikemaskini || new Date().toISOString();
    clean.push(v.data);
  }
  writePengadil_(db.sheet, clean);
  SpreadsheetApp.flush();
  if (readPengadil_().list.length !== clean.length) {
    return { ok: false, kod: 'GAGAL_TULIS', error: 'Senarai pengadil gagal ditulis sepenuhnya ke tab ' + SHEET_PENGADIL + '. Cuba lagi.' };
  }
  // Lepaskan kunci milik pengadil yang dipadam / digantung
  const aktif = {};
  clean.forEach(function (p) { if (p.status === 'AKTIF' && p.sukan === 'FUTSAL') aktif[p.id] = p.nama; });
  const kdb = readKunci_();
  gelanggangSah_().forEach(function (g) {
    const k = kdb.map[g];
    if (k && k.pengadilId && !aktif[k.pengadilId]) kosongKunci_(kdb.sheet, k);
  });
  return { ok: true, jumlah: clean.length, pengadil: clean.map(publicPengadilAdmin_) };
}

function loginPengadil_(body) {
  const nama = String(body.nama || '').replace(/\s+/g, ' ').trim();
  const password = String(body.password === undefined || body.password === null ? '' : body.password);
  if (!nama || !password) return { ok: false, error: 'Sila masukkan nama ringkas dan kata laluan.' };

  const cache = CacheService.getScriptCache();
  const lockKey = 'refgagal_' + refNameKey_(nama).replace(/[^a-z0-9]/g, '_').slice(0, 200);
  const gagal = Number(cache.get(lockKey) || 0);
  if (gagal >= PENGADIL_LOGIN_MAX_GAGAL) {
    return { ok: false, error: 'Terlalu banyak cubaan gagal. Cuba lagi selepas 5 minit.' };
  }

  const db = readPengadil_();
  const ref = db.list.find(function (e) { return refNameKey_(e.nama) === refNameKey_(nama); });
  if (!ref || ref.password !== password) {
    cache.put(lockKey, String(gagal + 1), PENGADIL_LOGIN_KUNCI_SAAT);
    return { ok: false, error: 'Nama ringkas atau kata laluan pengadil tidak sah.' };
  }
  if (ref.status !== 'AKTIF') {
    return { ok: false, error: 'Akaun pengadil ini telah digantung. Hubungi Master Admin.' };
  }
  cache.remove(lockKey);
  // v1.17.0: sukan dipilih semasa log masuk MESTI sama dengan sukan akaun (elak tertukar).
  // Aplikasi lama tidak menghantar sukanPengadil -> dianggap FUTSAL.
  const dipilih = sukanPengadil_(body.sukanPengadil);
  if (ref.sukan !== dipilih) {
    return { ok: false, kod: 'SUKAN_TIDAK_SEPADAN', sukanAkaun: ref.sukan,
      error: 'Akaun ' + ref.nama + ' didaftar sebagai pengadil ' + labelSukan_(ref.sukan).toUpperCase() +
        '. Pilih "' + labelSukan_(ref.sukan) + '" semasa log masuk.' };
  }
  const now = new Date();
  db.sheet.getRange(ref.row, 7).setValue(now).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  // Kata laluan TIDAK dipulangkan kepada peranti pengadil.
  // Token sesi digunakan untuk mengunci gelanggang & menghantar markah (Fasa 2).
  return {
    ok: true,
    token: ciptaSesi_(ref),
    sesiTamat: new Date(now.getTime() + SESI_TEMPOH_JAM * 3600 * 1000).toISOString(),
    pengadil: { id: ref.id, nama: ref.nama, status: ref.status, sukan: ref.sukan, loginTerakhir: now.toISOString() },
    kunci: statusKunci_()
  };
}

// Data penuh untuk Master Admin (termasuk kata laluan)
function publicPengadilAdmin_(p) {
  return {
    id: p.id, nama: p.nama, password: p.password, status: p.status, sukan: sukanPengadil_(p.sukan),
    dicipta: p.dicipta || null, dikemaskini: p.dikemaskini || null, loginTerakhir: p.loginTerakhir || null
  };
}

/* =========================================================
   FASA 2: SESI PENGADIL & KUNCI GELANGGANG (tab Kunci_Gelanggang)
   Aliran: loginPengadil (dapat token) -> pilih gelanggang -> "Sepak Mula"
           (kunciGelanggang) -> skorLive (markah) -> Tamat & Hantar (skorLive lepas:true)
   - Satu gelanggang hanya boleh dikunci oleh SATU pengadil pada satu masa.
   - Satu pengadil hanya memegang SATU gelanggang pada satu masa.
   - Semua tindakan berjalan di bawah LockService (doPost) -> tiada perlumbaan.
   ========================================================= */
function ciptaSesi_(ref) {
  const props = PropertiesService.getScriptProperties();
  bersihSesi_(props);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
  props.setProperty(SESI_PREFIX + token, JSON.stringify({ refId: ref.id, masa: Date.now() }));
  return token;
}

function bersihSesi_(props) {
  const all = props.getProperties();
  const had = Date.now() - SESI_TEMPOH_JAM * 3600 * 1000;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(SESI_PREFIX) !== 0) return;
    let v = null;
    try { v = JSON.parse(all[k]); } catch (err) { v = null; }
    if (!v || !v.masa || v.masa < had) props.deleteProperty(k);
  });
}

function sesiTamat_(msg) {
  return { ok: false, kod: 'SESI_TAMAT', error: msg || 'Sesi pengadil tidak sah atau telah tamat. Sila log masuk semula.' };
}

// Sahkan token sesi -> { ok, ref, token } atau ralat
function sahkanSesi_(token) {
  const t = String(token || '').toLowerCase().replace(/[^a-f0-9]/g, '');
  if (t.length < 32) return sesiTamat_();
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(SESI_PREFIX + t);
  if (!raw) return sesiTamat_();
  let v = null;
  try { v = JSON.parse(raw); } catch (err) { v = null; }
  if (!v || !v.refId || Date.now() - Number(v.masa || 0) > SESI_TEMPOH_JAM * 3600 * 1000) {
    props.deleteProperty(SESI_PREFIX + t);
    return sesiTamat_('Sesi pengadil telah tamat tempoh. Sila log masuk semula.');
  }
  const ref = readPengadil_().list.find(function (e) { return e.id === v.refId; });
  if (!ref) return sesiTamat_('Akaun pengadil ini tidak lagi wujud. Hubungi Master Admin.');
  if (ref.status !== 'AKTIF') return { ok: false, kod: 'DIGANTUNG', error: 'Akaun pengadil ini telah digantung. Hubungi Master Admin.' };
  return { ok: true, ref: ref, token: t };
}

/* =========================================================
   v1.19.0: AKAUN URUSETIA & SUB ADMIN (tab Senarai_Urusetia)
   - Master Admin mendaftar urusetia (NAMA + KATA LALUAN) dan boleh MELANTIK
     urusetia sebagai SUB ADMIN (lajur "Sub Admin" = YA).
   - Urusetia log masuk dengan nama + kata laluan -> token sesi (SESIU_<token>).
   - Sub Admin boleh Sahkan / Tolak keputusan perlawanan (Peti Kelulusan).
   - Kata laluan TIDAK dipulangkan kepada peranti urusetia.
   ========================================================= */
const SHEET_URUSETIA = 'Senarai_Urusetia';
const URUSETIA_HEADER = ['ID Urusetia', 'Nama', 'Kata Laluan', 'Sub Admin', 'Status', 'Dicipta Pada', 'Dikemaskini Pada', 'Log Masuk Terakhir'];
const URUSETIA_ACTIONS = ['loginurusetia', 'semakurusetia', 'logkeluarurusetia', 'senaraiurusetia', 'simpanurusetia', 'padamurusetia'];
const SESIU_PREFIX = 'SESIU_';

function handleUrusetia_(action, body) {
  switch (action) {
    case 'loginurusetia':     return loginUrusetia_(body);
    case 'semakurusetia': {
      const s = sahkanSesiUrusetia_(body.tokenUrusetia);
      return s.ok ? { ok: true, versi: API_VERSI, urusetia: publicUrusetia_(s.u) } : s;
    }
    case 'logkeluarurusetia': {
      const t = String(body.tokenUrusetia || '').toLowerCase().replace(/[^a-f0-9]/g, '');
      if (t) PropertiesService.getScriptProperties().deleteProperty(SESIU_PREFIX + t);
      return { ok: true };
    }
  }
  const cache = CacheService.getScriptCache();
  const gagalAdmin = Number(cache.get('admingagal') || 0);
  if (gagalAdmin >= ADMIN_MAX_GAGAL) {
    return { ok: false, kod: 'DISEKAT', error: 'Terlalu banyak cubaan kunci Master Admin yang salah. Cuba lagi selepas 10 minit.' };
  }
  if (!isMasterAdmin_(body)) {
    if (body && body.adminKey) cache.put('admingagal', String(gagalAdmin + 1), ADMIN_KUNCI_SAAT);
    return { ok: false, kod: 'BUKAN_ADMIN', error: 'Akses ditolak: hanya Master Admin boleh mengurus akaun Urusetia / Sub Admin.' };
  }
  switch (action) {
    case 'senaraiurusetia': return { ok: true, versi: API_VERSI, urusetia: readUrusetia_().list.map(adminUrusetia_) };
    case 'simpanurusetia':  return simpanUrusetia_(body.urusetia || {});
    case 'padamurusetia':   return padamUrusetia_(body.id || (body.urusetia && body.urusetia.id));
  }
  return { ok: false, kod: 'TINDAKAN_TIDAK_DIKENALI', versi: API_VERSI, error: 'Tindakan tidak dikenali: ' + action };
}

function getUrusetiaSheet_() {
  const sheet = getOrCreateSheet_(SHEET_URUSETIA);
  const first = sheet.getRange(1, 1, 1, URUSETIA_HEADER.length).getValues()[0];
  if (first.join('') === '') {
    sheet.getRange(1, 1, 1, URUSETIA_HEADER.length).setValues([URUSETIA_HEADER]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  sheet.getRange(1, 3, sheet.getMaxRows(), 1).setNumberFormat('@');
  return sheet;
}

function yaTidak_(v) {
  const t = String(v === undefined || v === null ? '' : v).trim().toUpperCase();
  return v === true || t === 'YA' || t === 'TRUE' || t === 'Y' || t === '1' || t === 'SUB ADMIN';
}

function readUrusetia_() {
  const sheet = getUrusetiaSheet_();
  const last = sheet.getLastRow();
  const list = [];
  if (last >= 2) {
    sheet.getRange(2, 1, last - 1, URUSETIA_HEADER.length).getValues().forEach(function (r, i) {
      if (!r[0] && !r[1]) return;
      list.push({
        row: i + 2,
        id: String(r[0]).trim().toUpperCase(),
        nama: String(r[1]).replace(/\s+/g, ' ').trim(),
        password: String(r[2]),
        subAdmin: yaTidak_(r[3]),
        status: String(r[4] || 'AKTIF').toUpperCase() === 'DIGANTUNG' ? 'DIGANTUNG' : 'AKTIF',
        dicipta: toIso_(r[5]),
        dikemaskini: toIso_(r[6]),
        loginTerakhir: toIso_(r[7])
      });
    });
  }
  return { sheet: sheet, list: list };
}

function writeUrusetia_(sheet, list) {
  const last = sheet.getLastRow();
  if (last >= 2) sheet.getRange(2, 1, last - 1, URUSETIA_HEADER.length).clearContent();
  if (!list.length) return;
  const rows = list.map(function (u) {
    return [u.id, u.nama, String(u.password), u.subAdmin ? 'YA' : 'TIDAK', u.status,
      toDate_(u.dicipta), toDate_(u.dikemaskini), toDate_(u.loginTerakhir)];
  });
  sheet.getRange(2, 3, rows.length, 1).setNumberFormat('@');
  sheet.getRange(2, 1, rows.length, URUSETIA_HEADER.length).setValues(rows);
  sheet.getRange(2, 6, rows.length, 3).setNumberFormat('dd/MM/yyyy HH:mm:ss');
}

// Maklumat untuk peranti urusetia (tanpa kata laluan)
function publicUrusetia_(u) {
  return { id: u.id, nama: u.nama, subAdmin: !!u.subAdmin, status: u.status, loginTerakhir: u.loginTerakhir || null };
}

// Maklumat untuk Master Admin (dengan kata laluan, untuk paparan / salinan peranti)
function adminUrusetia_(u) {
  const p = publicUrusetia_(u);
  p.password = String(u.password);
  p.dicipta = u.dicipta || null;
  p.dikemaskini = u.dikemaskini || null;
  return p;
}

function nextUrusetiaId_(list) {
  let max = 0;
  list.forEach(function (u) {
    const m = /^URUSETIA-(\d+)$/.exec(u.id);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'URUSETIA-' + String(max + 1).padStart(2, '0');
}

function simpanUrusetia_(p) {
  const db = readUrusetia_();
  const id = String(p.id || '').trim().toUpperCase();
  const idx = id ? db.list.findIndex(function (e) { return e.id === id; }) : -1;
  const old = idx >= 0 ? db.list[idx] : null;
  const nama = String(p.nama === undefined || p.nama === null ? (old ? old.nama : '') : p.nama).replace(/\s+/g, ' ').trim();
  const password = String(p.password === undefined || p.password === null || p.password === '' ? (old ? old.password : '') : p.password);
  if (nama.length < 3 || nama.length > 60) return { ok: false, error: 'Nama urusetia mesti 3 hingga 60 aksara.' };
  if (!/^\S{4,20}$/.test(password)) return { ok: false, error: 'Kata laluan urusetia mesti 4 hingga 20 aksara tanpa ruang.' };
  if (db.list.some(function (e) { return e.id !== id && refNameKey_(e.nama) === refNameKey_(nama); })) {
    return { ok: false, error: 'Nama "' + nama + '" telah digunakan oleh urusetia lain.' };
  }
  const now = new Date().toISOString();
  const data = {
    id: id,
    nama: nama,
    password: password,
    subAdmin: p.subAdmin === undefined ? !!(old && old.subAdmin) : yaTidak_(p.subAdmin),
    status: String(p.status || (old ? old.status : 'AKTIF')).toUpperCase() === 'DIGANTUNG' ? 'DIGANTUNG' : 'AKTIF',
    dicipta: old ? (old.dicipta || now) : (p.dicipta || now),
    dikemaskini: now,
    loginTerakhir: old ? old.loginTerakhir : null
  };
  if (old) db.list[idx] = data;
  else {
    if (!/^URUSETIA-\d+$/.test(data.id) || db.list.some(function (e) { return e.id === data.id; })) data.id = nextUrusetiaId_(db.list);
    db.list.push(data);
  }
  writeUrusetia_(db.sheet, db.list);
  SpreadsheetApp.flush();
  const semak = readUrusetia_().list.find(function (e) { return e.id === data.id; });
  if (!semak || semak.password !== data.password || semak.subAdmin !== data.subAdmin) {
    return { ok: false, kod: 'GAGAL_TULIS', error: 'Akaun ' + data.nama + ' gagal ditulis ke tab ' + SHEET_URUSETIA + '. Cuba lagi.' };
  }
  return { ok: true, disahkan: true, versi: API_VERSI, sheet: SHEET_URUSETIA, urusetia: adminUrusetia_(data) };
}

function padamUrusetia_(id) {
  const key = String(id || '').trim().toUpperCase();
  if (!key) return { ok: false, error: 'ID urusetia diperlukan.' };
  const db = readUrusetia_();
  const next = db.list.filter(function (e) { return e.id !== key; });
  if (next.length === db.list.length) return { ok: false, error: 'Urusetia ' + key + ' tidak dijumpai.' };
  writeUrusetia_(db.sheet, next);
  SpreadsheetApp.flush();
  return { ok: true, dipadam: key };
}

function loginUrusetia_(body) {
  const nama = String(body.nama || '').replace(/\s+/g, ' ').trim();
  const password = String(body.password === undefined || body.password === null ? '' : body.password);
  if (!nama || !password) return { ok: false, kod: 'TIADA_MAKLUMAT', error: 'Sila masukkan nama dan kata laluan urusetia.' };
  const cache = CacheService.getScriptCache();
  const lockKey = 'usgagal_' + refNameKey_(nama).replace(/[^a-z0-9]/g, '_').slice(0, 200);
  const gagal = Number(cache.get(lockKey) || 0);
  if (gagal >= PENGADIL_LOGIN_MAX_GAGAL) return { ok: false, kod: 'DISEKAT', error: 'Terlalu banyak cubaan gagal. Cuba lagi selepas 5 minit.' };
  const db = readUrusetia_();
  const u = db.list.find(function (e) { return refNameKey_(e.nama) === refNameKey_(nama); });
  if (!u || u.password !== password) {
    cache.put(lockKey, String(gagal + 1), PENGADIL_LOGIN_KUNCI_SAAT);
    return { ok: false, kod: 'SALAH', error: 'Nama atau kata laluan urusetia tidak sah.' };
  }
  if (u.status !== 'AKTIF') return { ok: false, kod: 'DIGANTUNG', error: 'Akaun urusetia ini telah digantung. Hubungi Master Admin.' };
  cache.remove(lockKey);
  db.sheet.getRange(u.row, 8).setValue(new Date()).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  const props = PropertiesService.getScriptProperties();
  bersihSesiUrusetia_(props);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
  props.setProperty(SESIU_PREFIX + token, JSON.stringify({ id: u.id, masa: Date.now() }));
  return { ok: true, versi: API_VERSI, urusetia: publicUrusetia_(u), tokenUrusetia: token };
}

function bersihSesiUrusetia_(props) {
  const all = props.getProperties();
  const had = Date.now() - SESI_TEMPOH_JAM * 3600 * 1000;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(SESIU_PREFIX) !== 0) return;
    let v = null;
    try { v = JSON.parse(all[k]); } catch (err) { v = null; }
    if (!v || !v.masa || v.masa < had) props.deleteProperty(k);
  });
}

function sahkanSesiUrusetia_(token) {
  const t = String(token || '').toLowerCase().replace(/[^a-f0-9]/g, '');
  const tamat = { ok: false, kod: 'SESI_TAMAT', error: 'Sesi urusetia tidak sah atau telah tamat. Sila log masuk semula dengan nama & kata laluan.' };
  if (t.length < 32) return tamat;
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(SESIU_PREFIX + t);
  if (!raw) return tamat;
  let v = null;
  try { v = JSON.parse(raw); } catch (err) { v = null; }
  if (!v || !v.id || Date.now() - Number(v.masa || 0) > SESI_TEMPOH_JAM * 3600 * 1000) {
    props.deleteProperty(SESIU_PREFIX + t);
    return tamat;
  }
  const u = readUrusetia_().list.find(function (e) { return e.id === v.id; });
  if (!u) return { ok: false, kod: 'SESI_TAMAT', error: 'Akaun urusetia ini tidak lagi wujud. Hubungi Master Admin.' };
  if (u.status !== 'AKTIF') return { ok: false, kod: 'DIGANTUNG', error: 'Akaun urusetia ini telah digantung. Hubungi Master Admin.' };
  return { ok: true, u: u, token: t };
}

// Sub Admin yang sah (urusetia AKTIF + dilantik Sub Admin)
function sesiSubAdmin_(token) {
  if (!token) return { ok: false, kod: 'BUKAN_SUB_ADMIN', error: 'Hanya Master Admin atau Sub Admin boleh mengesahkan keputusan perlawanan.' };
  const s = sahkanSesiUrusetia_(token);
  if (!s.ok) return s;
  if (!s.u.subAdmin) return { ok: false, kod: 'BUKAN_SUB_ADMIN', error: s.u.nama + ' belum dilantik sebagai Sub Admin. Hanya Master Admin atau Sub Admin boleh mengesahkan keputusan.' };
  return s;
}

/* ---------- v1.9.9: SENARAI GELANGGANG DINAMIK ---------- */
let gelanggangCache_ = null;   // cache satu pelaksanaan sahaja
// v1.23.0: true -> SEMUA gelanggang (Futsal & Badminton) dibuka kepada Sekolah Rendah & Menengah
// v1.24.0: false -> kategori setiap gelanggang ikut pilihan Master Admin (SEMUA / SR / SM)
const SEMUA_GELANGGANG_TERBUKA = false;
// v1.23.0: true -> gelanggang kosong diisi automatik dengan baki perlawanan daripada gelanggang lain
const AUTO_ISI_GELANGGANG = true;

function bersihSenaraiGelanggang_(list) {
  const out = [];
  const ada = {};
  (Array.isArray(list) ? list : []).forEach(function (g) {
    if (!g) return;
    const id = String(g.id || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{1,3}$/.test(id) || ada[id]) return;
    const kat = String(g.kategori || '').trim().toUpperCase();
    if (kat !== 'SR' && kat !== 'SM' && kat !== 'SEMUA') return;   // v1.10.0: SEMUA = terbuka
    ada[id] = true;
    out.push({
      id: id,
      nama: String(g.nama || ('Gelanggang ' + id)).replace(/\s+/g, ' ').trim().slice(0, 40) || ('Gelanggang ' + id),
      kategori: SEMUA_GELANGGANG_TERBUKA ? 'SEMUA' : kat,   // v1.23.0: semua gelanggang terbuka SR + SM
      aktif: !(g.aktif === false || g.aktif === 'false')
    });
  });
  return out.slice(0, GELANGGANG_MAX);
}

// v1.10.0: urutan giliran hasil Jana Susunan { 'SM-12': 0, 'SR-03': 1, ... }
function bersihSusunan_(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  Object.keys(obj).slice(0, 200).forEach(function (k) {
    const id = normMatchId_(k);
    const n = Number(obj[k]);
    if (id && isFinite(n) && n >= 0) out[id] = Math.floor(n);
  });
  return out;
}

// v1.10.0: Separuh Akhir / Tempat 3/4 / Akhir dikunci ke gelanggang { 'SM-30': 'A' }
function bersihKunciAcara_(obj, senarai) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  const sah = {};
  (senarai || []).forEach(function (g) { sah[g.id] = true; });
  Object.keys(obj).slice(0, 60).forEach(function (k) {
    const id = normMatchId_(k);
    const g = String(obj[k] || '').trim().toUpperCase();
    if (id && sah[g]) out[id] = g;
  });
  return out;
}

// Gelanggang menerima kategori perlawanan? (SEMUA = terbuka kepada semua kategori)
function gelanggangTerima_(g, kat) {
  return !!g && (g.kategori === 'SEMUA' || g.kategori === kat);
}

function bacaGelanggang_() {
  if (gelanggangCache_) return gelanggangCache_;
  let v = null;
  try { v = JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP_GELANGGANG) || 'null'); } catch (err) { v = null; }
  const senarai = v ? bersihSenaraiGelanggang_(v.senarai) : [];
  gelanggangCache_ = senarai.length
    ? { versi: Number(v.versi) || 0, senarai: senarai, dikemaskini: v.dikemaskini || null,
        susunan: bersihSusunan_(v.susunan), kunciAcara: bersihKunciAcara_(v.kunciAcara, senarai) }
    : { versi: 0, senarai: JSON.parse(JSON.stringify(GELANGGANG_LALAI)), dikemaskini: null, susunan: {}, kunciAcara: {} };
  return gelanggangCache_;
}

// Semua gelanggang (aktif & ditutup) - untuk kunci, keputusan lewat & rekod lama
function gelanggangSah_() {
  return bacaGelanggang_().senarai.map(function (g) { return g.id; });
}

// Gelanggang AKTIF sahaja - untuk papan live & Sepak Mula
function gelanggangAktif_() {
  return bacaGelanggang_().senarai.filter(function (g) { return g.aktif; }).map(function (g) { return g.id; });
}

function isGelanggangAktif_(g) {
  return gelanggangAktif_().indexOf(String(g || '').toUpperCase()) >= 0;
}

// Master Admin: simpan senarai gelanggang & pindahkan baki perlawanan ke gelanggang aktif
function urusGelanggang_(body) {
  const semasa = bacaGelanggang_();
  const senarai = bersihSenaraiGelanggang_(body.senarai);
  if (!senarai.length) return { ok: false, error: 'Senarai gelanggang kosong / tidak sah.', senaraiGelanggang: semasa };
  const versi = Number(body.versi) || Date.now();
  if (semasa.versi && versi < semasa.versi) {
    return { ok: false, kod: 'LAPUK', error: 'Senarai gelanggang telah dikemas kini oleh peranti lain. Senarai terkini dimuatkan.',
      senaraiGelanggang: semasa };
  }
  // Setiap kategori mesti ada sekurang-kurangnya satu gelanggang aktif
  const katTanpa = ['SR', 'SM'].filter(function (k) {
    return !senarai.some(function (g) { return g.aktif && gelanggangTerima_(g, k); });
  });
  if (katTanpa.length) {
    return { ok: false, error: 'Mesti ada sekurang-kurangnya satu gelanggang AKTIF untuk ' + katTanpa.join(' & ') + '.', senaraiGelanggang: semasa };
  }
  const aktifBaru = {};
  senarai.forEach(function (g) { if (g.aktif) aktifBaru[g.id] = g; });
  const lamaAktif = {};
  semasa.senarai.forEach(function (g) { if (g.aktif) lamaAktif[g.id] = true; });
  const ditutup = Object.keys(lamaAktif).filter(function (id) { return !aktifBaru[id]; });

  // Gelanggang yang sedang digunakan tidak boleh ditutup
  const table = readTable_(getJadualSheet_());
  if (ditutup.length) {
    const db = readKunci_();
    for (let i = 0; i < ditutup.length; i++) {
      const g = ditutup[i];
      const k = db.map[g];
      if (k && (k.pengadilId || k.rehat)) {
        return { ok: false, kod: 'SEDANG_DIGUNAKAN', error: 'Gelanggang ' + g + ' sedang dikunci pengadil' +
          (k.nama ? ' (' + k.nama + ')' : '') + (k.rehat ? ' / Rehat Kecemasan' : '') + '. Lepaskan kunci dahulu.', senaraiGelanggang: semasa };
      }
      const live = table.rows.filter(function (r) {
        return normId_(r.data.gelanggang) === g && statusBaris_(r.data) === 'LIVE';
      })[0];
      if (live) {
        return { ok: false, kod: 'SEDANG_DIGUNAKAN', error: 'Gelanggang ' + g + ' masih ada perlawanan LIVE (' + live.data.id + '). Tamatkan / tangguh dahulu.',
          senaraiGelanggang: semasa };
      }
    }
  }

  // Simpan senarai baharu
  const simpan = { versi: versi, senarai: senarai, dikemaskini: new Date().toISOString(),
    susunan: bersihSusunan_(body.susunan), kunciAcara: bersihKunciAcara_(body.kunciAcara, senarai) };
  PropertiesService.getScriptProperties().setProperty(PROP_GELANGGANG, JSON.stringify(simpan));
  gelanggangCache_ = simpan;
  try { getKunciSheet_(); } catch (err) { console.warn('getKunciSheet_', err); }

  // Pindahan baki perlawanan (dikira oleh aplikasi Master Admin) - MENUNGGU GILIRAN sahaja
  const byId = {};
  table.rows.forEach(function (r) { byId[String(r.data.id).toUpperCase()] = r.data; });
  const kemas = [];
  const diambil = {};
  (Array.isArray(body.matches) ? body.matches : []).forEach(function (x) {
    const id = normMatchId_(x && x.id);
    const g = String(x && x.gelanggang || '').trim().toUpperCase();
    const d = id ? byId[id] : null;
    if (!d || diambil[id] || !aktifBaru[g]) return;
    if (statusBaris_(d) !== 'MENUNGGU GILIRAN') return;
    if (!gelanggangTerima_(aktifBaru[g], String(d.kategori || id.slice(0, 2)).toUpperCase())) return;
    diambil[id] = true;
    if (normId_(d.gelanggang) !== g) kemas.push({ id: id, gelanggang: g });
  });
  // Jaring keselamatan: baki perlawanan yang masih di gelanggang ditutup -> gelanggang aktif pertama
  table.rows.forEach(function (r) {
    const d = r.data;
    const id = String(d.id || '').toUpperCase();
    if (diambil[id] || statusBaris_(d) !== 'MENUNGGU GILIRAN') return;
    const g = normId_(d.gelanggang);
    if (aktifBaru[g]) return;
    const kat = String(d.kategori || id.slice(0, 2)).toUpperCase();
    const ganti = senarai.filter(function (x) { return x.aktif && gelanggangTerima_(x, kat); })[0];
    if (ganti) kemas.push({ id: id, gelanggang: ganti.id });
  });
  if (kemas.length) upsertMatches_(kemas, { admin: true });
  try { bustPapanCache_(); } catch (err) { console.warn('bustPapanCache_', err); }   // v1.10.0: giliran baharu terus kelihatan

  return { ok: true, senaraiGelanggang: simpan, dipindah: kemas.length, ditutup: ditutup, masa: new Date().toISOString() };
}

/* =========================================================
   v1.20.0: URUS GELANGGANG BADMINTON (MASTER ADMIN SAHAJA)
   - Senarai gelanggang Badminton { id, nama, kategori: SR | SM | SEMUA, aktif } disimpan
     dalam Script Properties (SENARAI_GELANGGANG_BM), berasingan daripada Futsal.
   - 'susunan'   : { matchId: urutan } hasil Jana Susunan (giliran setiap gelanggang).
   - 'kunciAcara': { matchId: gelanggang } Suku Akhir / Separuh Akhir / Tempat 3/4 / Akhir.
   - Pindahan perlawanan dikira oleh aplikasi Master Admin; pelayan hanya menulis
     perlawanan yang BELUM BERMULA ke gelanggang AKTIF yang menerima kategorinya.
   ========================================================= */
const PROP_GELANGGANG_BM = 'SENARAI_GELANGGANG_BM';
let gelanggangBmCache_ = null;

function normBmMatchId_(id) {
  const v = String(id || '').trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{0,59}$/.test(v) ? v : '';
}

function bersihSusunanBm_(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  Object.keys(obj).slice(0, 300).forEach(function (k) {
    const id = normBmMatchId_(k);
    const n = Number(obj[k]);
    if (id && isFinite(n) && n >= 0) out[id] = Math.floor(n);
  });
  return out;
}

function bersihKunciAcaraBm_(obj, senarai) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  const sah = {};
  (senarai || []).forEach(function (g) { sah[g.id] = true; });
  Object.keys(obj).slice(0, 100).forEach(function (k) {
    const id = normBmMatchId_(k);
    const g = String(obj[k] || '').trim().toUpperCase();
    if (id && sah[g]) out[id] = g;
  });
  return out;
}

function bacaGelanggangBm_() {
  if (gelanggangBmCache_) return gelanggangBmCache_;
  let v = null;
  try { v = JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP_GELANGGANG_BM) || 'null'); } catch (err) { v = null; }
  const senarai = v ? bersihSenaraiGelanggang_(v.senarai) : [];
  // versi 0 + senarai kosong -> aplikasi membina senarai lalai daripada lajur Gelanggang jadual
  gelanggangBmCache_ = senarai.length
    ? { versi: Number(v.versi) || 0, senarai: senarai, dikemaskini: v.dikemaskini || null,
        susunan: bersihSusunanBm_(v.susunan), kunciAcara: bersihKunciAcaraBm_(v.kunciAcara, senarai) }
    : { versi: 0, senarai: [], dikemaskini: null, susunan: {}, kunciAcara: {} };
  return gelanggangBmCache_;
}

// Kategori perlawanan Badminton (SR / SM) daripada lajur Kategori atau ID (cth. BSR-01)
function katBm_(d) {
  const k = String((d && d.kategori) || '').trim().toUpperCase();
  if (k === 'SR' || k === 'SM') return k;
  if (k.indexOf('RENDAH') >= 0) return 'SR';
  if (k.indexOf('MENENGAH') >= 0) return 'SM';
  const m = /S[RM]/.exec(String((d && d.id) || '').toUpperCase());
  return m ? m[0] : '';
}

function bmBelumMula_(d) {
  const st = statusBaris_(d);
  return (st === 'MENUNGGU GILIRAN' || st === '') && String(d.pengesahan || '').toUpperCase() !== 'DISAHKAN';
}

function bmSedangGuna_(d) {
  const st = statusBaris_(d);
  if (bmBelumMula_(d) || st === 'SELESAI' || st.indexOf('TANGGUH') >= 0) return false;
  return String(d.pengesahan || '').toUpperCase() !== 'DISAHKAN';
}

function urusGelanggangBm_(body) {
  const semasa = bacaGelanggangBm_();
  const senarai = bersihSenaraiGelanggang_(body.senarai);
  if (!senarai.length) return { ok: false, versi: API_VERSI, error: 'Senarai gelanggang Badminton kosong / tidak sah.', senaraiGelanggang: semasa };
  const versi = Number(body.versi) || Date.now();
  if (semasa.versi && versi < semasa.versi) {
    return { ok: false, kod: 'LAPUK', versi: API_VERSI, error: 'Senarai gelanggang Badminton telah dikemas kini oleh peranti lain. Senarai terkini dimuatkan.',
      senaraiGelanggang: semasa };
  }
  const katTanpa = ['SR', 'SM'].filter(function (k) {
    return !senarai.some(function (g) { return g.aktif && gelanggangTerima_(g, k); });
  });
  if (katTanpa.length) {
    return { ok: false, versi: API_VERSI, error: 'Mesti ada sekurang-kurangnya satu gelanggang Badminton AKTIF untuk ' + katTanpa.join(' & ') + '.', senaraiGelanggang: semasa };
  }
  const aktifBaru = {};
  senarai.forEach(function (g) { if (g.aktif) aktifBaru[g.id] = g; });

  const sheet = getJadualSheet_('BADMINTON');
  const table = readTable_(sheet);
  const colG = table.colOf.gelanggang;
  if (colG === undefined) return { ok: false, versi: API_VERSI, error: 'Lajur Gelanggang tiada dalam tab ' + SHEET_BM_JADUAL + '.', senaraiGelanggang: semasa };

  // Gelanggang yang sedang digunakan (perlawanan berlangsung / menunggu pengesahan) tidak boleh ditutup
  for (let i = 0; i < table.rows.length; i++) {
    const d = table.rows[i].data;
    const g = normId_(d.gelanggang);
    if (g && !aktifBaru[g] && bmSedangGuna_(d)) {
      return { ok: false, kod: 'SEDANG_DIGUNAKAN', versi: API_VERSI,
        error: 'Gelanggang Badminton ' + g + ' masih digunakan (' + d.id + ' · ' + (statusBaris_(d) || 'berlangsung') + '). Tamatkan / sahkan perlawanan itu dahulu.',
        senaraiGelanggang: semasa };
    }
  }

  const simpan = { versi: versi, senarai: senarai, dikemaskini: new Date().toISOString(),
    susunan: bersihSusunanBm_(body.susunan), kunciAcara: bersihKunciAcaraBm_(body.kunciAcara, senarai) };
  PropertiesService.getScriptProperties().setProperty(PROP_GELANGGANG_BM, JSON.stringify(simpan));
  gelanggangBmCache_ = simpan;

  // Pindahan baki perlawanan (dikira oleh aplikasi Master Admin) - BELUM BERMULA sahaja
  const byId = {};
  table.rows.forEach(function (r) { byId[String(r.data.id).toUpperCase()] = r; });
  const baru = {};    // rowIndex -> gelanggang baharu
  const diambil = {};
  (Array.isArray(body.matches) ? body.matches : []).slice(0, 400).forEach(function (x) {
    const id = normBmMatchId_(x && x.id);
    const g = String(x && x.gelanggang || '').trim().toUpperCase();
    const r = id ? byId[id] : null;
    if (!r || diambil[id] || !aktifBaru[g]) return;
    if (!bmBelumMula_(r.data)) return;
    if (!gelanggangTerima_(aktifBaru[g], katBm_(r.data))) return;
    diambil[id] = true;
    if (normId_(r.data.gelanggang) !== g) baru[r.rowIndex] = g;
  });
  // Jaring keselamatan: baki perlawanan di gelanggang ditutup / tidak menerima kategorinya -> gelanggang aktif paling ringan
  const beban = {};
  table.rows.forEach(function (r) {
    if (!bmBelumMula_(r.data)) return;
    const g = baru[r.rowIndex] || normId_(r.data.gelanggang);
    beban[g] = (beban[g] || 0) + 1;
  });
  table.rows.forEach(function (r) {
    const d = r.data;
    const id = String(d.id || '').toUpperCase();
    if (diambil[id] || !bmBelumMula_(d)) return;
    const g = normId_(d.gelanggang);
    const kat = katBm_(d);
    if (aktifBaru[g] && (!kat || gelanggangTerima_(aktifBaru[g], kat))) return;
    const calon = senarai.filter(function (x) { return x.aktif && (!kat || gelanggangTerima_(x, kat)); });
    if (!calon.length) return;
    calon.sort(function (a, b) { return (beban[a.id] || 0) - (beban[b.id] || 0); });
    baru[r.rowIndex] = calon[0].id;
    beban[calon[0].id] = (beban[calon[0].id] || 0) + 1;
    if (g) beban[g] = Math.max(0, (beban[g] || 0) - 1);
  });

  const idx = Object.keys(baru);
  if (idx.length) {
    const n = table.values.length - 1;
    const lajur = [];
    for (let r = 1; r <= n; r++) lajur.push([baru[r] !== undefined ? baru[r] : table.values[r][colG]]);
    sheet.getRange(2, colG + 1, n, 1).setValues(lajur);
    const colK = table.colOf.kemaskini;
    if (colK !== undefined) {
      const now = new Date();
      idx.forEach(function (r) { sheet.getRange(Number(r) + 1, colK + 1).setValue(now); });
    }
  }
  SpreadsheetApp.flush();
  try { CacheService.getScriptCache().remove(BM_CACHE_KEY); } catch (err) { /* abaikan */ }
  return { ok: true, versi: API_VERSI, sukan: 'BADMINTON', senaraiGelanggang: simpan, dipindah: idx.length, masa: new Date().toISOString() };
}

/* =========================================================
   v1.23.0: AUTO-ISI GELANGGANG KOSONG (SEMUA GELANGGANG TERBUKA SR + SM)
   Gelanggang AKTIF dikira KOSONG bila: tiada perlawanan LIVE, tiada pengadil memegang
   kunci / Rehat Kecemasan, dan tiada baki perlawanan SEDIA dimainkan (kedua-dua pasukan
   sudah ditentukan). Gelanggang kosong mengambil perlawanan seterusnya daripada gelanggang
   lain (ikut urutan Jana Susunan, kemudian No. perlawanan) dengan syarat:
     - kedua-dua pasukan sudah ditentukan (bukan "Johan Kumpulan A" / "Menang Perlawanan 5");
     - pasukan tidak sedang bermain / sedang dipanggil di gelanggang lain;
     - perlawanan tidak dikunci (Separuh Akhir / Akhir) ke gelanggang aktif lain;
     - perlawanan seterusnya bagi gelanggang yang sedang menunggu Sepak Mula tidak diambil.
   Hanya lajur Gelanggang ditukar. Skor / status / pengesahan tidak disentuh.
   ========================================================= */
const AUTO_ISI_TINDAKAN_FUTSAL = ['', 'syncall', 'updatematch', 'updatematches', 'lepasgelanggang', 'urusgelanggang',
  'pembetulanskor', 'tangguhadmin', 'simpanjadual', 'simpanskorsukan'];
const AUTO_ISI_TINDAKAN_BM = ['', 'syncall', 'updatematch', 'updatematches', 'urusgelanggangbadminton', 'simpanjadual',
  'simpanskorsukan', 'skorpengadilbadminton'];

// v1.23.4: ditanda oleh skorPengadilBadminton_ bila perlawanan bertukar BELUM BERMULA -> LIVE (satu pelaksanaan sahaja)
let BM_BARU_MULA_ = false;

function autoIsiSelepasPost_(body, ctx) {
  if (!AUTO_ISI_GELANGGANG || !body) return 0;
  const action = String(body.action || '').toLowerCase();
  const sukan = jenisSukan_(body.sukan);
  if (sukan === 'BADMINTON') {
    if (AUTO_ISI_TINDAKAN_BM.indexOf(action) < 0) return 0;
    // Autosimpan skor (SEMASA) tidak membebaskan gelanggang -> abaikan (kekal pantas)
    // v1.23.4: kecuali skor PERTAMA (perlawanan baru bermula) -> gelanggang kosong boleh terus ambil giliran seterusnya
    if (action === 'skorpengadilbadminton' && String(body.jenis || '').toUpperCase() !== 'TAMAT' && !BM_BARU_MULA_) return 0;
    const nBm = isiGelanggangKosongBm_();
    if (nBm) ctx.tandaSukan = 'BADMINTON';
    return nBm;
  }
  if (action === 'skorlive') {
    // Gol biasa tidak membebaskan gelanggang -> abaikan (kekal pantas)
    const akhir = cleanValue_('status', String(body.status || '')) === 'TAMAT - TUNGGU SAH';
    const lepas = body.lepas === true || body.lepas === 'true' || body.tangguh === true || body.tangguh === 'true';
    if (!akhir && !lepas) return 0;
  } else if (AUTO_ISI_TINDAKAN_FUTSAL.indexOf(action) < 0) {
    return 0;
  }
  const n = isiGelanggangKosongFutsal_();
  if (n) { ctx.ubahPapan = true; ctx.tandaSukan = 'FUTSAL'; }
  return n;
}

// Kedua-dua pasukan sudah ditentukan?
function sediaMain_(d) {
  if (!d) return false;
  const a = String(d.namaP1 || '').trim(), b = String(d.namaP2 || '').trim();
  return !!a && !!b && !isNamaPlaceholder_(a) && !isNamaPlaceholder_(b);
}

// Kunci pasukan (kod ikut kategori + nama sebenar) - elak pasukan sama bermain serentak
function kunciPasukanAuto_(d, kat) {
  const out = [];
  ['kodP1', 'kodP2'].forEach(function (f) {
    const v = String(d[f] || '').trim().toUpperCase();
    if (v) out.push('K|' + kat + '|' + v);
  });
  ['namaP1', 'namaP2'].forEach(function (f) {
    const v = String(d[f] || '').trim();
    if (v && !isNamaPlaceholder_(v)) out.push('N|' + v.toUpperCase());
  });
  return out;
}

// v1.23.8: REHAT PASUKAN - pasukan yang tamat bermain kurang daripada tempoh ini (atau masih
// menunggu pengesahan keputusan) TIDAK diambil oleh auto-isi gelanggang kosong (tiada back-to-back).
const AUTO_ISI_REHAT_MINIT = 20;

function baruTamatMain_(d, nowMs) {
  const st = statusBaris_(d);
  if (st.indexOf('TUNGGU SAH') >= 0) return true;
  const iso = toIso_(d && d.masaTamat) || toIso_(d && d.sahPengadilPada);
  const t = iso ? new Date(iso).getTime() : NaN;
  return !isNaN(t) && t <= nowMs + 60000 && (nowMs - t) < AUTO_ISI_REHAT_MINIT * 60000;
}

// Perancang umum (Futsal & Badminton). Pulangkan [{ id, gel, d }]
// o = { courts:[id], rows:[d], gelOf(d), katOf(d), isLive(d), isPending(d), dipegang:{gel:true},
//       pegangId:{matchId:true}, kunciAcara:{matchId:gel}, susunan:{matchId:n} }
function rancangIsiGelanggang_(o) {
  const aktif = {};
  o.courts.forEach(function (g) { aktif[g] = { live: false, pending: [] }; });
  const sibuk = {};
  const tandaSibuk = function (d) { kunciPasukanAuto_(d, o.katOf(d)).forEach(function (k) { sibuk[k] = true; }); };
  const rehat = {};   // v1.23.8: pasukan sedang berehat (baru tamat bermain)
  const nowRehat = Date.now();
  let lain = [];   // baki perlawanan di gelanggang ditutup / tanpa gelanggang
  o.rows.forEach(function (d) {
    const g = o.gelOf(d);
    if (o.isLive(d)) { if (aktif[g]) aktif[g].live = true; tandaSibuk(d); return; }
    if (!o.isPending(d)) {
      if (baruTamatMain_(d, nowRehat)) kunciPasukanAuto_(d, o.katOf(d)).forEach(function (k) { rehat[k] = true; });
      return;
    }
    if (o.pegangId[String(d.id).toUpperCase()]) { tandaSibuk(d); return; }   // dikunci pengadil -> akan bermula
    if (aktif[g]) aktif[g].pending.push(d); else lain.push(d);
  });
  // v1.23.1: KUNCI PENGANJUR - perlawanan berkunci yang berada di gelanggang lain dikembalikan
  // ke gelanggang kuncinya (jika gelanggang itu aktif).
  const ka = o.kunciAcara || {};
  const pindahKunci = [];
  const ikutKunci = function (gSemasa) {
    return function (d) {
      const id = String(d.id).toUpperCase();
      const gk = ka[id];
      if (!gk || gk === gSemasa || !aktif[gk]) return true;
      aktif[gk].pending.push(d);
      pindahKunci.push({ id: id, gel: gk, d: d });
      return false;
    };
  };
  o.courts.forEach(function (g) { aktif[g].pending = aktif[g].pending.filter(ikutKunci(g)); });
  lain = lain.filter(ikutKunci(''));
  const sus = o.susunan || {};
  const cmp = function (a, b) {
    const ia = String(a.id).toUpperCase(), ib = String(b.id).toUpperCase();
    const ra = sus[ia], rb = sus[ib];
    const ada = typeof ra === 'number', adb = typeof rb === 'number';
    if (ada && adb && ra !== rb) return ra - rb;
    if (ada !== adb) return ada ? -1 : 1;
    const na = Number(a.no) || 0, nb = Number(b.no) || 0;
    if (na !== nb) return na - nb;
    const ka = String(o.katOf(a)), kb = String(o.katOf(b));
    if (ka !== kb) return ka.localeCompare(kb);
    return ia.localeCompare(ib);
  };
  const simpanan = {};   // perlawanan seterusnya gelanggang yang menunggu Sepak Mula (tidak diambil)
  const kosong = [];
  o.courts.forEach(function (g) {
    const c = aktif[g];
    c.pending.sort(cmp);
    if (c.live || o.dipegang[g]) return;
    const pertama = c.pending.filter(sediaMain_)[0];
    if (pertama) { simpanan[String(pertama.id).toUpperCase()] = true; tandaSibuk(pertama); return; }
    kosong.push(g);
  });
  if (!kosong.length) return pindahKunci;
  let calon = [];
  o.courts.forEach(function (g) { calon = calon.concat(aktif[g].pending); });
  calon = calon.concat(lain).filter(function (d) {
    const id = String(d.id).toUpperCase();
    return sediaMain_(d) && !simpanan[id];
  }).sort(cmp);
  const pindah = [];
  const diambil = {};
  kosong.forEach(function (g) {
    let nKunci = 0, nBertembung = 0, nRehat = 0, nKat = 0, dapat = false;
    for (let i = 0; i < calon.length; i++) {
      const d = calon[i];
      const id = String(d.id).toUpperCase();
      if (diambil[id]) continue;
      if (o.terima && !o.terima(g, d)) { nKat++; continue; }   // v1.24.0: kategori tidak diterima gelanggang ini
      const kunci = (o.kunciAcara || {})[id];
      if (kunci && kunci !== g && aktif[kunci]) { nKunci++; continue; }   // Separuh Akhir / Akhir dikunci ke gelanggang lain
      const keys = kunciPasukanAuto_(d, o.katOf(d));
      if (keys.some(function (k) { return sibuk[k]; })) { nBertembung++; continue; }
      if (keys.some(function (k) { return rehat[k]; })) { nRehat++; continue; }   // v1.23.8: pasukan perlu rehat
      diambil[id] = true;
      keys.forEach(function (k) { sibuk[k] = true; });
      pindah.push({ id: id, gel: g, d: d });
      dapat = true;
      break;
    }
    // v1.23.4: catat sebab gelanggang kosong tidak diisi (dipaparkan dalam log Executions)
    if (!dapat && Array.isArray(o.catatan)) {
      o.catatan.push('Gelanggang ' + g + ' kosong tetapi tidak diisi: ' + (calon.length
        ? nBertembung + ' perlawanan pasukannya sedang bermain / akan bermain di gelanggang lain' + (nRehat ? ', ' + nRehat + ' pasukannya baru tamat bermain (rehat ' + AUTO_ISI_REHAT_MINIT + ' minit)' : '') + (nKunci ? ', ' + nKunci + ' dikunci penganjur ke gelanggang lain' : '') + (nKat ? ', ' + nKat + ' kategori tidak dibenarkan di gelanggang ini' : '')
        : 'tiada baki perlawanan lain yang kedua-dua pasukannya sudah ditentukan'));
    }
  });
  return pindahKunci.concat(pindah);
}

function isiGelanggangKosongFutsal_() {
  const cfg = bacaGelanggang_();
  const courts = cfg.senarai.filter(function (g) { return g.aktif; }).map(function (g) { return g.id; });
  if (courts.length < 2) return 0;
  const kunci = readKunci_();
  const dipegang = {}, pegangId = {};
  gelanggangSah_().forEach(function (g) {
    const k = kunci.map[g];
    if (k && (k.pengadilId || k.rehat)) { dipegang[g] = true; if (k.matchId) pegangId[String(k.matchId).toUpperCase()] = true; }
  });
  const table = readTable_(getJadualSheet_());
  const nowMs = Date.now();
  const terbiarMs = LIVE_TERBIAR_MINIT * 60 * 1000;
  const pindah = rancangIsiGelanggang_({
    courts: courts,
    rows: table.rows.map(function (r) { return r.data; }),
    gelOf: function (d) { return normId_(d.gelanggang); },
    katOf: function (d) { return String(d.kategori || String(d.id || '').slice(0, 2)).toUpperCase(); },
    isLive: function (d) {
      if (statusBaris_(d) !== 'LIVE') return false;
      if (pegangId[String(d.id).toUpperCase()]) return true;
      const t = masaBarisMs_(d);
      return !t || (nowMs - t) <= terbiarMs;
    },
    isPending: function (d) { return statusBaris_(d) === 'MENUNGGU GILIRAN'; },
    terima: function (g, d) {   // v1.24.0: kategori gelanggang (SEMUA / SR / SM)
      const c = cfg.senarai.filter(function (x) { return x.id === g; })[0];
      return !c || gelanggangTerima_(c, String(d.kategori || String(d.id || '').slice(0, 2)).toUpperCase());
    },
    dipegang: dipegang, pegangId: pegangId,
    kunciAcara: cfg.kunciAcara || {}, susunan: cfg.susunan || {}
  });
  if (!pindah.length) return 0;
  upsertMatches_(pindah.map(function (p) { return { id: p.id, gelanggang: p.gel }; }), { sukan: 'FUTSAL' });
  console.log('Auto-isi gelanggang Futsal: ' + pindah.map(function (p) { return p.id + ' -> ' + p.gel; }).join(', '));
  return pindah.length;
}

function isiGelanggangKosongBm_() {
  const sheet = getJadualSheet_('BADMINTON');
  const table = readTable_(sheet);
  const colG = table.colOf.gelanggang;
  if (colG === undefined) return 0;
  const cfg = bacaGelanggangBm_();
  let courts = cfg.senarai.filter(function (g) { return g.aktif; }).map(function (g) { return g.id; });
  if (!cfg.senarai.length) {
    // Tiada senarai disimpan -> gelanggang yang digunakan dalam jadual
    const ada = {};
    table.rows.forEach(function (r) { const g = normId_(r.data.gelanggang); if (g) ada[g] = true; });
    courts = Object.keys(ada).sort(function (a, b) { return String(a).localeCompare(String(b), 'ms', { numeric: true }); });
  }
  if (courts.length < 2) return 0;
  // v1.23.2: giliran Badminton ikut No. Perlawanan Keseluruhan (P1, P2, P3 ...) seperti Jadual Badminton
  const colP = (table.values[0] || []).map(normalizeKey_).findIndex(function (k) {
    return k === 'noperkeseluruhan' || (k.indexOf('no') === 0 && k.indexOf('keseluruhan') >= 0);
  });
  const turutanP = {};
  if (colP >= 0) {
    table.rows.forEach(function (r) {
      const m = /^P(\d+)$/i.exec(String(table.values[r.rowIndex][colP] || '').trim());
      if (m) turutanP[String(r.data.id).toUpperCase()] = Number(m[1]);
    });
  }
  const adaP = Object.keys(turutanP).length > 0;
  const catatan = [];
  const pindah = rancangIsiGelanggang_({
    courts: courts,
    rows: table.rows.map(function (r) { return r.data; }),
    gelOf: function (d) { return normId_(d.gelanggang); },
    katOf: function (d) { return katBm_(d); },
    isLive: function (d) { return statusBaris_(d) === 'LIVE' && String(d.pengesahan || '').toUpperCase() !== 'DISAHKAN'; },
    isPending: function (d) { return bmBelumMula_(d); },
    terima: function (g, d) {   // v1.24.0: kategori gelanggang Badminton (SEMUA / SR / SM)
      const c = cfg.senarai.filter(function (x) { return x.id === g; })[0];
      const k = katBm_(d);
      return !c || !k || gelanggangTerima_(c, k);
    },
    dipegang: {}, pegangId: {},
    kunciAcara: cfg.kunciAcara || {}, susunan: adaP ? turutanP : (cfg.susunan || {}),
    catatan: catatan
  });
  if (catatan.length) console.log('Auto-isi Badminton: ' + catatan.join(' | '));
  if (!pindah.length) return 0;
  const rowOf = {};
  table.rows.forEach(function (r) { rowOf[String(r.data.id).toUpperCase()] = r.rowIndex; });
  const colK = table.colOf.kemaskini;
  const now = new Date();
  pindah.forEach(function (p) {
    const r = rowOf[p.id];
    if (r === undefined) return;
    sheet.getRange(r + 1, colG + 1).setValue(p.gel);
    if (colK !== undefined) sheet.getRange(r + 1, colK + 1).setValue(now);
  });
  SpreadsheetApp.flush();
  try { CacheService.getScriptCache().remove(BM_CACHE_KEY); } catch (err) { /* abaikan */ }
  console.log('Auto-isi gelanggang Badminton: ' + pindah.map(function (p) { return p.id + ' -> ' + p.gel; }).join(', '));
  return pindah.length;
}

// v1.23.4: jalankan manual dari editor Apps Script - isi gelanggang Badminton yang kosong serta-merta.
// Lihat log (Execution log) untuk perlawanan yang dipindahkan atau sebab gelanggang tidak diisi.
function semakAutoIsiBadminton() {
  const giliran = dapatKunciGiliran_(30000);
  if (!giliran) throw new Error('Pelayan sibuk. Cuba lagi sebentar.');
  try {
    const n = isiGelanggangKosongBm_();
    console.log(n ? n + ' perlawanan Badminton dipindahkan ke gelanggang kosong.' : 'Tiada perlawanan Badminton dipindahkan.');
    if (n) { try { tandaPerubahan_('BADMINTON'); } catch (err) { /* abaikan */ } }
    return n;
  } finally { try { giliran.lock.releaseLock(); } catch (err) { /* abaikan */ } }
}

function normId_(v) {
  return String(v || '').trim().toUpperCase();
}

function normGelanggang_(g) {
  const v = String(g || '').trim().toUpperCase();
  return gelanggangSah_().indexOf(v) >= 0 ? v : '';
}

function normMatchId_(id) {
  const v = String(id || '').trim().toUpperCase();
  return /^(SR|SM)-\d{1,2}$/.test(v) ? v : '';
}

function getKunciSheet_() {
  const sheet = getOrCreateSheet_(SHEET_KUNCI);
  const first = sheet.getRange(1, 1, 1, KUNCI_HEADER.length).getValues()[0];
  let baharu = false;
  if (first.join('') === '') {
    sheet.getRange(1, 1, 1, KUNCI_HEADER.length).setValues([KUNCI_HEADER]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    baharu = true;
  } else if (first.slice(6).join('') === '') {
    // FASA 5: tab lama (6 lajur) -> tambah tajuk Status Kunci & Data Rehat
    sheet.getRange(1, 7, 1, KUNCI_HEADER.length - 6).setValues([KUNCI_HEADER.slice(6)]).setFontWeight('bold');
    baharu = true;
  }
  // Data Rehat (JSON) sebagai teks biasa. v1.9.2: hanya semasa tab disediakan
  // (tulisKunci_ juga menetapkan format setiap baris) - bacaan papan live tidak lagi menulis.
  if (baharu) sheet.getRange(1, 8, sheet.getMaxRows(), 1).setNumberFormat('@');
  const last = sheet.getLastRow();
  const ada = last >= 2
    ? sheet.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim().toUpperCase(); })
    : [];
  const tambah = gelanggangSah_()
    .filter(function (g) { return ada.indexOf(g) < 0; })
    .map(function (g) { return [g, '', '', '', '', '', '', '']; });
  if (tambah.length) {
    sheet.getRange(Math.max(last, 1) + 1, 1, tambah.length, KUNCI_HEADER.length).setValues(tambah);
    sheet.getRange(1, 8, sheet.getMaxRows(), 1).setNumberFormat('@');
  }
  return sheet;
}

function readKunci_() {
  const sheet = getKunciSheet_();
  const last = sheet.getLastRow();
  const map = {};
  if (last >= 2) {
    sheet.getRange(2, 1, last - 1, KUNCI_HEADER.length).getValues().forEach(function (r, i) {
      const g = String(r[0]).trim().toUpperCase();
      if (gelanggangSah_().indexOf(g) < 0 || map[g]) return;
      map[g] = {
        row: i + 2,
        gelanggang: g,
        pengadilId: String(r[1] || '').trim(),
        nama: String(r[2] || '').trim(),
        matchId: String(r[3] || '').trim().toUpperCase(),
        dikunciPada: toIso_(r[4]),
        aktiviti: toIso_(r[5]),
        rehat: bacaRehat_(r[6], r[7], String(r[3] || '').trim().toUpperCase())   // FASA 5
      };
    });
  }
  return { sheet: sheet, map: map };
}

function tulisKunci_(sheet, k) {
  sheet.getRange(k.row, 8, 1, 1).setNumberFormat('@');
  sheet.getRange(k.row, 1, 1, KUNCI_HEADER.length).setValues([[
    k.gelanggang, k.pengadilId || '', k.nama || '', k.matchId || '', toDate_(k.dikunciPada), toDate_(k.aktiviti),
    k.rehat ? KUNCI_STATUS_REHAT : (k.pengadilId ? 'AKTIF' : ''),
    k.rehat ? JSON.stringify(k.rehat) : ''
  ]]);
  sheet.getRange(k.row, 5, 1, 2).setNumberFormat('dd/MM/yyyy HH:mm:ss');
}

// Lepaskan kunci pengadil.
// FASA 5: jika gelanggang dalam REHAT KECEMASAN, status rehat & ID Match DIKEKALKAN
// (markah kekal dibekukan & pengadil lain boleh mengambil alih). penuh = true -> kosongkan semua.
function kosongKunci_(sheet, k, penuh) {
  const kekalRehat = !penuh && !!k.rehat;
  k.pengadilId = ''; k.nama = ''; k.dikunciPada = null; k.aktiviti = null;
  if (!kekalRehat) { k.matchId = ''; k.rehat = null; }
  tulisKunci_(sheet, k);
}

// FASA 5: baca lajur Status Kunci + Data Rehat -> objek rehat atau null
function bacaRehat_(status, json, matchId) {
  if (String(status || '').trim().toUpperCase() !== KUNCI_STATUS_REHAT) return null;
  let v = null;
  try { v = JSON.parse(String(json || '')); } catch (err) { v = null; }
  if (!v || typeof v !== 'object') v = {};
  return {
    pada: v.pada || null,
    sebab: String(v.sebab || ''),
    olehId: String(v.olehId || ''),
    oleh: String(v.oleh || ''),
    fasaSebelum: FASA_SAMBUNG[v.fasaSebelum] ? v.fasaSebelum : 'SEPARUH 1',
    elapsedMs: Math.max(0, Math.min(REHAT_MAX_MS, Number(v.elapsedMs) || 0)),
    skorP1: skorInt_(v.skorP1) === null ? 0 : skorInt_(v.skorP1),
    skorP2: skorInt_(v.skorP2) === null ? 0 : skorInt_(v.skorP2),
    matchId: normMatchId_(v.matchId) || matchId || '',
    diambilAlihOleh: String(v.diambilAlihOleh || '')
  };
}

function isKunciBasi_(k, nowMs) {
  if (!k || !k.pengadilId) return false;
  const t = k.aktiviti ? new Date(k.aktiviti).getTime() : 0;
  return !t || (nowMs - t) > KUNCI_BASI_SAAT * 1000;
}

// Maklumat kunci untuk dipaparkan kepada semua peranti (tiada token / kata laluan)
function kunciAwam_(k, nowMs) {
  if (!k || (!k.pengadilId && !k.rehat)) return null;
  return {
    pengadilId: k.pengadilId || null, nama: k.nama || null, matchId: k.matchId || null,
    dikunciPada: k.dikunciPada, aktivitiTerakhir: k.aktiviti, basi: isKunciBasi_(k, nowMs),
    rehat: k.rehat || null   // FASA 5 (tiada data sulit)
  };
}

function statusKunci_(db) {
  db = db || readKunci_();
  const now = Date.now();
  const out = {};
  gelanggangSah_().forEach(function (g) { out[g] = kunciAwam_(db.map[g], now); });
  return out;
}

// matchId -> nama pengadil bagi perlawanan yang sedang dikunci
function lockedMatchIds_() {
  const out = {};
  try {
    const db = readKunci_();
    gelanggangSah_().forEach(function (g) {
      const k = db.map[g];
      if (k && k.pengadilId && k.matchId) out[k.matchId] = k.nama;
      // FASA 5: perlawanan dalam Rehat Kecemasan kekal dilindungi walaupun tiada pengadil
      else if (k && k.rehat && k.matchId) out[k.matchId] = 'Rehat Kecemasan (menunggu pengadil)';
    });
  } catch (err) {
    console.warn('lockedMatchIds_', err);
  }
  return out;
}

// v1.9.4: kosongkan kunci gelanggang bagi perlawanan yang telah DISAHKAN (SELESAI)
function lepasKunciMuktamad_() {
  const db = readKunci_();
  const table = readTable_(getJadualSheet_());
  const muktamad = {};
  table.rows.forEach(function (r) {
    const st = String(r.data.status || '').toUpperCase();
    const sah = String(r.data.pengesahan || '').toUpperCase();
    if (st === 'SELESAI' && sah === 'DISAHKAN') muktamad[String(r.data.id).toUpperCase()] = true;
  });
  let n = 0;
  gelanggangSah_().forEach(function (g) {
    const k = db.map[g];
    if (k && k.matchId && muktamad[String(k.matchId).toUpperCase()]) { kosongKunci_(db.sheet, k, true); n++; }
  });
  return n;
}

function lepasKunciPengadil_(refId) {
  if (!refId) return 0;
  const db = readKunci_();
  let n = 0;
  gelanggangSah_().forEach(function (g) {
    const k = db.map[g];
    if (k && k.pengadilId === refId) { kosongKunci_(db.sheet, k); n++; }
  });
  return n;
}

// Selepas Master Admin ubah / gantung pengadil: kemas kini nama atau lepaskan kunci
function kemasKunciPengadil_(p) {
  if (!p || !p.id) return;
  if (p.status !== 'AKTIF') { lepasKunciPengadil_(p.id); return; }
  const db = readKunci_();
  gelanggangSah_().forEach(function (g) {
    const k = db.map[g];
    if (k && k.pengadilId === p.id && k.nama !== p.nama) { k.nama = p.nama; tulisKunci_(db.sheet, k); }
  });
}

// "Sepak Mula": kunci gelanggang untuk pengadil (atau perbaharui isyarat aktif)
function kunciGelanggang_(body) {
  const g = normGelanggang_(body.gelanggang);
  if (!g) return { ok: false, error: 'Gelanggang tidak sah.' };
  const sesi = sahkanSesiFutsal_(body.token);
  if (!sesi.ok) return sesi;
  const ref = sesi.ref;
  const db = readKunci_();
  const k = db.map[g];
  const now = new Date();
  const nowMs = now.getTime();
  const perbaharui = body.perbaharui === true || body.perbaharui === 'true';

  // v1.9.9: gelanggang DITUTUP oleh Master Admin -> tiada Sepak Mula / kunci baharu
  if (!perbaharui && !isGelanggangAktif_(g) && !(k && k.pengadilId === ref.id)) {
    return { ok: false, kod: 'DITUTUP', error: 'Gelanggang ' + g + ' telah DITUTUP oleh Master Admin. Sila pilih gelanggang lain.',
      kunci: statusKunci_(db) };
  }

  // FASA 5: gelanggang dalam Rehat Kecemasan hanya boleh diambil alih melalui ambilAlihGelanggang
  if (!perbaharui && k.rehat && k.pengadilId !== ref.id) {
    return {
      ok: false, kod: 'REHAT',
      error: 'Gelanggang ' + g + ' sedang Rehat Kecemasan. Gunakan butang "Ambil Alih Gelanggang" untuk meneruskan perlawanan ini.',
      kunci: statusKunci_(db)
    };
  }

  if (k.pengadilId && k.pengadilId !== ref.id) {
    if (perbaharui) {
      return { ok: false, kod: 'HILANG', error: 'Kawalan Gelanggang ' + g + ' kini dipegang oleh ' + k.nama + '.', kunci: statusKunci_(db) };
    }
    if (!isKunciBasi_(k, nowMs)) {
      return {
        ok: false, kod: 'DIKUNCI',
        error: 'Gelanggang ' + g + ' sedang dikunci oleh ' + k.nama + '. Pengadil lain tidak boleh masuk campur.',
        kunci: statusKunci_(db)
      };
    }
  }
  if (perbaharui && k.pengadilId !== ref.id) {
    return { ok: false, kod: 'HILANG', error: 'Kunci Gelanggang ' + g + ' telah dilepaskan.', kunci: statusKunci_(db) };
  }

  // v1.23.1: KUNCI PENGANJUR - perlawanan dikunci ke gelanggang lain tidak boleh dimulakan di sini
  const idMula = normMatchId_(body.matchId);
  if (!perbaharui && idMula && !k.rehat) {
    const gKunci = (bacaGelanggang_().kunciAcara || {})[idMula];
    if (gKunci && gKunci !== g && isGelanggangAktif_(gKunci)) {
      return { ok: false, kod: 'DIKUNCI_PENGANJUR',
        error: 'Perlawanan ' + idMula + ' telah dikunci oleh penganjur ke Gelanggang ' + gKunci + '. Sila mulakan di Gelanggang ' + gKunci + '.',
        kunci: statusKunci_(db) };
    }
  }

  const diambilAlihDaripada = k.pengadilId && k.pengadilId !== ref.id ? k.nama : null;
  const sediaAda = k.pengadilId === ref.id;

  // v1.23.7: perlawanan bermarkah RALAT (seri kalah mati tanpa penalti) hanya boleh diambil semula
  // oleh pengadil asal yang mengisi markah tersebut. Pengadil lain ditolak; Master Admin guna Edit Skor.
  const idRalat = normMatchId_(body.matchId);
  if (idRalat) {
    const mR = cariPerlawanan_(idRalat);
    if (mR && String(mR.catatan || '').indexOf('RALAT:') === 0) {
      const asal = String(mR.pengadil || '').trim().toUpperCase();
      if (asal && asal !== String(ref.nama || '').trim().toUpperCase()) {
        return { ok: false, kod: 'RALAT_PENGADIL_ASAL', error: idRalat + ' mempunyai markah RALAT. Hanya pengadil asal (' +
          mR.pengadil + ') atau Master Admin boleh menetapkan semula markah.', kunci: statusKunci_(db) };
      }
    }
  }
  // Seorang pengadil hanya memegang satu gelanggang
  gelanggangSah_().forEach(function (o) {
    const x = db.map[o];
    if (o !== g && x && x.pengadilId === ref.id) kosongKunci_(db.sheet, x);
  });

  const matchId = normMatchId_(body.matchId);
  k.pengadilId = ref.id;
  k.nama = ref.nama;
  if (matchId && !k.rehat) k.matchId = matchId;   // FASA 5: perlawanan dibekukan tidak boleh ditukar
  if (!sediaAda) k.dikunciPada = now.toISOString();
  k.aktiviti = now.toISOString();
  tulisKunci_(db.sheet, k);

  // v1.9.0: { mula: true } -> perlawanan terus ditanda LIVE dalam panggilan yang sama
  // (dashboard nampak "LIVE" lebih cepat; tidak perlu menunggu panggilan skorLive kedua).
  let dimulakan = false;
  const mula = !perbaharui && (body.mula === true || body.mula === 'true');
  if (mula && matchId && !k.rehat) {
    const m = cariPerlawanan_(matchId);
    // v1.23.0: semua gelanggang terbuka -> perlawanan daripada gelanggang lain boleh dimulakan di sini
    // selagi tiada pengadil lain memegangnya (baris dipindahkan ke gelanggang ini oleh upsert di bawah).
    const dipegangLain = gelanggangSah_().some(function (o) {
      const x = db.map[o];
      return o !== g && x && x.matchId === matchId && (x.pengadilId || x.rehat);
    });
    // v1.24.0: perlawanan gelanggang lain hanya boleh dimulakan di sini jika kategorinya diterima gelanggang ini
    const cfgG = bacaGelanggang_().senarai.filter(function (x) { return x.id === g; })[0];
    const katM = m ? String(m.kategori || String(m.id || '').slice(0, 2)).toUpperCase() : '';
    const gelSah = normGelanggang_(m && m.gelanggang) === g ||
      (AUTO_ISI_GELANGGANG && !dipegangLain && isGelanggangAktif_(g) && (!cfgG || gelanggangTerima_(cfgG, katM)));
    if (m && String(m.status || '').toUpperCase() === 'MENUNGGU GILIRAN' &&
        gelSah && !isNamaPlaceholder_(m.namaP1) && !isNamaPlaceholder_(m.namaP2)) {
      upsertMatches_([{
        id: matchId, gelanggang: g, status: 'LIVE', skorP1: 0, skorP2: 0, fasaMasa: 'Separuh 1',
        masaMula: now.toISOString(), fasaMulaPada: now.toISOString(), masaTamat: '', pengesahan: 'MENUNGGU', pemenangPenalti: '',
        pengadil: ref.nama, catatan: ''
      }], { abaikanKunci: true });
      dimulakan = true;
    }
  }

  return {
    ok: true,
    gelanggang: g,
    dimulakan: dimulakan,
    diperbaharui: sediaAda,
    diambilAlihDaripada: diambilAlihDaripada,
    kunci: statusKunci_(db)
  };
}

// Lepaskan kunci: pengadil pemegang (token) atau Master Admin (adminKey)
function lepasGelanggang_(body) {
  const g = normGelanggang_(body.gelanggang);
  const db = readKunci_();
  if (isMasterAdmin_(body)) {
    (g ? [g] : gelanggangSah_()).forEach(function (x) {
      const k = db.map[x];
      if (k && k.pengadilId) kosongKunci_(db.sheet, k);
    });
    return { ok: true, olehAdmin: true, kunci: statusKunci_(db) };
  }
  const sesi = sahkanSesi_(body.token);
  if (!sesi.ok) return sesi;
  const targets = g ? [g] : gelanggangSah_();
  for (let i = 0; i < targets.length; i++) {
    const k = db.map[targets[i]];
    if (!k || !k.pengadilId) continue;
    if (k.pengadilId !== sesi.ref.id) {
      if (g) return { ok: false, kod: 'DIKUNCI', error: 'Anda bukan pemegang kunci Gelanggang ' + g + '.', kunci: statusKunci_(db) };
      continue;
    }
    kosongKunci_(db.sheet, k);
  }
  return { ok: true, kunci: statusKunci_(db) };
}

// Markah live daripada pengadil pemegang kunci
function skorLive_(body) {
  const g = normGelanggang_(body.gelanggang);
  if (!g) return { ok: false, error: 'Gelanggang tidak sah.' };
  const admin = isMasterAdmin_(body);
  let ref = null;
  if (admin) {
    ref = { id: 'MASTER_ADMIN', nama: 'Master Admin' };
  } else {
    const sesi = sahkanSesiFutsal_(body.token);
    if (!sesi.ok) return sesi;
    ref = sesi.ref;
  }
  const db = readKunci_();
  const k = db.map[g];
  // v1.9.2: KEPUTUSAN LEWAT - keputusan akhir pengadil diterima walaupun kunci gelanggang
  // telah dilepaskan / beralih ke perlawanan baharu (cth. hantar semula selepas internet putus).
  const idAwal = normMatchId_(body.matchId);
  const akhir = !(body.tangguh === true || body.tangguh === 'true') &&
    cleanValue_('status', String(body.status || '')) === 'TAMAT - TUNGGU SAH';
  if (idAwal && akhir && !(k.pengadilId === ref.id && (!k.matchId || k.matchId === idAwal))) {
    return keputusanLewat_(body, g, idAwal, ref, db);
  }
  if (!admin) {
    if (!k.pengadilId) {
      return { ok: false, kod: 'TIADA_KUNCI', error: 'Gelanggang ' + g + ' belum dikunci. Tekan "Sepak Mula" dahulu.', kunci: statusKunci_(db) };
    }
    if (k.pengadilId !== ref.id) {
      return { ok: false, kod: 'HILANG', error: 'Gelanggang ' + g + ' dikunci oleh ' + k.nama + '. Markah anda tidak diterima.', kunci: statusKunci_(db) };
    }
  }
  const id = normMatchId_(body.matchId);
  if (!id) return { ok: false, error: 'ID perlawanan tidak sah.' };
  if (k.matchId && k.matchId !== id) {
    return { ok: false, error: 'Perlawanan ' + id + ' tidak sepadan dengan kunci Gelanggang ' + g + ' (' + k.matchId + ').' };
  }
  // FASA 5: markah DIBEKUKAN semasa Rehat Kecemasan
  if (k.rehat) {
    return {
      ok: false, kod: 'REHAT',
      error: 'Perlawanan ' + id + ' sedang Rehat Kecemasan. Markah dibekukan - tekan "Sambung Perlawanan" dahulu.',
      kunci: statusKunci_(db)
    };
  }

  const tangguh = body.tangguh === true || body.tangguh === 'true';
  const data = { id: id, pengadil: ref.nama, gelanggang: g };
  ['skorP1', 'skorP2', 'fasaMasa', 'fasaMulaPada', 'status', 'pengesahan', 'pemenangPenalti', 'masaMula', 'masaTamat', 'catatan'].forEach(function (f) {
    if (f in body && body[f] !== undefined) data[f] = body[f];
  });
  if (tangguh) {
    // Tangguh: perlawanan kembali menunggu giliran, skor & masa mula dikosongkan
    data.status = 'MENUNGGU GILIRAN';
    data.fasaMasa = 'Ditangguhkan';
    data.skorP1 = ''; data.skorP2 = ''; data.masaMula = ''; data.fasaMulaPada = ''; data.masaTamat = '';
    data.pengesahan = 'MENUNGGU'; data.pemenangPenalti = '';
    data.catatan = 'Ditangguhkan: ' + String(body.sebab || 'Sepak mula terlalu awal').slice(0, 200);
    data.sahPengadil = ''; data.sahPengadilPada = '';
  }
  // FASA 6: pengadil mengesahkan keputusan -> nama diambil daripada token sesi
  const sahkan = !tangguh && (body.sahkan === true || body.sahkan === 'true') &&
    cleanValue_('status', data.status || '') === 'TAMAT - TUNGGU SAH';
  const sahPada = new Date();
  if (!tangguh && cleanValue_('status', data.status || '') === 'TAMAT - TUNGGU SAH') {
    const mSemak = cariPerlawanan_(id) || {};
    if (seriTanpaPenalti_(mSemak.peringkat, data.skorP1, data.skorP2, data.pemenangPenalti, mSemak.namaP1, mSemak.namaP2)) {
      return { ok: false, kod: 'PERLU_PENALTI', error: id + ': ' + RALAT_PENALTI_, kunci: statusKunci_(db) };
    }
  }
  if (sahkan) {
    data.sahPengadil = ref.nama;
    data.sahPengadilPada = sahPada.toISOString();
  }
  upsertMatches_([data], { abaikanKunci: true });
  if (sahkan) {
    logSahPengadil_({ masa: sahPada, matchId: id, gelanggang: g, ref: ref, skorP1: data.skorP1, skorP2: data.skorP2,
      pemenangPenalti: data.pemenangPenalti || '' });
  }

  const lepas = body.lepas === true || body.lepas === 'true';
  if (tangguh) {
    logTangguh_({ gelanggang: g, matchId: id, pasukan: body.pasukan || '', pengadil: ref.nama,
      sebab: body.sebab || '', tindakan: lepas ? 'TANGGUH + TUKAR PENGADIL' : 'TANGGUH (pengadil kekal)', oleh: ref.nama });
  }
  if (lepas) {
    kosongKunci_(db.sheet, k, true);
  } else {
    k.matchId = id;
    k.aktiviti = new Date().toISOString();
    tulisKunci_(db.sheet, k);
  }
  return { ok: true, dilepaskan: lepas, disahkanPengadil: sahkan ? ref.nama : null, masa: new Date().toISOString() };
}

// v1.9.2: Terima keputusan akhir pengadil yang tiba selepas kunci gelanggang dilepaskan
// atau beralih kepada perlawanan lain. Syarat keselamatan:
//  - perlawanan masih LIVE di gelanggang yang sama (keputusan yang sudah diterima -> ok)
//  - tidak dipegang pengadil lain & tidak dalam Rehat Kecemasan
//  - jika tiada kunci, nama pengadil pada baris perlawanan mesti sama dengan pengadil sesi
function keputusanLewat_(body, g, id, ref, db) {
  const m = cariPerlawanan_(id);
  if (!m) return { ok: false, error: 'Perlawanan ' + id + ' tidak dijumpai dalam Jadual_Perlawanan.' };
  const st = statusBaris_(m);
  if (st === 'TAMAT - TUNGGU SAH' || st === 'SELESAI') {
    // Hantar semula (cth. selepas sambungan terputus) - keputusan telah pun diterima
    return { ok: true, sudahDiterima: true, dilepaskan: false, disahkanPengadil: String(m.sahPengadil || '') || null,
      masa: new Date().toISOString() };
  }
  if (st !== 'LIVE') {
    return { ok: false, kod: 'BUKAN_LIVE', error: 'Perlawanan ' + id + ' berstatus "' + (m.status || '-') +
      '". Keputusan tidak diterima - sila hubungi Urusetia.' };
  }
  if (normGelanggang_(m.gelanggang) && normGelanggang_(m.gelanggang) !== g) {
    return { ok: false, error: 'Perlawanan ' + id + ' bukan di Gelanggang ' + g + '.' };
  }
  let pemegang = null;
  gelanggangSah_().forEach(function (x) {
    const kk = db.map[x];
    if (!pemegang && kk && kk.matchId === id && (kk.pengadilId || kk.rehat)) pemegang = kk;
  });
  if (pemegang && pemegang.rehat) {
    return { ok: false, kod: 'REHAT', error: 'Perlawanan ' + id + ' sedang Rehat Kecemasan. Markah dibekukan.', kunci: statusKunci_(db) };
  }
  if (pemegang && pemegang.pengadilId && pemegang.pengadilId !== ref.id) {
    return { ok: false, kod: 'HILANG', error: 'Perlawanan ' + id + ' kini dikendalikan oleh ' + pemegang.nama + '. Keputusan anda tidak diterima.',
      kunci: statusKunci_(db) };
  }
  if (!pemegang && String(m.pengadil || '').trim().toUpperCase() !== String(ref.nama || '').trim().toUpperCase()) {
    return { ok: false, kod: 'BUKAN_PENGADIL', error: 'Perlawanan ' + id + ' direkodkan di bawah pengadil lain (' +
      (m.pengadil || '-') + '). Sila hubungi Urusetia.' };
  }
  const data = { id: id, pengadil: ref.nama, gelanggang: g };
  ['skorP1', 'skorP2', 'fasaMasa', 'fasaMulaPada', 'status', 'pengesahan', 'pemenangPenalti', 'masaMula', 'masaTamat', 'catatan'].forEach(function (f) {
    if (f in body && body[f] !== undefined) data[f] = body[f];
  });
  data.status = 'TAMAT - TUNGGU SAH';
  if (seriTanpaPenalti_(m.peringkat, data.skorP1, data.skorP2, data.pemenangPenalti, m.namaP1, m.namaP2)) {
    return { ok: false, kod: 'PERLU_PENALTI', error: id + ': ' + RALAT_PENALTI_ };
  }
  if (!data.masaTamat) data.masaTamat = new Date().toISOString();
  const sahkan = body.sahkan === true || body.sahkan === 'true';
  const sahPada = new Date();
  if (sahkan) { data.sahPengadil = ref.nama; data.sahPengadilPada = sahPada.toISOString(); }
  upsertMatches_([data], { abaikanKunci: true });
  if (sahkan) {
    logSahPengadil_({ masa: sahPada, matchId: id, gelanggang: g, ref: ref, skorP1: data.skorP1, skorP2: data.skorP2,
      pemenangPenalti: data.pemenangPenalti || '' });
  }
  const lepas = body.lepas === true || body.lepas === 'true';
  if (pemegang && lepas) kosongKunci_(db.sheet, pemegang, true);
  return { ok: true, lewat: true, dilepaskan: !!(pemegang && lepas), disahkanPengadil: sahkan ? ref.nama : null,
    masa: new Date().toISOString() };
}

// FASA 6: catat setiap pengesahan keputusan oleh pengadil (tab Log_Sah_Pengadil)
function logSahPengadil_(x) {
  const sheet = getOrCreateSheet_(SHEET_SAH_PENGADIL);
  if (sheet.getRange(1, 1, 1, SAH_PENGADIL_HEADER.length).getValues()[0].join('') === '') {
    sheet.getRange(1, 1, 1, SAH_PENGADIL_HEADER.length).setValues([SAH_PENGADIL_HEADER]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  const m = cariPerlawanan_(x.matchId) || {};
  sheet.appendRow([x.masa, x.matchId, x.gelanggang, m.namaP1 || '', (skorInt_(x.skorP1) || 0) + ' - ' + (skorInt_(x.skorP2) || 0),
    m.namaP2 || '', x.pemenangPenalti || '', x.ref.nama, x.ref.id]);
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
}

/* =========================================================
   FASA 3: TANGGUH PERLAWANAN & PAPAN LIVE AWAM
   ========================================================= */
function getTangguhSheet_() {
  const sheet = getOrCreateSheet_(SHEET_TANGGUH);
  if (sheet.getRange(1, 1, 1, TANGGUH_HEADER.length).getValues()[0].join('') === '') {
    sheet.getRange(1, 1, 1, TANGGUH_HEADER.length).setValues([TANGGUH_HEADER]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function logTangguh_(t) {
  try {
    const sheet = getTangguhSheet_();
    sheet.appendRow([new Date(), t.gelanggang, t.matchId, t.pasukan, t.pengadil, String(t.sebab || '').slice(0, 200), t.tindakan, t.oleh]);
    sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  } catch (err) {
    console.warn('logTangguh_', err);
  }
}

// Master Admin (adminKey) tangguh perlawanan di mana-mana gelanggang & lepaskan kunci pengadil
function tangguhAdmin_(body) {
  if (!isMasterAdmin_(body)) return { ok: false, error: 'Hanya Master Admin boleh menangguhkan perlawanan gelanggang lain.' };
  const g = normGelanggang_(body.gelanggang);
  const id = normMatchId_(body.matchId);
  if (!g || !id) return { ok: false, error: 'Gelanggang / ID perlawanan tidak sah.' };
  const db = readKunci_();
  const k = db.map[g];
  const pengadilLama = k && k.nama ? k.nama : '';
  if (k && (k.pengadilId || k.rehat)) kosongKunci_(db.sheet, k, true);   // FASA 5: batal rehat juga
  upsertMatches_([{
    id: id, gelanggang: g, status: 'MENUNGGU GILIRAN', fasaMasa: 'Ditangguhkan', skorP1: '', skorP2: '',
    masaMula: '', fasaMulaPada: '', masaTamat: '', pengesahan: 'MENUNGGU', pemenangPenalti: '', pengadil: '',
    catatan: 'Ditangguhkan (Master Admin): ' + String(body.sebab || '-').slice(0, 200)
  }], { abaikanKunci: true, admin: true });
  logTangguh_({ gelanggang: g, matchId: id, pasukan: body.pasukan || '', pengadil: pengadilLama,
    sebab: body.sebab || '', tindakan: 'TANGGUH + LEPAS KUNCI', oleh: 'Master Admin' });
  return { ok: true, kunci: statusKunci_(db) };
}

// v1.9.0 / v1.9.3: papan live melalui CacheService.
//  - doPost membina semula papan terus ke cache selepas setiap penulisan (segarkanPapan_).
//  - doGet membaca cache. Jika cache lebih lama daripada PAPAN_CACHE_SAAT, hanya satu
//    permintaan membina semula (kunci dokumen); permintaan lain menerima salinan terakhir.
//  - Versi cache dinaikkan setiap penulisan; binaan yang bermula sebelum penulisan tidak disimpan.
function papanAwam_(data, cache) {
  data.masa = new Date().toISOString();
  data.cache = !!cache;
  return data;
}

function simpanPapan_(cache, data, ver) {
  try {
    data.dibina = Date.now();
    data.verPapan = ver || '';
    cache.put(PAPAN_CACHE_KEY, JSON.stringify(data), PAPAN_CACHE_MAX_SAAT);
  } catch (err) { /* abaikan */ }
}

function binaPapanCache_(cache) {
  const verSebelum = cache ? (cache.get(PAPAN_CACHE_VER) || '') : '';
  const data = papanLive_();
  if (cache) {
    try {
      if ((cache.get(PAPAN_CACHE_VER) || '') === verSebelum) simpanPapan_(cache, data, verSebelum);
    } catch (err) { /* abaikan */ }
  }
  return data;
}

// v1.22.0: token binaan (CacheService) menggantikan kunci skrip untuk pembaca papan.
// Pembaca papan TIDAK LAGI beratur dalam giliran pengadil.
const PAPAN_BINA_KEY = 'PAPAN_BINA_V122';
function ambilTokenBina_(cache) {
  try {
    if (cache.get(PAPAN_BINA_KEY)) return false;
    cache.put(PAPAN_BINA_KEY, '1', 15);
    return true;
  } catch (err) { return true; }
}
function lepasTokenBina_(cache) {
  try { cache.remove(PAPAN_BINA_KEY); } catch (err) { /* abaikan */ }
}

function papanLiveCached_() {
  let cache = null;
  try { cache = CacheService.getScriptCache(); } catch (err) { cache = null; }
  if (!cache) return papanAwam_(papanLive_(), false);
  let lama = null;
  try {
    const got = cache.getAll([PAPAN_CACHE_KEY, PAPAN_CACHE_VER]) || {};
    const hit = got[PAPAN_CACHE_KEY];
    if (hit) {
      const data = JSON.parse(hit);
      const umur = Date.now() - (Number(data.dibina) || 0);
      const verSemasa = got[PAPAN_CACHE_VER] || '';
      const verSama = !data.verPapan || !verSemasa || data.verPapan === verSemasa;
      if (verSama && umur >= 0 && umur <= PAPAN_CACHE_SAAT * 1000) return papanAwam_(data, true);
      lama = data;
    }
  } catch (err) { lama = null; }
  if (lama) {
    // Salinan lama wujud: hanya satu permintaan membina semula, yang lain terus dilayan
    if (!ambilTokenBina_(cache)) return papanAwam_(lama, true);
    try {
      return papanAwam_(binaPapanCache_(cache), false);
    } catch (err) {
      return papanAwam_(lama, true);
    } finally { lepasTokenBina_(cache); }
  }
  // Tiada salinan langsung: tunggu sebentar jika permintaan lain sedang membina
  if (!ambilTokenBina_(cache)) {
    for (let i = 0; i < 8; i++) {
      Utilities.sleep(250);
      try {
        const c = cache.get(PAPAN_CACHE_KEY);
        if (c) return papanAwam_(JSON.parse(c), true);
      } catch (err) { /* cuba lagi */ }
    }
  }
  try { return papanAwam_(binaPapanCache_(cache), false); }
  finally { lepasTokenBina_(cache); }
}

// v1.22.0: dipanggil DI DALAM kunci selepas tulisan -> versi baharu papan
function naikVersiPapan_() {
  const ver = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
  CacheService.getScriptCache().put(PAPAN_CACHE_VER, ver, 21600);
  return ver;
}

// v1.9.3 / v1.22.0: dipanggil oleh doPost SELEPAS kunci dilepaskan. Papan hanya disimpan
// jika tiada tulisan lain selepas tulisan ini (versi masih sama) -> tiada papan basi.
function segarkanPapan_(verSaya) {
  let cache = null;
  try { cache = CacheService.getScriptCache(); } catch (err) { cache = null; }
  if (!cache) return;
  try {
    if (!verSaya) verSaya = naikVersiPapan_();
    const data = papanLive_();
    if ((cache.get(PAPAN_CACHE_VER) || '') === verSaya) simpanPapan_(cache, data, verSaya);
  } catch (err) {
    bustPapanCache_();
  }
}

/* =========================================================
   Bahagian 5: ISYARAT PERUBAHAN MASA NYATA (Admin -> Dashboard)
   - tandaPerubahan_(sukan): dipanggil oleh doPost (SELEPAS kunci dilepaskan, v1.22.0) & onEdit.
   - isyaratPerubahan_()   : ?action=perubahan -> { futsal, badminton } cap masa (ms).
   - Pelayar membandingkan cap masa; jika berubah, data sukan itu dibaca semula serta-merta.
   ========================================================= */
function tandaPerubahan_(sukan) {
  const s = jenisSukan_(sukan);
  const token = String(Date.now());
  PropertiesService.getScriptProperties().setProperty(ISYARAT_KEY + s, token);
  try { CacheService.getScriptCache().put(ISYARAT_KEY + s, token, ISYARAT_CACHE_SAAT); } catch (err) { /* abaikan */ }
  return token;
}

function isyaratRingkas_() {
  const keys = [ISYARAT_KEY + 'FUTSAL', ISYARAT_KEY + 'BADMINTON'];
  let cache = null, got = {};
  try { cache = CacheService.getScriptCache(); got = cache.getAll(keys) || {}; } catch (err) { got = {}; }
  let props = null;
  const nilai = function (k) {
    if (got[k]) return String(got[k]);
    props = props || PropertiesService.getScriptProperties();
    const v = props.getProperty(k) || '0';
    try { if (cache) cache.put(k, v, ISYARAT_CACHE_SAAT); } catch (err) { /* abaikan */ }
    return v;
  };
  return { futsal: nilai(keys[0]), badminton: nilai(keys[1]) };
}

function isyaratPerubahan_() {
  const i = isyaratRingkas_();
  return { ok: true, versi: API_VERSI, masa: new Date().toISOString(), futsal: i.futsal, badminton: i.badminton, selangSaat: 5 };
}

// Suntingan manual terus di Google Sheets (pencetus mudah onEdit) turut dihantar ke Dashboard.
// Penulisan oleh skrip sendiri tidak mencetuskan onEdit, jadi tiada isyarat berganda.
function onEdit(e) {
  try {
    const nama = e && e.range ? e.range.getSheet().getName() : '';
    if (!nama) return;
    const bm = [SHEET_BM_JADUAL, SHEET_BM_PASUKAN, SHEET_BM_PERATURAN, SHEET_KEJOHANAN, SHEET_GELANGGANG_INFO, 'Log_Pengesahan_Badminton'];
    const fs = [SHEET_JADUAL, 'Pasukan_Futsal', 'Peraturan_Futsal', SHEET_LOG, SHEET_KUNCI];
    if (bm.indexOf(nama) >= 0) {
      try { CacheService.getScriptCache().remove(BM_CACHE_KEY); } catch (err) { /* abaikan */ }
      tandaPerubahan_('BADMINTON');
    }
    if (fs.indexOf(nama) >= 0) {
      bustPapanCache_();
      tandaPerubahan_('FUTSAL');
    }
  } catch (err) { console.warn('onEdit isyarat', err); }
}

function bustPapanCache_() {
  try {
    const cache = CacheService.getScriptCache();
    cache.put(PAPAN_CACHE_VER, String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8), 21600);
    cache.remove(PAPAN_CACHE_KEY);
  } catch (err) { /* abaikan */ }
}

// Papan live awam: perlawanan semasa setiap gelanggang + nama pengadil (tiada data sulit)
// v1.9.2: pemilihan perlawanan semasa yang tegas -> paparan projektor tidak lagi tersekat
// pada keputusan lama. Keutamaan setiap gelanggang:
//   1) perlawanan pada kunci gelanggang: LIVE, Rehat Kecemasan, atau dikunci belum sepak mula
//   2) perlawanan LIVE terkini di gelanggang (baris LIVE terbiar diabaikan)
//   3) perlawanan yang BARU ditangguhkan (kembali menunggu giliran)
// Keputusan "TAMAT - TUNGGU SAH" / "SELESAI" tidak pernah menjadi perlawanan semasa:
// keputusan itu kekal dalam Peti Kelulusan Urusetia, gelanggang dianggap bebas.
function masaBarisMs_(d) {
  const iso = toIso_(d && d.kemaskini) || toIso_(d && d.masaMula);
  const t = iso ? new Date(iso).getTime() : 0;
  return isNaN(t) ? 0 : t;
}

function statusBaris_(d) {
  return cleanValue_('status', String((d && d.status) || '').trim()).toUpperCase();
}

function papanLive_() {
  const kunci = readKunci_();
  const table = readTable_(getJadualSheet_());
  const nowMs = Date.now();
  const semua = table.rows.map(function (r) { return r.data; });
  const byId = {};
  semua.forEach(function (d) { byId[String(d.id).toUpperCase()] = d; });
  // Perlawanan yang dipegang kunci (mana-mana gelanggang) tidak dianggap terbiar
  const dikunci = {};
  gelanggangSah_().forEach(function (g) {
    const k = kunci.map[g];
    if (k && k.matchId && (k.pengadilId || k.rehat)) dikunci[k.matchId] = true;
  });
  const terbiarMs = LIVE_TERBIAR_MINIT * 60 * 1000;
  const tangguhMs = TANGGUH_PAPAN_MINIT * 60 * 1000;
  const terkiniDahulu = function (a, b) { return masaBarisMs_(b) - masaBarisMs_(a); };

  const susunan = bacaGelanggang_().susunan || {};   // v1.10.0: urutan Jana Susunan
  const out = {};
  gelanggangAktif_().forEach(function (g) {   // v1.9.9: gelanggang AKTIF sahaja
    const k = kunci.map[g];
    const diGelanggang = semua.filter(function (d) { return normGelanggang_(d.gelanggang) === g; });
    let m = null;

    // (1) Perlawanan pada kunci gelanggang
    const mk = k && k.matchId ? byId[k.matchId] : null;
    if (mk) {
      const st = statusBaris_(mk);
      if (st === 'LIVE' || k.rehat || (k.pengadilId && st === 'MENUNGGU GILIRAN')) m = mk;
    }
    // (2) Perlawanan LIVE terkini (abaikan baris LIVE terbiar tanpa kunci)
    if (!m) {
      m = diGelanggang.filter(function (d) {
        if (statusBaris_(d) !== 'LIVE') return false;
        if (dikunci[String(d.id).toUpperCase()]) return true;
        const t = masaBarisMs_(d);
        return !t || (nowMs - t) <= terbiarMs;
      }).sort(terkiniDahulu)[0] || null;
    }
    // (3) Perlawanan yang baru ditangguhkan
    if (!m) {
      m = diGelanggang.filter(function (d) {
        if (statusBaris_(d) !== 'MENUNGGU GILIRAN' || String(d.fasaMasa || '') !== 'Ditangguhkan') return false;
        const t = masaBarisMs_(d);
        return t && (nowMs - t) <= tangguhMs;
      }).sort(terkiniDahulu)[0] || null;
    }

    const stM = m ? statusBaris_(m) : '';
    const mId = m ? String(m.id).toUpperCase() : '';
    const kunciIni = !!(k && m && k.matchId && k.matchId === mId);
    const pegang = k && k.pengadilId && (!m || kunciIni) ? k : null;
    const rehat = k && k.rehat && kunciIni ? k.rehat : null;
    const ditangguh = !!(m && String(m.fasaMasa) === 'Ditangguhkan' && stM !== 'LIVE');

    // FASA 7: Giliran seterusnya (untuk makluman standby pengurus pasukan)
    const giliran = diGelanggang.filter(function (d) {
      if (statusBaris_(d) !== 'MENUNGGU GILIRAN') return false;
      return String(d.id).toUpperCase() !== mId;
    }).sort(function (a, b) {
      // v1.23.0: perlawanan yang pasukannya sudah ditentukan didahulukan (gelanggang tidak tersekat)
      const sa = sediaMain_(a) ? 0 : 1, sb = sediaMain_(b) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      const ra = susunan[String(a.id).toUpperCase()], rb = susunan[String(b.id).toUpperCase()];
      const ada = typeof ra === 'number', adb = typeof rb === 'number';
      if (ada && adb && ra !== rb) return ra - rb;
      if (ada !== adb) return ada ? -1 : 1;
      const ka = String(a.kategori || ''), kb = String(b.kategori || '');
      if (ka !== kb) return ka.localeCompare(kb);
      const na = Number(a.no) || 0, nb = Number(b.no) || 0;
      if (na !== nb) return na - nb;
      return String(a.id).localeCompare(String(b.id));
    }).slice(0, GILIRAN_MAX).map(function (d) {
      return {
        id: String(d.id || ''), kategori: String(d.kategori || ''), peringkat: String(d.peringkat || ''),
        kumpulan: String(d.kumpulan || ''), kodP1: String(d.kodP1 || ''), kodP2: String(d.kodP2 || ''),
        namaP1: String(d.namaP1 || ''), namaP2: String(d.namaP2 || ''),
        ditangguh: String(d.fasaMasa || '') === 'Ditangguhkan'
      };
    });
    out[g] = {
      gelanggang: g,
      giliran: giliran,
      matchId: m ? m.id : null,
      namaP1: m ? m.namaP1 : '', namaP2: m ? m.namaP2 : '',
      skorP1: m ? m.skorP1 : null, skorP2: m ? m.skorP2 : null,
      status: m ? (stM || m.status) : '', fasaMasa: m ? m.fasaMasa : '',
      masaMula: m ? toIso_(m.masaMula) : null,
      fasaMulaPada: m ? toIso_(m.fasaMulaPada) : null,
      peringkat: m ? m.peringkat : '', kumpulan: m ? m.kumpulan : '', kategori: m ? m.kategori : '',
      ditangguh: ditangguh,
      catatan: ditangguh ? String(m.catatan || '') : '',
      pengadil: pegang ? pegang.nama : (rehat ? '' : (stM === 'LIVE' ? String(m.pengadil || '') : '')),
      pengadilAktif: pegang ? !isKunciBasi_(pegang, nowMs) : false,
      // FASA 5: penangguhan sementara (rehat kecemasan)
      rehat: !!rehat,
      rehatSebab: rehat ? rehat.sebab : '',
      rehatPada: rehat ? rehat.pada : null,
      rehatElapsedMs: rehat ? Number(rehat.elapsedMs) || 0 : 0,
      rehatFasaSebelum: rehat ? rehat.fasaSebelum : '',
      sahPengadil: m ? String(m.sahPengadil || '') : '',   // FASA 6
      kemaskini: m ? toIso_(m.kemaskini) : null
    };
  });
  return { ok: true, versi: API_VERSI, masa: new Date().toISOString(), gelanggang: out, senaraiGelanggang: bacaGelanggang_() };
}

/* =========================================================
   FASA 5: REHAT KECEMASAN (PENANGGUHAN SEMENTARA) & AMBIL ALIH PENGADIL
   Aliran: Pengadil A (pemegang kunci) tekan "Rehat Kecemasan" -> skor semasa
           disimpan & DIBEKUKAN, Fasa Masa = "Rehat Kecemasan" (status kekal LIVE).
           -> Pengadil B log masuk -> "Ambil Alih Gelanggang" (kunci bertukar kepada B,
              status rehat kekal) -> "Sambung Perlawanan" -> fasa & masa disambung,
              skor diambil daripada Jadual_Perlawanan (tiada markah hilang / ditulis ganti).
           -> Pengadil A juga boleh menekan "Sambung Perlawanan" sendiri.
   - Semua tindakan berjalan di bawah LockService (doPost).
   ========================================================= */
function cariPerlawanan_(id) {
  const table = readTable_(getJadualSheet_());
  const rec = table.rows.find(function (r) { return String(r.data.id).toUpperCase() === id; });
  return rec ? rec.data : null;
}

// Data perlawanan untuk peranti pengadil (tiada data sulit)
function perlawananAwam_(d) {
  if (!d) return null;
  return {
    id: String(d.id || ''), kategori: String(d.kategori || ''), peringkat: String(d.peringkat || ''),
    namaP1: String(d.namaP1 || ''), namaP2: String(d.namaP2 || ''), kodP1: String(d.kodP1 || ''), kodP2: String(d.kodP2 || ''),
    skorP1: skorInt_(d.skorP1), skorP2: skorInt_(d.skorP2),
    status: String(d.status || ''), pengesahan: String(d.pengesahan || ''), fasaMasa: String(d.fasaMasa || ''),
    masaMula: d.masaMula || null, pengadil: String(d.pengadil || ''), gelanggang: String(d.gelanggang || ''),
    sahPengadil: String(d.sahPengadil || ''), sahPengadilPada: d.sahPengadilPada || null
  };
}

function normFasaKod_(v) {
  const k = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (k === 'SEPARUH1') return 'SEPARUH 1';
  if (k === 'SEPARUH2') return 'SEPARUH 2';
  if (k === 'REHAT') return 'REHAT';
  return 'SEPARUH 1';
}

function sesiDanKunci_(body) {
  const g = normGelanggang_(body.gelanggang);
  if (!g) return { ralat: { ok: false, error: 'Gelanggang tidak sah.' } };
  const sesi = sahkanSesiFutsal_(body.token);
  if (!sesi.ok) return { ralat: sesi };
  const db = readKunci_();
  return { g: g, ref: sesi.ref, db: db, k: db.map[g] };
}

// 1) REHAT KECEMASAN: pengadil pemegang kunci membekukan perlawanan LIVE
function rehatKecemasan_(body) {
  const c = sesiDanKunci_(body);
  if (c.ralat) return c.ralat;
  const g = c.g, ref = c.ref, db = c.db, k = c.k;
  if (!k.pengadilId) {
    return { ok: false, kod: 'TIADA_KUNCI', error: 'Gelanggang ' + g + ' belum dikunci. Tekan "Sepak Mula" dahulu.', kunci: statusKunci_(db) };
  }
  if (k.pengadilId !== ref.id) {
    return { ok: false, kod: 'HILANG', error: 'Gelanggang ' + g + ' dikunci oleh ' + k.nama + '. Anda tidak boleh menangguhkannya.', kunci: statusKunci_(db) };
  }
  const id = normMatchId_(body.matchId);
  if (!id) return { ok: false, error: 'ID perlawanan tidak sah.' };
  if (k.matchId && k.matchId !== id) {
    return { ok: false, error: 'Perlawanan ' + id + ' tidak sepadan dengan kunci Gelanggang ' + g + ' (' + k.matchId + ').' };
  }
  if (k.rehat) {
    // Idempotent: permintaan berulang (cth: internet lambat) tidak mengubah apa-apa
    return { ok: true, sudahRehat: true, rehat: k.rehat, kunci: statusKunci_(db) };
  }
  const d = cariPerlawanan_(id);
  if (!d) return { ok: false, error: 'Perlawanan ' + id + ' tidak dijumpai dalam ' + SHEET_JADUAL + '.' };
  if (String(d.status || '').toUpperCase() !== 'LIVE') {
    return { ok: false, kod: 'BUKAN_LIVE', error: 'Rehat Kecemasan hanya dibenarkan semasa perlawanan LIVE (status semasa: ' + d.status + ').' };
  }
  const s1 = skorInt_(body.skorP1), s2 = skorInt_(body.skorP2);
  if (s1 === null || s2 === null) return { ok: false, error: 'Skor semasa tidak sah (mesti 0 hingga 99).' };
  const sebab = String(body.sebab || 'Kecemasan pengadil').replace(/\s+/g, ' ').trim().slice(0, 200);
  const now = new Date();

  // Simpan skor terakhir pengadil (sumber sah) & bekukan fasa. Status kekal LIVE.
  upsertMatches_([{ id: id, gelanggang: g, pengadil: ref.nama, skorP1: s1, skorP2: s2, fasaMasa: FASA_REHAT_LABEL }], { abaikanKunci: true });

  k.matchId = id;
  k.aktiviti = now.toISOString();
  k.rehat = {
    pada: now.toISOString(), sebab: sebab, olehId: ref.id, oleh: ref.nama,
    fasaSebelum: normFasaKod_(body.fasaSebelum),
    elapsedMs: Math.max(0, Math.min(REHAT_MAX_MS, Math.round(Number(body.elapsedMs) || 0))),
    skorP1: s1, skorP2: s2, matchId: id, diambilAlihOleh: ''
  };
  tulisKunci_(db.sheet, k);
  logTangguh_({ gelanggang: g, matchId: id, pasukan: String(d.namaP1) + ' lwn ' + String(d.namaP2), pengadil: ref.nama,
    sebab: sebab + ' (skor ' + s1 + ' - ' + s2 + ')', tindakan: 'REHAT KECEMASAN (DIGANTUNG SEMENTARA)', oleh: ref.nama });
  return { ok: true, rehat: k.rehat, kunci: statusKunci_(db), masa: now.toISOString() };
}

// 2) AMBIL ALIH: pengadil baharu mengambil alih gelanggang yang sedang Rehat Kecemasan
function ambilAlihGelanggang_(body) {
  const c = sesiDanKunci_(body);
  if (c.ralat) return c.ralat;
  const g = c.g, ref = c.ref, db = c.db, k = c.k;
  if (!k.rehat) {
    return {
      ok: false, kod: 'BUKAN_REHAT',
      error: 'Gelanggang ' + g + ' tidak dalam status Rehat Kecemasan. Ambil alih hanya dibenarkan semasa perlawanan ditangguhkan sementara.',
      kunci: statusKunci_(db)
    };
  }
  // Pengadil ini tidak boleh sedang memegang perlawanan di gelanggang lain
  for (let i = 0; i < gelanggangSah_().length; i++) {
    const o = gelanggangSah_()[i];
    const x = db.map[o];
    if (o === g || !x || x.pengadilId !== ref.id) continue;
    if (x.matchId || x.rehat) {
      return { ok: false, kod: 'PEGANG_LAIN', error: 'Anda masih memegang Gelanggang ' + o + '. Lepaskan gelanggang tersebut dahulu.', kunci: statusKunci_(db) };
    }
    kosongKunci_(db.sheet, x);
  }
  const id = k.rehat.matchId || k.matchId;
  const d = cariPerlawanan_(id);
  if (!d || String(d.status || '').toUpperCase() !== 'LIVE') {
    return { ok: false, kod: 'BUKAN_LIVE', error: 'Perlawanan ' + id + ' tidak lagi LIVE. Hubungi Urusetia / Master Admin.', kunci: statusKunci_(db) };
  }
  const now = new Date();
  const sama = k.pengadilId === ref.id;
  const lama = sama ? '' : (k.nama || k.rehat.oleh || '');
  k.pengadilId = ref.id;
  k.nama = ref.nama;
  k.matchId = id;
  if (!sama) k.dikunciPada = now.toISOString();
  k.aktiviti = now.toISOString();
  if (!sama) k.rehat.diambilAlihOleh = ref.nama;
  tulisKunci_(db.sheet, k);
  // Hanya nama pengadil dikemas kini. Skor, status & fasa TIDAK disentuh.
  upsertMatches_([{ id: id, pengadil: ref.nama }], { abaikanKunci: true });
  if (!sama) {
    logTangguh_({ gelanggang: g, matchId: id, pasukan: String(d.namaP1) + ' lwn ' + String(d.namaP2), pengadil: lama || '-',
      sebab: 'Ambil alih semasa Rehat Kecemasan (skor ' + d.skorP1 + ' - ' + d.skorP2 + ')', tindakan: 'AMBIL ALIH (TUKAR PENGADIL)', oleh: ref.nama });
  }
  return {
    ok: true, gelanggang: g, diambilAlihDaripada: lama || null, rehat: k.rehat,
    perlawanan: perlawananAwam_(cariPerlawanan_(id)), kunci: statusKunci_(db), masa: now.toISOString()
  };
}

// 3) SAMBUNG PERLAWANAN: pemegang kunci (pengadil asal / baharu) meneruskan perlawanan
function sambungPerlawanan_(body) {
  const c = sesiDanKunci_(body);
  if (c.ralat) return c.ralat;
  const g = c.g, ref = c.ref, db = c.db, k = c.k;
  if (!k.pengadilId) {
    return { ok: false, kod: 'TIADA_KUNCI', error: 'Gelanggang ' + g + ' tiada pengadil. Tekan "Ambil Alih Gelanggang" dahulu.', kunci: statusKunci_(db) };
  }
  if (k.pengadilId !== ref.id) {
    return { ok: false, kod: 'HILANG', error: 'Gelanggang ' + g + ' kini dipegang oleh ' + k.nama + '.', kunci: statusKunci_(db) };
  }
  const reqId = normMatchId_(body.matchId);
  if (!k.rehat) {
    // Idempotent: sudah disambung
    return { ok: true, sudahSambung: true, perlawanan: perlawananAwam_(k.matchId ? cariPerlawanan_(k.matchId) : null), kunci: statusKunci_(db) };
  }
  const id = k.rehat.matchId || k.matchId;
  if (reqId && reqId !== id) {
    return { ok: false, error: 'Perlawanan ' + reqId + ' tidak sepadan dengan perlawanan yang ditangguhkan di Gelanggang ' + g + ' (' + id + ').', kunci: statusKunci_(db) };
  }
  const d = cariPerlawanan_(id);
  if (!d || String(d.status || '').toUpperCase() !== 'LIVE') {
    return { ok: false, kod: 'BUKAN_LIVE', error: 'Perlawanan ' + id + ' tidak lagi LIVE. Hubungi Urusetia / Master Admin.', kunci: statusKunci_(db) };
  }
  const rehat = k.rehat;
  const now = new Date();
  // Skor TIDAK dihantar / ditulis: hanya fasa dipulihkan & nama pengadil semasa.
  upsertMatches_([{ id: id, pengadil: ref.nama, fasaMasa: FASA_SAMBUNG[rehat.fasaSebelum] || 'Separuh 1',
    fasaMulaPada: new Date(now.getTime() - (Number(rehat.elapsedMs) || 0)).toISOString() }], { abaikanKunci: true });
  k.rehat = null;
  k.matchId = id;
  k.aktiviti = now.toISOString();
  tulisKunci_(db.sheet, k);
  const minit = rehat.pada ? Math.max(0, Math.round((now.getTime() - new Date(rehat.pada).getTime()) / 60000)) : 0;
  logTangguh_({ gelanggang: g, matchId: id, pasukan: String(d.namaP1) + ' lwn ' + String(d.namaP2), pengadil: ref.nama,
    sebab: 'Rehat ' + minit + ' minit (' + rehat.sebab + ') · skor ' + d.skorP1 + ' - ' + d.skorP2,
    tindakan: 'SAMBUNG PERLAWANAN' + (rehat.olehId && rehat.olehId !== ref.id ? ' (PENGADIL BAHARU)' : ''), oleh: ref.nama });
  return { ok: true, rehat: rehat, perlawanan: perlawananAwam_(cariPerlawanan_(id)), kunci: statusKunci_(db), masa: now.toISOString() };
}

/* =========================================================
   FASA 4: PEMBETULAN MARKAH (MASTER ADMIN SAHAJA) & ROMBAKAN AUTOMATIK
   Aliran: Master Admin log masuk -> Dashboard -> Pembetulan Markah -> pilih
           perlawanan DISAHKAN -> masukkan skor betul + sebab -> Simpan.
   Pelayan:
     1. Sahkan kunci Master Admin (handlePengadil_) - pengadil / urusetia ditolak.
     2. Semak perlawanan wujud, telah DISAHKAN & tidak sedang dikunci di gelanggang.
     3. Semak skor (0-99), pemenang penalti wajib bagi kalah mati yang seri.
     4. Tulis skor baharu + perlawanan susulan (hasil rombakan aplikasi) dengan
        cop "Versi Pembetulan" di bawah LockService (doPost).
     5. Rombakan pelayan: kira semula Carta_Liga & isi semula slot JOHAN-/NJOHAN-/
        MENANG-/KALAH- perlawanan yang masih MENUNGGU GILIRAN.
     6. Catat ke tab Log_Pembetulan.
   ========================================================= */
function getPembetulanSheet_() {
  const sheet = getOrCreateSheet_(SHEET_PEMBETULAN);
  if (sheet.getRange(1, 1, 1, PEMBETULAN_HEADER.length).getValues()[0].join('') === '') {
    sheet.getRange(1, 1, 1, PEMBETULAN_HEADER.length).setValues([PEMBETULAN_HEADER]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function bacaLogPembetulan_(had) {
  const sheet = getPembetulanSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const n = Math.min(had || 100, last - 1);
  return sheet.getRange(last - n + 1, 1, n, PEMBETULAN_HEADER.length).getValues().reverse().map(function (r) {
    return {
      masa: toIso_(r[0]), versi: String(r[1]), matchId: String(r[2]), kategori: String(r[3]), peringkat: String(r[4]),
      perlawanan: String(r[5]), skorLama: String(r[6]), skorBaharu: String(r[7]), sebab: String(r[10]),
      mod: String(r[11]), terkesan: String(r[12]), oleh: String(r[13])
    };
  });
}

function skorInt_(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;
}

// v1.23.6: Futsal kalah mati seri tanpa pemenang penalti = markah bermasalah
// v1.24.1: pemenang penalti boleh dihantar sebagai 'P1'/'P2' ATAU nama pasukan (telefon pengadil
// menghantar nama). Dahulu nama pasukan dianggap "tiada penalti" -> pengadil tersekat (gelung RALAT).
function seriTanpaPenalti_(peringkat, s1, s2, pen, n1, n2) {
  const a = skorInt_(s1), b = skorInt_(s2);
  if (!isKnockoutStage_(peringkat) || a === null || a !== b) return false;
  return !penaltiSah_(pen, n1, n2);
}
function penaltiSah_(pen, n1, n2) {
  const p = String(pen || '').trim().toUpperCase();
  if (!p) return false;
  if (p === 'P1' || p === 'P2') return true;
  const x1 = String(n1 || '').trim().toUpperCase(), x2 = String(n2 || '').trim().toUpperCase();
  return (!!x1 && p === x1) || (!!x2 && p === x2);
}
const RALAT_PENALTI_ = 'RALAT: Keputusan seri dalam perlawanan kalah mati tanpa pemenang penalti. Pengadil mesti tetapkan semula markah & pilih pemenang penalti.';

// v1.23.6: baris Futsal kalah mati yang sudah SELESAI / TUNGGU SAH tetapi seri tanpa penalti
// dikembalikan kepada pengadil (MENUNGGU GILIRAN) - tidak diserahkan kepada Urusetia.
function baikiSeriTanpaPenalti_(sheet, table) {
  const c = table.colOf; let n = 0;
  table.rows.forEach(function (r) {
    const d = r.data, st = statusBaris_(d);
    if (st !== 'SELESAI' && st !== 'TAMAT - TUNGGU SAH') return;
    if (!seriTanpaPenalti_(d.peringkat, d.skorP1, d.skorP2, d.pemenangPenalti, d.namaP1, d.namaP2)) return;
    const lama = (skorInt_(d.skorP1) || 0) + '-' + (skorInt_(d.skorP2) || 0);
    const set = { status: 'MENUNGGU GILIRAN', pengesahan: 'MENUNGGU', fasaMasa: 'PERLU TETAP SEMULA', skorP1: '', skorP2: '',
      masaMula: '', masaTamat: '', fasaMulaPada: '', pemenangPenalti: '', sahPengadil: '', sahPengadilPada: '',
      catatan: RALAT_PENALTI_ + ' (skor lama ' + lama + ')' };
    Object.keys(set).forEach(function (f) {
      if (c[f] === undefined) return;
      sheet.getRange(r.rowIndex + 1, c[f] + 1).setValue(set[f]);
      d[f] = set[f] === '' ? null : set[f];
    });
    n++;
  });
  if (n) console.warn('baikiSeriTanpaPenalti_: ' + n + ' perlawanan dikembalikan kepada pengadil.');
  return n;
}

function isKnockoutStage_(peringkat) {
  return KNOCKOUT_STAGES.indexOf(String(peringkat || '').toUpperCase()) >= 0;
}

// Pemenang baris yang telah DISAHKAN -> 'P1' | 'P2' | null
function pemenangBaris_(d) {
  if (String(d.status || '').toUpperCase() !== 'SELESAI' || String(d.pengesahan || '').toUpperCase() !== 'DISAHKAN') return null;
  const s1 = Number(d.skorP1) || 0, s2 = Number(d.skorP2) || 0;
  if (s1 > s2) return 'P1';
  if (s2 > s1) return 'P2';
  const pen = String(d.pemenangPenalti || '').trim();
  if (!pen) return null;
  if (pen === 'P1' || pen === String(d.namaP1)) return 'P1';
  if (pen === 'P2' || pen === String(d.namaP2)) return 'P2';
  return null;
}

function isNamaPlaceholder_(nama) {
  const n = String(nama || '').toUpperCase();
  return !n || n.trim().charAt(0) === '(' || n.indexOf('PEMENANG ') === 0 || n.indexOf('JOHAN KUMPULAN') === 0 || n.indexOf('NAIB JOHAN KUMPULAN') === 0 ||
    n.indexOf('MENANG PERLAWANAN') === 0 || n.indexOf('KALAH PERLAWANAN') === 0;
}

function placeholderKod_(kod) {
  const c = String(kod || '').toUpperCase();
  let m;
  if ((m = /^JOHAN-([A-Z])$/.exec(c))) return 'JOHAN KUMPULAN ' + m[1];
  if ((m = /^NJOHAN-([A-Z])$/.exec(c))) return 'NAIB JOHAN KUMPULAN ' + m[1];
  if ((m = /^MENANG-(\d+)$/.exec(c))) return 'MENANG PERLAWANAN ' + Number(m[1]);
  if ((m = /^KALAH-(\d+)$/.exec(c))) return 'KALAH PERLAWANAN ' + Number(m[1]);
  return null;
}

// Carta liga dikira di pelayan (Menang 3, Seri 1, Kalah 0 | Mata > PG > Jaringan > Kod)
// Pulangkan senarai baris untuk writeStandings_ + maklumat lengkap setiap kumpulan.
function kiraCartaPelayan_(table, out) {
  const groups = {};
  table.rows.forEach(function (r) {
    const d = r.data;
    if (GROUP_STAGES.indexOf(String(d.peringkat || '').toUpperCase()) < 0) return;
    const key = String(d.kategori).toUpperCase() + '|' + String(d.kumpulan).toUpperCase();
    const g = groups[key] || (groups[key] = { kategori: String(d.kategori).toUpperCase(), kumpulan: String(d.kumpulan).toUpperCase(), teams: {}, total: 0, played: 0 });
    g.total++;
    [['kodP1', 'namaP1'], ['kodP2', 'namaP2']].forEach(function (k) {
      const kod = String(d[k[0]] || '');
      if (kod && !g.teams[kod]) g.teams[kod] = { kod: kod, nama: String(d[k[1]] || kod), P: 0, M: 0, S: 0, K: 0, J: 0, B: 0, PG: 0, Mata: 0 };
    });
    if (!pemenangBarisAtauSeri_(d)) return;
    g.played++;
    const t1 = g.teams[String(d.kodP1)], t2 = g.teams[String(d.kodP2)];
    if (!t1 || !t2) return;
    const s1 = Number(d.skorP1) || 0, s2 = Number(d.skorP2) || 0;
    t1.P++; t2.P++; t1.J += s1; t1.B += s2; t2.J += s2; t2.B += s1;
    if (s1 > s2) { t1.M++; t2.K++; t1.Mata += 3; }
    else if (s2 > s1) { t2.M++; t1.K++; t2.Mata += 3; }
    else { t1.S++; t2.S++; t1.Mata++; t2.Mata++; }
  });
  const rows = [];
  Object.keys(groups).sort().forEach(function (key) {
    const g = groups[key];
    const list = Object.keys(g.teams).map(function (k) { const t = g.teams[k]; t.PG = t.J - t.B; return t; });
    list.sort(function (a, b) { return (b.Mata - a.Mata) || (b.PG - a.PG) || (b.J - a.J) || a.kod.localeCompare(b.kod); });
    list.forEach(function (t, i) {
      t.pos = i + 1;
      rows.push({ kategori: g.kategori, kumpulan: g.kumpulan, pos: t.pos, kod: t.kod, nama: t.nama, P: t.P, M: t.M, S: t.S, K: t.K, J: t.J, B: t.B, PG: t.PG, Mata: t.Mata });
    });
    g.complete = g.total > 0 && g.played === g.total && list.length >= 2 && !list.some(function (t) { return isNamaPlaceholder_(t.nama); });
    g.johan = g.complete ? list[0] : null;
    g.naib = g.complete ? list[1] : null;
  });
  if (out) out.groups = groups;
  return rows;
}

function pemenangBarisAtauSeri_(d) {
  return String(d.status || '').toUpperCase() === 'SELESAI' && String(d.pengesahan || '').toUpperCase() === 'DISAHKAN';
}

// Rombakan pelayan: isi semula slot perlawanan kalah mati yang masih MENUNGGU GILIRAN.
// Perlawanan yang sudah bermula / selesai TIDAK diubah di sini (aplikasi Master Admin
// menghantar keputusan "main semula" melalui senarai susulan).
function rombakJadualPelayan_() {
  const sheet = getJadualSheet_();
  const changes = [];
  const amaran = [];
  for (let pusingan = 0; pusingan < 6; pusingan++) {
    const table = readTable_(sheet);
    const info = {};
    const carta = kiraCartaPelayan_(table, info);
    const byKatNo = {};
    table.rows.forEach(function (r) { byKatNo[String(r.data.kategori).toUpperCase() + '|' + Number(r.data.no)] = r.data; });
    const kemas = [];
    table.rows.forEach(function (r) {
      const d = r.data;
      const kat = String(d.kategori).toUpperCase();
      const upd = { id: d.id };
      let ada = false;
      [1, 2].forEach(function (side) {
        const kod = String(d['kodP' + side] || '').toUpperCase();
        let nama = null, m;
        if ((m = /^(JOHAN|NJOHAN)-([A-Z])$/.exec(kod))) {
          const g = info.groups[kat + '|' + m[2]];
          const t = g && g.complete ? (m[1] === 'JOHAN' ? g.johan : g.naib) : null;
          nama = t ? t.nama : placeholderKod_(kod);
        } else if ((m = /^(MENANG|KALAH)-(\d+)$/.exec(kod))) {
          const src = byKatNo[kat + '|' + Number(m[2])];
          const win = src ? pemenangBaris_(src) : null;
          nama = placeholderKod_(kod);
          if (src && win && !isNamaPlaceholder_(src.namaP1) && !isNamaPlaceholder_(src.namaP2)) {
            const menang = win === 'P1' ? src.namaP1 : src.namaP2;
            const kalah = win === 'P1' ? src.namaP2 : src.namaP1;
            nama = m[1] === 'MENANG' ? menang : kalah;
          }
        }
        if (nama === null || String(d['namaP' + side]) === nama) return;
        if (String(d.status || '').toUpperCase() !== 'MENUNGGU GILIRAN') {
          amaran.push(d.id + ' (' + (side === 1 ? 'P1' : 'P2') + '): dijangka "' + nama + '" tetapi perlawanan telah ' + d.status);
          return;
        }
        upd['namaP' + side] = nama;
        ada = true;
        changes.push(d.id + ': ' + nama);
      });
      if (ada) kemas.push(upd);
    });
    if (!kemas.length) {
      if (carta.length) writeStandings_(carta);
      break;
    }
    upsertMatches_(kemas, { admin: true });
  }
  return { perubahan: changes, amaran: amaran.filter(function (v, i, a) { return a.indexOf(v) === i; }) };
}

function pembetulanSkor_(body) {
  const id = normMatchId_(body.matchId);
  if (!id) return { ok: false, error: 'ID perlawanan tidak sah.' };
  const sebab = String(body.sebab || '').replace(/\s+/g, ' ').trim();
  if (sebab.length < 5) return { ok: false, error: 'Sebab pembetulan wajib diisi (sekurang-kurangnya 5 aksara).' };
  const s1 = skorInt_(body.skorP1), s2 = skorInt_(body.skorP2);
  if (s1 === null || s2 === null) return { ok: false, error: 'Skor mesti nombor bulat 0 hingga 99.' };

  const table = readTable_(getJadualSheet_());
  const rec = table.rows.find(function (r) { return String(r.data.id).toUpperCase() === id; });
  if (!rec) return { ok: false, error: 'Perlawanan ' + id + ' tidak dijumpai dalam Jadual_Perlawanan.' };
  const d = rec.data;
  if (!pemenangBarisAtauSeri_(d)) {
    return { ok: false, kod: 'BELUM_SAH', error: id + ' belum DISAHKAN. Gunakan "Tolak" di Peti Kelulusan untuk keputusan yang belum disahkan.' };
  }
  const dikunci = lockedMatchIds_();
  if (dikunci[id]) return { ok: false, kod: 'DIKUNCI', error: id + ' sedang dikunci di gelanggang oleh ' + dikunci[id] + '. Lepaskan kunci dahulu.' };

  // Pemenang penalti: wajib bagi kalah mati yang seri, dibuang bagi kes lain
  let penalti = '';
  if (isKnockoutStage_(d.peringkat) && s1 === s2) {
    const p = String(body.pemenangPenalti || '').toUpperCase();
    if (p !== 'P1' && p !== 'P2') return { ok: false, error: 'Perlawanan kalah mati seri: pilih pemenang penalti.' };
    penalti = p === 'P1' ? String(d.namaP1) : String(d.namaP2);
  }

  const skorLama = (d.skorP1 === null ? '-' : d.skorP1) + ' - ' + (d.skorP2 === null ? '-' : d.skorP2);
  const penLama = String(d.pemenangPenalti || '');
  if (Number(d.skorP1) === s1 && Number(d.skorP2) === s2 && penLama === penalti) {
    return { ok: false, kod: 'TIADA_PERUBAHAN', error: 'Tiada perubahan markah untuk ' + id + '.' };
  }

  const now = new Date();
  const versi = 'PB-' + Utilities.formatDate(now, TIMEZONE, 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
  const mod = String(body.mod || 'MAIN_SEMULA').toUpperCase() === 'KEKAL' ? 'KEKAL' : 'MAIN_SEMULA';
  const kategori = String(d.kategori).toUpperCase();

  // Perlawanan susulan (hasil rombakan aplikasi Master Admin) - ditapis & disahkan
  const byId = {};
  table.rows.forEach(function (r) { byId[String(r.data.id).toUpperCase()] = r.data; });
  const susulan = [];
  const ditolak = [];
  (Array.isArray(body.susulan) ? body.susulan : []).slice(0, 65).forEach(function (s) {
    const sid = normMatchId_(s && s.id);
    if (!sid || sid === id) return;
    const asal = byId[sid];
    if (!asal || String(asal.kategori).toUpperCase() !== kategori) { ditolak.push(sid); return; }
    if (dikunci[sid] || String(asal.status || '').toUpperCase() === 'LIVE') { ditolak.push(sid + ' (LIVE)'); return; }
    const u = { id: sid, versiPembetulan: versi };
    SUSULAN_FIELDS.forEach(function (f) { if (f in s && s[f] !== undefined) u[f] = s[f]; });
    if ('skorP1' in u && u.skorP1 !== '' && u.skorP1 !== null && skorInt_(u.skorP1) === null) { ditolak.push(sid); return; }
    if ('skorP2' in u && u.skorP2 !== '' && u.skorP2 !== null && skorInt_(u.skorP2) === null) { ditolak.push(sid); return; }
    susulan.push(u);
  });
  if (ditolak.some(function (x) { return /LIVE/.test(x); })) {
    return { ok: false, kod: 'SUSULAN_LIVE', error: 'Perlawanan susulan sedang LIVE: ' + ditolak.join(', ') + '. Tangguhkan perlawanan tersebut dahulu.' };
  }

  upsertMatches_([{
    id: id, skorP1: s1, skorP2: s2, pemenangPenalti: penalti, versiPembetulan: versi,
    catatan: ('Dibetulkan (Master Admin) ' + skorLama + ' -> ' + s1 + ' - ' + s2 + ': ' + sebab).slice(0, 500)
  }].concat(susulan), { admin: true });

  // Rombakan pelayan (jaring keselamatan) + carta liga terkini
  const rombak = rombakJadualPelayan_();

  try {
    const sheet = getPembetulanSheet_();
    sheet.appendRow([now, versi, id, kategori, String(d.peringkat), String(d.namaP1) + ' lwn ' + String(d.namaP2),
      skorLama, s1 + ' - ' + s2, penLama, penalti, sebab.slice(0, 300), mod,
      susulan.map(function (x) { return x.id; }).concat(rombak.perubahan).join(', ').slice(0, 1000) || '-',
      String(body.oleh || 'Master Admin').slice(0, 60)]);
    sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    sheet.getRange(sheet.getLastRow(), 2).setNumberFormat('@');
  } catch (err) {
    console.warn('log pembetulan', err);
  }

  return {
    ok: true,
    versi: versi,
    matchId: id,
    susulan: susulan.map(function (x) { return x.id; }),
    ditolak: ditolak,
    rombakan: rombak.perubahan,
    amaran: rombak.amaran,
    masa: now.toISOString()
  };
}

function logKeluarPengadil_(body) {
  const t = String(body.token || '').toLowerCase().replace(/[^a-f0-9]/g, '');
  const sesi = sahkanSesi_(t);
  if (sesi.ok) lepasKunciPengadil_(sesi.ref.id);
  if (t) PropertiesService.getScriptProperties().deleteProperty(SESI_PREFIX + t);
  return { ok: true };
}

function toIso_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  if (v === '' || v === null || v === undefined) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function toDate_(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? '' : d;
}

/* =========================================================
   PEMBANTU SHEET
   ========================================================= */
function getOrCreateSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// Pastikan tab Jadual_Perlawanan wujud & semua lajur yang diperlukan ada
function getJadualSheet_(jenis) {
  const sukan = jenisSukan_(jenis);
  const sheet = getOrCreateSheet_(tabSukan_(sukan, 'jadual'));
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const isEmpty = header.every(function (h) { return h === '' || h === null; });

  if (isEmpty) {
    const defaults = Object.keys(FIELDS).map(function (f) { return tajukJadualSukan_(sukan, f); });
    if (sheet.getMaxColumns() < defaults.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), defaults.length - sheet.getMaxColumns());
    sheet.getRange(1, 1, 1, defaults.length).setValues([defaults]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }

  const found = mapHeader_(header);
  const missing = Object.keys(FIELDS).filter(function (f) { return found[f] === undefined; });
  if (missing.length) {
    const titles = missing.map(function (f) { return tajukJadualSukan_(sukan, f); });
    const lebar = header.length + titles.length;
    if (sheet.getMaxColumns() < lebar) sheet.insertColumnsAfter(sheet.getMaxColumns(), lebar - sheet.getMaxColumns());
    sheet.getRange(1, header.length + 1, 1, titles.length).setValues([titles]).setFontWeight('bold');
  }
  return sheet;
}

function normalizeKey_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapHeader_(header) {
  const colOf = {};
  header.forEach(function (h, i) {
    const k = normalizeKey_(h);
    if (!k) return;
    Object.keys(FIELDS).forEach(function (field) {
      if (colOf[field] !== undefined) return;
      const aliases = FIELDS[field].map(normalizeKey_);
      if (aliases.indexOf(k) >= 0) colOf[field] = i;
    });
  });
  return colOf;
}

function readTable_(sheet) {
  const values = sheet.getDataRange().getValues();
  const colOf = mapHeader_(values[0]);
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const idVal = values[r][colOf.id];
    if (idVal === '' || idVal === null || idVal === undefined) continue;
    const data = {};
    Object.keys(colOf).forEach(function (field) {
      let v = values[r][colOf[field]];
      if (v instanceof Date) v = v.toISOString();
      if ((field === 'skorP1' || field === 'skorP2') && v === '') v = null;
      data[field] = v;
    });
    rows.push({ rowIndex: r, data: data });
  }
  return { values: values, colOf: colOf, rows: rows };
}

function formatDateColumns_(sheet, colOf, totalRows) {
  if (totalRows < 2) return;
  DATE_FIELDS.forEach(function (f) {
    if (colOf[f] === undefined) return;
    sheet.getRange(2, colOf[f] + 1, totalRows - 1, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  });
}

function parseBody_(e) {
  if (!e) throw new Error('Tiada permintaan.');
  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      // Sokongan borang: payload=<json>
      if (e.parameter && e.parameter.payload) return JSON.parse(e.parameter.payload);
      throw new Error('Format JSON tidak sah.');
    }
  }
  if (e.parameter && e.parameter.payload) return JSON.parse(e.parameter.payload);
  if (e.parameter && e.parameter.id) return e.parameter;
  throw new Error('Badan permintaan kosong.');
}

// Bahagian 6: status respons terakhir -> isyarat perubahan hanya dihantar bila penulisan BERJAYA
let RESPONS_OK_ = false;
let RESPONS_OBJ_ = null;   // v1.22.0: respons terakhir (untuk cache anti-bertindih)
function output_(obj, callback) {
  RESPONS_OK_ = !!(obj && obj.ok);
  RESPONS_OBJ_ = obj || null;
  const json = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][\w$.]{0,63}$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================
   FUNGSI MANUAL (jalankan dari editor Apps Script)
   ========================================================= */
// 1) Jalankan sekali untuk memberi kebenaran & menyediakan lajur.
function setupSheet() {
  SpreadsheetApp.getActiveSpreadsheet().setSpreadsheetTimeZone(TIMEZONE);
  const sheet = getJadualSheet_();
  getPengadilSheet_();
  getKunciSheet_();
  getTangguhSheet_();
  getPembetulanSheet_();
  getSandaranSheet_();
  setupDuaSukan();
  SpreadsheetApp.getActiveSpreadsheet().toast('Tab ' + SHEET_JADUAL + ', ' + SHEET_PENGADIL + ', ' + SHEET_KUNCI + ', ' + SHEET_TANGGUH + ', ' + SHEET_PEMBETULAN + ' & ' + SHEET_SANDARAN + ' sedia digunakan.', 'Live Futsal PK KBB', 5);
  return sheet.getName();
}

// 2) Ujian ringkas tanpa aplikasi: kemas kini SR-01.
function testDoPost() {
  const res = doPost({
    postData: {
      contents: JSON.stringify({
        action: 'updateMatch', id: 'SR-01', skorP1: 2, skorP2: 1,
        fasaMasa: 'Separuh 2', status: 'LIVE', pengesahan: 'MENUNGGU', pengadil: 'Cikgu Ali'
      })
    }
  });
  console.log(res.getContent());
}

// 3) Ujian bacaan.
function testDoGet() {
  console.log(doGet({ parameter: { id: 'SR-01' } }).getContent());
}

// 4) Ujian pangkalan data pengadil: cipta, log masuk, senarai.
function testPengadil() {
  const key = getMasterAdminKey_();
  const call = function (obj) {
    return JSON.parse(doPost({ postData: { contents: JSON.stringify(obj) } }).getContent());
  };
  console.log(call({ action: 'simpanPengadil', adminKey: key, pengadil: { nama: 'Ujian Pengadil', password: 'uji1234' } }));
  console.log(call({ action: 'loginPengadil', nama: 'ujian pengadil', password: 'uji1234' }));
  console.log(call({ action: 'senaraiPengadil', adminKey: key }));
}

// 5) Ujian kunci gelanggang (Fasa 2): dua pengadil cuba mengunci Gelanggang A.
function testKunciGelanggang() {
  const key = getMasterAdminKey_();
  const call = function (obj) {
    return JSON.parse(doPost({ postData: { contents: JSON.stringify(obj) } }).getContent());
  };
  call({ action: 'simpanPengadil', adminKey: key, pengadil: { nama: 'Ujian Satu', password: 'uji1111' } });
  call({ action: 'simpanPengadil', adminKey: key, pengadil: { nama: 'Ujian Dua', password: 'uji2222' } });
  const a = call({ action: 'loginPengadil', nama: 'Ujian Satu', password: 'uji1111' });
  const b = call({ action: 'loginPengadil', nama: 'Ujian Dua', password: 'uji2222' });
  console.log('Satu kunci A:', call({ action: 'kunciGelanggang', token: a.token, gelanggang: 'A', matchId: 'SM-01' }).ok);   // true
  console.log('Dua kunci A :', call({ action: 'kunciGelanggang', token: b.token, gelanggang: 'A', matchId: 'SM-01' }));      // DIKUNCI
  console.log('Dua skor A  :', call({ action: 'skorLive', token: b.token, gelanggang: 'A', matchId: 'SM-01', skorP1: 5 })); // HILANG
  console.log('Satu skor A :', call({ action: 'skorLive', token: a.token, gelanggang: 'A', matchId: 'SM-01', skorP1: 1, skorP2: 0, status: 'LIVE' }).ok);
  console.log('Satu lepas  :', call({ action: 'lepasGelanggang', token: a.token, gelanggang: 'A' }).ok);
  call({ action: 'logKeluarPengadil', token: a.token });
  call({ action: 'logKeluarPengadil', token: b.token });
}


// 6) Ujian papan live awam (Fasa 3).
function testPapanLive() {
  console.log(doGet({ parameter: { action: 'live' } }).getContent());
}

// 7) Ujian pembetulan markah (Fasa 4): pengadil DITOLAK, Master Admin DITERIMA.
//    Pastikan SR-01 telah SELESAI & DISAHKAN dalam Jadual_Perlawanan sebelum menjalankan.
function testPembetulan() {
  const key = getMasterAdminKey_();
  const call = function (obj) {
    return JSON.parse(doPost({ postData: { contents: JSON.stringify(obj) } }).getContent());
  };
  call({ action: 'simpanPengadil', adminKey: key, pengadil: { nama: 'Ujian Satu', password: 'uji1111' } });
  const a = call({ action: 'loginPengadil', nama: 'Ujian Satu', password: 'uji1111' });
  console.log('Pengadil betulkan :', call({ action: 'pembetulanSkor', token: a.token, matchId: 'SR-01', skorP1: 3, skorP2: 0, sebab: 'Ujian pengadil' })); // ditolak
  console.log('syncAll tanpa admin:', call({ action: 'updateMatch', id: 'SR-01', skorP1: 9, skorP2: 9 }));                                         // dimuktamad: 1
  console.log('Master Admin      :', call({ action: 'pembetulanSkor', adminKey: key, matchId: 'SR-01', skorP1: 3, skorP2: 0, sebab: 'Ujian pembetulan', mod: 'MAIN_SEMULA' }));
  call({ action: 'logKeluarPengadil', token: a.token });
}

// 8) Ujian Rehat Kecemasan & Ambil Alih (Fasa 5).
//    Pastikan SM-01 belum bermula (MENUNGGU GILIRAN) dalam Jadual_Perlawanan & Gelanggang A kosong.
function testRehatKecemasan() {
  const key = getMasterAdminKey_();
  const call = function (obj) {
    return JSON.parse(doPost({ postData: { contents: JSON.stringify(obj) } }).getContent());
  };
  call({ action: 'simpanPengadil', adminKey: key, pengadil: { nama: 'Ujian Satu', password: 'uji1111' } });
  call({ action: 'simpanPengadil', adminKey: key, pengadil: { nama: 'Ujian Dua', password: 'uji2222' } });
  const a = call({ action: 'loginPengadil', nama: 'Ujian Satu', password: 'uji1111' });
  const b = call({ action: 'loginPengadil', nama: 'Ujian Dua', password: 'uji2222' });
  console.log('A kunci      :', call({ action: 'kunciGelanggang', token: a.token, gelanggang: 'A', matchId: 'SM-01' }).ok);
  console.log('A skor 2-1   :', call({ action: 'skorLive', token: a.token, gelanggang: 'A', matchId: 'SM-01', skorP1: 2, skorP2: 1, status: 'LIVE', fasaMasa: 'Separuh 1' }).ok);
  console.log('A rehat      :', call({ action: 'rehatKecemasan', token: a.token, gelanggang: 'A', matchId: 'SM-01', skorP1: 2, skorP2: 1, fasaSebelum: 'SEPARUH 1', elapsedMs: 420000, sebab: 'Ujian tandas' }).ok);
  console.log('A skor (beku):', call({ action: 'skorLive', token: a.token, gelanggang: 'A', matchId: 'SM-01', skorP1: 5 }).kod);          // REHAT
  console.log('Sync (beku)  :', call({ action: 'updateMatch', id: 'SM-01', skorP1: 9, skorP2: 9 }).dilindungi);                         // 1
  console.log('B ambil alih :', call({ action: 'ambilAlihGelanggang', token: b.token, gelanggang: 'A' }));
  console.log('A sambung    :', call({ action: 'sambungPerlawanan', token: a.token, gelanggang: 'A' }).kod);                            // HILANG
  const sam = call({ action: 'sambungPerlawanan', token: b.token, gelanggang: 'A', matchId: 'SM-01' });
  console.log('B sambung    :', sam.ok, 'skor', sam.perlawanan && sam.perlawanan.skorP1, '-', sam.perlawanan && sam.perlawanan.skorP2); // true 2 - 1
  console.log('B skor 3-1   :', call({ action: 'skorLive', token: b.token, gelanggang: 'A', matchId: 'SM-01', skorP1: 3, skorP2: 1, status: 'LIVE', fasaMasa: 'Separuh 1' }).ok);
  call({ action: 'tangguhAdmin', adminKey: key, gelanggang: 'A', matchId: 'SM-01', sebab: 'Tamat ujian' });
  call({ action: 'logKeluarPengadil', token: a.token });
  call({ action: 'logKeluarPengadil', token: b.token });
}

// v1.9.9: Ujian Urus Gelanggang (jalankan dari editor). Tidak mengubah apa-apa - hanya papar senarai.
function testSenaraiGelanggang() {
  Logger.log(JSON.stringify(bacaGelanggang_()));
  Logger.log('Aktif: ' + gelanggangAktif_().join(', '));
}


/* =========================================================
   RESET EVENT - HARI SEBENAR (Master Admin sahaja) - v1.20.1
   Kembalikan KEDUA-DUA sukan kepada keadaan asal sebelum kejohanan sebenar:
   - FUTSAL   : kosongkan baris perlawanan, carta & semua log. Aplikasi menghantar
                semula jadual asal (syncAll) selepas ini.
   - BADMINTON: kosongkan skor / status / pengadil / pengesahan / masa dalam
                Jadual_Badminton, kembalikan gelanggang & slot kalah mati kepada
                jadual ASAL (bmAsal daripada aplikasi), kosongkan log pengesahan.
   - URUS GELANGGANG: senarai gelanggang Futsal & Badminton kembali kepada lalai,
                susunan Jana Susunan & kunci acara DIPADAM (versi baharu -> semua peranti).
   Senarai_Pengadil, Senarai_Urusetia, Pasukan, Peraturan & Sandaran_Data DIKEKALKAN.
   ========================================================= */
function resetAcara_(body) {
  body = body || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const versiBaru = Date.now();

  // ---------- 1) FUTSAL ----------
  const tab = [SHEET_JADUAL, SHEET_CARTA, SHEET_LOG, SHEET_KUNCI, SHEET_TANGGUH, SHEET_PEMBETULAN, SHEET_SAH_PENGADIL];
  const dikosongkan = [];
  tab.forEach(function (nama) {
    const sh = ss.getSheetByName(nama);
    if (!sh) return;
    const last = sh.getLastRow();
    if (last > 1) {
      sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), 1)).clearContent();
      dikosongkan.push(nama);
    }
  });
  // Urus Gelanggang Futsal -> senarai lalai, tiada susunan / kunci acara
  const gelFutsal = { versi: versiBaru, senarai: JSON.parse(JSON.stringify(GELANGGANG_LALAI)),
    dikemaskini: new Date().toISOString(), susunan: {}, kunciAcara: {} };
  PropertiesService.getScriptProperties().setProperty(PROP_GELANGGANG, JSON.stringify(gelFutsal));
  gelanggangCache_ = gelFutsal;

  // ---------- 2) BADMINTON ----------
  let bm = { ok: false, error: 'Tab ' + SHEET_BM_JADUAL + ' tidak dijumpai.' };
  if (ss.getSheetByName(SHEET_BM_JADUAL)) bm = resetBadmintonAcara_(body.bmAsal, versiBaru);
  const logBm = ss.getSheetByName(tabSukan_('BADMINTON', 'log'));
  if (logBm && logBm.getLastRow() > 1) {
    logBm.getRange(2, 1, logBm.getLastRow() - 1, Math.max(logBm.getLastColumn(), 1)).clearContent();
    dikosongkan.push(logBm.getName());
  }
  if (bm.ok && bm.dikosongkan) dikosongkan.push(SHEET_BM_JADUAL);

  SpreadsheetApp.flush();
  try { CacheService.getScriptCache().removeAll([PAPAN_CACHE_KEY, PAPAN_CACHE_VER, BM_CACHE_KEY]); } catch (e) {}
  try { bustPapanCache_(); } catch (e) { /* abaikan */ }
  try { tandaPerubahan_('FUTSAL'); tandaPerubahan_('BADMINTON'); } catch (e) { /* abaikan */ }
  return { ok: true, versi: API_VERSI, dikosongkan: dikosongkan, senaraiGelanggang: gelFutsal,
    badminton: bm, masa: new Date().toISOString() };
}

// Cari lajur tambahan (cth. Singkatan_P1) melalui nama tajuk
function cariLajur_(header, alias) {
  const k = alias.map(normalizeKey_);
  for (let i = 0; i < header.length; i++) { if (k.indexOf(normalizeKey_(header[i])) >= 0) return i; }
  return -1;
}

function teksSelamat_(v, max) {
  const t = String(v === null || v === undefined ? '' : v).trim().slice(0, max || 120);
  return /^[=+@-]/.test(t) ? '' : t;
}

function resetBadmintonAcara_(bmAsal, versiBaru) {
  const sheet = getJadualSheet_('BADMINTON');
  const table = readTable_(sheet);
  const n = table.values.length - 1;
  const header = table.values[0];
  const c = table.colOf;
  if (n < 1 || c.id === undefined) return { ok: true, baris: 0, dikosongkan: false, senaraiGelanggang: null };

  // Data asal daripada aplikasi (BM_SEED): gelanggang & slot kalah mati
  const asal = {};
  (Array.isArray(bmAsal) ? bmAsal : []).slice(0, 400).forEach(function (x) {
    const id = normBmMatchId_(x && x.id);
    if (!id) return;
    const g = String(x.gelanggang || '').trim().toUpperCase();
    asal[id] = {
      gelanggang: /^[A-Z0-9]{1,3}$/.test(g) ? g : '',
      kalahMati: String(x.peringkat || '').trim().toUpperCase() !== 'PERINGKAT KUMPULAN' && !!String(x.peringkat || '').trim(),
      kodP1: teksSelamat_(x.kodP1, 40).toUpperCase(), kodP2: teksSelamat_(x.kodP2, 40).toUpperCase(),
      namaP1: teksSelamat_(x.namaP1), namaP2: teksSelamat_(x.namaP2)
    };
  });

  // Medan yang dikosongkan / ditetapkan semula
  const kosong = ['skorP1', 'skorP2', 'pemenangPenalti', 'fasaMasa', 'fasaMulaPada', 'pengadil', 'sahPengadil',
    'sahPengadilPada', 'masaMula', 'masaTamat', 'disahkanOleh', 'disahkanPada', 'catatan', 'versiPembetulan', 'kemaskini'];
  const lajur = {};   // colIndex -> array nilai baharu
  const ambil = function (col) {
    if (col === undefined || col < 0) return null;
    if (!lajur[col]) { lajur[col] = []; for (let r = 1; r <= n; r++) lajur[col].push([table.values[r][col]]); }
    return lajur[col];
  };
  const colSing1 = cariLajur_(header, ['Singkatan_P1', 'singkatanp1']);
  const colSing2 = cariLajur_(header, ['Singkatan_P2', 'singkatanp2']);
  const placeholder = function (v) { const t = String(v || '').trim(); return !t || t.charAt(0) === '(' || isNamaPlaceholder_(t); };
  let baris = 0;
  const gelKat = {};   // gelanggang -> { SR: true, SM: true }

  for (let r = 1; r <= n; r++) {
    const row = table.values[r];
    const id = String(row[c.id] || '').trim().toUpperCase();
    if (!id) continue;
    baris++;
    kosong.forEach(function (f) { const a = ambil(c[f]); if (a) a[r - 1][0] = ''; });
    const aSt = ambil(c.status); if (aSt) aSt[r - 1][0] = 'BELUM BERMULA';
    const aSah = ambil(c.pengesahan); if (aSah) aSah[r - 1][0] = 'MENUNGGU';
    const x = asal[id];
    if (x && x.gelanggang) { const aG = ambil(c.gelanggang); if (aG) aG[r - 1][0] = x.gelanggang; }
    // Slot kalah mati yang telah diisi nama pasukan semasa ujian -> kembali kepada kod asal (MENANG-20, JOHAN-A ...)
    if (x && x.kalahMati) {
      [['1', c.namaP1, c.kodP1, colSing1, x.namaP1, x.kodP1], ['2', c.namaP2, c.kodP2, colSing2, x.namaP2, x.kodP2]].forEach(function (s) {
        const aN = ambil(s[1]);
        if (aN && !placeholder(row[s[1]])) aN[r - 1][0] = s[4];
        const aK = ambil(s[2]);
        if (aK && s[5]) aK[r - 1][0] = s[5];
        const aS = ambil(s[3]);
        if (aS && aN && !placeholder(row[s[1]])) aS[r - 1][0] = '';
      });
    }
    const g = String((x && x.gelanggang) || (c.gelanggang !== undefined ? row[c.gelanggang] : '') || '').trim().toUpperCase();
    if (/^[A-Z0-9]{1,3}$/.test(g)) {
      const kat = katBm_({ kategori: c.kategori !== undefined ? row[c.kategori] : '', id: id });
      (gelKat[g] = gelKat[g] || {})[kat || 'X'] = true;
    }
  }
  Object.keys(lajur).forEach(function (col) {
    sheet.getRange(2, Number(col) + 1, n, 1).setValues(lajur[col]);
  });

  // Urus Gelanggang Badminton -> senarai lalai daripada jadual asal, tiada susunan / kunci acara
  const ids = Object.keys(gelKat).sort(function (a, b) { return String(a).localeCompare(String(b), 'ms', { numeric: true }); });
  const senarai = bersihSenaraiGelanggang_(ids.map(function (id) {
    const k = Object.keys(gelKat[id]).filter(function (x) { return x === 'SR' || x === 'SM'; });
    return { id: id, nama: 'Gelanggang ' + id, kategori: 'SEMUA', aktif: true };   // v1.24.0: lalai Terbuka (Master Admin boleh kunci kategori kemudian)
  }));
  let gelBm = null;
  if (senarai.length) {
    gelBm = { versi: versiBaru, senarai: senarai, dikemaskini: new Date().toISOString(), susunan: {}, kunciAcara: {} };
    PropertiesService.getScriptProperties().setProperty(PROP_GELANGGANG_BM, JSON.stringify(gelBm));
  } else {
    PropertiesService.getScriptProperties().deleteProperty(PROP_GELANGGANG_BM);
  }
  gelanggangBmCache_ = null;
  return { ok: true, baris: baris, dikosongkan: true, asalDiterima: Object.keys(asal).length, senaraiGelanggang: gelBm };
}

/* =========================================================
   FUNGSI SUKAN (dahulu dalam Sukan.gs) - v1.16.1
   Digabung ke Code.gs supaya SATU fail sudah lengkap. Tanpa fungsi ini,
   SEMUA permintaan POST (termasuk loginPengadil) gagal dengan ralat
   "jenisSukan_ is not defined". Fail Sukan.gs dalam projek Apps Script
   boleh dipadam (atau dibiarkan - tiada konflik).
   ========================================================= */
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

const PASUKAN_SUKAN_HEADER_ = ['ID_Pasukan', 'ID_Event', 'Kategori', 'Kumpulan', 'Kod', 'Singkatan',
  'Nama_Pasukan', 'Nama_Sekolah', 'Pemain_1', 'Pemain_2', 'Status_Penyertaan', 'Kemaskini_Terakhir'];

function setupDuaSukan() {
  const tabs = [];
  ['FUTSAL', 'BADMINTON'].forEach(function (sukan) {
    const nama = tabSukan_(sukan, 'jadual');
    // Gunakan alias tajuk lama; jangan tambah lajur kedua bagi medan yang sama.
    getJadualSheet_(sukan);
    sediaTabSukan_(tabSukan_(sukan, 'pasukan'), PASUKAN_SUKAN_HEADER_);
    sediaTabSukan_(tabSukan_(sukan, 'peraturan'), ['Bahagian', 'Kod', 'Nilai', 'Keterangan']);
    sediaTabSukan_(tabSukan_(sukan, 'log'), ['Masa', 'Match', 'Keputusan', 'Tindakan', 'Oleh']);
    tabs.push(nama, tabSukan_(sukan, 'pasukan'), tabSukan_(sukan, 'peraturan'), tabSukan_(sukan, 'log'));
  });
  sediaTabSukan_(SHEET_KEJOHANAN, ['ID_Event', 'Sukan', 'Nama_Event', 'Kategori']);
  sediaTabSukan_(SHEET_GELANGGANG_INFO, ['ID_Gelanggang', 'Sukan', 'Nama_Gelanggang', 'Kategori', 'Aktif']);
  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove(BM_CACHE_KEY);
  tandaPerubahan_('FUTSAL'); tandaPerubahan_('BADMINTON');   // Bahagian 6: isyarat awal untuk Dashboard
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
  const sheet = sediaTabSukan_(tabSukan_(sukan, 'pasukan'), PASUKAN_SUKAN_HEADER_);
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
      if (value.length > 120 || /^[=+@-]/.test(value)) throw new Error('Nilai jadual tidak sah (tidak boleh bermula dengan = + - @).');
      next[f] = f === 'gelanggang' || f === 'kodP1' || f === 'kodP2' ? value.toUpperCase() : value;
    }
  });
  if (!next.gelanggang || !next.namaP1 || !next.namaP2) throw new Error('Gelanggang dan kedua-dua pasukan diperlukan.');
  if (next.namaP1.toUpperCase() === next.namaP2.toUpperCase()) throw new Error('Pasukan 1 dan Pasukan 2 mesti berbeza.');
  // Bahagian 6: gelanggang Futsal mesti dalam senarai gelanggang sah (elak perlawanan "hilang" dari papan live)
  if (sukan === 'FUTSAL') {
    const sah = gelanggangSah_();
    if (sah.length && sah.indexOf(next.gelanggang) < 0) throw new Error('Gelanggang ' + next.gelanggang + ' tiada dalam senarai gelanggang Futsal (' + sah.join(', ') + ').');
  }
  const row = table.values[rec.rowIndex].slice();
  fields.forEach(function (f) { row[table.colOf[f]] = next[f]; });
  row[table.colOf.kemaskini] = new Date();
  sheet.getRange(rec.rowIndex + 1, 1, 1, row.length).setValues([row]);
  SpreadsheetApp.flush();
  if (sukan === 'BADMINTON') CacheService.getScriptCache().remove(BM_CACHE_KEY);
  return { ok: true, versi: API_VERSI, sukan: sukan, id: id, sheet: sheet.getName() };
}

function simpanSkorSukan_(body, sukan, oleh) {
  oleh = oleh || 'Master Admin';
  const id = String(body.id || '').trim().toUpperCase();
  const sheet = getJadualSheet_(sukan);
  const table = readTable_(sheet);
  let rec = table.rows.find(function (r) { return String(r.data.id).toUpperCase() === id; });
  // v1.21.0 PRESTASI: rombak awal hanya bila baris ini masih menunggu nama pasukan (sebelum ini setiap simpanan)
  if (sukan === 'BADMINTON' && (!rec || bmBarisPerluRombak_(rec.data))) {
    try { rombakJadualBadminton_(sheet, table); } catch (errR) { console.warn('rombakJadualBadminton_', errR); }
    rec = table.rows.find(function (r) { return String(r.data.id).toUpperCase() === id; });
  }
  if (!rec) throw new Error('Perlawanan tidak dijumpai untuk ' + sukan + '.');
  const d = rec.data;
  // Master Admin boleh menyimpan markah walaupun ada kunci pengadil
  // if (sukan === 'FUTSAL' && lockedMatchIds_()[id]) throw new Error('Skor dikendalikan pengadil. Lepaskan kunci dahulu.');
  if (sukan === 'FUTSAL' && isRowFinal_(table.values[rec.rowIndex], table.colOf)) throw new Error('Keputusan Futsal disahkan: gunakan Pembetulan Markah sedia ada.');
  if (String(d.fasaMasa || '').toUpperCase() === 'REHAT KECEMASAN') throw new Error('Skor dibekukan semasa Rehat Kecemasan.');
  const fields = ['skorP1','skorP2','status','pengesahan','pemenangPenalti'];
  // v1.21.0 PRESTASI: Peti Kelulusan Badminton (asalRingan) -> tiada bacaan tambahan di peranti.
  // Keselamatan dikekalkan: skor mesti sama dengan yang dipaparkan, status mesti TAMAT & belum DISAHKAN.
  const kepRingan = String((body.skor || {}).keputusan || '');
  const ringan = sukan === 'BADMINTON' && body.asalRingan === true && (kepRingan === 'DISAHKAN' || kepRingan === 'DITOLAK');
  if (ringan) {
    if (!body.asal || !samaNilai_(d.skorP1, body.asal.skorP1) || !samaNilai_(d.skorP2, body.asal.skorP2) ||
        statusBaris_(d).indexOf('TAMAT') < 0 || String(d.pengesahan || '').toUpperCase() === 'DISAHKAN') {
      return { ok:false, kod:'LAPUK', versi:API_VERSI, error:'Skor telah berubah. Muat semula sebelum menyimpan.' };
    }
  } else if (!body.asal || fields.some(function (f) { return !samaNilai_(d[f], body.asal[f]); })) return { ok:false, kod:'LAPUK', versi:API_VERSI, error:'Skor telah berubah. Muat semula sebelum menyimpan.' };
  // v1.18.1: Tolak keputusan Badminton (Peti Kelulusan) -> kembali kepada pengadil
  if ((body.skor || {}).keputusan === 'DITOLAK') return tolakKeputusanSukan_(sheet, table, rec, id, sukan, body.skor);
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
  // Bahagian 5: skor sementara Badminton -> perlawanan dipaparkan sebagai SEDANG BERLANGSUNG di Dashboard
  if (!final && sukan === 'BADMINTON' && (statusBaris_(d) === 'MENUNGGU GILIRAN' || statusBaris_(d) === '')) {
    set('status', 'SEDANG BERLANGSUNG');
    if (!d.masaMula) set('masaMula', now);
  }
  if (final) {
    set('status','SELESAI'); set('pengesahan','DISAHKAN'); set('fasaMasa','Tamat');
    set('disahkanOleh',oleh); set('disahkanPada',now);
    if (!d.masaTamat) set('masaTamat',now);
  }
  sheet.getRange(rec.rowIndex+1,1,1,row.length).setValues([row]);
  tambahApprovalLog_([{masa:now.toISOString(),matchId:id,keputusan:s1+' - '+s2,tindakan:final?'SKOR ADMIN DISAHKAN':'SKOR ADMIN SEMENTARA',oleh:oleh}],sukan);
  SpreadsheetApp.flush();
  if (sukan === 'BADMINTON') {
    // v1.20.2: keputusan disahkan -> isi pemenang / Johan kumpulan ke pusingan seterusnya
    // v1.21.0 PRESTASI: guna jadual dalam memori (tiada bacaan semula seluruh tab selepas tulisan)
    if (final) {
      try {
        table.values[rec.rowIndex] = row;
        Object.assign(d, { skorP1: s1, skorP2: s2, status: 'SELESAI', pengesahan: 'DISAHKAN', fasaMasa: 'Tamat' });
        rombakJadualBadminton_(sheet, table);
      } catch (errR) { console.warn('rombakJadualBadminton_', errR); }
    }
    CacheService.getScriptCache().remove(BM_CACHE_KEY);
  }
  else if (final) {
    rombakJadualPelayan_(); lepasKunciMuktamad_();
    // Bahagian 5: Carta Liga di Google Sheets dikira semula selepas keputusan Admin disahkan
    try { const carta = kiraCartaPelayan_(readTable_(getJadualSheet_())); if (carta.length) writeStandings_(carta); }
    catch (errC) { console.warn('kiraCartaPelayan_', errC); }
  }
  return {ok:true,versi:API_VERSI,sukan:sukan,id:id,skorP1:s1,skorP2:s2,keputusan:final?'DISAHKAN':'SEMENTARA'};
}

/* =========================================================
   v1.18.0: PENGADIL BADMINTON - SKOR PERLAWANAN BADMINTON
   - Hanya akaun pengadil BADMINTON (token sesi) diterima. Pengadil Futsal ditolak.
   - jenis 'SEMASA' -> skor sementara (SEDANG BERLANGSUNG di Dashboard).
   - jenis 'TAMAT'  -> keputusan dihantar (TAMAT, MENUNGGU pengesahan Master Admin).
   - Satu perlawanan dipegang oleh SATU pengadil. Pengadil lain hanya boleh mengambil
     alih jika perlawanan terbiar > BM_PENGADIL_TERBIAR_MINIT atau keputusan DITOLAK.
   - Keputusan DISAHKAN tidak boleh diubah oleh pengadil (Master Admin sahaja).
   ========================================================= */
const BM_PENGADIL_TERBIAR_MINIT = 30;

// v1.36.1: tampal satu baris Jadual_Badminton ke dalam cache dataBadminton_ (tanpa baca Sheets).
// Pulangkan true jika berjaya; false -> pemanggil membuang cache seperti biasa.
function tampalCacheBm_(header, row, colId, id) {
  try {
    if (colId === undefined || !header || !row) return false;
    const cache = CacheService.getScriptCache();
    const c = cache.get(BM_CACHE_KEY);
    if (!c) return true;   // tiada cache -> bacaan seterusnya membina semula daripada Sheets
    const d = JSON.parse(c);
    if (!d || !Array.isArray(d.jadual)) return false;
    const kunciId = String(header[colId] === null || header[colId] === undefined ? '' : header[colId]).trim();
    if (!kunciId) return false;
    const idx = d.jadual.findIndex(function (o) { return String(o && o[kunciId] || '').trim().toUpperCase() === id; });
    if (idx < 0) return false;
    const o = {};
    header.forEach(function (h, i) {
      const k = String(h === null || h === undefined ? '' : h).trim();
      if (!k) return;
      let v = row[i];
      if (v instanceof Date) v = v.toISOString();
      o[k] = v;
    });
    d.jadual[idx] = o;
    d.masa = new Date().toISOString();
    delete d.cache;
    const s = JSON.stringify(d);
    if (s.length >= 95000) return false;
    cache.put(BM_CACHE_KEY, s, BM_CACHE_SAAT);
    return true;
  } catch (err) { console.warn('tampalCacheBm_', err); return false; }
}

function skorPengadilBadminton_(body) {
  const sesi = sahkanSesi_(body.token);
  if (!sesi.ok) return sesi;
  const ref = sesi.ref;
  if (ref.sukan !== 'BADMINTON') {
    return { ok: false, kod: 'SUKAN_LAIN', versi: API_VERSI, error: 'Akaun ' + ref.nama + ' ialah pengadil ' + labelSukan_(ref.sukan) +
      '. Hanya pengadil Badminton boleh memberi skor perlawanan Badminton.' };
  }
  const id = String(body.id || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,59}$/.test(id)) return { ok: false, error: 'ID perlawanan tidak sah.' };
  const jenis = String(body.jenis || '').trim().toUpperCase();
  if (jenis !== 'SEMASA' && jenis !== 'TAMAT') return { ok: false, error: 'Jenis penghantaran skor tidak sah.' };
  const s1 = skorInt_(body.skorP1), s2 = skorInt_(body.skorP2);
  if (s1 === null || s2 === null) return { ok: false, error: 'Skor mesti nombor bulat 0 hingga 99.' };
  if (jenis === 'TAMAT' && s1 === s2) return { ok: false, error: 'Keputusan Badminton tidak boleh seri.' };

  const sheet = getJadualSheet_('BADMINTON');
  const table = readTable_(sheet);
  let rec = table.rows.find(function (r) { return String(r.data.id).toUpperCase() === id; });
  // v1.21.0 PRESTASI: autosimpan skor (setiap 1.2 s) tidak lagi merombak seluruh jadual & membaca tab pasukan
  if (!rec || bmBarisPerluRombak_(rec.data)) {
    try { rombakJadualBadminton_(sheet, table); } catch (errR) { console.warn('rombakJadualBadminton_', errR); }
    rec = table.rows.find(function (r) { return String(r.data.id).toUpperCase() === id; });
  }
  if (!rec) return { ok: false, error: 'Perlawanan ' + id + ' tidak dijumpai dalam jadual Badminton.' };
  const d = rec.data;
  const status = statusBaris_(d);
  const sah = String(d.pengesahan || '').trim().toUpperCase();
  if (sah === 'DISAHKAN' || status === 'SELESAI') {
    return { ok: false, kod: 'MUKTAMAD', error: 'Keputusan ' + id + ' telah disahkan Master Admin. Hubungi Master Admin untuk pembetulan.' };
  }
  if (!d.namaP1 || !d.namaP2 || isNamaPlaceholder_(d.namaP1) || isNamaPlaceholder_(d.namaP2) ||
      String(d.namaP1).charAt(0) === '(' || String(d.namaP2).charAt(0) === '(') {
    return { ok: false, error: 'Pasukan bertanding bagi ' + id + ' belum lengkap.' };
  }
  const lama = String(d.pengadil || '').trim();
  if (lama && refNameKey_(lama) !== refNameKey_(ref.nama) && sah !== 'DITOLAK') {
    if (status === 'TAMAT - TUNGGU SAH') {
      return { ok: false, kod: 'DIKUNCI', error: 'Keputusan ' + id + ' telah dihantar oleh pengadil ' + lama + ' dan sedang menunggu pengesahan Master Admin.' };
    }
    const kemas = d.kemaskini ? new Date(d.kemaskini).getTime() : 0;
    if (status === 'LIVE' && kemas && !isNaN(kemas) && Date.now() - kemas < BM_PENGADIL_TERBIAR_MINIT * 60000) {
      return { ok: false, kod: 'DIKUNCI', error: 'Perlawanan ' + id + ' sedang diadili oleh pengadil ' + lama + '.' };
    }
  }

  if (jenis === 'SEMASA' && bmBelumMula_(d)) BM_BARU_MULA_ = true;   // v1.23.4: perlawanan baru bermula -> auto-isi gelanggang kosong
  const now = new Date();
  const row = table.values[rec.rowIndex].slice();
  const set = function (f, v) { if (table.colOf[f] !== undefined) row[table.colOf[f]] = v; };
  set('skorP1', s1); set('skorP2', s2); set('pengadil', ref.nama); set('kemaskini', now);
  if (!d.masaMula) set('masaMula', now);
  if (jenis === 'TAMAT') {
    set('status', 'TAMAT'); set('pengesahan', 'MENUNGGU'); set('fasaMasa', 'Tamat');
    set('masaTamat', now); set('sahPengadil', ref.nama); set('sahPengadilPada', now);
  } else {
    set('status', 'SEDANG BERLANGSUNG');
    if (sah === 'DITOLAK' || status === 'TAMAT - TUNGGU SAH') set('pengesahan', 'MENUNGGU');
    set('sahPengadil', ''); set('sahPengadilPada', '');
  }
  sheet.getRange(rec.rowIndex + 1, 1, 1, row.length).setValues([row]);
  if (jenis === 'TAMAT') {
    tambahApprovalLog_([{ masa: now.toISOString(), matchId: id, keputusan: s1 + ' - ' + s2,
      tindakan: 'KEPUTUSAN PENGADIL (TUNGGU SAH)', oleh: 'Pengadil ' + ref.nama }], 'BADMINTON');
  }
  SpreadsheetApp.flush();
  // v1.36.1 PRESTASI SERENTAK: skor SEMASA tidak lagi membuang cache papan Badminton.
  // Baris yang baru ditulis ditampal terus ke dalam cache -> papan / projektor / telefon
  // penonton tidak perlu membaca semula 6 tab Google Sheets selepas SETIAP mata
  // (sebelum ini 6 gelanggang serentak menyebabkan pelayan sesak & skor lewat berminit-minit).
  if (jenis !== 'SEMASA' || !tampalCacheBm_(table.values[0], row, table.colOf.id, id)) {
    CacheService.getScriptCache().remove(BM_CACHE_KEY);
  }
  return { ok: true, versi: API_VERSI, sukan: 'BADMINTON', id: id, skorP1: s1, skorP2: s2, jenis: jenis,
    status: jenis === 'TAMAT' ? 'TAMAT' : 'SEDANG BERLANGSUNG', pengadil: ref.nama };
}


/* =========================================================
   v1.18.1: TOLAK KEPUTUSAN BADMINTON (PETI KELULUSAN)
   - Hanya Master Admin (disemak dalam doPost sebelum simpanSkorSukan_).
   - Hanya perlawanan TAMAT - TUNGGU SAH (belum disahkan) boleh ditolak.
   - Status kembali SEDANG BERLANGSUNG, pengesahan DITOLAK -> pengadil boleh hantar semula.
   ========================================================= */
function tolakKeputusanSukan_(sheet, table, rec, id, sukan, x) {
  if (sukan !== 'BADMINTON') throw new Error('Tolak keputusan Futsal menggunakan Peti Kelulusan sedia ada.');
  const d = rec.data;
  if (String(d.pengesahan || '').toUpperCase() === 'DISAHKAN' || statusBaris_(d) === 'SELESAI') {
    throw new Error('Keputusan ' + id + ' telah disahkan dan tidak boleh ditolak.');
  }
  if (statusBaris_(d) !== 'TAMAT - TUNGGU SAH') throw new Error('Perlawanan ' + id + ' tidak menunggu pengesahan.');
  const sebab = String((x && x.catatan) || '').trim().replace(/^[=+@-]+/, '').slice(0, 200) || 'Skor perlu disemak semula';
  const now = new Date();
  const row = table.values[rec.rowIndex].slice();
  const set = function (f, v) { if (table.colOf[f] !== undefined) row[table.colOf[f]] = v; };
  set('status', 'SEDANG BERLANGSUNG'); set('pengesahan', 'DITOLAK'); set('fasaMasa', '');
  set('masaTamat', ''); set('sahPengadil', ''); set('sahPengadilPada', '');
  set('catatan', sebab); set('kemaskini', now);
  sheet.getRange(rec.rowIndex + 1, 1, 1, row.length).setValues([row]);
  tambahApprovalLog_([{ masa: now.toISOString(), matchId: id, keputusan: (d.skorP1 === null ? 0 : d.skorP1) + ' - ' + (d.skorP2 === null ? 0 : d.skorP2),
    tindakan: 'DITOLAK: ' + sebab, oleh: 'Master Admin' }], sukan);
  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove(BM_CACHE_KEY);
  return { ok: true, versi: API_VERSI, sukan: sukan, id: id, keputusan: 'DITOLAK', catatan: sebab };
}


/* =========================================================
   v1.20.2: KALAH MATI BADMINTON - ISI NAMA PASUKAN AUTOMATIK
   Punca pepijat: keputusan Badminton yang DISAHKAN tidak pernah mengisi slot
   kalah mati (JOHAN-A, NJOHAN-B, MENANG-10 ...) dalam tab Jadual_Badminton.
   Nama pasukan kekal kosong / "(MENUNGGU KEPUTUSAN)" -> butang pengadil terkunci
   dan pelayan menolak skor ("Pasukan bertanding belum lengkap").
   Fungsi ini:
   - Kira carta setiap kumpulan (Menang 3 / Kalah 0 | Mata > Beza Mata > Kod),
     sama seperti aplikasi (bmStandings).
   - Isi JOHAN-x / NJOHAN-x bila SEMUA perlawanan kumpulan x disahkan dan tiada seri.
   - Isi MENANG-n / KALAH-n bila perlawanan n disahkan.
   - Hanya slot yang masih placeholder & BELUM BERMULA diubah (nama yang diisi
     manual oleh Master Admin tidak ditimpa).
   - Dipanggil: selepas keputusan Badminton disahkan, sebelum skor pengadil / admin
     disimpan, dan semasa ?action=read&sukan=BADMINTON (pulih sendiri).
   ========================================================= */
function bmNamaPlaceholder_(n) {
  const t = String(n === null || n === undefined ? '' : n).trim();
  return !t || t.charAt(0) === '(' || isNamaPlaceholder_(t);
}

function bmLulus_(d) {
  if (String(d.pengesahan || '').trim().toUpperCase() !== 'DISAHKAN' && statusBaris_(d) !== 'SELESAI') return false;
  if (d.skorP1 === null || d.skorP1 === '' || d.skorP2 === null || d.skorP2 === '') return false;
  const a = Number(d.skorP1), b = Number(d.skorP2);
  return isFinite(a) && isFinite(b) && a !== b;
}

// v1.21.0 PRESTASI: rombak semasa GET read dihadkan sekali setiap 45 s (pulih sendiri selepas suntingan manual Sheets).
const BM_ROMBAK_BACA_KEY = 'BM_ROMBAK_BACA_V121';
function bmRombakBacaPerlu_() {
  try {
    const c = CacheService.getScriptCache();
    if (c.get(BM_ROMBAK_BACA_KEY)) return false;
    c.put(BM_ROMBAK_BACA_KEY, '1', 45);
  } catch (err) { /* cache pilihan sahaja */ }
  return true;
}

// v1.21.0 PRESTASI: adakah baris ini memerlukan rombakan (nama pasukan masih placeholder)?
function bmBarisPerluRombak_(d) {
  return !!d && (bmNamaPlaceholder_(d.namaP1) || bmNamaPlaceholder_(d.namaP2));
}

// v1.21.0 PRESTASI: tab pasukan Badminton dibaca SEKALI sahaja bagi setiap permintaan
let BM_PASUKAN_MEMO_ = null;
function bmPasukanAktif_() {
  if (BM_PASUKAN_MEMO_) return BM_PASUKAN_MEMO_;
  BM_PASUKAN_MEMO_ = bmPasukanAktif0_();
  return BM_PASUKAN_MEMO_;
}
function bmPasukanAktif0_() {
  const out = { aktif: null, sing: {} };
  let list = null;
  try { list = bacaObjekSheet_(SHEET_BM_PASUKAN); } catch (err) { list = null; }
  if (!list || !list.length) return out;
  out.aktif = {};
  list.forEach(function (o) {
    const g = {};
    Object.keys(o).forEach(function (k) { g[normalizeKey_(k)] = o[k]; });
    const ev = String(g.idevent || '').trim().toUpperCase();
    const kat = ev.slice(-2) === 'SR' || ev.slice(-2) === 'SM' ? ev.slice(-2)
      : (String(g.kategori || '').toUpperCase().indexOf('RENDAH') >= 0 ? 'SR' : 'SM');
    const kod = String(g.kod || '').trim().toUpperCase();
    const status = String(g.statuspenyertaan || 'AKTIF').trim().toUpperCase() || 'AKTIF';
    const nama = String(g.namapasukan || g.namasekolah || '').trim();
    if (kod && status === 'AKTIF') out.aktif[kat + '|' + kod] = true;
    if (nama && g.singkatan) out.sing[nama.toUpperCase()] = String(g.singkatan).trim();
  });
  return out;
}

function bmCartaKumpulan_(rows, pasukan) {
  const groups = {};
  rows.forEach(function (r) {
    const d = r.data;
    if (String(d.peringkat || '').trim().toUpperCase() !== 'PERINGKAT KUMPULAN') return;
    const kat = katBm_(d), kum = String(d.kumpulan || '').trim().toUpperCase();
    if (!kat || !kum || kum === '-') return;
    const key = kat + '|' + kum;
    const g = groups[key] || (groups[key] = { teams: {}, total: 0, done: 0 });
    g.total++;
    [['kodP1', 'namaP1'], ['kodP2', 'namaP2']].forEach(function (k) {
      const kod = String(d[k[0]] || '').trim().toUpperCase();
      if (!kod || g.teams[kod]) return;
      if (pasukan.aktif && !pasukan.aktif[kat + '|' + kod]) return;   // pasukan tarik diri
      g.teams[kod] = { kod: kod, nama: String(d[k[1]] || '').trim(), P: 0, Mata: 0, MD: 0, ML: 0 };
    });
  });
  rows.forEach(function (r) {
    const d = r.data;
    if (String(d.peringkat || '').trim().toUpperCase() !== 'PERINGKAT KUMPULAN' || !bmLulus_(d)) return;
    const g = groups[katBm_(d) + '|' + String(d.kumpulan || '').trim().toUpperCase()];
    if (!g) return;
    g.done++;
    const a = g.teams[String(d.kodP1 || '').trim().toUpperCase()], b = g.teams[String(d.kodP2 || '').trim().toUpperCase()];
    if (!a || !b) return;
    const s1 = Number(d.skorP1), s2 = Number(d.skorP2);
    a.P++; b.P++; a.MD += s1; a.ML += s2; b.MD += s2; b.ML += s1;
    if (s1 > s2) a.Mata += 3; else b.Mata += 3;
  });
  Object.keys(groups).forEach(function (key) {
    const g = groups[key];
    const list = Object.keys(g.teams).map(function (k) { const t = g.teams[k]; t.BM = t.MD - t.ML; return t; });
    list.sort(function (x, y) { return (y.Mata - x.Mata) || (y.BM - x.BM) || x.kod.localeCompare(y.kod); });
    const sama = function (x, y) { return !!x && !!y && x.Mata === y.Mata && x.BM === y.BM && x.P > 0; };
    list.forEach(function (t, i) { t.seri = t.P > 0 && (sama(t, list[i - 1]) || sama(t, list[i + 1])); });
    g.list = list;
    g.complete = g.total > 0 && g.done === g.total && list.length >= 2 &&
      !list.some(function (t) { return bmNamaPlaceholder_(t.nama); });
  });
  return groups;
}

// sheet/table pilihan: jika diberi, table.rows[].data & table.values dikemas kini terus (tiada bacaan semula).
function rombakJadualBadminton_(sheet, table) {
  sheet = sheet || getJadualSheet_('BADMINTON');
  table = table || readTable_(sheet);
  const colOf = table.colOf;
  if (colOf.namaP1 === undefined || colOf.namaP2 === undefined || colOf.kodP1 === undefined || colOf.kodP2 === undefined) return { perubahan: [] };
  const header = (table.values[0] || []).map(normalizeKey_);
  const colSing = { 1: header.indexOf('singkatanp1'), 2: header.indexOf('singkatanp2') };

  const ada = table.rows.some(function (r) {
    return /^(N?JOHAN|MENANG|KALAH)-/.test(String(r.data.kodP1 || '').toUpperCase()) ||
           /^(N?JOHAN|MENANG|KALAH)-/.test(String(r.data.kodP2 || '').toUpperCase());
  });
  if (!ada) return { perubahan: [] };
  // v1.21.0 PRESTASI: semua slot kalah mati sudah berisi -> keluar terus (tiada bacaan tab pasukan / pengiraan carta)
  const kodSlot = /^(N?JOHAN|MENANG|KALAH)-/;
  const adaSlotKosong = table.rows.some(function (r) {
    const d = r.data;
    if (!bmBelumMula_(d)) return false;
    return (kodSlot.test(String(d.kodP1 || '').toUpperCase()) && bmNamaPlaceholder_(d.namaP1)) ||
           (kodSlot.test(String(d.kodP2 || '').toUpperCase()) && bmNamaPlaceholder_(d.namaP2));
  });
  if (!adaSlotKosong) return { perubahan: [] };

  const pasukan = bmPasukanAktif_();
  const groups = bmCartaKumpulan_(table.rows, pasukan);
  const urut = table.rows.slice().sort(function (a, b) {
    const ka = katBm_(a.data), kb = katBm_(b.data);
    return ka === kb ? (Number(a.data.no) || 0) - (Number(b.data.no) || 0) : (ka < kb ? -1 : 1);
  });
  const byKatNo = {};
  urut.forEach(function (r) { byKatNo[katBm_(r.data) + '|' + (Number(r.data.no) || 0)] = r.data; });

  const tulis = [];
  const perubahan = [];
  urut.forEach(function (r) {   // ikut No_Per -> QF diisi sebelum SF, SF sebelum Akhir
    const d = r.data;
    const kat = katBm_(d);
    [1, 2].forEach(function (side) {
      const kod = String(d['kodP' + side] || '').trim().toUpperCase();
      let nama = null, m;
      if ((m = /^(N?)JOHAN-([A-Z])$/.exec(kod))) {
        const g = groups[kat + '|' + m[2]];
        if (g && g.complete) {
          const t = g.list[m[1] ? 1 : 0];
          if (t && !t.seri) nama = t.nama;
        }
      } else if ((m = /^(MENANG|KALAH)-(\d+)$/.exec(kod))) {
        const src = byKatNo[kat + '|' + Number(m[2])];
        if (src && bmLulus_(src) && !bmNamaPlaceholder_(src.namaP1) && !bmNamaPlaceholder_(src.namaP2)) {
          const p1Menang = Number(src.skorP1) > Number(src.skorP2);
          const menang = p1Menang ? src.namaP1 : src.namaP2, kalah = p1Menang ? src.namaP2 : src.namaP1;
          nama = String(m[1] === 'MENANG' ? menang : kalah).trim();
        }
      }
      if (!nama || !bmNamaPlaceholder_(d['namaP' + side]) || !bmBelumMula_(d)) return;
      d['namaP' + side] = nama;
      table.values[r.rowIndex][colOf['namaP' + side]] = nama;
      tulis.push([r.rowIndex + 1, colOf['namaP' + side] + 1, nama]);
      const sing = pasukan.sing[nama.toUpperCase()];
      if (sing && colSing[side] >= 0 && !String(table.values[r.rowIndex][colSing[side]] || '').trim()) {
        table.values[r.rowIndex][colSing[side]] = sing;
        tulis.push([r.rowIndex + 1, colSing[side] + 1, sing]);
      }
      perubahan.push(d.id + ' P' + side + ': ' + nama);
    });
  });
  if (!tulis.length) return { perubahan: [] };
  tulis.forEach(function (t) { sheet.getRange(t[0], t[1]).setValue(t[2]); });
  SpreadsheetApp.flush();
  try { CacheService.getScriptCache().remove(BM_CACHE_KEY); } catch (err) { /* abaikan */ }
  try {
    tambahApprovalLog_([{ masa: new Date().toISOString(), matchId: '-', keputusan: perubahan.join(' | ').slice(0, 450),
      tindakan: 'KALAH MATI DIISI AUTOMATIK', oleh: 'Sistem' }], 'BADMINTON');
  } catch (err) { /* log pilihan sahaja */ }
  return { perubahan: perubahan };
}

// Jalankan manual dari editor Apps Script jika perlu (cth. selepas import jadual).
function isiKalahMatiBadminton() {
  const giliran = dapatKunciGiliran_(30000);
  if (!giliran) throw new Error('Pelayan sibuk. Cuba lagi sebentar.');
  const lock = giliran.lock;
  try {
    const res = rombakJadualBadminton_();
    console.log(res.perubahan.length ? res.perubahan.join('\n') : 'Tiada slot kalah mati Badminton yang perlu diisi.');
    return res;
  } finally { lock.releaseLock(); }
}
