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
