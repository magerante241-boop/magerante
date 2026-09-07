const CACHE_NAME = "magerante-v52"; // ⚠️ à incrémenter à CHAQUE nouvelle livraison
const CORE_ASSETS = [
  "./index.html",
  "./dashboard.html",
  "./style.css",
  "./app.js",
  "./auth.js",
  "./firebase-config.js",
  "./inventaire.js",
  "./invitation.js",
  "./cloture.js",
  "./ventes.js",
  "./mouvements.js",
  "./notifications.js",
  "./dashboard.js",
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

// STALE-WHILE-REVALIDATE : répond immédiatement avec le cache (façon WhatsApp),
// puis va chercher la dernière version en fond pour la prochaine ouverture.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Ne jamais mettre en cache les requêtes hors origine (Firebase Auth,
  // Firestore, Google APIs, gstatic...) : ce sont des échanges temps réel /
  // authentifiés qui ne doivent jamais être servis depuis un cache local.
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
