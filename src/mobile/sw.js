// Build revision: luce-remote-shell-v1. Push works without storing the design.
const SHELL = ['/', '/styles.css', '/mobile.css', '/mobile.js', '/manifest.webmanifest', '/luce-mark.svg', '/icon-256.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('luce-remote-shell-')).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !SHELL.includes(url.pathname)) return;
  event.respondWith(fetch(new Request(request, {cache: 'no-store'})));
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || '' }; }
  const title = typeof payload.title === 'string' ? payload.title : 'Luce needs your attention';
  const body = typeof payload.body === 'string' ? payload.body : 'An approval is waiting in Luce Remote.';
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/luce-mark.svg', badge: '/luce-mark.svg', tag: 'luce-approval' }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    for (const client of clients) if ('focus' in client) return client.focus();
    if (self.clients.openWindow) return self.clients.openWindow('/');
  }));
});
