// --- 0. REGISTER PWA & CUSTOM INSTALL BUTTON ---
let deferredPrompt;
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('PWA gagal terdaftar:', err));
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); 
    deferredPrompt = e;
    const installBtn = document.getElementById('installAppBtn');
    if(installBtn) {
        installBtn.style.display = 'flex'; 
        installBtn.addEventListener('click', async () => {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if(outcome === 'accepted') {
                installBtn.style.display = 'none'; 
            }
            deferredPrompt = null;
        });
    }
});

// --- 1. INDEXEDDB SETUP (SannMusicDB) ---
let db;
const request = indexedDB.open("SannMusicDB", 1);
request.onupgradeneeded = function(e) {
    db = e.target.result;
    if(!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
    if(!db.objectStoreNames.contains('liked_songs')) db.createObjectStore('liked_songs', { keyPath: 'videoId' });
};
request.onsuccess = function(e) { db = e.target.result; renderLibraryUI(); };

// --- 2. YOUTUBE IFRAME API & PLAYER LOGIC ---
let ytPlayer;
let isPlaying = false;
let currentTrack = null;
let progressInterval;
const ICON_PLAY = 'M8 5v14l11-7z';
const ICON_PAUSE = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';
let userPaused = false;      // true = pengguna sendiri yang menjeda (jangan dilanjutkan otomatis)
let trackHistory = [];       // riwayat lagu untuk tombol "sebelumnya"

// --- MESIN PEMUTAR: YouTube (iframe) ATAU audio langsung (Audius) ---
// Audio langsung diputar lewat elemen <audio> biasa, sehingga tetap jalan saat layar mati / pindah aplikasi.
let useAudio = false;
const audioEl = new Audio();
audioEl.preload = 'auto';
audioEl.setAttribute('playsinline', '');
const AUDIUS = 'https://api.audius.co/v1';
const AUDIUS_APP = 'iki-music';
const PH_IMG = 'https://placehold.co/140x140/282828/FFFFFF?text=Music';
let audiusQueue = [];

function audiusStream(id) { return `${AUDIUS}/tracks/${encodeURIComponent(id)}/stream?app_name=${AUDIUS_APP}`; }
function audiusToTrack(t) {
    const art = t.artwork || {};
    const img = art['480x480'] || art['1000x1000'] || art['150x150'] || PH_IMG;
    return { videoId: 'audius:' + t.id, audiusId: t.id, src: 'audius', title: t.title || 'Tanpa judul',
             artist: (t.user && t.user.name) || 'Unknown', img: img, thumbnail: img };
}
async function audiusGet(path) {
    const url = AUDIUS + path + (path.includes('?') ? '&' : '?') + 'app_name=' + AUDIUS_APP;
    const res = await fetch(url);
    const json = await res.json();
    return (json.data || []).filter(t => t && t.id && t.is_streamable !== false);
}
async function fillAudiusQueue(track) {
    let list = [];
    try { list = await audiusGet('/tracks/search?query=' + encodeURIComponent(track.artist) + '&limit=20'); } catch (e) {}
    if (list.length < 4) { try { list = list.concat(await audiusGet('/tracks/trending?limit=20')); } catch (e) {} }
    audiusQueue = list.map(audiusToTrack).filter(t => t.videoId !== track.videoId).sort(() => Math.random() - 0.5).slice(0, 15);
}

function getCur() {
    if (useAudio) return audioEl.currentTime || 0;
    return (ytPlayer && ytPlayer.getCurrentTime) ? ytPlayer.getCurrentTime() : 0;
}
function getDur() {
    if (useAudio) return isFinite(audioEl.duration) ? audioEl.duration : 0;
    return (ytPlayer && ytPlayer.getDuration) ? ytPlayer.getDuration() : 0;
}
function doSeek(t) {
    if (useAudio) { try { audioEl.currentTime = t; } catch (e) {} }
    else if (ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(t, true);
}
function doPlay() {
    if (useAudio) audioEl.play().catch(() => {});
    else if (ytPlayer && ytPlayer.playVideo) ytPlayer.playVideo();
}
function doPause() {
    if (useAudio) audioEl.pause();
    else if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
}

// Event audio -> memakai handler status yang sama dengan YouTube
audioEl.addEventListener('playing', () => onPlayerStateChange({ data: 1, audio: true }));
audioEl.addEventListener('pause', () => { if (!audioEl.ended) onPlayerStateChange({ data: 2, audio: true }); });
audioEl.addEventListener('ended', () => onPlayerStateChange({ data: 0, audio: true }));
audioEl.addEventListener('error', () => {
    if (!useAudio || !currentTrack || !audioEl.getAttribute('src')) return;
    if (errorSkips < 3) {
        errorSkips++;
        showToast('Lagu ini gagal dimuat, lanjut ke lagu lain...');
        setTimeout(playNextSimilarSong, 1000);
    } else {
        showToast('Gagal memutar lagu. Periksa koneksi internet.');
    }
});

function onYouTubeIframeAPIReady() {
    if (ytPlayer) return;   // jangan buat pemutar ganda
    const yp = document.getElementById('youtube-player');
    if (yp) yp.style.display = '';
    ytPlayer = new YT.Player('youtube-player', {
        height: '200', width: '200',
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0 },
        events: {
            'onReady': onPlayerReady,
            'onError': onPlayerError,
            'onAutoplayBlocked': onAutoplayBlocked,
            'onStateChange': onPlayerStateChange
        }
    });
}

let errorSkips = 0;
function onPlayerError(event) {
    // 2 = id salah, 5 = error HTML5, 100 = video dihapus/privat, 101/150 = pemilik melarang diputar di situs lain
    const code = event && event.data;
    console.log('YouTube error', code);
    if (errorSkips < 3 && currentTrack) {
        errorSkips++;
        showToast('Lagu ini tidak bisa diputar (kode ' + code + '), lanjut ke lagu lain...');
        setTimeout(playNextSimilarSong, 1200);
    } else {
        showToast('Gagal memutar lagu (kode ' + code + '). Coba lagu lain.');
    }
}

function onAutoplayBlocked() {
    showToast('Browser menahan pemutaran. Ketuk tombol putar.');
}

function onPlayerReady(event) {
    console.log("YouTube Player is ready");
    applyVolume();
}

function onPlayerStateChange(event) {
    if (!!event.audio !== useAudio) return;   // abaikan event dari mesin yang sedang tidak dipakai
    const mainPlayBtn = document.getElementById('mainPlayBtn');
    const miniPlayBtn = document.getElementById('miniPlayBtn');
    
    // Play Path
    const playIconPath = "M8 5v14l11-7z";
    // Pause Path
    const pauseIconPath = "M6 19h4V5H6v14zm8-14v14h4V5h-4z";

    if (event.data == 1) {
        isPlaying = true;
        userPaused = false;
        errorSkips = 0;
        startKeepAlive();
        mainPlayBtn.innerHTML = `<path d="${pauseIconPath}"></path>`;
        miniPlayBtn.innerHTML = `<path d="${pauseIconPath}"></path>`;
        startProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } else if (event.data == 2) {
        isPlaying = false;
        // Browser kadang menjeda sendiri saat layar mati / pindah aplikasi -> lanjutkan jika bukan pengguna yang menjeda
        if (!userPaused && document.hidden) setTimeout(resumeIfNeeded, 250);
        mainPlayBtn.innerHTML = `<path d="${playIconPath}"></path>`;
        miniPlayBtn.innerHTML = `<path d="${playIconPath}"></path>`;
        stopProgressBar();
        if (userPaused) stopKeepAlive();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else if (event.data == 0) {
        isPlaying = false;
        mainPlayBtn.innerHTML = `<path d="${playIconPath}"></path>`;
        miniPlayBtn.innerHTML = `<path d="${playIconPath}"></path>`;
        stopProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        
        if (sleepAtEnd) { clearSleep(); showToast('Timer tidur: pemutaran dihentikan'); }
        else playNextSimilarSong();
    }
    updateLyricsPlayIcon();
}

function updateMediaSession() {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: 'iki Music & Lyrics',
        artwork: [96, 128, 256, 512].map(n => ({ src: currentTrack.img, sizes: n + 'x' + n, type: 'image/jpeg' }))
    });
    const set = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn); } catch (e) {} };
    set('play', () => { userPaused = false; doPlay(); });
    set('pause', () => { userPaused = true; doPause(); });
    set('nexttrack', () => playNextSimilarSong());
    set('previoustrack', () => playPrev());
    set('seekbackward', (d) => seekBy(-(d && d.seekOffset || 10)));
    set('seekforward', (d) => seekBy(d && d.seekOffset || 10));
    set('seekto', (d) => { if (d && d.seekTime != null) { doSeek(d.seekTime); updatePositionState(); } });
    set('stop', () => { userPaused = true; doPause(); });
}

function updatePositionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    try {
        const d = getDur();
        if (d > 0) navigator.mediaSession.setPositionState({ duration: d, playbackRate: 1, position: Math.min(getCur(), d) });
    } catch (e) {}
}

function seekBy(sec) {
    doSeek(Math.max(0, getCur() + sec));
    updatePositionState();
}

// --- AGAR LAGU TETAP JALAN DI LATAR BELAKANG ---
// 1) Audio senyap yang di-loop membuat browser menganggap halaman sebagai "pemutar media"
//    sehingga tidak langsung dibekukan saat layar mati / pindah aplikasi.
let keepAliveAudio = null;
function makeSilentWav() {
    const sampleRate = 8000, samples = sampleRate; // 1 detik
    const buf = new ArrayBuffer(44 + samples * 2), v = new DataView(buf);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
function startKeepAlive() {
    if (useAudio) return;   // audio langsung tidak butuh trik ini
    try {
        if (!keepAliveAudio) {
            keepAliveAudio = new Audio(makeSilentWav());
            keepAliveAudio.loop = true;
            keepAliveAudio.setAttribute('playsinline', '');
        }
        if (keepAliveAudio.paused) keepAliveAudio.play().catch(() => {});
    } catch (e) {}
}
function stopKeepAlive() {
    try { if (keepAliveAudio && !keepAliveAudio.paused) keepAliveAudio.pause(); } catch (e) {}
}

// 2) Jika browser menjeda sendiri saat halaman disembunyikan, lanjutkan lagi.
function resumeIfNeeded() {
    if (useAudio || !ytPlayer || !currentTrack || userPaused || !ytPlayer.getPlayerState) return;
    const st = ytPlayer.getPlayerState();
    if (st === 2 || st === 5) ytPlayer.playVideo();
}
document.addEventListener('visibilitychange', () => {
    if (document.hidden) setTimeout(resumeIfNeeded, 300);
    else resumeIfNeeded();
});
window.addEventListener('pagehide', () => { /* biarkan audio berjalan */ });

async function playNextSimilarSong() {
    if (!currentTrack) return;
    if (currentTrack.src === 'audius') return playNextAudius();
    try {
        const response = await fetch(`/api/search?query=${encodeURIComponent(currentTrack.artist + " official audio")}`);
        const result = await response.json();
        
        if (result.status === 'success' && result.data.length > 0) {
            const relatedSongs = result.data.filter(t => t.videoId !== currentTrack.videoId);
            if (relatedSongs.length > 0) {
                const nextTrack = relatedSongs[Math.floor(Math.random() * relatedSongs.length)];
                
                let img = nextTrack.thumbnail ? nextTrack.thumbnail : (nextTrack.img ? nextTrack.img : 'https://placehold.co/140x140/282828/FFFFFF?text=Music');
                img = getHighResImage(img);
                const artist = nextTrack.artist ? nextTrack.artist : 'Unknown';
                const trackData = encodeURIComponent(JSON.stringify({videoId: nextTrack.videoId, title: nextTrack.title, artist: artist, img: img}));
                
                playMusic(nextTrack.videoId, trackData);
            }
        }
    } catch (error) {}
}

async function playNextAudius() {
    try {
        let next = audiusQueue.shift();            // sudah disiapkan sebelumnya -> langsung putar (aman di latar belakang)
        if (!next) { await fillAudiusQueue(currentTrack); next = audiusQueue.shift(); }
        if (next) playMusic(next.videoId, encTrack(next));
        else showToast('Tidak ada lagu berikutnya.');
    } catch (e) {}
}

function playMusic(videoId, encodedTrackData, fromHistory) {
    if (currentTrack && !fromHistory && currentTrack.videoId !== videoId) {
        trackHistory.push(currentTrack);
        if (trackHistory.length > 30) trackHistory.shift();
    }
    currentTrack = JSON.parse(decodeURIComponent(encodedTrackData));
    userPaused = false;
    useAudio = currentTrack.src === 'audius';
    refreshLikeButtons();

    document.getElementById('miniPlayer').style.display = 'flex';
    document.getElementById('miniPlayerImg').src = currentTrack.img;
    document.getElementById('miniPlayerTitle').innerText = currentTrack.title;
    document.getElementById('miniPlayerArtist').innerText = currentTrack.artist;

    document.getElementById('playerArt').src = currentTrack.img;
    document.getElementById('playerTitle').innerText = currentTrack.title;
    document.getElementById('playerArtist').innerText = currentTrack.artist;
    document.getElementById('playerBg').style.backgroundImage = `url('${currentTrack.img}')`;

    try { updateMediaSession(); } catch (e) { console.log('mediaSession error', e); }

    if (useAudio) {
        // Sumber audio langsung: jalan di latar belakang
        try { if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo(); } catch (e) {}
        stopKeepAlive();
        audioEl.src = audiusStream(currentTrack.audiusId);
        audioEl.play().catch(() => showToast('Browser menahan pemutaran. Ketuk tombol putar.'));
        fillAudiusQueue(currentTrack);
    } else {
        if (audioEl.getAttribute('src')) { audioEl.pause(); audioEl.removeAttribute('src'); }
        if (ytPlayer && ytPlayer.loadVideoById) {
            ytPlayer.loadVideoById(videoId);
            if (ytPlayer.playVideo) ytPlayer.playVideo();   // dalam gesture klik: memastikan HP mau memutar
        } else {
            showToast('Pemutar belum siap, coba lagi sebentar...');
        }
        setTimeout(startKeepAlive, 400);
    }
    
    applyVolume();
    const qm = document.getElementById('queueModal'); if (qm) qm.style.display = 'none';

    document.getElementById('progressBar').value = 0;
    document.getElementById('progressBar').style.setProperty('--p', '0%');
    document.getElementById('currentTime').innerText = "0:00";
    document.getElementById('totalTime').innerText = "0:00";

    // Jika modal lirik sedang terbuka dalam mode "ikut pemutar", ganti liriknya
    if (lyricsFollowsPlayer && lyricsModal.style.display === 'flex') openLyrics(currentTrack, true);
    updateLyricsPlayIcon();
}

function togglePlay() {
    if (!useAudio && !ytPlayer) return;
    if (isPlaying) {
        userPaused = true;
        doPause();
    } else {
        userPaused = false;
        startKeepAlive();
        doPlay();
    }
}

function playPrev() {
    // Jika sudah lewat 4 detik, ulangi lagu; jika tidak, kembali ke lagu sebelumnya
    if (getCur() > 4) { doSeek(0); return; }
    const prev = trackHistory.pop();
    if (prev) playMusic(prev.videoId, encTrack(prev), true);
    else doSeek(0);
}

function expandPlayer() {
    document.getElementById('playerModal').style.display = 'flex';
}

function minimizePlayer() {
    document.getElementById('playerModal').style.display = 'none';
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function startProgressBar() {
    stopProgressBar();
    progressInterval = setInterval(() => {
        const current = getCur();
        const duration = getDur();
        if (duration > 0) {
            const percent = (current / duration) * 100;
            const progressBar = document.getElementById('progressBar');
            progressBar.value = percent;
            progressBar.style.setProperty('--p', percent + '%');
            document.getElementById('currentTime').innerText = formatTime(current);
            document.getElementById('totalTime').innerText = formatTime(duration);
            updatePositionState();
        }
    }, 1000);
}

function stopProgressBar() {
    clearInterval(progressInterval);
}

function seekTo(value) {
    const duration = getDur();
    if (duration <= 0) return;
    doSeek((value / 100) * duration);
    document.getElementById('progressBar').style.setProperty('--p', value + '%');
}

// --- CUSTOM TOAST NOTIFICATION ---
let toastTimeout;
function showToast(message) {
    const toast = document.getElementById('customToast');
    toast.innerText = message;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// --- 3. SISTEM NAVIGASI ---
function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById('view-' + viewName).classList.add('active');
    
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    navItems.forEach(nav => nav.classList.remove('active'));
    const navIndex = { home: 0, search: 1, library: 2, developer: 3 }[viewName];
    if (navIndex !== undefined) {
        navItems[navIndex].classList.add('active');
        document.querySelector('.bottom-nav').style.setProperty('--idx', navIndex);
    }
    if (viewName === 'library') renderLibraryUI();
    
    window.scrollTo(0,0);
    if (typeof setNavCollapsed === 'function') setNavCollapsed(false);
}

// --- 4. RENDER KOMPONEN UI ---
const dotsPath = 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z';

// Escape teks untuk HTML
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// encodeURIComponent yang juga meng-encode tanda petik satu (aman untuk onclick='...')
function encq(s) { return encodeURIComponent(s).replace(/'/g, '%27'); }
function encTrack(t) { return encq(JSON.stringify(t)); }

function normalizeTrack(track, placeholder) {
    const img = getHighResImage(track.thumbnail || track.img || placeholder);
    const t = { videoId: track.videoId, title: track.title, artist: track.artist || 'Unknown', img: img };
    if (track.src === 'audius') { t.src = 'audius'; t.audiusId = track.audiusId; }
    return t;
}

function getHighResImage(url) {
    if (!url) return url;
    if (url.match(/=w\d+-h\d+/)) {
        return url.replace(/=w\d+-h\d+[^&]*/g, '=w512-h512-l90-rj');
    }
    return url;
}

function createListHTML(track) {
    const PH = 'https://placehold.co/48x48/282828/FFFFFF?text=Music';
    const t = normalizeTrack(track, PH);
    const data = encTrack(t);

    return `
        <div class="v-item" onclick="playMusic('${esc(t.videoId)}', '${data}')">
            <img src="${esc(t.img)}" class="v-img" onerror="this.src='${PH}'">
            <div class="v-info">
                <div class="v-title">${esc(t.title)}</div>
                <div class="v-sub">${esc(t.artist)}</div>
            </div>
            <svg class="dots-icon" viewBox="0 0 24 24" onclick="event.stopPropagation(); openTrackMenu('${data}')"><path d="${dotsPath}"></path></svg>
        </div>
    `;
}

function createCardHTML(track, isArtist = false) {
    const PH = 'https://placehold.co/140x140/282828/FFFFFF?text=Music';
    const t = normalizeTrack(track, PH);
    const data = encTrack(t);

    const clickAction = isArtist
        ? `openArtistView(decodeURIComponent('${encq(t.title)}'))`
        : `playMusic('${esc(t.videoId)}', '${data}')`;
    const imgClass = isArtist ? 'h-img artist-img' : 'h-img';

    return `
        <div class="h-card" onclick="${clickAction}">
            <div class="h-img-wrap${isArtist ? ' artist' : ''}">
                <img src="${esc(t.img)}" class="${imgClass}" onerror="this.src='${PH}'">
            </div>
            <div class="h-title">${esc(t.title)}</div>
            <div class="h-sub">${isArtist ? 'Artis' : esc(t.artist)}</div>
        </div>
    `;
}

let homeDisplayedVideoIds = new Set();

async function fetchAndRender(query, containerId, formatType, isArtist = false, isHome = false) {
    try {
        const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            let limit = containerId === 'recentList' ? 4 : (formatType === 'list' ? 4 : 8);
            let tracks = [];
            
            for (let t of result.data) {
                if (isHome) {
                    if (!homeDisplayedVideoIds.has(t.videoId)) {
                        tracks.push(t);
                        homeDisplayedVideoIds.add(t.videoId);
                    }
                } else {
                    tracks.push(t);
                }
                if (tracks.length >= limit) break;
            }

            let html = '';
            tracks.forEach(t => html += formatType === 'list' ? createListHTML(t) : createCardHTML(t, isArtist));
            document.getElementById(containerId).innerHTML = html;
        }
    } catch (error) {}
}

async function loadAudiusHome() {
    const row = document.getElementById('rowAudius');
    if (!row) return;
    try {
        const list = await audiusGet('/tracks/trending?limit=12');
        if (!list.length) throw new Error('kosong');
        row.innerHTML = list.map(t => createCardHTML(audiusToTrack(t))).join('');
    } catch (e) {
        const sec = row.closest('.section-container');
        if (sec) sec.style.display = 'none';
    }
}

function loadHomeData() {
    homeDisplayedVideoIds.clear();
    loadAudiusHome();
    
    fetchAndRender('lagu indonesia hits terbaru', 'recentList', 'list', false, true);
    fetchAndRender('lagu pop indonesia rilis terbaru anyar', 'rowAnyar', 'card', false, true);
    fetchAndRender('lagu ceria gembira semangat', 'rowGembira', 'card', false, true);
    fetchAndRender('top 50 indonesia playlist update', 'rowCharts', 'card', false, true);
    fetchAndRender('lagu galau sedih indonesia terpopuler', 'rowGalau', 'card', false, true);
    fetchAndRender('lagu viral terbaru 2026', 'rowBaru', 'card', false, true);
    fetchAndRender('lagu fyp tiktok viral jedag jedug', 'rowTiktok', 'card', false, true);
    fetchAndRender('penyanyi pop indonesia paling hits', 'rowArtists', 'card', true, true);
    
    fetchAndRender('hit terpopuler hari ini', 'rowHitsHariIni', 'card', false, true);
    fetchAndRender('playlist dibuat untuk tiktok', 'rowUntukTiktok', 'card', false, true);
    fetchAndRender('album dan single populer', 'rowAlbumSingle', 'card', false, true);
}

function renderSearchCategories() {
    const categories = [
        { title: 'Dibuat Untuk Kamu', color: '#8d67ab', img: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100&q=80' },
        { title: 'Rilis Mendatang', color: '#188653', img: 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=100&q=80' },
        { title: 'Rilis Baru', color: '#739c18', img: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80' },
        { title: 'Ramadan', color: '#188653', img: 'https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=100&q=80' },
        { title: 'Pop', color: '#477d95', img: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=100&q=80' },
        { title: 'Indie', color: '#e1118c', img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80' },
        { title: 'Musik Indonesia', color: '#e8115b', img: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80' },
        { title: 'Tangga Lagu', color: '#8d67ab', img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&q=80' },
        { title: 'Peringkat Podcast', color: '#1e3264', img: 'https://images.unsplash.com/photo-1593697821252-0c9137d9fc45?w=100&q=80' },
        { title: 'K-pop', color: '#e8115b', img: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=100&q=80' }
    ];
    let html = '';
    categories.forEach(cat => { html += `<div class="category-card" style="background-color: ${cat.color};"><div class="category-title">${cat.title}</div><img src="${cat.img}" class="category-img"></div>`; });
    document.getElementById('categoryGrid').innerHTML = html;
}

let searchTimeout;
let searchSource = 'yt';   // 'yt' = YouTube, 'audius' = audio langsung (jalan di latar belakang)

function setSource(src) {
    searchSource = src;
    document.getElementById('srcYT').classList.toggle('active', src === 'yt');
    document.getElementById('srcAU').classList.toggle('active', src === 'audius');
    document.getElementById('searchInput').dispatchEvent(new Event('input'));
}

async function searchRender(query) {
    const box = document.getElementById('searchResults');
    const msg = (t) => '<div style="color:var(--text-sub); text-align:center;">' + t + '</div>';
    box.innerHTML = msg('Mencari musik...');
    try {
        let tracks = [];
        if (searchSource === 'audius') {
            const list = query ? await audiusGet('/tracks/search?query=' + encodeURIComponent(query) + '&limit=25')
                               : await audiusGet('/tracks/trending?limit=25');
            tracks = list.map(audiusToTrack);
        } else {
            const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
            const result = await response.json();
            if (result.status === 'success') tracks = result.data;
        }
        let html = '';
        tracks.forEach(t => html += createListHTML(t));
        box.innerHTML = html || msg('Tidak ada hasil.');
    } catch (error) {
        box.innerHTML = msg('Gagal memuat. Periksa koneksi internet.');
    }
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length === 0 && searchSource === 'yt') {
        document.getElementById('searchCategoriesUI').style.display = 'block';
        document.getElementById('searchResultsUI').style.display = 'none';
        return;
    }
    document.getElementById('searchCategoriesUI').style.display = 'none';
    document.getElementById('searchResultsUI').style.display = 'block';
    searchTimeout = setTimeout(() => searchRender(query), query ? 800 : 0);
});

let artistFirstTrack = null;
function playFirstArtistTrack() {
    if (artistFirstTrack) playMusic(artistFirstTrack.videoId, encTrack(artistFirstTrack));
}

async function openArtistView(artistName) {
    artistFirstTrack = null;
    document.getElementById('artistNameDisplay').innerText = artistName;
    document.getElementById('artistTracksContainer').innerHTML = '<div style="color:var(--text-sub); text-align:center;">Memuat lagu artis...</div>';
    switchView('artist');

    try {
        const response = await fetch(`/api/search?query=${encodeURIComponent(artistName + " official audio")}`);
        const result = await response.json();
        if (result.status === 'success') {
            let html = '';
            result.data.forEach(track => { html += createListHTML(track); });
            document.getElementById('artistTracksContainer').innerHTML = html;
            
            if(result.data.length > 0) {
                const firstTrack = result.data[0];
                let img = firstTrack.thumbnail ? firstTrack.thumbnail : (firstTrack.img ? firstTrack.img : 'https://placehold.co/48x48/282828/FFFFFF?text=Music');
                img = getHighResImage(img);
                const artist = firstTrack.artist ? firstTrack.artist : 'Unknown';
                artistFirstTrack = {videoId: firstTrack.videoId, title: firstTrack.title, artist: artist, img: img};
            }
        }
    } catch(e) {}
}

function setLikeButton(btn, liked) {
    if (!btn) return;
    btn.classList.toggle('liked', liked);
    if (btn.id === 'btnLikeSong') { btn.style.fill = liked ? '#1ed760' : 'white'; btn.style.color = liked ? '#1ed760' : 'white'; }
}

// Sinkronkan status like untuk lagu di player & lagu di modal lirik
function refreshLikeButtons() {
    if (!db) return;
    [[currentTrack, 'btnLikeSong'], [lyricsTrack, 'btnLikeLyrics']].forEach(([track, id]) => {
        if (!track) return;
        const req = db.transaction("liked_songs", "readonly").objectStore("liked_songs").get(track.videoId);
        req.onsuccess = () => setLikeButton(document.getElementById(id), !!req.result);
    });
}

function toggleLikeFor(track) {
    if (!track) return;
    const tx = db.transaction("liked_songs", "readwrite");
    const store = tx.objectStore("liked_songs");
    const getReq = store.get(track.videoId);
    getReq.onsuccess = function() {
        if (getReq.result) store.delete(track.videoId);
        else store.put(track);
    };
    tx.oncomplete = function() { refreshLikeButtons(); renderLibraryUI(); };
}

function toggleLike() { toggleLikeFor(currentTrack); }
function toggleLikeLyrics() { toggleLikeFor(lyricsTrack); }

function renderLibraryUI() {
    if(!db) return;
    const container = document.getElementById('libraryContainer');
    let html = '';

    const tx = db.transaction("liked_songs", "readonly");
    const req = tx.objectStore("liked_songs").getAll();
    
    req.onsuccess = function() {
        const likedCount = req.result.length;
        html += `
            <div class="lib-item" onclick="openPlaylistView('liked')">
                <div class="lib-item-img liked">
                    <svg viewBox="0 0 24 24" style="fill:white; width:28px; height:28px;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                </div>
                <div class="lib-item-info">
                    <div class="lib-item-title">Lagu yang Disukai</div>
                    <div class="lib-item-sub"><svg class="pin-icon" viewBox="0 0 24 24"><path d="M12 2L15 8l6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z"></path></svg> Playlist • ${likedCount} lagu</div>
                </div>
            </div>
        `;

        const txP = db.transaction("playlists", "readonly");
        const reqP = txP.objectStore("playlists").getAll();
        reqP.onsuccess = function() {
            const playlists = reqP.result;
            playlists.forEach(p => {
                html += `
                    <div class="lib-item" onclick="openPlaylistView('${p.id}')">
                        <img src="${p.img || 'https://via.placeholder.com/120?text=+'}" class="lib-item-img" onerror="this.src='https://via.placeholder.com/120?text=+'">
                        <div class="lib-item-info">
                            <div class="lib-item-title">${p.name}</div>
                            <div class="lib-item-sub">Playlist • iki</div>
                        </div>
                    </div>
                `;
            });

            html += `
                <div class="lib-item">
                    <div class="lib-item-img add-btn circle">
                        <svg viewBox="0 0 24 24" style="fill:white; width:32px; height:32px;"><path d="M11 11V4h2v7h7v2h-7v7h-2v-7H4v-2h7z"></path></svg>
                    </div>
                    <div class="lib-item-info"><div class="lib-item-title">Tambahkan artis</div></div>
                </div>
                <div class="lib-item">
                    <div class="lib-item-img add-btn add-btn-sq">
                        <svg viewBox="0 0 24 24" style="fill:white; width:32px; height:32px;"><path d="M11 11V4h2v7h7v2h-7v7h-2v-7H4v-2h7z"></path></svg>
                    </div>
                    <div class="lib-item-info"><div class="lib-item-title">Tambahkan podcast</div></div>
                </div>
            `;

            container.innerHTML = html;
        };
    };
}

let currentPlaylistTracks = [];

function openPlaylistView(id) {
    switchView('playlist');
    const container = document.getElementById('playlistTracksContainer');
    container.innerHTML = '<div style="color:var(--text-sub); text-align:center;">Memuat daftar lagu...</div>';

    if (id === 'liked') {
        document.getElementById('playlistNameDisplay').innerText = "Lagu yang Disukai";
        document.getElementById('playlistImageDisplay').src = "1ced33a183cb33692d94252ad74fa4d9.jpg";
        
        const tx = db.transaction("liked_songs", "readonly");
        const req = tx.objectStore("liked_songs").getAll();
        req.onsuccess = () => {
            currentPlaylistTracks = req.result;
            document.getElementById('playlistStatsDisplay').innerText = `${req.result.length} lagu disimpan`;
            renderTracksInPlaylist(req.result);
        };
    } else {
        const tx = db.transaction("playlists", "readonly");
        const req = tx.objectStore("playlists").get(id);
        req.onsuccess = () => {
            const p = req.result;
            currentPlaylistTracks = p.tracks || [];
            document.getElementById('playlistNameDisplay').innerText = p.name;
            document.getElementById('playlistImageDisplay').src = p.img || 'https://via.placeholder.com/240/282828/ffffff?text=+';
            const trackCount = p.tracks ? p.tracks.length : 0;
            document.getElementById('playlistStatsDisplay').innerText = `${trackCount} lagu disimpan`;
            renderTracksInPlaylist(p.tracks || []);
        };
    }
}

function playFirstPlaylistTrack() {
    if(currentPlaylistTracks && currentPlaylistTracks.length > 0) {
        const firstTrack = currentPlaylistTracks[0];
        const trackData = encodeURIComponent(JSON.stringify(firstTrack));
        playMusic(firstTrack.videoId, trackData);
    }
}

function renderTracksInPlaylist(tracks) {
    const container = document.getElementById('playlistTracksContainer');
    if (!tracks || tracks.length === 0) {
        container.innerHTML = '<div style="color:var(--text-sub); text-align:center;">Playlist ini masih kosong.</div>';
        return;
    }
    let html = '';
    tracks.forEach(t => html += createListHTML(t));
    container.innerHTML = html;
}

let base64PlaylistImage = '';

function openCreatePlaylist() { document.getElementById('createPlaylistModal').style.display = 'block'; }
function closeCreatePlaylist() {
    document.getElementById('createPlaylistModal').style.display = 'none';
    document.getElementById('cpName').value = '';
    document.getElementById('cpPreview').src = 'https://via.placeholder.com/120x120?text=+';
    base64PlaylistImage = '';
}

function previewImage(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
        document.getElementById('cpPreview').src = reader.result;
        base64PlaylistImage = reader.result;
    };
    if(file) reader.readAsDataURL(file);
}

function saveNewPlaylist() {
    const name = document.getElementById('cpName').value || "Playlist baruku";
    const newPlaylist = { id: Date.now().toString(), name: name, img: base64PlaylistImage, tracks: [] };
    
    const tx = db.transaction("playlists", "readwrite");
    tx.objectStore("playlists").put(newPlaylist);
    tx.oncomplete = function() {
        closeCreatePlaylist();
        renderLibraryUI();
    };
}

let playlistTargetTrack = null;

function openAddToPlaylistModal(track) {
    const target = track || currentTrack;
    if(!target) return;
    playlistTargetTrack = target;
    const tx = db.transaction("playlists", "readonly");
    const req = tx.objectStore("playlists").getAll();
    req.onsuccess = () => {
        let html = '';
        req.result.forEach(p => {
            html += `
                <div class="lib-item" onclick="addTrackToPlaylist('${p.id}')" style="margin-bottom: 12px; cursor: pointer;">
                    <img src="${p.img || 'https://via.placeholder.com/50'}" style="width:50px; height:50px; object-fit:cover; border-radius:4px;" onerror="this.src='https://via.placeholder.com/50'">
                    <div style="color:white; font-size:16px;">${p.name}</div>
                </div>`;
        });
        if(req.result.length === 0) html = '<div style="color:#a7a7a7; text-align:center;">Belum ada playlist. Buat dulu di Koleksi Kamu.</div>';
        document.getElementById('addToPlaylistList').innerHTML = html;
        document.getElementById('addToPlaylistModal').style.display = 'flex';
    };
}

function closeAddToPlaylistModal() { document.getElementById('addToPlaylistModal').style.display = 'none'; }

function addTrackToPlaylist(playlistId) {
    const tx = db.transaction("playlists", "readwrite");
    const store = tx.objectStore("playlists");
    const req = store.get(playlistId);
    req.onsuccess = () => {
        const p = req.result;
        if(!p.tracks) p.tracks = [];
        if(!p.tracks.find(t => t.videoId === playlistTargetTrack.videoId)) {
            p.tracks.push(playlistTargetTrack);
            store.put(p);
            showToast('Ditambahkan ke ' + p.name); // Notifikasi Modern
        } else {
            showToast('Sudah ada di ' + p.name); // Notifikasi Modern
        }
        closeAddToPlaylistModal();
    };
}

// --- 7. FITUR LIRIK (digabung dari project Lyrics) ---
const lyricsModal = document.getElementById('lyricsModal');
const lyricsBody = document.getElementById('lyricsBody');

let lyricsTrack = null;          // lagu yang liriknya sedang ditampilkan
let lyricsFollowsPlayer = false; // true = lirik otomatis ganti mengikuti lagu yang diputar
let lyricsRequestId = 0;         // mencegah respons lama menimpa lirik yang baru

function setLyricsMessage(text, isError) {
    lyricsBody.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'lyrics-msg' + (isError ? ' err' : '');
    d.textContent = text;
    lyricsBody.appendChild(d);
}

function updateLyricsPlayIcon() {
    const icon = document.getElementById('lyricsPlayIcon');
    if (!icon) return;
    const sameTrack = currentTrack && lyricsTrack && currentTrack.videoId === lyricsTrack.videoId;
    icon.innerHTML = `<path d="${(sameTrack && isPlaying) ? ICON_PAUSE : ICON_PLAY}"></path>`;
}

async function openLyrics(track, followPlayer) {
    lyricsTrack = track;
    lyricsFollowsPlayer = !!followPlayer;
    const reqId = ++lyricsRequestId;

    document.getElementById('lyricsTrackImg').src = track.img;
    document.getElementById('lyricsTrackTitle').innerText = track.title;
    document.getElementById('lyricsTrackArtist').innerText = track.artist;
    document.getElementById('lyricsBg').style.backgroundImage = `url('${track.img}')`;

    refreshLikeButtons();
    updateLyricsPlayIcon();
    lyricsModal.style.display = 'flex';
    lyricsBody.scrollTop = 0;
    if (track.src === 'audius') { setLyricsMessage('Lirik belum tersedia untuk lagu dari Audius.'); return; }
    setLyricsMessage('Menarik data lirik dari server... ⏳');

    try {
        const response = await fetch(`/api/lyrics?video_id=${encodeURIComponent(track.videoId)}`);
        const result = await response.json();
        if (reqId !== lyricsRequestId) return; // pengguna sudah pindah lagu / menutup modal

        if (result.status === 'success' && result.data && result.data.lyrics) {
            lyricsBody.textContent = result.data.lyrics;   // textContent: aman dari HTML injection
            if (result.data.source) {
                const src = document.createElement('span');
                src.className = 'lyrics-source';
                src.textContent = result.data.source;
                lyricsBody.appendChild(src);
            }
        } else {
            setLyricsMessage('Lirik belum tersedia untuk lagu ini.');
        }
    } catch (e) {
        if (reqId !== lyricsRequestId) return;
        setLyricsMessage('Gagal memuat lirik. Periksa koneksi internet.', true);
    }
}

function openLyricsForCurrent() {
    if (!currentTrack) return;
    openLyrics(currentTrack, true);
}

function closeLyrics() {
    lyricsRequestId++;
    lyricsFollowsPlayer = false;
    lyricsModal.style.display = 'none';
    lyricsBody.innerHTML = '';
}

function toggleLyricsPlayback() {
    if (!lyricsTrack) return;
    if (currentTrack && currentTrack.videoId === lyricsTrack.videoId) {
        togglePlay();
    } else {
        playMusic(lyricsTrack.videoId, encTrack(lyricsTrack));
        lyricsFollowsPlayer = true;
    }
}

// --- 8. MENU AKSI LAGU (titik tiga): Putar / Lihat lirik / Tambah ke playlist ---
let menuTrack = null;

function openTrackMenu(encodedTrackData) {
    menuTrack = JSON.parse(decodeURIComponent(encodedTrackData));
    document.getElementById('trackMenuImg').src = menuTrack.img;
    document.getElementById('trackMenuTitle').innerText = menuTrack.title;
    document.getElementById('trackMenuArtist').innerText = menuTrack.artist;
    document.getElementById('trackMenuModal').style.display = 'flex';
}

function closeTrackMenu() {
    document.getElementById('trackMenuModal').style.display = 'none';
}

function trackMenuAction(action) {
    const t = menuTrack;
    closeTrackMenu();
    if (!t) return;
    if (action === 'play') playMusic(t.videoId, encTrack(t));
    else if (action === 'lyrics') openLyrics(t, !!(currentTrack && currentTrack.videoId === t.videoId));
    else if (action === 'playlist') openAddToPlaylistModal(t);
}

// --- 9. VOLUME ---
const pref = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
};
let volume = Math.min(100, Math.max(0, parseInt(pref.get('ikiVol', '100'), 10) || 0));
if (pref.get('ikiVol', null) === null) volume = 100;

function applyVolume() {
    try { audioEl.volume = volume / 100; } catch (e) {}
    try { if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(volume); } catch (e) {}
}
function setVolume(v) {
    volume = Math.min(100, Math.max(0, +v));
    applyVolume();
    const el = document.getElementById('volumeBar');
    if (el) el.style.setProperty('--p', volume + '%');
    pref.set('ikiVol', volume);
}

// --- 10. ANTREAN, BAGIKAN, TIMER TIDUR ---
function openQueue() {
    const label = t => `<div class="queue-label">${t}</div>`;
    let h = '';
    if (currentTrack) {
        h += label('Sedang diputar') + createListHTML(currentTrack);
        if (currentTrack.src === 'audius') {
            if (audiusQueue.length) { h += label('Berikutnya'); audiusQueue.slice(0, 10).forEach(t => h += createListHTML(t)); }
        } else {
            h += label('Berikutnya') + '<div class="queue-note">Lagu berikutnya dipilih otomatis dari artis yang sama.</div>';
        }
    }
    if (trackHistory.length) { h += label('Riwayat'); trackHistory.slice().reverse().forEach(t => h += createListHTML(t)); }
    if (!h) h = '<div class="queue-note">Belum ada lagu yang diputar.</div>';
    document.getElementById('queueBody').innerHTML = h;
    document.getElementById('queueModal').style.display = 'flex';
}
function closeQueue() { document.getElementById('queueModal').style.display = 'none'; }

async function shareCurrent() {
    if (!currentTrack) { showToast('Putar lagu dulu untuk membagikan.'); return; }
    const url = currentTrack.src === 'audius'
        ? 'https://audius.co/search/' + encodeURIComponent(currentTrack.title)
        : 'https://music.youtube.com/watch?v=' + encodeURIComponent(currentTrack.videoId);
    const text = currentTrack.title + ' — ' + currentTrack.artist;
    try {
        if (navigator.share) { await navigator.share({ title: currentTrack.title, text: text, url: url }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text + '\n' + url); showToast('Tautan lagu disalin'); }
    catch (e) { showToast('Tidak bisa membagikan lagu ini.'); }
}

let sleepTimer = null, sleepTick = null, sleepEndsAt = 0, sleepAtEnd = false;
function updateSleepLabel() {
    const el = document.getElementById('sleepLabel'), btn = document.getElementById('sleepBtn');
    if (!el || !btn) return;
    if (sleepAtEnd) el.textContent = 'Akhir lagu';
    else if (sleepEndsAt) el.textContent = Math.max(1, Math.ceil((sleepEndsAt - Date.now()) / 60000)) + ' mnt';
    else el.textContent = 'Timer';
    btn.classList.toggle('on', !!(sleepAtEnd || sleepEndsAt));
}
function clearSleep() {
    clearTimeout(sleepTimer); clearInterval(sleepTick);
    sleepTimer = null; sleepTick = null; sleepEndsAt = 0; sleepAtEnd = false;
    updateSleepLabel();
}
function setSleep(min) {
    clearSleep();
    closeSleepMenu();
    if (min === 'end') { sleepAtEnd = true; showToast('Berhenti di akhir lagu'); }
    else if (min > 0) {
        sleepEndsAt = Date.now() + min * 60000;
        sleepTimer = setTimeout(() => { userPaused = true; doPause(); clearSleep(); showToast('Timer tidur selesai'); }, min * 60000);
        sleepTick = setInterval(updateSleepLabel, 15000);
        showToast('Timer tidur ' + min + ' menit');
    } else showToast('Timer tidur dimatikan');
    updateSleepLabel();
}
function openSleepMenu() { document.getElementById('sleepModal').style.display = 'flex'; }
function closeSleepMenu() { document.getElementById('sleepModal').style.display = 'none'; }

// --- 11. NAVBAR KACA: geser untuk pindah halaman + melipat saat scroll ---
const navEl = document.querySelector('.bottom-nav');
const NAV_ORDER = ['home', 'search', 'library', 'developer'];
let navCollapsed = false, navDragging = false, navMoved = false, navStartX = 0, navSuppressClick = false;

function collapseSupported() { return !!(window.IKI_ENV && IKI_ENV.android && IKI_ENV.ver >= 13); }
function collapseEnabled() { return collapseSupported() && pref.get('ikiCollapse', '1') !== '0'; }
function setNavCollapsed(v) {
    if (v && !collapseEnabled()) return;
    if (navCollapsed === v) return;
    navCollapsed = v;
    navEl.classList.toggle('collapsed', v);
    document.body.classList.toggle('nav-collapsed', v);
}
function navIdxFromX(x) {
    const r = navEl.getBoundingClientRect();
    const w = (r.width - 12) / 4;
    return Math.min(3, Math.max(0, (x - r.left - 6) / w - 0.5));
}
navEl.addEventListener('pointerdown', (e) => {
    if (navCollapsed) return;
    navDragging = true; navMoved = false; navStartX = e.clientX;
});
window.addEventListener('pointermove', (e) => {
    if (!navDragging) return;
    if (!navMoved && Math.abs(e.clientX - navStartX) > 8) {
        navMoved = true;
        navEl.classList.add('dragging');
        try { navEl.setPointerCapture(e.pointerId); } catch (err) {}
    }
    if (navMoved) navEl.style.setProperty('--idx', navIdxFromX(e.clientX));
});
function endNavDrag(e) {
    if (!navDragging) return;
    navDragging = false;
    navEl.classList.remove('dragging');
    if (navMoved) {
        const i = Math.round(navIdxFromX(e.clientX));
        switchView(NAV_ORDER[i]);
        navSuppressClick = true;
        setTimeout(() => { navSuppressClick = false; }, 80);
    }
    navMoved = false;
}
window.addEventListener('pointerup', endNavDrag);
window.addEventListener('pointercancel', endNavDrag);
navEl.addEventListener('click', (e) => {
    if (navSuppressClick) { e.stopPropagation(); e.preventDefault(); return; }
    if (navCollapsed) { e.stopPropagation(); e.preventDefault(); setNavCollapsed(false); }
}, true);

let lastScrollY = window.scrollY;
window.addEventListener('scroll', () => {
    const y = window.scrollY, dy = y - lastScrollY;
    if (Math.abs(dy) < 6) return;
    if (dy > 0 && y > 90) setNavCollapsed(true);
    else if (dy < 0 || y < 40) setNavCollapsed(false);
    lastScrollY = y;
}, { passive: true });

// --- 12. PENGATURAN TAMPILAN: kaca, font, ketebalan huruf ---
const FONTS = [
    { n: 'Bawaan sistem', f: null },
    { n: 'Rubik', f: 'Rubik', s: '300..900' },
    { n: 'Inter', f: 'Inter', s: '300..800' },
    { n: 'Poppins', f: 'Poppins', s: '300;400;500;600;700;800' },
    { n: 'Montserrat', f: 'Montserrat', s: '300..800' },
    { n: 'Nunito', f: 'Nunito', s: '300..800' },
    { n: 'Quicksand', f: 'Quicksand', s: '300..700' },
    { n: 'Lexend', f: 'Lexend', s: '300..800' },
    { n: 'DM Sans', f: 'DM Sans', s: '300..800' },
    { n: 'Manrope', f: 'Manrope', s: '300..800' },
    { n: 'Plus Jakarta Sans', f: 'Plus Jakarta Sans', s: '300..800' },
    { n: 'Outfit', f: 'Outfit', s: '300..800' },
    { n: 'Space Grotesk', f: 'Space Grotesk', s: '300..700' },
    { n: 'Sora', f: 'Sora', s: '300..800' },
    { n: 'Raleway', f: 'Raleway', s: '300..800' },
    { n: 'Work Sans', f: 'Work Sans', s: '300..800' }
];
const FW_NAMES = { 300: 'Tipis', 400: 'Normal', 500: 'Sedang', 600: 'Tebal', 700: 'Sangat tebal' };
const loadedFonts = {};

function applyFont(i) {
    const f = FONTS[i] || FONTS[0], root = document.documentElement;
    if (!f.f) { root.style.removeProperty('--app-font'); return; }
    if (!loadedFonts[f.f]) {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=' + f.f.replace(/ /g, '+') + ':wght@' + f.s + '&display=swap';
        document.head.appendChild(l);
        loadedFonts[f.f] = true;
    }
    root.style.setProperty('--app-font', "'" + f.f + "', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif");
}
function setFontPref(i) { applyFont(+i); pref.set('ikiFont', i); }

function applyWeight(w) {
    const root = document.documentElement;
    root.style.setProperty('--fw', w);
    root.style.setProperty('--fwb', Math.min(900, w + 300));
    root.classList.add('fw-custom');
    const lab = document.getElementById('fwLabel'), sl = document.getElementById('setFw');
    if (lab) lab.textContent = FW_NAMES[w] || w;
    if (sl) { sl.value = w; sl.style.setProperty('--p', ((w - 300) / 400 * 100) + '%'); }
}
function setWeightPref(v) { v = +v; applyWeight(v); pref.set('ikiFw', v); }

function setGlassPref(on) {
    pref.set('ikiGlass', on ? 'full' : 'lite');
    document.documentElement.classList.toggle('glass-full', on);
    document.documentElement.classList.toggle('glass-lite', !on);
}
function setCollapsePref(on) {
    pref.set('ikiCollapse', on ? '1' : '0');
    if (!on) setNavCollapsed(false);
}

function syncSettingsUI() {
    const g = document.getElementById('setGlass'), c = document.getElementById('setCollapse'), d = document.getElementById('setCollapseDesc');
    if (g) g.checked = document.documentElement.classList.contains('glass-full');
    if (c) {
        c.disabled = !collapseSupported();
        c.checked = collapseEnabled();
        if (d) d.textContent = collapseSupported()
            ? 'Navbar jadi lingkaran saat scroll ke bawah, mini player menempel di sebelahnya.'
            : 'Khusus Android 13 ke atas.';
    }
}
function initSettings() {
    const sel = document.getElementById('setFont');
    if (sel) sel.innerHTML = FONTS.map((f, i) => '<option value="' + i + '">' + f.n + '</option>').join('');
    const fi = parseInt(pref.get('ikiFont', '0'), 10) || 0;
    if (sel) sel.value = fi;
    applyFont(fi);
    const fw = pref.get('ikiFw', null);
    if (fw !== null) applyWeight(+fw);
    else { const sl = document.getElementById('setFw'); if (sl) sl.style.setProperty('--p', '25%'); }
    const vb = document.getElementById('volumeBar');
    if (vb) { vb.value = volume; vb.style.setProperty('--p', volume + '%'); }
    syncSettingsUI();
}
document.addEventListener('iki-env', syncSettingsUI);

window.onload = () => {
    initSettings();
    loadHomeData();
    renderSearchCategories();
};

// API YouTube bisa selesai dimuat lebih dulu daripada file ini (sering terjadi di HP) -> mulai pemutar sendiri
if (window.YT && window.YT.Player && !ytPlayer) onYouTubeIframeAPIReady();
