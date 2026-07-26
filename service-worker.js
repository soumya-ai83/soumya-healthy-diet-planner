const CACHE_VERSION = "v1.3.0"; // Bump this value whenever app-shell assets change.
const CACHE_PREFIX = "soumya-healthy-diet-";
const SHELL_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}-runtime`;
const MAX_RUNTIME_ENTRIES = 60;

const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/data.js",
  "./js/script.js",
  "./manifest.webmanifest",
  "./assets/jatiababa/jatiababa-ask.png",
  "./assets/jatiababa/jatiababa-hero.png",
  "./assets/icons/app-icon.svg",
  "./assets/icons/apple-touch-icon-180.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png"
];

async function precacheAppShell() {
  const cache = await caches.open(SHELL_CACHE);
  const results = await Promise.allSettled(APP_SHELL.map(asset => cache.add(asset)));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(`[PWA] Could not precache ${APP_SHELL[index]}`, result.reason);
    }
  });
}

async function trimRuntimeCache() {
  const cache = await caches.open(RUNTIME_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME_ENTRIES)).map(key => cache.delete(key)));
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put("./index.html", response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    return cached || caches.match("./index.html") || Promise.reject(error);
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const networkResponse = fetch(request)
    .then(async response => {
      if (response.ok) {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(request, response.clone());
        await trimRuntimeCache();
      }
      return response;
    })
    .catch(() => null);
  return cached || networkResponse || Response.error();
}

self.addEventListener("install", event => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const cacheableDestinations = new Set(["style", "script", "image", "font", "manifest"]);
  if (cacheableDestinations.has(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
