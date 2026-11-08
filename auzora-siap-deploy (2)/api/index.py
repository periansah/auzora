# api/index.py  -- Backend gabungan: Musik + Lirik (FastAPI + ytmusicapi)
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, Response
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


@app.get("/api/lyrics")
def get_lyrics(video_id: str, response: Response):
    try:
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
