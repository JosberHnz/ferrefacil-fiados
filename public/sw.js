const CACHE_NAME = 'fiados-v5';
// '/' es la landing; '/app.html' es el shell de la aplicacion. Se precachea
// el .html y no la URL limpia '/app': si una entrada de addAll fallara, la
// instalacion entera del service worker se abortaria.
const ESTATICOS = [
  '/', '/index.html', '/app.html', '/app.js',
  '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ESTATICOS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API: intenta red primero (datos frescos); si falla, no hay fallback
  // porque los fiados/pagos requieren datos actuales, no obsoletos.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexion' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // /app es una URL limpia que resuelve el servidor, asi que no esta en la
  // cache con ese nombre: se le sirve el shell de /app.html para que la
  // aplicacion tambien abra sin conexion.
  if (event.request.mode === 'navigate' && url.pathname === '/app') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/app.html'))
    );
    return;
  }

  // Estaticos: cache-first para que la app cargue offline.
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
