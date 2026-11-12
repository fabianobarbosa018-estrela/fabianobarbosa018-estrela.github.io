// Sala Digital — permite instalar na tela inicial; sempre busca a versão mais nova das telas
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
// avisos no celular (Prova do dia)
self.addEventListener('push', e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch (x) { m = { corpo: e.data ? e.data.text() : '' }; }
  const titulo = m.titulo || '📝 Sala Digital';
  e.waitUntil(self.registration.showNotification(titulo, { body: m.corpo || 'Tem prova para você na Sala Digital!', icon: 'icone-192.png', badge: 'icone-192.png',
    tag: m.tag || 'sala-digital', renotify: true, data: { url: m.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { for (const c of cs) { if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } } return self.clients.openWindow(url); }));
});
