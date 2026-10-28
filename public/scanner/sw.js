// Service worker приложения тикетора (/scanner/).
// - Страница всегда берётся из сети, поэтому новая версия приходит сразу.
//   Без сети открывается последняя сохранённая, и приложение честно
//   показывает «Нет связи».
// - Файлы сборки (/assets/…) неизменяемы, их держим в кэше.
// - Запросы к базе и серверу продаж не трогаем никогда.
const CACHE = "scanner-v1";
const SHELL = "/scanner/";

// Старые файлы прошлых версий не копятся: держим последние 80.
async function trim() {
  const c = await caches.open(CACHE);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - 80))) {
    if (new URL(k.url).pathname !== SHELL) await c.delete(k);
  }
}

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(new Request(SHELL, { cache: "reload" }))).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(SHELL, copy));
          }
          return res;
        })
        .catch(() => caches.match(SHELL).then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/scanner/icon") || url.pathname === "/logo-header.svg") {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).then(trim);
            }
            return res;
          }),
      ),
    );
  }
});

// Нажатие на уведомление открывает приложение.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).pathname.startsWith("/scanner"));
      return open ? open.focus() : self.clients.openWindow(SHELL);
    }),
  );
});
