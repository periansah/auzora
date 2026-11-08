# api/index.py  -- Backend gabungan: Musik + Lirik (FastAPI + ytmusicapi)
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode, urlparse

from fastapi import Body, FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ytmusicapi import YTMusic

app = FastAPI(title="iki - Music & Lyrics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ytmusic = YTMusic()

# Cache di edge Vercel (CDN). Lebih andal daripada variabel global di serverless,
# karena memori global hilang setiap instance baru dibuat.
CACHE_SEARCH = "public, s-maxage=600, stale-while-revalidate=1800"
CACHE_HOME = "public, s-maxage=1800, stale-while-revalidate=3600"
CACHE_LYRICS = "public, s-maxage=86400, stale-while-revalidate=604800"


def format_results(search_results):
    """Ubah hasil mentah ytmusicapi menjadi format ringan untuk frontend."""
    cleaned = []
    for item in search_results or []:
        if "videoId" not in item:
            continue
        artists = item.get("artists") or []
        thumbs = item.get("thumbnails") or []
        cleaned.append({
            "videoId": item["videoId"],
            "title": item.get("title", "Unknown Title"),
            "artist": artists[0]["name"] if artists and "name" in artists[0] else "Unknown Artist",
            "thumbnail": thumbs[-1]["url"] if thumbs else "",
        })
    return cleaned


def error(message: str, status_code: int = 200):
    # Error tidak boleh ikut ter-cache oleh CDN
    return JSONResponse(
        {"status": "error", "message": message},
        status_code=status_code,
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/search")
def search_music(query: str, response: Response):
    try:
        results = ytmusic.search(query, filter="songs", limit=12)
        response.headers["Cache-Control"] = CACHE_SEARCH
        return {"status": "success", "data": format_results(results)}
    except Exception as e:
        return error(str(e))


HOME_QUERIES = {
    "recent": ("lagu indonesia hits terbaru", 4),
    "anyar": ("lagu pop indonesia rilis terbaru anyar", 8),
    "gembira": ("lagu ceria gembira semangat", 8),
    "charts": ("top 50 indonesia playlist update", 8),
    "galau": ("lagu galau sedih indonesia terpopuler", 8),
    "baru": ("lagu viral terbaru 2026", 8),
    "tiktok": ("lagu fyp tiktok viral jedag jedug", 8),
    "artists": ("penyanyi pop indonesia paling hits", 8),
}


@app.get("/api/home")
def get_home_data(response: Response):
    """Semua section beranda dalam 1 request (dijalankan paralel agar tidak timeout)."""
    def run(item):
        key, (q, limit) = item
        return key, format_results(ytmusic.search(q, filter="songs", limit=limit))

    try:
        with ThreadPoolExecutor(max_workers=8) as pool:
            data = dict(pool.map(run, HOME_QUERIES.items()))
        response.headers["Cache-Control"] = CACHE_HOME
        return {"status": "success", "data": data}
    except Exception as e:
        return error(str(e))


def _clean_title(t: str) -> str:
    """Buang embel-embel seperti (Official Video), [Lyrics], - Remastered agar pencarian lirik lebih tepat."""
    t = re.sub(r"[\(\[][^\)\]]*(official|video|audio|lyric|lirik|mv|clip|remaster|live|visuali[sz]er|ost)[^\)\]]*[\)\]]", "", t, flags=re.I)
    t = re.sub(r"\s*[-|]\s*(official.*|lyrics?.*|lirik.*|remaster.*)$", "", t, flags=re.I)
    return re.sub(r"\s+", " ", t).strip()


def _parse_lrc(text: str):
    """Parse LRC -> [[detik, teks], ...]. Mendukung beberapa cap waktu dalam satu baris."""
    out = []
    for ln in (text or "").splitlines():
        stamps = re.findall(r"\[(\d+):(\d+(?:\.\d+)?)\]", ln)
        if not stamps:
            continue
        body = re.sub(r"\[\d+:\d+(?:\.\d+)?\]", "", ln).strip()
        for mm, ss in stamps:
            out.append([round(int(mm) * 60 + float(ss), 2), body])
    out.sort(key=lambda x: x[0])
    return out


def _lrclib(title: str, artist: str, duration: int):
    """Cari lirik tersinkron (LRC) di LRCLIB. Urutan: pencocokan persis -> pencarian terstruktur -> pencarian bebas."""
    ct = _clean_title(title)
    cands = []

    def add(items):
        if isinstance(items, dict):
            items = [items]
        for it in items or []:
            if isinstance(it, dict) and it.get("syncedLyrics") and not it.get("instrumental"):
                cands.append(it)

    if duration:  # pencocokan persis (paling akurat)
        try:
            add(json.loads(_fetch("https://lrclib.net/api/get?" + urlencode(
                {"track_name": ct, "artist_name": artist, "duration": duration}))))
        except Exception:
            pass
    queries = [{"track_name": ct, "artist_name": artist}, {"q": (ct + " " + artist).strip()}]
    if ct != title:
        queries.insert(1, {"track_name": title, "artist_name": artist})
    for q in queries:
        if len(cands) >= 5:
            break
        try:
            add(json.loads(_fetch("https://lrclib.net/api/search?" + urlencode(q))))
        except Exception:
            continue

    best = None
    for tol in ((4, 8) if duration else (None,)):   # coba toleransi ketat dulu, lalu longgar
        for it in cands:
            d = it.get("duration") or 0
            if tol is not None and abs(d - duration) > tol:
                continue
            score = abs(d - duration) if duration else 0
            if best is None or score < best[0]:
                best = (score, it)
        if best:
            break
    if not best:
        return None
    synced = _parse_lrc(best[1]["syncedLyrics"])
    if not synced:
        return None
    return {"lyrics": "\n".join(t for _, t in synced), "synced": synced, "source": "LRCLIB • tersinkron"}


@app.get("/api/lyrics")
def get_lyrics(video_id: str, response: Response, title: str = "", artist: str = "", duration: int = 0):
    try:
        if title:
            try:
                found = _lrclib(title, artist, duration)
                if found:
                    response.headers["Cache-Control"] = CACHE_LYRICS
                    return {"status": "success", "data": found}
            except Exception:
                pass
        watch = ytmusic.get_watch_playlist(videoId=video_id, limit=1)
        lyrics_id = watch.get("lyrics")
        if not lyrics_id:
            return error("Lirik tidak ditemukan")

        lyrics = ytmusic.get_lyrics(lyrics_id)
        if not lyrics or not lyrics.get("lyrics"):
            return error("Lirik tidak ditemukan")

        response.headers["Cache-Control"] = CACHE_LYRICS
        return {"status": "success", "data": lyrics}
    except Exception as e:
        return error(str(e))


# --- Endpoint bawaan project Lirik (dipertahankan agar kompatibel) ---
@app.get("/api/charts")
def get_charts(response: Response):
    try:
        data = ytmusic.get_charts()
        response.headers["Cache-Control"] = CACHE_HOME
        return {"status": "success", "data": data}
    except Exception as e:
        return error(str(e))


@app.get("/api/album")
def get_album_info(browse_id: str, response: Response):
    try:
        data = ytmusic.get_album(browse_id)
        response.headers["Cache-Control"] = CACHE_LYRICS
        return {"status": "success", "data": data}
    except Exception as e:
        return error(str(e))


# --- Impor playlist Spotify / Apple Music (tempel link) ---
UA = {"User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"}


def _fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=8) as r:
        return r.read().decode("utf-8", "ignore")


def _find(o, key):
    if isinstance(o, dict):
        if key in o:
            return o[key]
        for v in o.values():
            r = _find(v, key)
            if r is not None:
                return r
    elif isinstance(o, list):
        for v in o:
            r = _find(v, key)
            if r is not None:
                return r
    return None


def _spotify(path: str):
    m = re.search(r"/(playlist|album)/([A-Za-z0-9]+)", path)
    if not m:
        raise ValueError("Link Spotify tidak dikenali. Gunakan link playlist atau album")
    html = ""
    for suffix in ("", "?utm_source=oembed"):          # coba dua bentuk URL embed
        try:
            html = _fetch(f"https://open.spotify.com/embed/{m.group(1)}/{m.group(2)}{suffix}")
        except Exception:
            continue
        if "__NEXT_DATA__" in html:
            break
    nd = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not nd:
        raise ValueError("Playlist Spotify tidak bisa dibaca (privat, atau playlist buatan Spotify seperti Daily Mix)")
    data = json.loads(nd.group(1))
    ent = _find(data, "entity") or {}
    tl = _find(data, "trackList") or []
    cover = ((ent.get("coverArt") or {}).get("sources") or [{}])[0].get("url", "")
    seen, tracks = set(), []
    for t in tl:
        title = (t.get("title") or "").strip()
        artist = (t.get("subtitle") or "").replace("\xa0", " ").strip()
        if not title or (title, artist) in seen:
            continue
        seen.add((title, artist))
        tracks.append({"title": title, "artist": artist})
        if len(tracks) >= 100:
            break
    if not tracks:
        raise ValueError("Tidak ada lagu yang terbaca dari playlist ini")
    return {"name": ent.get("name") or ent.get("title") or "Playlist Spotify", "img": cover, "tracks": tracks,
            "truncated": len(tl) >= 100}


def _resolve_spotify_short(url: str) -> str:
    """spotify.link / spoti.fi -> URL open.spotify.com yang sebenarnya."""
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=8) as r:
        final = r.geturl()
        body = r.read(200000).decode("utf-8", "ignore")
    for cand in (final, body):
        m = re.search(r"https?://open\.spotify\.com/(?:intl-[a-z-]+/)?(playlist|album)/[A-Za-z0-9]+", cand)
        if m:
            return m.group(0)
    raise ValueError("Link pendek Spotify tidak bisa diurai. Buka linknya lalu salin link lengkapnya")


def _apple(url: str):
    html = _fetch(url)
    name, tracks = "Playlist Apple Music", []
    for blk in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.S):
        try:
            d = json.loads(blk)
        except Exception:
            continue
        for item in (d if isinstance(d, list) else [d]):
            if isinstance(item, dict) and item.get("track"):
                name = item.get("name") or name
                for t in item["track"]:
                    by = t.get("byArtist")
                    by = by[0] if isinstance(by, list) and by else by
                    tracks.append({"title": t.get("name", ""), "artist": (by or {}).get("name", "") if isinstance(by, dict) else ""})
    img = re.search(r'<meta property="og:image" content="([^"]+)"', html)
    if not tracks:
        raise ValueError("Playlist Apple Music tidak bisa dibaca")
    return {"name": name, "img": img.group(1) if img else "", "tracks": [t for t in tracks if t["title"]][:200]}


@app.get("/api/import")
def import_playlist(url: str):
    try:
        u = urlparse(url.strip())
        host = (u.hostname or "").lower()
        if host in ("spotify.link", "spoti.fi", "link.tospotify.com"):
            u = urlparse(_resolve_spotify_short(url.strip()))
            host = (u.hostname or "").lower()
        if host == "open.spotify.com":
            data = _spotify(u.path)
        elif host in ("music.apple.com", "itunes.apple.com"):
            data = _apple(url.strip())
        else:
            return error("Hanya link Spotify atau Apple Music yang didukung")
        return JSONResponse({"status": "success", "data": data}, headers={"Cache-Control": "public, s-maxage=600"})
    except Exception as e:
        return error(str(e))


# --- Proxy DeepL (opsional, butuh API key milik pengguna; browser tidak boleh memanggil DeepL langsung) ---
@app.post("/api/deepl")
def deepl(payload: dict = Body(...)):
    try:
        key = str(payload.get("key", "")).strip()
        host = "api-free.deepl.com" if key.endswith(":fx") else "api.deepl.com"
        body = json.dumps({"text": [payload.get("text", "")], "target_lang": str(payload.get("target", "ID")).upper()}).encode()
        req = urllib.request.Request(f"https://{host}/v2/translate", data=body, method="POST",
                                     headers={"Authorization": "DeepL-Auth-Key " + key, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as r:
            out = json.loads(r.read())
        return {"status": "success", "data": out["translations"][0]["text"]}
    except Exception as e:
        return error(str(e))
