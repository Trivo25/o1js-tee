/*! coi-serviceworker — adds COOP/COEP to navigation document and worker scripts */
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

  self.addEventListener('fetch', (event) => {
    const r = event.request;
    const dest = r.destination;
    const isWorker = dest === 'worker' || dest === 'sharedworker' || dest === 'serviceworker';
    if (r.mode !== 'navigate' && !isWorker) return;

    event.respondWith(
      fetch(r).then(async (response) => {
        if (response.status === 0 || !response.body) return response;
        const buffer = await response.arrayBuffer();
        const headers = new Headers(response.headers);
        // body has already been decoded by fetch — drop encoding-related headers
        headers.delete('Content-Encoding');
        headers.delete('Content-Length');
        headers.delete('Transfer-Encoding');
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        headers.set('Cross-Origin-Resource-Policy', 'same-origin');
        return new Response(buffer, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
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
