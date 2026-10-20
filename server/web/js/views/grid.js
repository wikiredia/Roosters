// Gedeeld voor Rooster en Vergelijken: weergavekeuze (verticaal/horizontaal, aantal dagen),
// soorten lessen met hun kleur, en de schaal van de tijdas.
import { h, store, fmt } from "../util.js";

export const KINDS = {
  theorie: "Theorie",
  hoorcollege: "Hoorcollege",
  werkcollege: "Werkcollege",
  labo: "Labo",
  practicum: "Practicum",
  examen: "Examen",
  les: "Les",
};

export const prefs = {
  get orient() { return store.get("view.orient", "v"); },
  set orient(v) { store.set("view.orient", v); },
  get days() { return store.get("view.days", 2); },
  set days(v) { store.set("view.days", v); },
  get equal() { return store.get("view.equal", false); },
  set equal(v) { store.set("view.equal", v); },
  // Kleine app: hoeveel dagen je rooster toont bij het openen (Opties), standaard 1
  get tinyDays() { return Math.max(1, Math.min(5, Number(store.get("tiny.days", 1)) || 1)); },
  set tinyDays(v) { store.set("tiny.days", v); },
};

// [1] [2] [3] [Week], een knop verticaal/horizontaal en bij vergelijken 'gelijke breedte'
export function viewControls(onChange, { withDays = true, equalWidth = false } = {}) {
  const bar = h("div", { class: "view-controls" });
  if (withDays) {
    const seg = h("div", { class: "seg", role: "group", "aria-label": "Aantal dagen" });
    for (const [n, label] of [[1, "1"], [2, "2"], [3, "3"], [5, "Week"]]) {
      seg.append(h("button", {
        type: "button", "aria-pressed": String(prefs.days === n),
        onclick: () => { prefs.days = n; onChange(); },
      }, label));
    }
    bar.append(seg);
  }
  const vertical = prefs.orient === "v";
  bar.append(h("button", {
    type: "button", class: "orient-btn", "aria-label": vertical ? "Horizontaal tonen" : "Verticaal tonen",
    title: vertical ? "Horizontaal tonen" : "Verticaal tonen",
    onclick: () => { prefs.orient = vertical ? "h" : "v"; onChange(); },
  }, h("span", { class: `orient-ico ${vertical ? "v" : "h"}`, "aria-hidden": "true" }, h("i"), h("i"), h("i")),
  vertical ? "Verticaal" : "Horizontaal"));
  // Vergelijken: wie samen pauze heeft is breder, tenzij je dit aanvinkt
  if (equalWidth) {
    bar.append(h("label", { class: "equal-check" },
      h("input", { type: "checkbox", checked: prefs.equal, onchange: (e) => { prefs.equal = e.target.checked; onChange(); } }),
      "Gelijke breedte voor iedereen"));
  }
  return bar;
}

// Uren die op het scherm moeten: van de vroegste les tot de laatste (minstens 8u–17u)
export function hourRange(blocks) {
  let lo = Math.min(8 * 60, ...blocks.map((b) => b.start));
  let hi = Math.max(17 * 60, ...blocks.map((b) => b.end));
  lo = Math.max(0, Math.floor(lo / 60) * 60);
  hi = Math.min(24 * 60, Math.ceil(hi / 60) * 60);
  return [lo, hi];
}

// Hoeveel scherm er nog vrij is onder `el` (tabbalk en marge eraf).
// Kleine app: precies tot de onderrand (niets scrollt), ook als het venster laag is.
export function freeHeight(el, extra = 0) {
  const top = el.getBoundingClientRect().top + window.scrollY;
  const tiny = document.body.classList.contains("tiny");
  const tabbar = tiny ? 10 : document.body.classList.contains("compact") || window.matchMedia("(min-width: 900px)").matches ? 24 : 96;
  return Math.max(tiny ? 160 : 320, window.innerHeight - top - tabbar - extra);
}

export function legend(kindsSeen) {
  const order = Object.keys(KINDS).filter((k) => kindsSeen.has(k));
  if (order.length <= 1) return null;
  return h("div", { class: "legend" }, order.map((k) => h("span", null, h("i", { class: `k-${k}` }), KINDS[k])));
}

export const timeLabel = (b) => `${fmt(b.start)}–${fmt(b.end)}`;
