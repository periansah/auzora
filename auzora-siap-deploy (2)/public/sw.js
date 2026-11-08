// Service worker minimal (supaya web bisa di-install sebagai PWA).
// Sengaja TIDAK mencegat permintaan jaringan: audio streaming (termasuk request Range dari domain lain)
// harus ditangani langsung oleh browser agar bisa diputar, di-seek, dan tetap jalan di latar belakang.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* biarkan browser menangani */ });
