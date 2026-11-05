const VERSION = "v2";
const PREFIX = `nasa-space-explorer:${self.registration.scope}:`;
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const API_CACHE = `${PREFIX}api-${VERSION}`;
const IMAGE_CACHE = `${PREFIX}images-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, API_CACHE, IMAGE_CACHE];

const appURL = (path) =>
  new URL(path, self.registration.scope).href;

// We will add pwa.js in the next step.
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./dateRange.js",
  "./script.js",
  "./pwa.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
].map(appURL);

// Save the app files during installation.
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

// Remove outdated caches belonging to this app.
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter((key) =>
          key.startsWith(PREFIX) &&
          !CURRENT_CACHES.includes(key)
        )
        .map((key) => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

async function saveResponse(cache, request, response, limit = 0) {
  try {
    await cache.put(request, response.clone());

    if (limit) {
      const keys = await cache.keys();

      for (const key of keys.slice(
        0,
        Math.max(0, keys.length - limit)
      )) {
        await cache.delete(key);
      }
    }
  } catch (error) {
    console.warn("Could not save an offline copy:", error);
  }
}

// App files and images: check the cache first.
async function cacheFirst(request, cacheName, limit = 0) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(request);

  if (saved) return saved;

  const response = await fetch(request);

  if (response.ok || response.type === "opaque") {
    await saveResponse(cache, request, response, limit);
  }

  return response;
}

// NASA data: try the network, then use saved data.
async function networkFirst(request) {
  const cache = await caches.open(API_CACHE);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(request, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`NASA returned ${response.status}`);
    }

    await saveResponse(cache, request, response, 30);
    return response;
  } catch (error) {
    const saved = await cache.match(request);

    if (saved) return saved;

    return new Response(
      JSON.stringify({
        error: {
          message:
            "No saved data for these dates. Reconnect and load this date range first."
        }
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (
    (url.hostname === "api.nasa.gov" &&
      url.pathname === "/planetary/apod") ||
    (url.hostname === "science.nasa.gov" &&
      url.pathname === "/wp-json/wp/v2/apod-basic")
  ) {
    event.respondWith(networkFirst(request));
  } else if (
    url.origin === self.location.origin &&
    request.mode === "navigate"
  ) {
    event.respondWith(
      cacheFirst(appURL("./index.html"), SHELL_CACHE)
    );
  } else if (APP_SHELL.includes(url.href)) {
    event.respondWith(
      cacheFirst(request, SHELL_CACHE)
    );
  } else if (request.destination === "image") {
    event.respondWith(
      cacheFirst(request, IMAGE_CACHE, 80).catch(async () => {
        const shell = await caches.open(SHELL_CACHE);

        return (
          await shell.match(appURL("./icons/icon-192.png"))
        ) || Response.error();
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    const app = windows.find((client) =>
      client.url.startsWith(self.registration.scope)
    );

    if (app) return app.focus();

    return self.clients.openWindow(appURL("./"));
  })());
});