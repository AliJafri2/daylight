// Daylight service worker: push notifications only (no offline caching, so the demo never serves stale code).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = { title: 'Daylight', body: 'Ben has an update for you.', url: '/?skip-intro' };
  try { d = { ...d, ...e.data.json() }; } catch { /* plain text or empty */ }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: '/icon-192.png', badge: '/icon-192.png', tag: 'daylight-heads-up', renotify: true, data: { url: d.url },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/?skip-intro', self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.focus(); c.postMessage({ type: 'open', url }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
