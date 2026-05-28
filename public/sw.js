importScripts("/sj/scramjet.js");
importScripts("/sj/controller.sw.js");

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if ($scramjetController.shouldRoute(event)) {
    event.respondWith($scramjetController.route(event));
  }
});
