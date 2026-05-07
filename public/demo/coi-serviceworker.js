/*! coi-serviceworker — minimal: only rewrite the navigation document, pass everything else through */
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
    if (r.mode !== 'navigate') return; // don't touch scripts/styles/wasm — same-origin already satisfies COEP

    event.respondWith(
      fetch(r).then((response) => {
        if (response.status === 0 || !response.body) return response;
        const headers = new Headers(response.headers);
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        return new Response(response.body, {
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
