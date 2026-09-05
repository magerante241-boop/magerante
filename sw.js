const CACHE_NAME = "magerante-v15"; // ⚠️ à incrémenter à CHAQUE nouvelle livraison
                                    // (v2, v3, v4...) pour forcer le renouvellement du cache
const CORE_ASSETS = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./auth.js",
  "./firebase-config.js",
  "./manifest.json",
  "./splash.png"
];

// Fichiers de code : on veut TOUJOURS la dernière version depuis le réseau,
// le cache ne sert que de secours hors-connexion.
const NETWORK_FIRST_FILES = [
  "index.html",
  "app.js",
  "auth.js",
  "inventaire.js",
  "state.js",
  "firebase-config.js",
  "style.css"
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

function isNetworkFirst(url) {
  return NETWORK_FIRST_FILES.some((name) => url.pathname.endsWith(name)) ||
         url.pathname === "/" || url.pathname.endsWith("/magerante/");
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (isNetworkFirst(url)) {
    // NETWORK-FIRST : on va chercher la dernière version sur le réseau ;
    // si ça échoue (hors-ligne), on retombe sur le cache.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // CACHE-FIRST : pour les assets statiques (images, manifest...) qui changent rarement.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
