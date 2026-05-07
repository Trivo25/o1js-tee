/*! coi-serviceworker — adapted for o1js demo (require-corp, buffered body) */
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('message', (ev) => {
    if (!ev.data) return;
    if (ev.data.type === 'deregister') {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => clients.forEach((client) => client.navigate(client.url)));
    }
  });

  self.addEventListener('fetch', function (event) {
    const r = event.request;
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;

    event.respondWith(
      fetch(r)
        .then(async (response) => {
          if (response.status === 0 || !response.body) return response;

          // buffer the body so we don't re-stream through firefox with potentially stale headers
          const buffer = await response.arrayBuffer();

          const newHeaders = new Headers(response.headers);
          newHeaders.delete('Content-Encoding');
          newHeaders.delete('Content-Length');
          newHeaders.delete('Transfer-Encoding');
          newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
          newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

          return new Response(buffer, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => {
          console.error('[coi-sw] fetch failed', e);
          return new Response('coi-sw fetch error: ' + e.message, { status: 502 });
        })
    );
  });
} else {
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem('coiReloadedBySelf');
    window.sessionStorage.removeItem('coiReloadedBySelf');

    const n = navigator;
    if (window.crossOriginIsolated !== false || reloadedBySelf) return;
    if (!window.isSecureContext) {
      console.log('coi-sw not registered: secure context required');
      return;
    }

    n.serviceWorker.register(window.document.currentScript.src).then(
      (registration) => {
        console.log('coi-sw registered', registration.scope);

        registration.addEventListener('updatefound', () => {
          window.sessionStorage.setItem('coiReloadedBySelf', 'updatedSW');
          window.location.reload();
        });

        if (registration.active && !n.serviceWorker.controller) {
          window.sessionStorage.setItem('coiReloadedBySelf', 'notController');
          window.location.reload();
        }
      },
      (err) => console.error('coi-sw failed to register:', err)
    );
  })();
}
