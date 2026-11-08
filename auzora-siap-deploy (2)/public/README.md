# iki — Music & Lyrics

Gabungan project **Music Player** + **Lyrics Search** dalam satu aplikasi (FastAPI + ytmusicapi + frontend PWA).

## Fitur yang terhubung
- **Putar lagu → lihat liriknya**: tombol **Lirik** di player penuh dan ikon lirik di mini player.
- **Lirik ikut berganti** otomatis saat lagu yang diputar berganti (auto-next).
- **Menu titik tiga** di setiap lagu: *Putar lagu · Lihat lirik · Tambahkan ke playlist*.
  Lirik bisa dibaca tanpa mengganti lagu yang sedang diputar.
- **Satu koleksi**: "Lagu yang Disukai" & playlist dipakai bersama (satu IndexedDB `SannMusicDB`).

## Struktur
```
api/index.py     -> backend tunggal (search, home, lyrics, charts, album)
public/          -> frontend (index.html, script.js, style.css, sw.js, manifest.json, gambar)
vercel.json      -> routing Vercel
requirements.txt -> fastapi, ytmusicapi
```

## Endpoint
| Endpoint | Keterangan |
|---|---|
| `GET /api/search?query=...` | Cari lagu (format ringan) |
| `GET /api/lyrics?video_id=...` | Lirik lagu |
| `GET /api/home` | Semua section beranda sekaligus (paralel) |
| `GET /api/charts`, `GET /api/album?browse_id=...` | Bawaan project Lirik |

## Deploy ke Vercel
1. Upload isi folder ini ke repo GitHub (`api/`, `public/`, `vercel.json`, `requirements.txt` harus ada di **root** repo).
2. Di Vercel: **Add New → Project → Import** repo tersebut. Framework Preset: **Other**. Tidak perlu environment variable.
3. Klik **Deploy**.

Atau lewat CLI: `npm i -g vercel && vercel --prod`

## Tes lokal (opsional)
```bash
pip install -r requirements.txt uvicorn
uvicorn api.index:app --reload        # backend di :8000
```
Untuk frontend + API sekaligus seperti di Vercel, paling mudah pakai `vercel dev`.

## v3.2.0 — Dynamic Bar & pemutaran di latar belakang
- **Dynamic bar** (gaya Dynamic Island) di atas layar: cover, judul, equalizer, progress, prev/play/next, lirik.
- **Sumber Audius** (audio langsung lewat `<audio>`): inilah yang tetap berbunyi saat layar mati / pindah aplikasi.
  Ada di beranda ("Trending Audius") dan di halaman Cari (pilih pill **Audius • Latar belakang**). Tidak butuh API key dan tidak perlu mengubah backend.
- **Sumber YouTube** tetap ada, tetapi video YouTube yang disematkan dijeda oleh browser HP saat halaman ditinggalkan (batasan browser/YouTube).
- `sw.js` tidak lagi mencegat jaringan supaya streaming audio tidak terganggu.

## v3.3.0 — Fitur baru
- **Dynamic Island** (Developer › Tampilan): gaya, sudut, cahaya, posisi, ukuran, preset. Di Chrome desktop kapsul ikut melayang (Document PiP) saat pindah tab.
- **Statistik & Recap**: Koleksi Kamu › kartu Statistik. Periode tahun / 30 hari / sepanjang waktu, tampilan cerita + poster PNG. Data disimpan lokal (localStorage `auPlays`).
- **Impor playlist** Spotify (maks. 100 lagu) & Apple Music: ikon unduh di Koleksi Kamu. Endpoint `GET /api/import?url=`.
- **Pencarian**: Terakhir diputar, Paling sering diputar, Artis favorit, Genre pilihan.
- **Bagikan lirik sebagai gambar** (4 latar, Square/Story, font, ketebalan, rata teks, warna) dan **terjemahan lirik** (Google gratis; DeepL lewat `POST /api/deepl`).
- **Mode Ambient** (tombol di pemutar), **widget Auralys Glass**, **artwork beranimasi** (default mati).

## v3.3.2 — Perbaikan
- Pengaturan: efek lensa & blur berat dimatikan di halaman itu (penyebab crash di mode kaca penuh), animasi latar dijeda.
- Latar diperluas (tidak ada pita hitam), pemudar di belakang mini player & navbar, kolom cari lebih kecil dan keyboard tidak muncul sendiri.
- Tombol putar playlist ⇄ jeda; setelah playlist habis lanjut rekomendasi dari lagu terakhir.
- Lirik: dipilih yang tersinkron (LRCLIB) dan durasinya cocok; baris aktif ikut menyorot. Bahasa terjemahan default mengikuti bahasa HP.
- Lagu yang terjeda sendiri karena gangguan suara dilanjutkan otomatis (maks. 3 kali), kecuali pengguna yang menjeda.

## v3.3.3 — Lirik Sinkron (Time-Synced Lyrics)
- Lirik berjalan otomatis: baris aktif disorot & dibesarkan, baris yang sudah lewat diredupkan, layar menggulir ke tengah (cek tiap 250 ms, pencarian biner).
- **Ketuk baris lirik** untuk loncat ke bagian itu di lagu.
- **Offset sinkron** (Lambat / Cepat, ±0,5 dtk, tersimpan per lagu) bila lirik terasa sedikit meleset; ketuk angka untuk reset.
- Menggulir manual menjeda auto-scroll 4 detik, lalu kembali mengikuti.
- **Terjemahan tetap tersinkron** (terjemahan tampil per baris di bawah teks asli); "Tampilkan asli" kini mengembalikan lirik tersinkron.
- Backend: pencarian LRCLIB lebih akurat (pencocokan persis + judul dibersihkan dari "(Official Video)" dkk, toleransi durasi bertahap, dukungan banyak cap waktu per baris).
- Lagu tanpa lirik tersinkron tetap menampilkan lirik biasa. Lagu Audius belum punya lirik.
- **Sampul Liquid Glass di layar kunci**: kartu media Android digambar oleh sistem (tidak bisa di-style dari web), jadi yang diubah adalah gambar sampulnya: latar blur, bingkai kaca, kilau. Matikan dengan `localStorage.auGlassArt = '0'`. Bila gambar tidak bisa dibaca (CORS), sampul asli dipakai.
- **Tata letak beda untuk HP dan web**: layar lebar dengan mouse (≥ 900 px) → navigasi jadi **sidebar kiri** vertikal dan mini player jadi **bar lebar di bawah** (di sebelah kanan sidebar). HP tetap kapsul navigasi di bawah. Geser-untuk-pindah-halaman dimatikan di desktop.
- **Impor Spotify lebih mudah**: kartu "Impor playlist" terlihat di Koleksi Kamu, tombol Tempel (clipboard), progress bar, link dari teks bagikan / URI `spotify:playlist:ID` / link pendek `spotify.link` diterima, lagu ganda dibuang. Tetap lewat link publik (API resmi Spotify kini butuh Premium + batas 5 pengguna). Maks. 100 lagu per playlist.
