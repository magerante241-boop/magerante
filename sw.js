const CACHE_NAME = "magerante-v1";
const CORE_ASSETS = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./auth.js",
  "./firebase-config.js",
  "./manifest.json",
  "./splash.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stratégie simple : cache d'abord pour les fichiers statiques (le réseau
// sera utilisé plus tard pour Firestore, jamais mis en cache ici)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
