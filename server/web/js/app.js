// Opstart, router, tabbalk, meldingen onderaan (toasts), onderblad (sheet) en push.
import { api, ApiError } from "./api.js";
import { h, clear, icon, isIOS, isStandalone, store } from "./util.js";

export const state = { me: null, view: null };

const TABS = [
  { id: "home", label: "Home", icon: "home" },
  { id: "rooster", label: "Rooster", icon: "rooster" },
  { id: "vergelijk", label: "Vergelijk", icon: "vergelijk" },
  { id: "chat", label: "Chat", icon: "chat", badge: "chat" },
  { id: "afspreken", label: "Afspreken", icon: "afspreken" },
  { id: "opties", label: "Opties", icon: "opties" },
];

// Klein venster (menubalk-app op Mac, systeemvak op Windows): /?compact=1.
// Geen tabbalk onderaan maar bovenaan Rooster, Vergelijk en Afspreken; de rest zit onder ⋯.
export const compact = new URLSearchParams(location.search).get("compact") === "1";
const COMPACT_TABS = ["rooster", "vergelijk", "afspreken"];
// Kleine app standaard: het hele venster is je rooster, met enkel ☰ en Vergelijk bovenaan.
// 'Klassieke weergave' (Opties) geeft de tabs bovenaan terug.
export const tiny = compact && !store.get("tiny.classic", false);

const loaders = {
  home: () => import("./views/home.js"),
  rooster: () => import("./views/rooster.js"),
  vergelijk: () => import("./views/vergelijk.js"),
  afspreken: () => import("./views/afspreken.js"),
  chat: () => import("./views/chat.js"),
  opties: () => import("./views/opties.js"),
  admin: () => import("./views/admin.js"),
};

// ---- Toestel / wie ben ik ------------------------------------------------------
export async function loadMe() {
  state.me = await api.get("/me");
  renderBanner();
  return state.me;
}

export const myPerson = () => state.me?.device?.person || null;
export const isApproved = () => {
  const d = state.me?.device;
  return !!d && d.status === "approved" && (!!d.person || d.admin);
};
export const isPending = () => state.me?.device?.status === "pending";
export const isAdmin = () => !!state.me?.device?.admin;

// ---- Router ------------------------------------------------------------------
export function replaceRoute(hash) {
  history.replaceState(null, "", hash);
  route();
}

export function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return { parts, query: new URLSearchParams(query) };
}

let cleanup = null;
let routeToken = 0;

async function route() {
  const { parts, query } = parseHash();
  let tab = parts[0];
  if (!tab || !loaders[tab]) {
    // Vanzelf gekozen (niet aangetikt): Home mag doorschakelen naar je rooster als er niets nieuws is
    state.autoStart = true;
    const start = compact ? "rooster" : store.get("start", "home");
    const target = start === "rooster" && myPerson() ? "#/rooster" : "#/home";
    history.replaceState(null, "", target);
    return route();
  }
  const view = tab === "opties" && parts[1] === "admin" ? "admin" : tab;
  const current = tiny ? (["rooster", "vergelijk"].includes(view) ? view : "more")
    : compact && !COMPACT_TABS.includes(tab) ? "more" : tab;
  document.body.dataset.view = view;
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === current ? "page" : "false"));
  const token = ++routeToken;
  if (cleanup) { try { cleanup(); } catch { /* */ } cleanup = null; }
  const root = clear(document.getElementById("view"));
  root.className = `view view-${view}`;
  closeSheet();
  try {
    const mod = await loaders[view]();
    if (token !== routeToken) return;
    state.view = view;
    cleanup = (await mod.render(root, { parts: parts.slice(1), query })) || null;
  } catch (e) {
    if (token !== routeToken) return;
    showError(root, e);
  }
  if (token === routeToken) window.scrollTo({ top: 0 });
}

// ---- Fouten en wachten op toegang -----------------------------------------------
export function pendingCard(extra) {
  return h("section", { class: "card pending" },
    h("div", { class: "pending-ico" }, icon("shield")),
    h("h2", null, "Wacht tot Reda je toegang geeft"),
    h("p", { class: "muted" }, extra || "Dit kan je doen zodra je toegang hebt."),
    h("p", { class: "ps" }, "PS: Als ik je toegang geef dan kan je dit wel doen, ik wil mn wifi niet gehackt dus bel ofzo als dit sneller moet gebeuren"),
  );
}

export function showError(root, e) {
  if (e instanceof ApiError && e.code === "pending") {
    clear(root).append(pendingCard());
    return;
  }
  if (e instanceof ApiError && e.code === "blocked") {
    clear(root).append(h("section", { class: "card" }, h("h2", null, "Geen toegang"), h("p", { class: "muted" }, "Dit toestel heeft geen toegang tot Roosters.")));
    return;
  }
  clear(root).append(h("section", { class: "card error" }, h("h2", null, "Oeps"), h("p", null, e.message || "Er ging iets mis."),
    h("button", { class: "btn", onclick: () => route() }, "Opnieuw proberen")));
}

export function toastError(e) {
  if (e instanceof ApiError && e.code === "pending") toast("Wacht tot Reda je toegang geeft.");
  else toast(e.message || "Er ging iets mis.", { kind: "error" });
}

// ---- Toasts (met 'ongedaan maken') -----------------------------------------------
export function toast(text, { undo = null, kind = "", ms = 10000, onUndo = null } = {}) {
  const box = document.getElementById("toasts");
  // Eén melding tegelijk: een nieuwe vervangt de vorige
  for (const old of box.children) { old.classList.remove("show"); setTimeout(() => old.remove(), 250); }
  const t = h("div", { class: `toast ${kind}`, role: "status" }, h("span", null, text));
  if (undo) {
    t.append(h("button", {
      class: "toast-undo",
      onclick: async () => {
        t.remove();
        try {
          await api.post("/undo", { id: undo.id });
          toast("Ongedaan gemaakt", { ms: 2500 });
          if (onUndo) onUndo(); else route();
        } catch (e) { toastError(e); }
      },
    }, "Ongedaan maken"));
  }
  box.append(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, undo ? ms : Math.min(ms, 3500));
}

export function undoToast(res, fallbackText, onUndo) {
  if (res?.undo) toast(res.undo.label, { undo: res.undo, onUndo });
  else if (fallbackText) toast(fallbackText);
}

// ---- Onderblad -------------------------------------------------------------------
let sheetClose = null;

export function sheet(title, body, { onClose } = {}) {
  closeSheet();
  const root = document.getElementById("sheet-root");
  const panel = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title || "Details" },
    h("div", { class: "sheet-grip" }),
    h("div", { class: "sheet-head" },
      h("h2", null, title || ""),
      h("button", { class: "icon-btn", "aria-label": "Sluiten", onclick: () => closeSheet() }, icon("close"))),
    h("div", { class: "sheet-body" }, body));
  const shade = h("div", { class: "shade", onclick: () => closeSheet() });
  root.append(shade, panel);
  requestAnimationFrame(() => { shade.classList.add("show"); panel.classList.add("show"); });
  // Naar beneden vegen om te sluiten
  let y0 = null;
  panel.addEventListener("touchstart", (e) => { if (panel.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  panel.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  panel.addEventListener("touchend", (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    y0 = null;
    panel.style.transform = "";
    if (dy > 90) closeSheet();
  });
  const onKey = (e) => { if (e.key === "Escape") closeSheet(); };
  document.addEventListener("keydown", onKey);
  sheetClose = () => {
    document.removeEventListener("keydown", onKey);
    shade.classList.remove("show");
    panel.classList.remove("show");
    setTimeout(() => { shade.remove(); panel.remove(); }, 250);
    if (onClose) onClose();
  };
  return closeSheet;
}

export function closeSheet() {
  if (sheetClose) { const f = sheetClose; sheetClose = null; f(); }
}

// ---- Banner bovenaan (wachten op toegang) ---------------------------------------
function renderBanner() {
  const b = clear(document.getElementById("banner"));
  if (isPending()) {
    const d = state.me.device;
    const box = h("div", { class: "banner" },
      h("strong", null, `Hoi ${d.person?.name || ""}! Wacht tot Reda je toegang geeft.`),
      h("span", null, "Ondertussen kan je al je rooster toevoegen in Opties."));
    if (state.me.secure && "geolocation" in navigator && !d.location_shared) {
      box.append(h("button", { class: "btn small", onclick: shareLocation }, icon("pin"), "Geef locatie aan Reda om te zien of je echt bent :)"));
    } else if (d.location_shared) {
      box.append(h("span", { class: "muted small" }, "Locatie gedeeld, bedankt!"));
    }
    b.append(box);
  }
}

function shareLocation() {
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      await api.post("/request/location", { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) });
      toast("Locatie gedeeld met Reda");
      await loadMe();
    } catch (e) { toastError(e); }
  }, () => toast("Locatie delen is niet gelukt of geweigerd."), { enableHighAccuracy: true, timeout: 15000 });
}

// ---- Pushmeldingen ---------------------------------------------------------------
export function pushSupport() {
  if (!state.me?.secure || !window.isSecureContext) return { ok: false, why: "Meldingen werken pas als de server via https bereikbaar is." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    if (isIOS() && !isStandalone()) return { ok: false, why: "Op iPhone: tik op 'Deel' → 'Zet op beginscherm' en open Roosters vanaf je beginscherm. Daar kan je meldingen aanzetten." };
    return { ok: false, why: "Deze browser ondersteunt geen pushmeldingen." };
  }
  return { ok: true };
}

function b64ToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function pushEnabled() {
  if (!pushSupport().ok) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return !!sub && Notification.permission === "granted";
}

export async function enablePush() {
  const sup = pushSupport();
  if (!sup.ok) throw new Error(sup.why);
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Meldingen zijn niet toegestaan. Zet ze aan in de instellingen van je browser.");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(state.me.vapid) });
  const j = sub.toJSON();
  await api.post("/push/subscribe", { endpoint: j.endpoint, keys: j.keys });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api.post("/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
}

// ---- Rood bolletje met een getal (ongelezen in Chat) ---------------------------------
// Elk element met data-badge="chat" toont het aantal; wie zo'n icoon tekent, gebruikt badgeEl().
// Gebeurtenissen in de chat ("Reda stopt nu met de les") zijn geen pushmelding, enkel dit bolletje.
const badges = { chat: 0 };

export function badgeEl(name) {
  const n = badges[name] || 0;
  return h("span", { class: "badge-dot", "data-badge": name, hidden: !n, "aria-label": `${n} ongelezen` }, n > 99 ? "99+" : String(n));
}

export function setBadge(name, n) {
  badges[name] = Math.max(0, n | 0);
  for (const el of document.querySelectorAll(`[data-badge="${name}"]`)) {
    el.hidden = !badges[name];
    el.textContent = badges[name] > 99 ? "99+" : String(badges[name]);
    el.setAttribute("aria-label", `${badges[name]} ongelezen`);
  }
  // Ook op het app-icoon (beginscherm), waar dat kan
  try {
    if (badges.chat) navigator.setAppBadge?.(badges.chat).catch(() => {});
    else navigator.clearAppBadge?.().catch(() => {});
  } catch { /* niet ondersteund */ }
}

export const badgeCount = (name) => badges[name] || 0;

// GET /api/chat/unread -> {total, chats: {id: n}}
export async function refreshBadge() {
  if (!isApproved() || !myPerson()) return;
  try {
    const r = await api.get("/chat/unread");
    setBadge("chat", r.total);
  } catch { /* stil */ }
}

// ---- Opstart -----------------------------------------------------------------------
function buildTabs() {
  const nav = document.querySelector(".tabs");
  if (compact) document.body.classList.add("compact");
  if (tiny) {
    document.body.classList.add("tiny");
    nav.append(
      h("button", { type: "button", class: "tiny-menu", "data-tab": "more", "aria-current": "false", "aria-label": "Menu", onclick: moreSheet },
        h("span", { class: "tab-ico" }, icon("menu"), badgeEl("chat"))),
      // Buiten je rooster: terug naar je rooster
      h("button", { type: "button", class: "tiny-title", "data-tab": "rooster", "aria-label": "Terug naar je rooster", onclick: () => go("#/rooster") },
        icon("back"), h("span", null, "Rooster")),
      h("button", { type: "button", class: "tiny-cmp", "data-tab": "vergelijk", "aria-current": "false", onclick: () => go("#/vergelijk") },
        icon("vergelijk"), h("span", null, "Vergelijk")));
    return;
  }
  for (const t of TABS) {
    if (compact && !COMPACT_TABS.includes(t.id)) continue;
    nav.append(h("button", { type: "button", "data-tab": t.id, "aria-current": "false", onclick: () => go(`#/${t.id}`) },
      h("span", { class: "tab-ico" }, icon(t.icon), t.badge ? badgeEl(t.badge) : null), h("span", null, t.label)));
  }
  if (compact) {
    nav.append(h("button", { type: "button", class: "more", "data-tab": "more", "aria-current": "false", "aria-label": "Meer", onclick: moreSheet },
      h("span", { class: "tab-ico" }, icon("more"), badgeEl("chat"))));
  }
}

// Alles wat niet in de kleine tabbalk past (kleine app: alles behalve je rooster en Vergelijk)
function moreSheet() {
  const item = (label, ico, onclick, extra) => h("button", { class: "row-btn", type: "button", onclick: () => { closeSheet(); onclick(); } },
    icon(ico), h("span", { class: "row-text" }, h("span", { class: "row-main" }, label)), extra || null);
  sheet(tiny ? "Menu" : "Meer", h("div", { class: "more-list" },
    tiny ? item("Mijn rooster", "rooster", () => go("#/rooster")) : null,
    item("Home", "home", () => go("#/home")),
    item("Chat", "chat", () => go("#/chat"), h("span", { class: "row-badge" }, badgeEl("chat"))),
    tiny ? item("Afspreken", "afspreken", () => go("#/afspreken")) : null,
    item("Opties", "opties", () => go("#/opties")),
    isAdmin() ? item("Beheer", "shield", () => go("#/opties/admin")) : null,
    // Op je rooster: enkel het rooster opnieuw ophalen; elders de hele app
    item("Vernieuwen", "refresh", () => (state.refresh ? state.refresh() : location.reload())),
    item("Openen in je browser", "external", () => openInBrowser(`${location.origin}/${location.hash}`))));
}

// Menubalk-app: via de app zelf (desktop.js); in een gewone browser gewoon een nieuw tabblad
async function openInBrowser(href) {
  if (compact && window.__TAURI__) {
    try { return (await import("./desktop.js")).openInBrowser(href); } catch { /* valt terug op hieronder */ }
  }
  window.open(href, "_blank", "noopener");
}

async function boot() {
  buildTabs();
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.url) go(e.data.url.replace(/^\//, "")); });
  }
  try {
    await loadMe();
  } catch (e) {
    showError(document.getElementById("view"), e);
    return;
  }
  window.addEventListener("hashchange", route);
  route();
  refreshBadge();
  setInterval(() => { if (!document.hidden) refreshBadge(); }, 30000);
  // In de menubalk-/systeemvak-app (desktop/): sneltoetsen, links, tekst naast het icoon
  if (compact && window.__TAURI__) import("./desktop.js").then((m) => m.init()).catch(() => {});
  // Terug naar de app (bv. na een tijdje op de achtergrond): gegevens opfrissen
  let hidden = 0;
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) { hidden = Date.now(); return; }
    refreshBadge();
    if (Date.now() - hidden > 60000) {
      await loadMe().catch(() => {});
      if (state.view !== "opties" && state.view !== "admin") route();
    }
  });
}

boot();
