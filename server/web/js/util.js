// Kleine hulpjes voor DOM, tijd en kleuren. Alle tekst gaat via textContent (nooit innerHTML).

export function h(tag, attrs, ...children) {
  const n = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "style" && typeof v === "object") {
        for (const [prop, val] of Object.entries(v)) {
          if (prop.startsWith("--")) n.style.setProperty(prop, val);
          else n.style[prop] = val;
        }
      }
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(n.dataset, v);
      else if (v === true) n.setAttribute(k, "");
      else n.setAttribute(k, v);
    }
  }
  append(n, children);
  return n;
}

export function append(n, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

export function clear(n) {
  while (n.firstChild) n.firstChild.remove();
  return n;
}

const SVG = "http://www.w3.org/2000/svg";
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  rooster: "M4 5h16v15H4zM4 9h16M8 3v4M16 3v4",
  vergelijk: "M7 4v16M17 4v16M3 8h8M13 14h8M3 16h8M13 6h8",
  afspreken: "M12 21s-7-4.6-7-10a7 7 0 0 1 14 0c0 5.4-7 10-7 10zM12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  opties: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  close: "M6 6l12 12M18 6 6 18",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
  pin: "M12 21s-7-4.6-7-10a7 7 0 0 1 14 0c0 5.4-7 10-7 10z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  copy: "M8 8h12v12H8zM4 16V4h12",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  pencil: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  pause: "M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3",
  menu: "M4 7h16M4 12h16M4 17h16",
  send: "M4 12 20 4l-6 16-3-7z",
  bellOff: "M6 8a6 6 0 0 1 10.6-3.8M18 8c0 7 3 9 3 9H7M10.3 21a1.9 1.9 0 0 0 3.4 0M3 3l18 18",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M19 19v2H6",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
};

export function icon(name, cls = "ico") {
  const s = document.createElementNS(SVG, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", cls);
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(SVG, "path");
  p.setAttribute("d", ICONS[name] || "");
  s.append(p);
  return s;
}

// ---- Tijd --------------------------------------------------------------------
export const fmt = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

export function dur(m) {
  const hh = Math.floor(m / 60), mm = m % 60;
  if (hh && mm) return `${hh}u${String(mm).padStart(2, "0")}`;
  if (hh) return `${hh} ${hh === 1 ? "uur" : "uur"}`;
  return `${mm} min`;
}

export function brusselsMinutes(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return get("hour") * 60 + get("minute");
}

export function brusselsDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function dayLabel(iso, today) {
  const d = new Date(iso + "T12:00:00Z");
  const t = new Date(today + "T12:00:00Z");
  const diff = Math.round((d - t) / 86400000);
  const long = new Intl.DateTimeFormat("nl-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
  if (diff === 0) return { main: "Vandaag", sub: long };
  if (diff === 1) return { main: "Morgen", sub: long };
  const wd = new Intl.DateTimeFormat("nl-BE", { weekday: "long", timeZone: "UTC" }).format(d);
  return { main: wd[0].toUpperCase() + wd.slice(1), sub: new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", timeZone: "UTC" }).format(d) };
}

export function ago(isoString) {
  if (!isoString) return "nog nooit";
  const s = Math.max(0, (Date.now() - new Date(isoString).getTime()) / 1000);
  if (s < 60) return "net nu";
  if (s < 3600) return `${Math.floor(s / 60)} min geleden`;
  if (s < 86400) return `${Math.floor(s / 3600)} uur geleden`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "gisteren" : `${d} dagen geleden`;
}

export function names(list) {
  if (list.length <= 1) return list.join("");
  return list.slice(0, -1).join(", ") + " & " + list[list.length - 1];
}

// ---- Kleuren per persoon -------------------------------------------------------
const HUES = [222, 340, 160, 28, 272, 190, 8, 95, 300, 45];
export function personColor(id) {
  return `hsl(${HUES[id % HUES.length]} 70% 52%)`;
}

export function initials(name) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function avatar(person, size = "") {
  return h("span", { class: `avatar ${size}`, style: { background: personColor(person.id) }, "aria-hidden": "true" }, initials(person.name));
}

// ---- Lokale voorkeuren (mag mislukken: privévenster e.d.) --------------------
export const store = {
  get(k, fallback = null) {
    try { const v = localStorage.getItem("roosters:" + k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(k, v) {
    try { localStorage.setItem("roosters:" + k, JSON.stringify(v)); } catch { /* geen opslag */ }
  },
};

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
