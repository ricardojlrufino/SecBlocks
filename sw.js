const IS_DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1' || self.location.hostname.includes('ngrok');

const CACHE = 'secblocks-v10';
const SHELL = [
  './',
  './index.html',
  './webui/styles.css',
  './webui/app.js',
  './webui/qrcode.min.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
];

self.addEventListener('install', e => {
  if (IS_DEV) return self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  if (IS_DEV) return self.clients.claim();
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (IS_DEV) return;
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});
