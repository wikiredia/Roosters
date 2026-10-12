"use strict";

// ---- Instellingen ----------------------------------------------------------
// Hoe lang iemand maximaal wil wachten om samen te rijden (minuten).
// Tot 2 uur verschil rijden jullie samen; de wachttijd telt als pauze.
const MAX_WAIT = 120;
// Kortste samen-pauze die getoond wordt (minuten).
const MIN_SHARED_BREAK = 15;
const CACHE_KEY = "roosters-cache-v1";
const PX_PER_MIN = 0.95;
const DAYS = ["ma", "di", "wo", "do", "vr"];
const DAY_LONG = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

// ---- Hulpfuncties ----------------------------------------------------------
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const fmt = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

// Datum in Brussel als YYYY-MM-DD
function brusselsDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function brusselsMinutes(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return get("hour") * 60 + get("minute");
}
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const mondayOf = (iso) => addDays(iso, -((weekday(iso) + 6) % 7));

// Gaten tussen lesblokken
function gaps(blocks) {
  const g = [];
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i][0] > blocks[i - 1][1]) g.push([blocks[i - 1][1], blocks[i][0]]);
  }
  return g;
}
function intersect(a, b) {
  const out = [];
  for (const [s1, e1] of a) for (const [s2, e2] of b) {
    const s = Math.max(s1, s2), e = Math.min(e1, e2);
    if (e - s >= MIN_SHARED_BREAK) out.push([s, e]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

// ---- Dagplanning -----------------------------------------------------------
// r en k: lesblokken [[start, einde], ...] in minuten, of leeg.
function planDay(r, k) {
  r = r || [];
  k = k || [];
  const plan = {
    r: { les: r, pauze: gaps(r) },
    k: { les: k, pauze: gaps(k) },
    heen: null,
    terug: null,
    samen: [],
  };
  const hasR = r.length > 0, hasK = k.length > 0;
  if (!hasR && !hasK) return plan;

  if (hasR && hasK) {
    const rs = r[0][0], ks = k[0][0];
    if (Math.abs(rs - ks) <= MAX_WAIT) {
      const t = Math.min(rs, ks);
      plan.heen = { mode: "samen", time: t, r: rs, k: ks };
      if (rs > t) plan.r.pauze.unshift([t, rs]);
      if (ks > t) plan.k.pauze.unshift([t, ks]);
    } else {
      plan.heen = { mode: "apart", r: rs, k: ks };
    }
    const re = r.at(-1)[1], ke = k.at(-1)[1];
    if (Math.abs(re - ke) <= MAX_WAIT) {
      const t = Math.max(re, ke);
      plan.terug = { mode: "samen", time: t, r: re, k: ke };
      if (re < t) plan.r.pauze.push([re, t]);
      if (ke < t) plan.k.pauze.push([ke, t]);
    } else {
      plan.terug = { mode: "apart", r: re, k: ke };
    }
    plan.samen = intersect(plan.r.pauze, plan.k.pauze);
  } else if (hasR) {
    plan.heen = { mode: "reda", r: r[0][0] };
    plan.terug = { mode: "reda", r: r.at(-1)[1] };
  } else {
    plan.heen = { mode: "kayra", k: k[0][0] };
    plan.terug = { mode: "kayra", k: k.at(-1)[1] };
  }
  return plan;
}

// ---- Data ophalen (max. 1x per dag, tenzij op Vernieuwen gedrukt) ----------
async function loadData(force = false) {
  const today = brusselsDate();
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (c && c.day === today && c.data) return c.data;
    } catch (_) { /* geen opslag beschikbaar */ }
  }
  const res = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Rooster ophalen mislukt (${res.status}).`);
  const data = await res.json();
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ day: today, data })); } catch (_) { /* negeren */ }
  return data;
}

// ---- Weergave --------------------------------------------------------------
let DATA = null;
let selectedWeek = null;

function dayBlocks(id, iso) {
  return (DATA.people[id] && DATA.people[id].days[iso]) || [];
}

function rideCell(trip) {
  const c = el("div", "ride");
  if (!trip) return c;
  const part = (icon, who) => el("span", `solo ${who}`, icon);
  if (trip.mode === "samen") {
    c.classList.add("together");
    c.append("🏍️", el("span", "t", fmt(trip.time)));
    c.title = `Samen met de motor (${fmt(trip.time)})`;
  } else if (trip.mode === "apart") {
    c.append(part("🏍️", "r"), part("🚌", "k"));
    c.title = `Apart: Reda met de motor (${fmt(trip.r)}), Kayra met de bus (${fmt(trip.k)})`;
  } else if (trip.mode === "reda") {
    c.append(part("🏍️", "r"));
    c.title = `Enkel Reda, met de motor (${fmt(trip.r)})`;
  } else {
    c.append(part("🚌", "k"));
    c.title = `Enkel Kayra, met de bus (${fmt(trip.k)})`;
  }
  return c;
}

function renderWeek() {
  const wrap = $("#week");
  wrap.replaceChildren();
  const monday = selectedWeek;
  const dates = DAYS.map((_, i) => addDays(monday, i));
  const plans = dates.map((d) => planDay(dayBlocks("reda", d), dayBlocks("kayra", d)));

  // Tijdas: van het vroegste begin tot het laatste einde, afgerond op hele uren
  let lo = Infinity, hi = -Infinity;
  for (const p of plans) for (const who of ["r", "k"]) for (const [s, e] of p[who].les.concat(p[who].pauze)) {
    lo = Math.min(lo, s); hi = Math.max(hi, e);
  }
  if (!isFinite(lo)) { lo = 8 * 60; hi = 18 * 60; }
  lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
  const height = (hi - lo) * PX_PER_MIN;
  const y = (m) => (m - lo) * PX_PER_MIN;
  const today = brusselsDate();

  // Rij 1: dagkoppen
  wrap.append(el("div"));
  dates.forEach((d, i) => {
    const h = el("div", "day-head" + (d === today ? " is-today" : ""));
    h.append(el("div", "dn", DAYS[i]), el("div", "dd", String(Number(d.slice(8)))));
    wrap.append(h);
  });

  // Rij 2: heen
  wrap.append(el("div"));
  plans.forEach((p) => wrap.append(rideCell(p.heen)));

  // Rij 3: tijdlijn
  const axis = el("div", "axis");
  axis.style.height = `${height}px`;
  for (let m = lo; m <= hi; m += 60) {
    const s = el("span", null, `${m / 60}u`);
    s.style.top = `${y(m)}px`;
    axis.append(s);
  }
  wrap.append(axis);

  dates.forEach((d, i) => {
    const p = plans[i];
    const lanes = el("div", "lanes");
    lanes.style.height = `${height}px`;
    for (let m = lo + 60; m < hi; m += 60) {
      const g = el("div", "gridline");
      g.style.top = `${y(m)}px`;
      lanes.append(g);
    }
    for (const [s, e] of p.samen) {
      const b = el("div", "samen");
      b.style.top = `${y(s)}px`;
      b.style.height = `${(e - s) * PX_PER_MIN}px`;
      b.title = `Samen pauze ${fmt(s)}–${fmt(e)}`;
      lanes.append(b);
    }
    for (const who of ["r", "k"]) {
      const lane = el("div", "lane");
      const name = who === "r" ? "Reda" : "Kayra";
      for (const [s, e] of p[who].pauze) {
        const b = el("div", `blk pauze ${who}`);
        b.style.top = `${y(s)}px`;
        b.style.height = `${(e - s) * PX_PER_MIN}px`;
        b.title = `${name} pauze ${fmt(s)}–${fmt(e)}`;
        lane.append(b);
      }
      for (const [s, e] of p[who].les) {
        const b = el("div", `blk les ${who}`);
        b.style.top = `${y(s)}px`;
        b.style.height = `${(e - s) * PX_PER_MIN - 2}px`;
        b.title = `${name} les ${fmt(s)}–${fmt(e)}`;
        lane.append(b);
      }
      lanes.append(lane);
    }
    if (!p.r.les.length && !p.k.les.length) lanes.append(el("div", "free", "vrij"));
    if (d === today) {
      const now = brusselsMinutes();
      if (now >= lo && now <= hi) {
        const n = el("div", "now-line");
        n.style.top = `${y(now)}px`;
        lanes.append(n);
      }
    }
    wrap.append(lanes);
  });

  // Rij 4: terug
  wrap.append(el("div"));
  plans.forEach((p) => wrap.append(rideCell(p.terug)));
}

function tripLine(icon, what, sub) {
  const t = el("div", "trip");
  const w = el("div", "what");
  if (Array.isArray(what)) w.append(...what); else w.textContent = what;
  t.append(el("div", "ico", icon), w, el("div", "sub", sub));
  return t;
}

function renderToday() {
  const box = $("#today");
  box.replaceChildren();
  let iso = brusselsDate();
  const wd = weekday(iso);
  let label = "Vandaag";
  if (wd === 6 || wd === 0) { iso = addDays(iso, wd === 6 ? 2 : 1); label = "Volgende schooldag"; }
  const d = new Date(iso + "T12:00:00Z");
  box.append(el("h1", null, `${label}, ${DAY_LONG[weekday(iso)]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`));

  if (!DATA.weeks.includes(mondayOf(iso))) {
    box.append(el("p", "empty-day", "Nog geen rooster voor deze dag."));
    return;
  }
  const p = planDay(dayBlocks("reda", iso), dayBlocks("kayra", iso));
  if (!p.heen) {
    box.append(el("p", "empty-day", "Geen les voor jullie allebei."));
    return;
  }
  const R = () => el("span", "who-r", "Reda");
  const K = () => el("span", "who-k", "Kayra");

  const h = p.heen;
  if (h.mode === "samen") {
    const later = h.r > h.k ? `Reda begint om ${fmt(h.r)}` : h.k > h.r ? `Kayra begint om ${fmt(h.k)}` : "Jullie beginnen tegelijk";
    box.append(tripLine("🏍️", "Samen naar school", `Eerste les om ${fmt(h.time)}. ${later}.`));
  } else if (h.mode === "apart") {
    box.append(tripLine("🚌", "Apart naar school", `Reda met de motor om ${fmt(h.r)}, Kayra met de bus om ${fmt(h.k)}.`));
  } else if (h.mode === "reda") {
    box.append(tripLine("🏍️", [R(), " heeft alleen les"], `Met de motor, eerste les om ${fmt(h.r)}. Kayra is vrij.`));
  } else {
    box.append(tripLine("🚌", [K(), " heeft alleen les"], `Met de bus, eerste les om ${fmt(h.k)}. Reda is vrij.`));
  }

  if (p.samen.length) {
    box.append(tripLine("☕", "Samen pauze", p.samen.map(([s, e]) => `${fmt(s)}–${fmt(e)}`).join(" en ")));
  }

  const t = p.terug;
  if (t.mode === "samen") {
    const wait = t.r < t.k ? `Reda wacht vanaf ${fmt(t.r)}` : t.k < t.r ? `Kayra wacht vanaf ${fmt(t.k)}` : "Jullie zijn tegelijk klaar";
    box.append(tripLine("🏍️", "Samen naar huis", `Vertrek om ${fmt(t.time)}. ${wait}.`));
  } else if (t.mode === "apart") {
    box.append(tripLine("🚌", "Apart naar huis", `Reda met de motor om ${fmt(t.r)}, Kayra met de bus om ${fmt(t.k)}.`));
  } else if (t.mode === "reda") {
    box.append(tripLine("🏍️", "Reda naar huis", `Laatste les tot ${fmt(t.r)}.`));
  } else {
    box.append(tripLine("🚌", "Kayra naar huis", `Met de bus, laatste les tot ${fmt(t.k)}.`));
  }
}

function renderWeekButtons() {
  const seg = $("#weeks");
  seg.replaceChildren();
  const thisMonday = mondayOf(brusselsDate());
  DATA.weeks.forEach((w) => {
    const b = el("button", null, w === thisMonday ? "Deze week" : w === addDays(thisMonday, 7) ? "Volgende week" : `Week van ${Number(w.slice(8))}/${Number(w.slice(5, 7))}`);
    b.type = "button";
    b.setAttribute("aria-pressed", String(w === selectedWeek));
    b.addEventListener("click", () => { selectedWeek = w; renderWeekButtons(); renderWeek(); });
    seg.append(b);
  });
}

function renderFoot() {
  const g = new Date(DATA.generated);
  const s = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(g);
  $("#foot").textContent = `Rooster uit Untis bijgewerkt op ${s}.`;
}

function pickWeek() {
  const today = brusselsDate();
  const wd = weekday(today);
  let target = mondayOf(today);
  if (wd === 6 || wd === 0) target = addDays(target, 7);
  selectedWeek = DATA.weeks.includes(target) ? target : DATA.weeks[0];
}

function render() {
  $("#error").replaceChildren();
  if (!selectedWeek || !DATA.weeks.includes(selectedWeek)) pickWeek();
  renderToday();
  renderWeekButtons();
  renderWeek();
  renderFoot();
}

function showError(msg) {
  const e = el("div", "error", msg);
  $("#error").replaceChildren(e);
}

async function start(force = false) {
  const btn = $("#refresh");
  btn.classList.add("busy");
  btn.disabled = true;
  try {
    DATA = await loadData(force);
    render();
  } catch (err) {
    if (!DATA) $("#today").replaceChildren(el("h1", null, "Rooster niet beschikbaar"));
    showError(`${err.message} Probeer het later opnieuw met Vernieuwen.`);
  } finally {
    btn.classList.remove("busy");
    btn.disabled = false;
  }
}

$("#refresh").addEventListener("click", () => start(true));
// Bij terugkeren naar de app op een nieuwe dag: opnieuw laden
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && DATA) start(false);
});
start(false);
