// Rooster van één persoon als echte roosterweergave: tijdlijn met uren, 1/2/3 dagen of een week,
// verticaal of horizontaal, en verder scrollen naar de volgende weken.
import { api } from "../api.js";
import { state, go, myPerson, toast, toastError, showError } from "../app.js";
import { h, clear, fmt, dur, icon, ago, brusselsMinutes, store, dayLabel } from "../util.js";
import { lessonSheet, emptyState } from "./common.js";
import { prefs, viewControls, hourRange, freeHeight, legend } from "./grid.js";

export async function render(root, { parts }) {
  const mine = myPerson();
  const pid = Number(parts[0]) || mine?.id || store.get("lastViewed");
  if (!pid) {
    root.append(emptyState("Kies eerst wie je bent", "Op Home kies je je naam.", h("a", { class: "btn", href: "#/home" }, "Naar Home")));
    return;
  }
  store.set("lastViewed", pid);

  const head = h("div", { class: "toolbar" });
  const body = h("div");
  root.append(head, body);

  // Kies wiens rooster (jij bovenaan)
  const people = [...(state.me.people || [])].sort((a, b) => (a.id === mine?.id ? -1 : b.id === mine?.id ? 1 : a.name.localeCompare(b.name)));
  const select = h("select", { class: "person-select", "aria-label": "Wiens rooster", onchange: () => go(`#/rooster/${select.value}`) },
    people.map((p) => h("option", { value: p.id, selected: p.id === pid }, p.id === mine?.id ? `${p.name} (jij)` : p.name)));
  const refreshBtn = h("button", { class: "icon-btn refresh", "aria-label": "Rooster opnieuw ophalen" }, icon("refresh"));
  const updated = h("span", { class: "updated" });
  head.classList.add("rooster-bar");
  head.append(h("div", { class: "select-wrap" }, select, updated), refreshBtn);

  let data;
  const load = async () => {
    data = await api.get(`/schedule/${pid}`);
    draw();
  };

  const draw = (flash = new Set()) => {
    clear(body);
    updated.textContent = data.updated ? `bijgewerkt ${ago(data.updated)}` : "";
    const errors = data.sources.filter((s) => s.error);
    if (!data.sources.length) {
      body.append(emptyState(
        pid === mine?.id ? "Je hebt nog geen rooster toegevoegd" : `${data.person.name} heeft nog geen rooster toegevoegd`,
        pid === mine?.id ? "Voeg je Untis-klas, Google- of iCloud-agenda toe." : null,
        pid === mine?.id ? h("a", { class: "btn primary", href: "#/opties" }, "Rooster toevoegen") : null));
      return;
    }
    body.append(viewControls(() => draw()));
    const n = prefs.days;
    if (prefs.orient === "h") drawHorizontal(body, data, flash, n);
    else drawVertical(body, data, flash, n);
    const kinds = new Set(data.days.flatMap((d) => d.lessons.map((l) => l.kind || "les")));
    const lg = legend(kinds);
    if (lg) body.append(lg);
    for (const s of errors) body.append(h("p", { class: "source-error" }, `${s.label}: ${s.error}`));
  };

  const refresh = async () => {
    if (refreshBtn.classList.contains("busy")) return;
    refreshBtn.classList.add("busy");
    root.classList.add("refreshing");
    const before = new Map();
    for (const d of data?.days || []) for (const l of d.lessons) before.set(l.id, `${l.start}-${l.end}-${l.state}-${l.location}`);
    try {
      const r = await api.post(`/refresh/${pid}`);
      data = await api.get(`/schedule/${pid}`);
      const flash = new Set();
      for (const d of data.days) for (const l of d.lessons) {
        if (before.get(l.id) !== `${l.start}-${l.end}-${l.state}-${l.location}`) flash.add(l.id);
      }
      draw(r.changes ? flash : new Set());
      updated.classList.add("pulse");
      setTimeout(() => updated.classList.remove("pulse"), 1200);
      if (r.errors?.length) toast(`Niet alles gelukt: ${r.errors[0].error}`, { kind: "error" });
      else if (r.skipped) toast("Net nog vernieuwd · alles is up-to-date");
      else toast(r.changes ? `Bijgewerkt · ${r.changes} ${r.changes === 1 ? "wijziging" : "wijzigingen"}` : "Bijgewerkt · alles is up-to-date");
    } catch (e) {
      toastError(e);
    } finally {
      refreshBtn.classList.remove("busy");
      root.classList.remove("refreshing");
    }
  };
  refreshBtn.addEventListener("click", refresh);

  try {
    await load();
  } catch (e) {
    showError(body, e);
    return;
  }
  return pullToRefresh(root, refresh);
}

const ACTIVE = (l) => l.state !== "cancelled" && l.state !== "removed";

// Vanaf welke dag tonen we? Vandaag, tenzij je lessen van vandaag al voorbij zijn.
function startIndex(data) {
  const now = brusselsMinutes();
  let i = data.days.findIndex((d) => d.day >= data.today);
  if (i < 0) return 0;
  const today = data.days[i];
  if (today.day === data.today) {
    const active = today.lessons.filter(ACTIVE);
    if (active.length && Math.max(...active.map((l) => l.end)) <= now) i = Math.min(i + 1, data.days.length - 1);
  }
  return i;
}

function weekStart(days, i) {
  // Eerste dag van dezelfde week (in de lijst)
  const monday = (iso) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const m = monday(days[i].day);
  return days.findIndex((d) => d.day >= m);
}

function dayHead(d, today, narrow = false) {
  const lab = dayLabel(d.day, today);
  const date = new Date(d.day + "T12:00:00Z");
  const short = new Intl.DateTimeFormat("nl-BE", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(date);
  if (narrow) {
    // Smalle kolommen (week): "wo 21" met eronder "vandaag"/"morgen" of de maand
    const month = new Intl.DateTimeFormat("nl-BE", { month: "short", timeZone: "UTC" }).format(date);
    const rel = lab.main === "Vandaag" || lab.main === "Morgen" ? lab.main.toLowerCase() : month;
    return { main: short, sub: rel };
  }
  return { main: lab.main === "Vandaag" || lab.main === "Morgen" ? lab.main : short, sub: lab.main === "Vandaag" || lab.main === "Morgen" ? short : lab.sub };
}

function lessonBlock(l, style, flash, isToday, now, compact) {
  const badge = { cancelled: "vervalt", removed: "vervallen", changed: "gewijzigd", extra: "extra", exam: "examen" }[l.state] || (l.changed ? "nieuw" : null);
  return h("button", {
    type: "button",
    class: `cal-blk k-${l.kind || "les"} s-${l.state} ${l.changed ? "changed" : ""} ${flash.has(l.id) ? "flash" : ""} ${isToday && l.end <= now ? "past" : ""} ${isToday && l.start <= now && now < l.end && ACTIVE(l) ? "now" : ""} ${compact ? "compact" : ""}`,
    style,
    onclick: () => lessonSheet(l.id, l),
    "aria-label": `${l.title}, ${fmt(l.start)} tot ${fmt(l.end)}${l.location ? ", " + l.location : ""}`,
  },
    h("span", { class: "b-title" }, l.title),
    h("span", { class: "b-time" }, `${fmt(l.start)}–${fmt(l.end)}`),
    l.location ? h("span", { class: "b-loc" }, l.location) : null,
    badge ? h("span", { class: "b-badge" }, badge) : null);
}

// Verticaal: dagen als kolommen, de tijd van boven naar onder
function drawVertical(body, data, flash, n) {
  const all = data.days.flatMap((d) => d.lessons);
  const [lo, hi] = hourRange(all);
  const span = hi - lo;
  const wrap = h("div", { class: `calv cols-${n}`, style: { "--cols": String(n) } });
  body.append(wrap);
  const ppm = Math.max(0.75, Math.min(2.4, (freeHeight(wrap, 56) - 8) / span));
  const height = Math.round(span * ppm);
  const y = (m) => `${Math.round((m - lo) * ppm)}px`;
  const now = brusselsMinutes();

  const gutter = h("div", { class: "calv-gutter" }, h("div", { class: "calv-head" }));
  const gbody = h("div", { class: "calv-gbody", style: { height: `${height}px` } });
  for (let t = lo; t <= hi; t += 60) gbody.append(h("span", { style: { top: y(t) } }, `${t / 60}u`));
  gutter.append(gbody);

  const scroller = h("div", { class: "calv-scroll", tabindex: "0", "aria-label": "Dagen, veeg om verder te kijken" });
  data.days.forEach((d) => {
    const isToday = d.day === data.today;
    const weekday = new Date(d.day + "T12:00:00Z").getUTCDay();
    const head = dayHead(d, data.today, n >= 3);
    const col = h("section", { class: `calv-col ${isToday ? "today" : ""} ${n === 5 && weekday === 1 ? "snap" : ""} ${n !== 5 ? "snap" : ""}` },
      h("header", { class: "calv-head" }, h("b", null, head.main), h("span", null, head.sub)));
    const colBody = h("div", { class: "calv-body", style: { height: `${height}px` } });
    for (let t = lo + 60; t < hi; t += 60) colBody.append(h("i", { class: "hr", style: { top: y(t) } }));
    const active = d.lessons.filter(ACTIVE).sort((a, b) => a.start - b.start);
    for (let i = 1; i < active.length; i++) {
      const gs = Math.max(...active.slice(0, i).map((l) => l.end)), ge = active[i].start;
      if (ge - gs >= 45) colBody.append(h("span", { class: "gap-label", style: { top: y(gs), height: `${(ge - gs) * ppm}px` } }, `pauze ${dur(ge - gs)}`));
    }
    for (const l of d.lessons) {
      colBody.append(lessonBlock(l, { top: y(l.start), height: `${Math.max(14, (l.end - l.start) * ppm - 2)}px` }, flash, isToday, now, (l.end - l.start) * ppm < 46));
    }
    if (!d.lessons.length) colBody.append(h("span", { class: "no-class-v" }, isToday ? "Geen les vandaag" : "Geen les"));
    if (isToday && now > lo && now < hi) colBody.append(h("b", { class: "now-line", style: { top: y(now) } }));
    if (isToday && data.checkin && ["chilling", "want_chill"].includes(data.checkin.status) && active.length) {
      const from = Math.max(...active.map((l) => l.end)), until = Math.min(hi, data.checkin.until_min || hi);
      if (until > from) colBody.append(h("span", { class: "chill-band", style: { top: y(from), height: `${(until - from) * ppm}px` } }, "blijft in Antwerpen"));
    }
    col.append(colBody);
    scroller.append(col);
  });
  wrap.append(gutter, scroller);

  let i = startIndex(data);
  if (n === 5) i = weekStart(data.days, i);
  requestAnimationFrame(() => {
    const first = scroller.children[0], target = scroller.children[i];
    if (first && target) scroller.scrollLeft = target.offsetLeft - first.offsetLeft;
  });
  scroller.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    scroller.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * scroller.clientWidth, behavior: "smooth" });
  });
}

// Horizontaal: elke dag een rij, de tijd van links naar rechts
function drawHorizontal(body, data, flash, n) {
  const all = data.days.flatMap((d) => d.lessons);
  const [lo, hi] = hourRange(all);
  const span = hi - lo;
  const pct = (m) => `${((m - lo) / span) * 100}%`;
  const wrap = h("div", { class: "calh" });
  body.append(wrap);
  const rowH = Math.max(72, Math.min(200, Math.floor((freeHeight(wrap, 28) - 4) / n)));
  const now = brusselsMinutes();
  const axis = h("div", { class: "calh-axis" });
  const step = span > 10 * 60 ? 120 : 60;
  for (let t = lo; t <= hi; t += step) axis.append(h("span", { style: { left: pct(t) } }, `${t / 60}u`));
  wrap.append(h("div", { class: "calh-row head" }, h("span"), axis));
  const rows = [];
  data.days.forEach((d) => {
    const isToday = d.day === data.today;
    const head = dayHead(d, data.today);
    const track = h("div", { class: "calh-track", style: { height: `${rowH}px` } });
    for (let t = lo + 60; t < hi; t += 60) track.append(h("i", { class: "vr", style: { left: pct(t) } }));
    for (const l of d.lessons) {
      const narrow = ((l.end - l.start) / span) * window.innerWidth < 70;
      track.append(lessonBlock(l, { left: pct(l.start), width: `calc(${((l.end - l.start) / span) * 100}% - 2px)` }, flash, isToday, now, narrow));
    }
    if (!d.lessons.length) track.append(h("span", { class: "no-class-h" }, isToday ? "Geen les vandaag" : "Geen les"));
    if (isToday && now > lo && now < hi) track.append(h("b", { class: "now-line-v", style: { left: pct(now) } }));
    const row = h("div", { class: `calh-row ${isToday ? "today" : ""}` }, h("span", { class: "calh-label" }, h("b", null, head.main), h("span", null, head.sub)), track);
    rows.push(row);
    wrap.append(row);
  });
  let i = startIndex(data);
  if (n === 5) i = weekStart(data.days, i);
  requestAnimationFrame(() => {
    if (i > 0 && rows[i]) window.scrollTo({ top: rows[i].getBoundingClientRect().top + window.scrollY - 72 });
  });
}

// Naar beneden trekken bovenaan de pagina = vernieuwen
export function pullToRefresh(root, onRefresh) {
  const ind = h("div", { class: "ptr" }, icon("refresh"));
  root.prepend(ind);
  let y0 = null, dy = 0;
  const start = (e) => { if (window.scrollY <= 0) { y0 = e.touches[0].clientY; dy = 0; } };
  const move = (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0 && window.scrollY <= 0) {
      ind.style.height = `${Math.min(70, dy / 2)}px`;
      ind.style.opacity = String(Math.min(1, dy / 120));
      ind.classList.toggle("ready", dy > 120);
    }
  };
  const end = () => {
    if (y0 == null) return;
    const go = dy > 120;
    y0 = null;
    ind.style.height = "";
    ind.style.opacity = "";
    ind.classList.remove("ready");
    if (go) onRefresh();
  };
  window.addEventListener("touchstart", start, { passive: true });
  window.addEventListener("touchmove", move, { passive: true });
  window.addEventListener("touchend", end);
  return () => {
    window.removeEventListener("touchstart", start);
    window.removeEventListener("touchmove", move);
    window.removeEventListener("touchend", end);
  };
}
