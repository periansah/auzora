/* Auralys v3.3.3 (dasar v3.3.0) — fitur baru. Dimuat setelah script.js (memakai fungsi & variabel globalnya). */
(function () {
'use strict';
const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
const jget = (k, d) => { try { return Object.assign({}, d, JSON.parse(pref.get(k, '{}'))); } catch (e) { return Object.assign({}, d); } };
const IC = { play: 'M8 5v14l11-7z', pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z', prev: 'M6 6h2v12H6zm3.5 6l8.5 6V6z', next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z' };
const ppSvg = '<svg class="au-pp" data-au="pp" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const PH = 'https://placehold.co/140x140/282828/FFFFFF?text=Music';
const trOf = (p) => Object.assign({ videoId: p.id, title: p.t, artist: p.a, img: p.i, thumbnail: p.i }, p.s === 'audius' ? { src: 'audius', audiusId: p.u } : {});

/* ---------- util: sheet, gambar, ekspor ---------- */
function closeSheet() { $$('.au-sheet').forEach(x => x.remove()); }
function sheet(html, tall) {
    closeSheet();
    const o = el('<div class="modal-overlay au-sheet" style="display:flex;justify-content:flex-end;background:rgba(0,0,0,.8);z-index:2800"><div class="track-menu au-sheet-box' + (tall ? ' tall' : '') + '">' + html + '</div></div>');
    o.addEventListener('click', e => { if (e.target === o) closeSheet(); });
    document.body.appendChild(o);
    return o;
}
const loadImg = (u) => new Promise(r => { if (!u) return r(null); const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => r(i); i.onerror = () => r(null); i.src = u; });
async function exportCanvas(draw, name) {      // draw(useImg) -> canvas
    let blob = null;
    for (const useImg of [true, false]) {
        try { const c = await draw(useImg); blob = await new Promise(r => c.toBlob(r, 'image/png')); if (blob) break; } catch (e) {}
    }
    if (!blob) { showToast('Gambar tidak bisa dibuat.'); return; }
    const f = new File([blob], name, { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    showToast('Gambar diunduh');
}
function rr(x, a, b, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(a, b, w, h, r); else x.rect(a, b, w, h); }
function wrapText(x, text, mw) {
    const out = [];
    text.split('\n').forEach(p => {
        if (!p.trim()) { out.push(''); return; }
        let line = ''; p.split(' ').forEach(w => { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > mw && line) { out.push(line); line = w; } else line = t; });
        out.push(line);
    });
    return out;
}
async function ensureFont(i) {
    const f = FONTS[i]; if (!f || !f.f) return 'sans-serif';
    if (!loadedFonts[f.f]) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + f.f.replace(/ /g, '+') + ':wght@' + f.s + '&display=swap'; document.head.appendChild(l); loadedFonts[f.f] = true; }
    try { await document.fonts.load('400 20px "' + f.f + '"'); await document.fonts.load('700 20px "' + f.f + '"'); } catch (e) {}
    return '"' + f.f + '"';
}

/* ---------- riwayat putar (untuk Statistik, Recap, Pencarian) ---------- */
let plays = []; try { plays = JSON.parse(pref.get('auPlays', '[]')); } catch (e) {}
let cur = null, lastTick = Date.now(), tickN = 0;
const savePlays = () => { if (plays.length > 1500) plays = plays.slice(-1500); pref.set('auPlays', JSON.stringify(plays)); };
const _pm = window.playMusic;
window.playMusic = function () {
    _pm.apply(this, arguments);
    if (currentTrack) { cur = { id: currentTrack.videoId, t: currentTrack.title, a: currentTrack.artist, i: currentTrack.img, s: currentTrack.src, u: currentTrack.audiusId, ts: Date.now(), sec: 0 }; plays.push(cur); }
};
function agg(per) {
    const cut = per === 'year' ? new Date(new Date().getFullYear(), 0, 1).getTime() : per === '30' ? Date.now() - 30 * 864e5 : 0;
    const L = plays.filter(p => p.ts >= cut && p.sec >= 5), S = {}, A = {}, H = Array(24).fill(0); let sec = 0;
    L.forEach(p => {
        sec += p.sec;
        const s = S[p.id] || (S[p.id] = { p, n: 0, sec: 0 }); s.n++; s.sec += p.sec;
        const a = A[p.a] || (A[p.a] = { name: p.a, img: p.i, n: 0, sec: 0 }); a.n++; a.sec += p.sec;
        H[new Date(p.ts).getHours()] += p.sec;
    });
    const top = (o, k) => Object.values(o).sort((x, y) => y[k] - x[k]);
    return { sec, n: L.length, songs: top(S, 'n'), artists: top(A, 'sec'), peak: H.indexOf(Math.max.apply(null, H)), has: L.length > 0 };
}
const PER = { year: String(new Date().getFullYear()), '30': '30 hari', all: 'Sepanjang waktu' };

/* ---------- Pencarian baru ---------- */
const GENRES = ['Pop', 'Rock', 'Hip-hop', 'Dangdut', 'Jazz', 'EDM', 'Indie', 'Lo-fi', 'R&B', 'K-pop', 'Akustik', 'Metal'];
function initSearch() {
    const host = $('#searchCategoriesUI'); if (!host) return;
    host.parentNode.insertBefore(el('<div class="au-chips" id="auChips">' + [['recent', 'Terakhir diputar'], ['top', 'Paling sering diputar'], ['artists', 'Artis favorit'], ['genre', 'Genre pilihan']].map(c => '<div class="pill" data-k="' + c[0] + '">' + c[1] + '</div>').join('') + '</div>'), host);
    $('#auChips').onclick = e => {
        const k = e.target.dataset && e.target.dataset.k; if (!k) return;
        $$('#auChips .pill').forEach(p => p.classList.toggle('active', p.dataset.k === k));
        $('#searchInput').value = '';
        $('#searchCategoriesUI').style.display = 'none'; $('#searchResultsUI').style.display = 'block';
        const box = $('#searchResults'), seen = new Set();
        const empty = '<div style="color:var(--text-sub);text-align:center">Belum ada riwayat. Putar beberapa lagu dulu.</div>';
        if (k === 'genre') { box.innerHTML = '<div class="au-row">' + GENRES.map(g => '<div class="pill" data-g="' + esc(g) + '">' + esc(g) + '</div>').join('') + '</div>'; return; }
        if (k === 'recent') { box.innerHTML = plays.slice().reverse().filter(p => !seen.has(p.id) && seen.add(p.id)).slice(0, 25).map(p => createListHTML(trOf(p))).join('') || empty; }
        if (k === 'top') { box.innerHTML = agg('all').songs.slice(0, 25).map(s => createListHTML(trOf(s.p))).join('') || empty; }
        if (k === 'artists') { box.innerHTML = '<div class="au-grid" style="padding:0">' + agg('all').artists.slice(0, 20).map(a => createCardHTML({ videoId: 'a:' + a.name, title: a.name, artist: '', img: a.img }, true)).join('') + '</div>' || empty; if (!plays.length) box.innerHTML = empty; }
    };
    $('#searchResults').addEventListener('click', e => { const g = e.target.dataset && e.target.dataset.g; if (!g) return; const i = $('#searchInput'); i.value = g + ' lagu populer'; i.dispatchEvent(new Event('input')); });
}

/* ---------- Dynamic Island ---------- */
const ISL_D = { on: false, style: 'black', radius: 24, glow: 24, pos: 'center', y: 10, size: 100 };
const PRESETS = {
    Default: { style: 'black', radius: 24, glow: 24, pos: 'center', y: 10, size: 100 }, Minimal: { style: 'black', radius: 18, glow: 0, pos: 'center', y: 6, size: 88 },
    Neon: { style: 'glass', radius: 30, glow: 70, pos: 'center', y: 12, size: 104 }, Kaca: { style: 'glass', radius: 26, glow: 28, pos: 'center', y: 10, size: 100 },
    Cover: { style: 'cover', radius: 28, glow: 48, pos: 'center', y: 10, size: 106 }, Kiri: { style: 'black', radius: 22, glow: 20, pos: 'left', y: 8, size: 92 }
};
let isl = jget('auIsl', ISL_D), previewing = false, pip = false, islTimer;
const I = el('<div class="au-isl" id="auIsland"><div class="au-isl-bg"></div><div class="au-isl-row" data-au="tog"><img class="au-isl-img" alt=""><div class="au-isl-txt"><b></b><span></span></div><div class="au-eq"><i></i><i></i><i></i></div></div>' +
    '<div class="au-isl-ext"><div class="au-isl-bar"><i></i></div><div class="au-isl-ctl"><svg data-au="prev" viewBox="0 0 24 24"><path d="' + IC.prev + '"/></svg>' + ppSvg + '<svg data-au="next" viewBox="0 0 24 24"><path d="' + IC.next + '"/></svg><svg data-au="open" viewBox="0 0 24 24"><path d="M7 14l5-5 5 5z"/></svg></div></div></div>');
function applyIsl() {
    I.style.setProperty('--r', isl.radius + 'px'); I.style.setProperty('--glow', isl.glow + 'px'); I.style.setProperty('--sc', isl.size / 100); I.style.setProperty('--y', isl.y + 'px');
    I.classList.remove('st-black', 'st-glass', 'st-cover', 'pl', 'pr'); I.classList.add('st-' + isl.style);
    if (isl.pos === 'left') I.classList.add('pl'); if (isl.pos === 'right') I.classList.add('pr');
}
const saveIsl = () => { pref.set('auIsl', JSON.stringify(isl)); applyIsl(); };
function islSheet() {
    previewing = true;
    const pills = (name, opts, val) => '<div class="au-row" data-f="' + name + '">' + opts.map(o => '<div class="pill' + (String(val) === String(o[0]) ? ' sel' : '') + '" data-v="' + o[0] + '">' + o[1] + '</div>').join('') + '</div>';
    const rng = (k, l, a, b) => '<label>' + l + '</label><input type="range" data-r="' + k + '" min="' + a + '" max="' + b + '" value="' + isl[k] + '">';
    const o = sheet('<div class="sheet-title">Dynamic Island</div><label>Preset</label><div class="au-row" data-p>' + Object.keys(PRESETS).map(n => '<div class="pill">' + n + '</div>').join('') + '</div>' +
        '<label>Gaya</label>' + pills('style', [['black', 'Hitam'], ['glass', 'Kaca'], ['cover', 'Warna cover']], isl.style) + '<label>Posisi</label>' + pills('pos', [['left', 'Kiri'], ['center', 'Tengah'], ['right', 'Kanan']], isl.pos) +
        rng('radius', 'Sudut', 8, 40) + rng('glow', 'Cahaya', 0, 100) + rng('size', 'Ukuran', 80, 120) + rng('y', 'Jarak dari atas', 0, 60) + '<div class="au-row" style="margin-top:16px"><button class="au-btn ghost" data-pip>Kapsul melayang (PiP)</button><button class="au-btn" data-done>Selesai</button></div>', true);
    const done = () => { previewing = false; closeSheet(); };
    o.addEventListener('click', e => { if (e.target === o) previewing = false; });
    o.onclick = e => {
        const t = e.target;
        if (t === o) { done(); return; }
        if (t.dataset.done !== undefined) done();
        else if (t.dataset.pip !== undefined) smartPip(true);
        else if (t.parentNode.dataset.p !== undefined) { Object.assign(isl, PRESETS[t.textContent]); saveIsl(); islSheet(); }
        else if (t.dataset.v !== undefined) { isl[t.parentNode.dataset.f] = t.dataset.v; saveIsl(); $$('.pill', t.parentNode).forEach(p => p.classList.toggle('sel', p === t)); }
    };
    o.oninput = e => { if (e.target.dataset.r) { isl[e.target.dataset.r] = +e.target.value; saveIsl(); } };
}
function openPip(force) {   // Chrome desktop: kapsul ikut melayang saat pindah tab (Document Picture-in-Picture)
    if ((!isl.on && !force) || !window.documentPictureInPicture || pip) return;
    documentPictureInPicture.requestWindow({ width: 360, height: 130 }).then(w => {
        $$('link[rel=stylesheet]').forEach(l => w.document.head.appendChild(l.cloneNode()));
        w.document.body.style.cssText = 'margin:0;background:#000;overflow:hidden'; pip = true; I.classList.add('pip', 'open', 'show'); w.document.body.appendChild(I);
        w.addEventListener('pagehide', () => { pip = false; I.classList.remove('pip'); document.body.appendChild(I); });
        w.document.addEventListener('click', e => { const b = e.target.closest('[data-au]'); if (b && b.dataset.au !== 'tog') act(b.dataset.au); });
    }).catch(() => {});
}


/* ---------- Kapsul melayang lewat Picture-in-Picture video (Android & browser tanpa Document PiP) ---------- */
const PV = document.createElement('video'), PC = document.createElement('canvas');
PC.width = 480; PC.height = 200; PV.muted = true; PV.playsInline = true;
PV.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none';
let pImg = null, pImgSrc = '', pTimer;
async function drawPip() {
    const T = currentTrack, x = PC.getContext('2d'); if (!T) return;
    if (T.img !== pImgSrc) { pImgSrc = T.img; pImg = null; loadImg(T.img).then(i => { if (pImgSrc === T.img) pImg = i; }); }
    x.fillStyle = '#0b0b0f'; x.fillRect(0, 0, 480, 200);
    x.fillStyle = 'rgba(30,215,96,.18)'; x.fillRect(0, 0, 480, 200);
    x.fillStyle = '#0b0b0f'; rr(x, 6, 6, 468, 188, 40); x.fill();
    if (pImg) { x.save(); rr(x, 28, 28, 108, 108, 20); x.clip(); x.drawImage(pImg, 28, 28, 108, 108); x.restore(); } else { x.fillStyle = '#282828'; rr(x, 28, 28, 108, 108, 20); x.fill(); }
    const fit = (t, w) => { let o = t; while (x.measureText(o).width > w && o.length > 1) o = o.slice(0, -1); return o === t ? t : o + '…'; };
    x.fillStyle = '#fff'; x.textBaseline = 'top'; x.font = '700 28px sans-serif'; x.fillText(fit(T.title, 250), 156, 36);
    x.globalAlpha = .7; x.font = '400 21px sans-serif'; x.fillText(fit(T.artist, 250), 156, 76); x.globalAlpha = 1;
    const t = Date.now() / 250;   // equalizer / ikon jeda
    if (isPlaying) { x.fillStyle = '#1ed760'; for (let i = 0; i < 3; i++) { const h = 10 + Math.abs(Math.sin(t + i * 1.7)) * 26; x.fillRect(404 + i * 14, 66 - h, 8, h); } }
    else { x.fillStyle = '#fff'; x.fillRect(408, 38, 9, 28); x.fillRect(426, 38, 9, 28); }
    const d = getDur(), c = getCur(); x.fillStyle = 'rgba(255,255,255,.2)'; rr(x, 156, 124, 292, 10, 5); x.fill();
    x.fillStyle = '#fff'; rr(x, 156, 124, Math.max(10, d ? 292 * Math.min(1, c / d) : 0), 10, 5); x.fill();
    x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '500 18px sans-serif'; x.fillText(formatTime(c), 156, 148); x.textAlign = 'right'; x.fillText(d ? formatTime(d) : '', 448, 148); x.textAlign = 'left';
}
PV.addEventListener('pause', () => { if (isPlaying && document.pictureInPictureElement === PV) togglePlay(); });
PV.addEventListener('play', () => { if (!isPlaying && document.pictureInPictureElement === PV) togglePlay(); });
async function openVidPip() {
    if (!currentTrack) { showToast('Putar lagu dulu.'); return; }
    try {
        if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return; }
        if (!PV.isConnected) document.body.appendChild(PV);
        await drawPip();
        if (!PV.srcObject) PV.srcObject = PC.captureStream(10);
        await PV.play(); await PV.requestPictureInPicture();
        clearInterval(pTimer); pTimer = setInterval(drawPip, 500);
        PV.addEventListener('leavepictureinpicture', () => { clearInterval(pTimer); PV.pause(); }, { once: true });
    } catch (e) { showToast('Tidak bisa membuka jendela melayang di browser ini.'); }
}
function smartPip(force) {
    if (window.documentPictureInPicture) openPip(force);
    else if (document.pictureInPictureEnabled && (force || isl.on)) openVidPip();
    else if (force) showToast('Browser ini tidak mendukung jendela melayang.');
}

/* ---------- Widget Auralys Glass ---------- */
const W = el('<div class="au-widget" id="auWidget"><img alt=""><b></b><span class="a"></span><div class="au-wctl"><svg data-au="prev" viewBox="0 0 24 24"><path d="' + IC.prev + '"/></svg>' + ppSvg + '<svg data-au="next" viewBox="0 0 24 24"><path d="' + IC.next + '"/></svg></div></div>');
(function () {
    let d = null;
    W.addEventListener('pointerdown', e => { if (e.target.closest('[data-au]')) return; const r = W.getBoundingClientRect(); d = { x: e.clientX - r.left, y: e.clientY - r.top }; W.setPointerCapture(e.pointerId); });
    W.addEventListener('pointermove', e => { if (!d) return; W.style.left = Math.min(innerWidth - W.offsetWidth, Math.max(0, e.clientX - d.x)) + 'px'; W.style.top = Math.max(0, e.clientY - d.y) + 'px'; W.style.right = 'auto'; });
    W.addEventListener('pointerup', () => { if (d) { pref.set('auWPos', W.style.left + '|' + W.style.top); d = null; } });
})();

/* ---------- Mode Ambient ---------- */
const AMB = el('<div class="au-amb" id="auAmb" data-au="closeAmb"><div class="amb-bg"></div><div class="amb-bg b"></div><div class="amb-clock"></div><img class="amb-art" alt=""><div class="amb-t"></div><div class="amb-a"></div><div class="amb-bar"><i></i></div>' + ppSvg + '</div>');
let wake = null;
function openAmb() { if (!currentTrack) { showToast('Putar lagu dulu.'); return; } AMB.classList.add('show'); AMB._k = ''; try { navigator.wakeLock.request('screen').then(w => wake = w).catch(() => {}); } catch (e) {} }
function closeAmb() { AMB.classList.remove('show'); try { if (wake) wake.release(); } catch (e) {} wake = null; }

/* ---------- aksi bersama (delegasi klik) ---------- */
function act(a) {
    if (a === 'prev') playPrev(); else if (a === 'next') playNextSimilarSong(); else if (a === 'pp') togglePlay();
    else if (a === 'open') { I.classList.remove('open'); expandPlayer(); } else if (a === 'closeAmb') closeAmb(); else if (a === 'amb2') openAmb(); else if (a === 'pip2') smartPip(true);
    else if (a === 'tog') { I.classList.toggle('open'); clearTimeout(islTimer); if (I.classList.contains('open') && !pip) islTimer = setTimeout(() => I.classList.remove('open'), 6000); }
}
document.addEventListener('click', e => {
    const b = e.target.closest('[data-au]'); if (!b || !document.body.contains(b)) return;
    if (b.dataset.au === 'closeAmb' && e.target.closest('.au-pp')) return;   // tombol play di Ambient tidak menutup
    e.stopPropagation(); act(b.dataset.au);
}, true);

/* ---------- tick UI (1 dtk) ---------- */
function uiTick() {
    const root = document.documentElement; root.classList.toggle('au-paused', !isPlaying);
    const T = currentTrack || (previewing ? { title: 'Auralys', artist: 'Pratinjau Dynamic Island', img: PH } : null);
    const open = $('#playerModal').style.display === 'flex' || $('#lyricsModal').style.display === 'flex';
    I.classList.toggle('show', !!(T && (pip || ((isl.on || previewing) && (!open || previewing)))));
    W.classList.toggle('show', !!(T && pref.get('auWid', '0') === '1' && !open));
    $$('.au-pp path').forEach(p => p.setAttribute('d', isPlaying ? IC.pause : IC.play));
    if (!T) return;
    const k = T.title + T.img;
    if (I._k !== k) { I._k = k; $('img', I).src = T.img; $('b', I).textContent = T.title; $('.au-isl-txt span', I).textContent = T.artist; $('.au-isl-bg', I).style.backgroundImage = 'url("' + T.img + '")'; }
    if (W._k !== k) { W._k = k; $('img', W).src = T.img; $('b', W).textContent = T.title; $('.a', W).textContent = T.artist; }
    const d = getDur(), c = getCur(), pc = d ? Math.min(100, c / d * 100) + '%' : '0%';
    $('.au-isl-bar i', I).style.width = pc;
    if (AMB.classList.contains('show')) {
        if (AMB._k !== k) { AMB._k = k; $$('.amb-bg', AMB).forEach(x => x.style.backgroundImage = 'url("' + T.img + '")'); $('.amb-art', AMB).src = T.img; $('.amb-t', AMB).textContent = T.title; $('.amb-a', AMB).textContent = T.artist; }
        $('.amb-bar i', AMB).style.width = pc; $('.amb-clock', AMB).textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }
}
setInterval(() => {
    const n = Date.now(), dt = Math.min((n - lastTick) / 1000, 120); lastTick = n;
    if (isPlaying && cur) { cur.sec += dt; if (++tickN % 15 === 0) savePlays(); }
    uiTick();
}, 1000);
addEventListener('pagehide', savePlays);
document.addEventListener('visibilitychange', () => { if (document.hidden) savePlays(); });
try { navigator.mediaSession.setActionHandler('enterpictureinpicture', () => smartPip(false)); } catch (e) {}

/* ---------- Terjemahan lirik (Google gratis / DeepL via backend) ---------- */
const LANGS = [['id', 'Indonesia'], ['en', 'Inggris'], ['ja', 'Jepang'], ['ko', 'Korea'], ['es', 'Spanyol'], ['fr', 'Prancis'], ['de', 'Jerman'], ['ar', 'Arab'], ['zh-CN', 'Mandarin'], ['pt', 'Portugis'], ['ru', 'Rusia'], ['hi', 'Hindi'], ['th', 'Thai'], ['ms', 'Melayu']];
const phoneLang = (() => { const l = (navigator.language || 'id').split('-')[0].toLowerCase(); if (l === 'zh') return 'zh-CN'; return LANGS.some(x => x[0] === l) ? l : 'id'; })();
let lyrText = '', synced = null, syncIdx = -1, lyrLines = [], lastUser = 0, offKey = '';
const getOff = () => parseFloat(pref.get(offKey, '0')) || 0;
function updSyncBar() {
    const bar = $('#auSyncBar'); if (!bar) return;
    bar.style.display = synced ? 'flex' : 'none';
    const o = getOff(); const v = $('#auSyncVal'); if (v) v.textContent = (o > 0 ? '+' : '') + o.toFixed(1) + 's';
}
function renderSynced(tr) {       // tr: {indeks: terjemahan} (opsional)
    lyricsBody.textContent = ''; lyricsBody.classList.add('synced');
    synced.forEach((r, i) => {
        const d = el('<div class="lyr-line"></div>'), sp = document.createElement('span');
        sp.textContent = r[1] || '♪'; d.appendChild(sp); d.dataset.i = i;
        if (tr && tr[i]) { const t = el('<div class="lyr-t"></div>'); t.textContent = tr[i]; d.appendChild(t); }
        lyricsBody.appendChild(d);
    });
    lyrLines = $$('.lyr-line', lyricsBody);
    const s = el('<span class="lyrics-source"></span>'); s.textContent = 'LRCLIB • tersinkron — ketuk baris untuk loncat'; lyricsBody.appendChild(s);
    syncIdx = -2; syncLyrics(true);
}
const _ol = window.openLyrics;
window.openLyrics = async function (t) {
    lyrText = ''; synced = null; syncIdx = -1; lyrLines = []; lyricsBody.classList.remove('synced'); window._lyrData = null; offKey = 'auLo:' + (t && t.videoId); updSyncBar();
    await _ol.apply(this, arguments);
    const D = window._lyrData, ok = !lyricsBody.querySelector('.lyrics-msg');
    if (ok && D && D.synced && D.synced.length) { synced = D.synced; lyrText = D.lyrics || ''; renderSynced(); }
    else if (ok && lyricsBody.firstChild) lyrText = lyricsBody.firstChild.textContent || '';
    updSyncBar();
};
function centerLine(e, smooth) {
    const br = lyricsBody.getBoundingClientRect(), lr = e.getBoundingClientRect();
    lyricsBody.scrollBy({ top: lr.top - br.top - (br.height / 2 - lr.height / 2), behavior: smooth ? 'smooth' : 'auto' });
}
function syncLyrics(force) {
    if (!synced || lyricsModal.style.display !== 'flex' || !currentTrack || !lyricsTrack || currentTrack.videoId !== lyricsTrack.videoId) return;
    const c = getCur() + .25 + getOff();
    let lo = 0, hi = synced.length - 1, i = -1;           // pencarian biner: baris terakhir yang waktunya <= posisi lagu
    while (lo <= hi) { const m = (lo + hi) >> 1; if (synced[m][0] <= c) { i = m; lo = m + 1; } else hi = m - 1; }
    if (i === syncIdx && !force) {
        if (lastUser && Date.now() - lastUser > 4000) { lastUser = 0; if (lyrLines[i]) centerLine(lyrLines[i], true); }   // kembali mengikuti setelah pengguna berhenti menggulir
        return;
    }
    const jump = Math.abs(i - syncIdx) > 1; syncIdx = i;
    lyrLines.forEach((e, k) => { e.classList.toggle('on', k === i); e.classList.toggle('past', k < i); });
    if (lyrLines[i] && (!lastUser || Date.now() - lastUser > 4000 || force)) { lastUser = 0; centerLine(lyrLines[i], !jump || !force); }
}
lyricsBody.addEventListener('click', e => {
    const l = e.target.closest('.lyr-line'); if (!l || !synced) return;
    if (!currentTrack || currentTrack.videoId !== lyricsTrack.videoId) { showToast('Putar lagu ini dulu untuk loncat ke baris lirik.'); return; }
    doSeek(Math.max(0, synced[+l.dataset.i][0] - getOff())); lastUser = 0; syncLyrics(true);
});
['touchstart', 'wheel', 'pointerdown'].forEach(ev => lyricsBody.addEventListener(ev, () => { lastUser = Date.now(); }, { passive: true }));
async function trSynced(tl) {      // terjemahkan per baris supaya tetap tersinkron
    const ne = []; synced.forEach((r, i) => { if ((r[1] || '').trim()) ne.push(i); });
    const out = (await translateText(ne.map(i => synced[i][1]).join('\n'), tl)).split('\n');
    if (out.length !== ne.length) return false;
    const m = {}; ne.forEach((i, k) => { m[i] = out[k]; }); renderSynced(m); return true;
}
async function googleTr(text, tl) {
    const lines = text.split('\n'), chunks = []; let c = '';
    lines.forEach(l => { if ((c + l).length > 1500) { chunks.push(c); c = ''; } c += l + '\n'; }); if (c) chunks.push(c);
    const out = [];
    for (const ch of chunks) {
        const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + encodeURIComponent(tl) + '&dt=t&q=' + encodeURIComponent(ch.replace(/\n$/, '')));
        const j = await r.json(); out.push(j[0].map(s => s[0]).join(''));
    }
    return out.join('\n');
}
async function translateText(text, tl) {
    if (pref.get('auTp', 'google') === 'deepl') {
        const r = await fetch('/api/deepl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: pref.get('auDk', ''), text: text, target: tl.split('-')[0] }) });
        const j = await r.json(); if (j.status !== 'success') throw new Error(j.message); return j.data;
    }
    return googleTr(text, tl);
}
function showTranslation(orig, tr) {
    const a = orig.split('\n'), b = tr.split('\n'); lyricsBody.textContent = '';
    if (a.length === b.length) a.forEach((l, i) => { if (!l.trim()) { lyricsBody.appendChild(el('<div style="height:10px"></div>')); return; } const o = el('<div class="lyr-o"></div>'), t = el('<div class="lyr-t"></div>'); o.textContent = l; t.textContent = b[i]; lyricsBody.append(o, t); });
    else { const o = el('<div class="lyr-o"></div>'), t = el('<div class="lyr-t" style="white-space:pre-wrap;margin-top:24px"></div>'); o.textContent = orig; t.textContent = tr; lyricsBody.append(o, t); }
}
function trSheet() {
    if (!lyrText) { showToast('Lirik belum tersedia untuk diterjemahkan.'); return; }
    const o = sheet('<div class="sheet-title">Terjemahkan lirik</div><label>Ke bahasa</label><select id="auTl">' + LANGS.map(l => '<option value="' + l[0] + '"' + (l[0] === pref.get('auTl', phoneLang) ? ' selected' : '') + '>' + l[1] + '</option>').join('') + '</select>' +
        '<label>Penerjemah: ' + (pref.get('auTp', 'google') === 'deepl' ? 'DeepL' : 'Google Terjemahan (gratis)') + ' — ubah di Developer › Tampilan</label><div class="au-row" style="margin-top:16px"><button class="au-btn" id="auDoTr">Terjemahkan</button><button class="au-btn ghost" id="auUnTr">Tampilkan asli</button></div>');
    $('#auDoTr', o).onclick = async () => {
        const tl = $('#auTl', o).value; pref.set('auTl', tl); closeSheet(); showToast('Menerjemahkan...');
        try { if (synced && await trSynced(tl)) return; showTranslation(lyrText, await translateText(lyrText, tl)); } catch (e) { showToast('Gagal menerjemahkan: ' + (e.message || 'periksa koneksi')); }
    };
    $('#auUnTr', o).onclick = () => { closeSheet(); window.openLyrics(lyricsTrack, lyricsFollowsPlayer); };
}

/* ---------- Bagikan lirik sebagai gambar ---------- */
async function drawLyr(o, useImg) {
    const W_ = 1080, H = o.size === 'story' ? 1920 : 1080, c = document.createElement('canvas'); c.width = W_; c.height = H;
    const x = c.getContext('2d'), img = useImg ? await loadImg(o.img) : null, fam = await ensureFont(o.font);
    if (o.bg === 2) { x.fillStyle = '#0b0b0f'; x.fillRect(0, 0, W_, H); }
    else if (o.bg === 3) { x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, W_, H); }
    else if (o.bg === 0 && img) { x.filter = 'blur(50px)'; const s = Math.max(W_, H) / Math.min(img.width, img.height) * 1.2; x.drawImage(img, (W_ - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s); x.filter = 'none'; x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 0, W_, H); }
    else {
        let a = '#1ed760', b = '#6a2bd9';
        if (img) { try { const t = document.createElement('canvas'); t.width = t.height = 2; const tx = t.getContext('2d'); tx.drawImage(img, 0, 0, 2, 2); const d = tx.getImageData(0, 0, 2, 2).data, f = i => 'rgb(' + (d[i] * .6 | 0) + ',' + (d[i + 1] * .6 | 0) + ',' + (d[i + 2] * .6 | 0) + ')'; a = f(0); b = f(12); } catch (e) {} }
        const g = x.createLinearGradient(0, 0, W_, H); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, 0, W_, H);
    }
    const pad = 90, top = pad + 40, bot = H - pad - 190; let fs = o.size === 'story' ? 84 : 72, lines = [];
    for (; fs >= 30; fs -= 4) { x.font = o.fw + ' ' + fs + 'px ' + fam; lines = wrapText(x, o.text, W_ - pad * 2); if (lines.length * fs * 1.3 <= bot - top) break; }
    x.fillStyle = o.color; x.textAlign = o.align; x.textBaseline = 'top';
    const tx = o.align === 'left' ? pad : o.align === 'right' ? W_ - pad : W_ / 2; let y = top + Math.max(0, (bot - top - lines.length * fs * 1.3) / 2);
    lines.forEach(l => { x.fillText(l, tx, y); y += fs * 1.3; });
    if (img) { x.save(); rr(x, pad, H - pad - 130, 120, 120, 18); x.clip(); x.drawImage(img, pad, H - pad - 130, 120, 120); x.restore(); }
    const fx = pad + (img ? 150 : 0); x.textAlign = 'left'; x.font = '700 38px ' + fam; x.fillText(o.title.slice(0, 34), fx, H - pad - 125);
    x.globalAlpha = .7; x.font = '400 30px ' + fam; x.fillText(o.artist.slice(0, 40), fx, H - pad - 75);
    x.globalAlpha = .5; x.font = '600 24px ' + fam; x.textAlign = 'right'; x.fillText('Auralys', W_ - pad, H - pad - 40);
    return c;
}
function lyrImgSheet() {
    const t = lyricsTrack; if (!t) return;
    const first = lyrText.split('\n').filter(l => l.trim()).slice(0, 4).join('\n');
    const o = sheet('<div class="sheet-title">Bagikan lirik</div><canvas class="au-prev" id="auPv"></canvas><label>Teks (boleh diedit)</label><textarea id="auTx">' + esc(first) + '</textarea>' +
        '<label>Latar</label><div class="au-row" id="auBg">' + ['Cover blur', 'Gradien', 'Hitam', 'Terang'].map((n, i) => '<div class="pill' + (i === 0 ? ' sel' : '') + '" data-i="' + i + '">' + n + '</div>').join('') + '</div>' +
        '<label>Ukuran</label><div class="au-row" id="auSz"><div class="pill sel" data-i="square">Square</div><div class="pill" data-i="story">Story</div></div>' +
        '<label>Font</label><select id="auFt">' + FONTS.map((f, i) => '<option value="' + i + '">' + f.n + '</option>').join('') + '</select>' +
        '<label>Ketebalan</label><input type="range" id="auFw" min="300" max="800" step="100" value="700"><label>Rata teks</label><div class="au-row" id="auAl"><div class="pill" data-i="left">Kiri</div><div class="pill sel" data-i="center">Tengah</div><div class="pill" data-i="right">Kanan</div></div>' +
        '<label>Warna teks</label><input type="color" id="auCl" value="#ffffff"><div class="au-row" style="margin-top:16px"><button class="au-btn" id="auGo">Bagikan</button><button class="au-btn ghost" id="auDl">Tutup</button></div>', true);
    const sel = id => { const e = $('#' + id + ' .sel', o); return e ? e.dataset.i : null; };
    const read = () => ({ text: $('#auTx', o).value || t.title, bg: +sel('auBg'), size: sel('auSz'), font: +$('#auFt', o).value, fw: $('#auFw', o).value, align: sel('auAl'), color: $('#auCl', o).value, img: t.img, title: t.title, artist: t.artist });
    let n = 0; const redraw = async () => { const id = ++n; let c; try { c = await drawLyr(read(), true); } catch (e) { c = await drawLyr(read(), false); } if (id !== n) return; const pv = $('#auPv', o); pv.width = c.width; pv.height = c.height; pv.getContext('2d').drawImage(c, 0, 0); };
    o.addEventListener('click', e => { const p = e.target.closest('.pill'); if (p) { $$('.pill', p.parentNode).forEach(x => x.classList.toggle('sel', x === p)); if (p.parentNode.id === 'auBg') $('#auCl', o).value = p.dataset.i === '3' ? '#111111' : '#ffffff'; redraw(); } });
    o.addEventListener('input', redraw);
    $('#auGo', o).onclick = () => exportCanvas(u => drawLyr(read(), u), 'lirik-auralys.png');
    $('#auDl', o).onclick = closeSheet; redraw();
}

/* ---------- Impor playlist Spotify / Apple Music ---------- */
function importSheet() {
    const o = sheet('<div class="sheet-title">Impor playlist</div><label>Tempel link Spotify atau Apple Music</label><input type="text" id="auUrl" placeholder="https://open.spotify.com/playlist/..."><div id="auImpSt" class="queue-note" style="margin-top:12px">Spotify dibaca sampai 100 lagu pertama. Playlist harus publik.</div><div style="margin-top:16px"><button class="au-btn" id="auImpGo">Impor</button></div>');
    $('#auImpGo', o).onclick = async () => {
        const url = $('#auUrl', o).value.trim(), st = $('#auImpSt', o); if (!url) return;
        st.textContent = 'Membaca playlist...';
        try {
            const j = await (await fetch('/api/import?url=' + encodeURIComponent(url))).json();
            if (j.status !== 'success') { st.textContent = j.message || 'Gagal membaca link.'; return; }
            const list = j.data.tracks, res = [];
            let i = 0, done = 0;
            const worker = async () => {
                while (i < list.length) {
                    const it = list[i++];
                    try { const r = await (await fetch('/api/search?query=' + encodeURIComponent(it.title + ' ' + it.artist))).json(); if (r.status === 'success' && r.data[0]) { const m = r.data[0]; res[list.indexOf(it)] = { videoId: m.videoId, title: m.title, artist: m.artist, img: getHighResImage(m.thumbnail) }; } } catch (e) {}
                    st.textContent = 'Mencocokkan lagu ' + (++done) + '/' + list.length + '...';
                }
            };
            await Promise.all([worker(), worker(), worker(), worker()]);
            const tracks = res.filter(Boolean);
            if (!tracks.length) { st.textContent = 'Tidak ada lagu yang cocok ditemukan.'; return; }
            const tx = db.transaction('playlists', 'readwrite');
            tx.objectStore('playlists').put({ id: Date.now().toString(), name: j.data.name, img: j.data.img || tracks[0].img, tracks: tracks });
            tx.oncomplete = () => { closeSheet(); renderLibraryUI(); showToast('Diimpor: ' + tracks.length + ' dari ' + list.length + ' lagu'); };
        } catch (e) { st.textContent = 'Gagal impor. Periksa koneksi atau link.'; }
    };
}

/* ---------- Statistik & Recap ---------- */
let statPer = 'year';
function renderStats() {
    const a = agg(statPer), v = $('#view-stats');
    v.innerHTML = '<div style="padding:40px 16px 12px;display:flex;align-items:center;gap:12px"><svg viewBox="0 0 24 24" style="width:28px;height:28px;fill:#fff;cursor:pointer" onclick="switchView(\'library\')"><path d="M15.957 2.793a1 1 0 010 1.414L8.164 12l7.793 7.793a1 1 0 11-1.414 1.414L5.336 12l9.207-9.207a1 1 0 011.414 0z"/></svg><h1 style="font-size:24px">Statistik</h1></div>' +
        '<div class="au-chips">' + Object.keys(PER).map(k => '<div class="pill' + (k === statPer ? ' active' : '') + '" data-per="' + k + '">' + PER[k] + '</div>').join('') + '</div>' +
        '<div class="au-card" id="auRcCard" style="margin-bottom:20px"><div>Recap ' + PER[statPer] + '<small>Lihat rangkuman dengar musikmu</small></div><span style="font-size:26px">▶</span></div>' +
        (a.has ? '<div class="st-grid"><div class="st-box"><small>Menit didengar</small><div class="st-big">' + Math.round(a.sec / 60) + '</div></div><div class="st-box"><small>Lagu diputar</small><div class="st-big">' + a.n + '</div></div></div>' +
            '<h2 class="section-title" style="font-size:18px">Lagu teratas</h2><div class="vertical-list" style="margin-bottom:24px">' + a.songs.slice(0, 5).map(s => createListHTML(trOf(s.p))).join('') + '</div>' +
            '<h2 class="section-title" style="font-size:18px">Artis teratas</h2><div class="au-grid">' + a.artists.slice(0, 6).map(x => createCardHTML({ videoId: 'a:' + x.name, title: x.name, artist: '', img: x.img }, true)).join('') + '</div>'
            : '<div style="color:var(--text-sub);text-align:center;padding:40px 16px">Belum ada data untuk periode ini. Putar beberapa lagu dulu.</div>');
}
function initStats() {
    $('#view-developer').insertAdjacentElement('afterend', el('<div id="view-stats" class="view-section"></div>'));
    $('#view-stats').addEventListener('click', e => {
        const p = e.target.closest('[data-per]'); if (p) { statPer = p.dataset.per; renderStats(); return; }
        if (e.target.closest('#auRcCard')) openRecap(statPer);
    });
    const lib = $('#view-library'), act_ = $('.lib-actions', lib);
    act_.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 24 24" id="auImpBtn"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>');
    $('#auImpBtn').onclick = importSheet;
    $('#libraryContainer').insertAdjacentElement('beforebegin', el('<div class="au-card" id="auStatCard" style="margin-top:12px"><div>Statistik & Recap<small>Rangkuman dengar musikmu</small></div><span style="font-size:26px">›</span></div>'));
    $('#auStatCard').onclick = () => { switchView('stats'); renderStats(); };
}
const AR = el('<div class="au-rc" id="auRc"><div class="rc-bars"></div><div class="rc-stage"></div><div class="rc-foot"><button class="au-btn" id="rcPoster">Poster</button><button class="au-btn ghost" id="rcClose">Tutup</button></div></div>');
let rcI = 0, rcS = [], rcT, rcA, rcL;
function slides(a, label) {
    const s1 = a.songs[0];
    return ['<div class="rc-s g1"><small>Recap ' + esc(label) + '</small><h1>' + Math.round(a.sec / 60) + '</h1><p>menit mendengarkan musik</p><small>' + a.n + ' lagu diputar</small></div>',
        s1 ? '<div class="rc-s g2"><small>Lagu nomor satu</small><img src="' + esc(s1.p.i) + '"><h2>' + esc(s1.p.t) + '</h2><p>' + esc(s1.p.a) + ' • ' + s1.n + '× diputar</p></div>' : '',
        '<div class="rc-s g3"><small>Artis teratas</small><ol>' + a.artists.slice(0, 5).map(x => '<li>' + esc(x.name) + '<span>' + Math.round(x.sec / 60) + ' mnt</span></li>').join('') + '</ol></div>',
        '<div class="rc-s g4"><small>Jam favoritmu</small><h1>' + String(a.peak).padStart(2, '0') + ':00</h1><p>Waktu paling sering kamu mendengarkan</p></div>'].filter(Boolean);
}
function rcShow(i) {
    clearTimeout(rcT); rcI = Math.max(0, Math.min(rcS.length - 1, i));
    $('.rc-stage', AR).innerHTML = rcS[rcI]; $('.rc-bars', AR).innerHTML = rcS.map((_, k) => '<i class="' + (k < rcI ? 'done' : k === rcI ? 'on' : '') + '"></i>').join('');
    if (rcI < rcS.length - 1) rcT = setTimeout(() => rcShow(rcI + 1), 5000);
}
function openRecap(per) {
    rcA = agg(per); rcL = PER[per];
    if (!rcA.has) { showToast('Belum ada data. Putar beberapa lagu dulu.'); return; }
    rcS = slides(rcA, rcL); AR.classList.add('show'); rcShow(0);
}
async function drawPoster(useImg) {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const x = c.getContext('2d'), a = rcA, s1 = a.songs[0], img = useImg && s1 ? await loadImg(s1.p.i) : null;
    const g = x.createLinearGradient(0, 0, 1080, 1920); g.addColorStop(0, '#1ed760'); g.addColorStop(.55, '#5b1bd1'); g.addColorStop(1, '#0b0b0f'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
    x.fillStyle = '#fff'; x.textBaseline = 'top'; x.font = '700 44px sans-serif'; x.fillText('Recap ' + rcL, 80, 110);
    x.font = '800 260px sans-serif'; x.fillText(String(Math.round(a.sec / 60)), 70, 190); x.font = '500 46px sans-serif'; x.fillText('menit mendengarkan • ' + a.n + ' lagu', 80, 470);
    if (img) { x.save(); rr(x, 80, 580, 360, 360, 28); x.clip(); x.drawImage(img, 80, 580, 360, 360); x.restore(); }
    const lx = img ? 480 : 80; x.font = '500 32px sans-serif'; x.globalAlpha = .75; x.fillText('Lagu nomor satu', lx, 600); x.globalAlpha = 1; x.font = '800 54px sans-serif';
    wrapText(x, s1 ? s1.p.t : '', 1000 - lx).slice(0, 3).forEach((l, i) => x.fillText(l, lx, 650 + i * 66)); x.font = '500 36px sans-serif'; x.fillText(s1 ? s1.p.a : '', lx, 870);
    x.font = '700 40px sans-serif'; x.fillText('Artis teratas', 80, 1050); x.font = '600 50px sans-serif';
    a.artists.slice(0, 5).forEach((r, i) => { x.fillText((i + 1) + '. ' + r.name.slice(0, 26), 80, 1130 + i * 90); });
    x.font = '700 40px sans-serif'; x.fillText('Jam favorit  ' + String(a.peak).padStart(2, '0') + ':00', 80, 1640); x.globalAlpha = .7; x.font = '600 34px sans-serif'; x.fillText('Auralys', 80, 1790);
    return c;
}
AR.addEventListener('click', e => {
    if (e.target.id === 'rcClose') { clearTimeout(rcT); AR.classList.remove('show'); return; }
    if (e.target.id === 'rcPoster') { clearTimeout(rcT); exportCanvas(drawPoster, 'recap-auralys.png'); return; }
    if (e.target.closest('.rc-foot')) return;
    rcShow(e.clientX < innerWidth / 3 ? rcI - 1 : rcI + 1);
});

/* ---------- Pengaturan: kartu "Tampilan" ---------- */
function initSettingsCard() {
    const first = $('#view-developer .dev-card'); if (!first) return;
    const row = (n, d, id) => '<div class="set-row"><div><div class="set-name">' + n + '</div><div class="set-desc">' + d + '</div></div><input type="checkbox" class="glass-switch" id="' + id + '"></div>';
    first.insertAdjacentHTML('afterend', '<div class="dev-card"><div class="dev-card-title">Tampilan</div>' +
        row('Dynamic Island', 'Kapsul di atas layar yang bisa dibuka jadi kartu kontrol lagu.', 'auIslOn') +
        '<div class="set-row"><div class="set-desc">Gaya, sudut, cahaya, posisi, ukuran, preset</div><button class="au-btn" id="auIslCfg">Atur</button></div>' +
        row('Artwork beranimasi', 'Cover bergerak halus saat lagu diputar. Default mati.', 'auAnimOn') +
        row('Widget Auralys Glass', 'Kartu kaca mengambang yang bisa digeser.', 'auWidOn') +
        '<div class="set-row column"><div class="set-name">Terjemahan lirik</div><select id="auTp" class="glass-select"><option value="google">Google Terjemahan (gratis, tanpa API key)</option><option value="deepl">DeepL (butuh API key)</option></select><input id="auDk" type="text" class="cp-input" placeholder="DeepL API key" style="display:none"></div></div>');
    $('#auIslOn').checked = isl.on; $('#auIslOn').onchange = e => { isl.on = e.target.checked; saveIsl(); if (isl.on && !currentTrack) showToast('Kapsul muncul saat ada lagu diputar.'); };
    $('#auIslCfg').onclick = islSheet;
    const setAnim = on => document.documentElement.classList.toggle('art-anim', on);
    $('#auAnimOn').checked = pref.get('auAnim', '0') === '1'; setAnim($('#auAnimOn').checked); $('#auAnimOn').onchange = e => { pref.set('auAnim', e.target.checked ? '1' : '0'); setAnim(e.target.checked); };
    $('#auWidOn').checked = pref.get('auWid', '0') === '1'; $('#auWidOn').onchange = e => pref.set('auWid', e.target.checked ? '1' : '0');
    const tp = $('#auTp'), dk = $('#auDk'); tp.value = pref.get('auTp', 'google'); dk.value = pref.get('auDk', ''); dk.style.display = tp.value === 'deepl' ? 'block' : 'none';
    tp.onchange = () => { pref.set('auTp', tp.value); dk.style.display = tp.value === 'deepl' ? 'block' : 'none'; }; dk.oninput = () => pref.set('auDk', dk.value.trim());
}

/* ---------- Playlist/album: tombol putar⇄jeda dan lanjut rekomendasi setelah habis ---------- */
let ctx = null;
const inList = (L) => !!(L && currentTrack && L.some(t => t.videoId === currentTrack.videoId));
window.playFirstPlaylistTrack = function () {
    const L = currentPlaylistTracks; if (!L || !L.length) return;
    if (ctx && inList(L) && inList(ctx.tracks)) { togglePlay(); return; }
    ctx = { tracks: L.slice() }; playMusic(L[0].videoId, encTrack(L[0]));
};
const _pm2 = window.playMusic;
window.playMusic = function (id) { _pm2.apply(this, arguments); if (ctx && !ctx.tracks.some(t => t.videoId === id)) ctx = null; };
const _pn = window.playNextSimilarSong;
window.playNextSimilarSong = function () {
    if (ctx && currentTrack) {
        const i = ctx.tracks.findIndex(t => t.videoId === currentTrack.videoId);
        if (i >= 0 && i < ctx.tracks.length - 1) { const n = ctx.tracks[i + 1]; playMusic(n.videoId, encTrack(n)); return; }
        if (i >= 0) { ctx = null; showToast('Playlist selesai, lanjut rekomendasi'); }
    }
    return _pn.apply(this, arguments);
};
const _sv = window.switchView;
window.switchView = function (v) { _sv.apply(this, arguments); document.documentElement.dataset.view = v; if (v === 'search' && document.activeElement && document.activeElement.blur) document.activeElement.blur(); };
document.documentElement.dataset.view = 'home';
function syncPlaylistBtn() {
    const b = $('#view-playlist .play-pause-btn[onclick*="playFirstPlaylistTrack"] svg'); if (!b) return;
    b.innerHTML = '<path d="' + ((isPlaying && ctx && inList(currentPlaylistTracks) && inList(ctx.tracks)) ? IC.pause : IC.play) + '"/>';
}
/* lagu jeda sendiri karena gangguan suara -> lanjutkan (kecuali pengguna yang menjeda) */
let lastPlayAt = Date.now(), resumeTry = 0;
function guardResume() {
    if (isPlaying) { lastPlayAt = Date.now(); resumeTry = 0; return; }
    if (!currentTrack || userPaused || resumeTry >= 3) return;
    const gap = Date.now() - lastPlayAt; if (gap < 1200 || gap > 20000) return;
    const paused = useAudio ? (audioEl.paused && !audioEl.ended && audioEl.readyState > 0) : !!(ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() === 2);
    if (paused) { resumeTry++; doPlay(); }
}
document.addEventListener('click', e => { if (e.target.closest('#playlistTracksContainer .v-item') && !e.target.closest('.dots-icon')) ctx = { tracks: (currentPlaylistTracks || []).slice() }; }, true);
setInterval(() => { syncPlaylistBtn(); guardResume(); }, 700);
setInterval(syncLyrics, 250);

/* ---------- Sampul gaya Liquid Glass untuk layar kunci / notifikasi media (v3.3.3) ---------- */
// Kartu pemutar di layar kunci digambar oleh Android, jadi gayanya tidak bisa diubah dari web.
// Yang bisa: gambar sampulnya. Di sini sampul dibuat ulang bergaya kaca (latar blur + bingkai kaca + kilau).
let glassUrl = '', glassSeq = 0;
async function glassArt(url) {
    const img = await loadImg(url); if (!img) return null;       // gagal (mis. CORS) -> pakai sampul asli
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    const cover = (w, h) => { const r = Math.max(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r; return [(w - iw) / 2, (h - ih) / 2, iw, ih]; };
    x.save(); x.filter = 'blur(26px) saturate(1.7) brightness(1.05)'; x.drawImage(img, ...[].concat(cover(S, S).map((v, i) => i < 2 ? v - 40 : v + 80))); x.restore();
    let g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, 'rgba(255,255,255,.34)'); g.addColorStop(.5, 'rgba(255,255,255,.06)'); g.addColorStop(1, 'rgba(255,255,255,.2)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    const a = 64, w = S - a * 2, r = 88;
    x.save(); x.shadowColor = 'rgba(0,0,0,.38)'; x.shadowBlur = 36; x.shadowOffsetY = 14; rr(x, a, a, w, w, r); x.fillStyle = 'rgba(255,255,255,.2)'; x.fill(); x.restore();
    x.save(); rr(x, a, a, w, w, r); x.clip(); x.drawImage(img, ...cover(w, w).map((v, i) => i < 2 ? v + a : v)); x.restore();
    x.save(); rr(x, a, a, w, w, r); x.clip();
    g = x.createLinearGradient(a, a, a + w, a + w); g.addColorStop(0, 'rgba(255,255,255,.45)'); g.addColorStop(.35, 'rgba(255,255,255,0)'); g.addColorStop(.8, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.22)');
    x.fillStyle = g; x.fillRect(a, a, w, w);
    x.beginPath(); x.ellipse(S / 2, a - 40, w * .62, 120, 0, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,.2)'; x.fill(); x.restore();
    rr(x, a, a, w, w, r); x.lineWidth = 4; g = x.createLinearGradient(a, a, a + w, a + w); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.5, 'rgba(255,255,255,.25)'); g.addColorStop(1, 'rgba(255,255,255,.7)'); x.strokeStyle = g; x.stroke();
    return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}
const _ums = window.updateMediaSession;
window.updateMediaSession = function () {
    _ums.apply(this, arguments);
    if (pref.get('auGlassArt', '1') !== '1' || !currentTrack || !currentTrack.img || !navigator.mediaSession) return;
    const seq = ++glassSeq, t = currentTrack;
    glassArt(t.img).then(blob => {
        if (!blob || seq !== glassSeq || currentTrack !== t) return;
        const old = glassUrl; glassUrl = URL.createObjectURL(blob);
        const m = navigator.mediaSession.metadata; if (!m) return;
        navigator.mediaSession.metadata = new MediaMetadata({ title: m.title, artist: m.artist, album: m.album, artwork: [{ src: glassUrl, sizes: '512x512', type: 'image/png' }] });
        if (old) setTimeout(() => URL.revokeObjectURL(old), 5000);
    }).catch(() => {});
};

/* ---------- init ---------- */
function init() {
    document.body.append(I, W, AMB, AR); applyIsl();
    const wp = pref.get('auWPos', ''); if (wp.includes('|')) { const p = wp.split('|'); W.style.left = p[0]; W.style.top = p[1]; W.style.right = 'auto'; }
    initSettingsCard(); initSearch(); initStats();
    const cap = $('#playerModal .glass-capsule');
    if (cap) cap.insertAdjacentHTML('beforeend', '<button data-au="amb2"><svg viewBox="0 0 24 24"><path d="M12 7a5 5 0 100 10 5 5 0 000-10zM2 13h2v-2H2v2zm18 0h2v-2h-2v2zM11 2v2h2V2h-2zm0 18v2h2v-2h-2z"/></svg><span>Ambient</span></button><button data-au="pip2"><svg viewBox="0 0 24 24"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.98 2 1.98h18c1.1 0 2-.88 2-1.98V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z"/></svg><span>Melayang</span></button>');
    const hd = $('#lyricsModal .lyric-actions');
    if (hd) hd.insertAdjacentHTML('afterbegin', '<svg class="lyric-btn" id="auTrBtn" viewBox="0 0 24 24"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg><svg class="lyric-btn" id="auImgBtn" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>');
    const lb = $('#lyricsBody');
    if (lb && !$('#auSyncBar')) {
        lb.insertAdjacentHTML('beforebegin', '<div id="auSyncBar" class="au-syncbar" style="display:none"><span class="au-sb-dot">● Tersinkron</span><span class="au-sb-sp"></span><button id="auSyncM" aria-label="Lirik lebih lambat">Lambat</button><b id="auSyncVal" title="Ketuk untuk reset">0.0s</b><button id="auSyncP" aria-label="Lirik lebih cepat">Cepat</button></div>');
        const ch = d => { pref.set(offKey, (Math.round((getOff() + d) * 10) / 10).toFixed(1)); updSyncBar(); syncLyrics(true); };
        $('#auSyncM').onclick = () => ch(-.5); $('#auSyncP').onclick = () => ch(.5);
        $('#auSyncVal').onclick = () => { pref.set(offKey, '0'); updSyncBar(); syncLyrics(true); };
    }
    if ($('#auTrBtn')) { $('#auTrBtn').onclick = trSheet; $('#auImgBtn').onclick = lyrImgSheet; }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
