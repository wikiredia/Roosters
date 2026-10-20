// Service worker: pushmeldingen tonen en de app-schil offline beschikbaar houden.
const CACHE = "roosters-v4";
const SHELL = ["/", "/index.html", "/app.css", "/js/app.js", "/js/api.js", "/js/util.js",
  "/js/views/common.js", "/js/views/grid.js", "/js/views/home.js", "/js/views/rooster.js", "/js/views/vergelijk.js",
  "/js/views/afspreken.js", "/js/views/opties.js", "/js/views/admin.js", "/js/views/chat.js", "/js/views/social.js",
  "/css/compact.css", "/css/home.css", "/css/vergelijk.css", "/css/pauzes.css", "/css/chat.css", "/css/admin.css",
  "/fonts/bricolage-latin.woff2", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Altijd eerst het netwerk (verse versie), cache enkel als terugval. De API nooit cachen.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});

// "Reda wil pauze met jou, kan jij?" krijgt Ja/Nee-knoppen (waar de browser dat kan).
// Zo'n vraag heeft als titel ASK_TITLE (zie api/roosters/r_breaks.py); met data.request weten we welke.
const ASK_TITLE = "Pauze samen?";

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: "Roosters", body: e.data?.text() || "" }; }
  const ask = data.title === ASK_TITLE;
  e.waitUntil(self.registration.showNotification(data.title || "Roosters", {
    body: data.body || "",
    tag: data.tag || "roosters",
    renotify: true,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/#/home", ask, request: data.request || null },
    actions: ask ? [{ action: "ja", title: "Ja, ik kom" }, { action: "nee", title: "Nee" }] : [],
  }));
});

// Ja/Nee meteen versturen; lukt dat niet (bv. meerdere vragen open), dan de app openen
async function answer(data, action) {
  try {
    const res = await fetch("/api/breaks/quick", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Roosters": "1" },
      body: JSON.stringify({ response: action === "ja" ? "accepted" : "declined", request_id: data.request || null }),
    });
    if (res.ok) {
      await self.registration.showNotification("Roosters", {
        body: action === "ja" ? "Top, ze weten dat je komt." : "Oké, ze weten dat je niet kan.",
        tag: "roosters-antwoord", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: "/#/afspreken" },
      });
      return true;
    }
  } catch { /* offline */ }
  return false;
}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/#/home";
  e.waitUntil((async () => {
    if (e.notification.data?.ask && (e.action === "ja" || e.action === "nee") && await answer(e.notification.data, e.action)) return;
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === location.origin) {
        await c.focus();
        c.postMessage({ url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
