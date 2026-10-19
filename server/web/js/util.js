// Kleine hulpjes voor DOM, tijd en kleuren. Alle tekst gaat via textContent (nooit innerHTML).

export function h(tag, attrs, ...children) {
  const n = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
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
