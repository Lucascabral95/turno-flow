const CACHE_NAME = "turnoflow-static-v1";
const STATIC_ASSETS = ["/turnoflow-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api")) {
    return;
  }

  if (STATIC_ASSETS.includes(requestUrl.pathname)) {
    event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
  }
});
