/* Offline cache for the bank app only. Scope is this folder. */
var CACHE = "slb-static-v6";
var ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./logic.js",
  "./browser.js",
  "./songbird.js",
  "./coins.js",
  "./tasks.json",
  "./seed-nov16.json",
  "./manifest.webmanifest",
  "./coins/oak.png",
  "./coins/ember.png",
  "./coins/copper-key.png",
  "./coins/teachers-bell.png",
  "./coins/still-water.png",
  "./coins/songbird.png",
  "./coins/warm-bread.png",
  "./coins/candlelight.png",
  "./coins/hearth.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(ASSETS);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
    return res;
  }).catch(function () {
    return caches.match(event.request).then(function (hit) {
      return hit || caches.match("./index.html");
    });
  }));
});
