const CACHE_NAME = "corporation-map-v12";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/app-icon.svg",
  "./src/app.js",
  "./src/styles.css",
  "./src/models/place.js",
  "./src/services/PlaceService.js",
  "./src/services/TerritoryEngine.js",
  "./src/vendor/turf.min.js",
  "./src/providers/PlaceProvider.js",
  "./src/providers/MockPlaceProvider.js",
  "./src/providers/CompanyProvider.js",
  "./src/providers/GovernmentProvider.js",
  "./src/providers/OpenStreetMapProvider.js",
  "./src/data/mockPlaces.js",
  "./src/data/nikkei225Companies.js",
  "./src/data/nikkei225Headquarters.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
    )
  );
});
