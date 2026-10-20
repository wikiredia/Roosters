// Rooster van één persoon als echte roosterweergave: tijdlijn met uren, 1/2/3 dagen of een week,
// verticaal of horizontaal, en verder scrollen naar de volgende weken.
// Je eigen rooster: een pauze die je met iemand deelt is geel en aantikbaar (wie heeft er dan ook
// pauze?), net als de tijd na je laatste les (wie is ook klaar, wie blijft in Antwerpen).
// Kleine app: altijd verticaal, zoveel dagen als in Opties, met een + om tijdelijk een dag bij te zetten.
import { api } from "../api.js";
import { state, go, myPerson, toast, toastError, showError, sheet, closeSheet, tiny } from "../app.js";
import { h, clear, fmt, dur, icon, ago, brusselsMinutes, store, dayLabel, names, avatar } from "../util.js";
import { lessonSheet, emptyState } from "./common.js";
import { prefs, viewControls, hourRange, freeHeight, legend } from "./grid.js";
import { breakRequestSheet, personSheet } from "./social.js";
import { checkinSheet, CHECKIN_LABEL } from "./afspreken.js";

// Kleine app: dagen die je met + bijzette (niet onthouden, weg bij opnieuw openen)
let extraDays = 0;
// Welke dag links staat (zodat + of opnieuw tekenen je niet terug naar vandaag gooit)
let shownDay = null;

export async function render(root, { parts }) {
  const mine = myPerson();
  const pid = Number(parts[0]) || mine?.id || store.get("lastViewed");
  if (!pid) {
    root.append(emptyState("Kies eerst wie je bent", "Op Home kies je je naam.", h("a", { class: "btn", href: "#/home" }, "Naar Home")));
    return;
  }
  store.set("lastViewed", pid);
  shownDay = null;
  const own = pid === mine?.id;

  const head = h("div", { class: "toolbar" });
  const body = h("div");
  // Kleine app: geen keuzelijst, geen knoppen; vernieuwen zit in het menu
  if (!tiny) root.append(head);
  root.append(body);

  // Kies wiens rooster (jij bovenaan)
  const people = [...(state.me.people || [])].sort((a, b) => (a.id === mine?.id ? -1 : b.id === mine?.id ? 1 : a.name.localeCompare(b.name)));
  const select = h("select", { class: "person-select", "aria-label": "Wiens rooster", onchange: () => go(`#/rooster/${select.value}`) },
    people.map((p) => h("option", { value: p.id, selected: p.id === pid }, p.id === mine?.id ? `${p.name} (jij)` : p.name)));
  const refreshBtn = h("button", { class: "icon-btn refresh", "aria-label": "Rooster opnieuw ophalen" }, icon("refresh"));
  const updated = h("span", { class: "updated" });
  head.classList.add("rooster-bar");
  head.append(h("div", { class: "select-wrap" }, select, updated), refreshBtn);

  let data;
  // Per dag (eigen rooster): /api/overview, met wie je pauze hebt en wie na school blijft
  let overviews = new Map();
  const loadOverviews = async () => {
    if (!own) return new Map();
    const days = data.days.filter((d) => d.day >= data.today && d.lessons.some(ACTIVE)).slice(0, 6);
    const got = await Promise.all(days.map((d) => api.get(`/overview?day=${d.day}`).catch(() => null)));
    return new Map(got.filter(Boolean).map((o) => [o.day, o]));
  };
  const load = async () => {
    data = await api.get(`/schedule/${pid}`);
    overviews = await loadOverviews();
    draw();
  };

  const draw = (flash = new Set()) => {
    clear(body);
    updated.textContent = data.updated ? `bijgewerkt ${ago(data.updated)}` : "";
    const errors = data.sources.filter((s) => s.error);
    if (!data.sources.length) {
      body.append(emptyState(
        own ? "Je hebt nog geen rooster toegevoegd" : `${data.person.name} heeft nog geen rooster toegevoegd`,
        own ? "Voeg je Untis-klas, Google- of iCloud-agenda toe." : null,
        own ? h("a", { class: "btn primary", href: "#/opties" }, "Rooster toevoegen") : null));
      return;
    }
    const n = tiny ? Math.min(5, prefs.tinyDays + extraDays) : prefs.days;
    const ctx = { own, overviews, flash, n, redraw: () => draw(), reload: () => load().catch(() => {}) };
    if (!tiny) {
      body.append(viewControls(() => draw()));
      const p = own ? samePrompt(data, overviews) : null;
      if (p) body.append(p);
    }
    if (!tiny && prefs.orient === "h") drawHorizontal(body, data, ctx);
    else drawVertical(body, data, ctx);
    const kinds = new Set(data.days.flatMap((d) => d.lessons.map((l) => l.kind || "les")));
    const lg = tiny ? null : legend(kinds);
    if (lg) body.append(lg);
    for (const s of errors) body.append(h("p", { class: "source-error" }, `${s.label}: ${s.error}`));
    announceChanges(data, own);
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
      overviews = await loadOverviews();
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
  // 'Vernieuwen' in het menu (kleine app) haalt dit rooster opnieuw op
  state.refresh = refresh;

  try {
    await load();
  } catch (e) {
    showError(body, e);
    return () => { state.refresh = null; };
  }
  // Venster groter/kleiner (laptop, kleine app): opnieuw passend tekenen
  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(() => draw(), 150); };
  window.addEventListener("resize", onResize);
  const stopPull = pullToRefresh(root, refresh);
  return () => {
    stopPull();
    clearTimeout(rt);
    window.removeEventListener("resize", onResize);
    if (state.refresh === refresh) state.refresh = null;
  };
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

function firstShown(data, n) {
  const kept = shownDay ? data.days.findIndex((d) => d.day === shownDay) : -1;
  if (kept >= 0) return kept;
  const i = startIndex(data);
  return n === 5 ? weekStart(data.days, i) : i;
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

// "vandaag", "morgen" of "woensdag"
function dayWord(iso, today) {
  const lab = dayLabel(iso, today);
  return lab.main.toLowerCase();
}

// ---- 'Nieuw': enkel tot je de les opent ----------------------------------------------
// Per les onthouden we welke wijziging (changed_at) je al zag; een nieuwe wijziging = weer 'nieuw'.
const SEEN = "seenChanges";
const ANNOUNCED = "announcedChanges";

function remembered(key) {
  const m = store.get(key, {});
  return m && typeof m === "object" ? m : {};
}

function remember(key, lessons) {
  const m = remembered(key);
  for (const l of lessons) m[l.id] = l.changed_at;
  // Niet eindeloos laten groeien: de laatste 300
  const keys = Object.keys(m);
  for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete m[k];
  store.set(key, m);
}

const isNew = (l) => !!(l.changed && l.changed_at && remembered(SEEN)[l.id] !== l.changed_at);

function changedLine(l, today) {
  const t = new Date(l.changed_at);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(t);
  const time = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).format(t);
  const when = day === today ? time : `${dayWord(day, today)} ${time}`;
  return `Gewijzigd in ${l.source || "je rooster"} om ${when}`;
}

// De eerste keer dat je een wijziging ziet: één keer zeggen wat er veranderde en waar
function announceChanges(data, own) {
  if (!own) return;
  const told = remembered(ANNOUNCED);
  const fresh = data.days.filter((d) => d.day >= data.today).flatMap((d) => d.lessons.map((l) => ({ ...l, day: d.day })))
    .filter((l) => isNew(l) && told[l.id] !== l.changed_at);
  if (!fresh.length) return;
  remember(ANNOUNCED, fresh);
  const l = fresh[0];
  toast(fresh.length === 1
    ? `${l.title} (${dayWord(l.day, data.today)} ${fmt(l.start)}): ${changedLine(l, data.today).replace(/^G/, "g")}`
    : `${fresh.length} lessen zijn gewijzigd. ${changedLine(l, data.today)}.`, { ms: 3500 });
}

function lessonBlock(l, style, flash, isToday, now, compact, today) {
  const fresh = isNew(l);
  const badge = { cancelled: "vervalt", removed: "vervallen", changed: "gewijzigd", extra: "extra", exam: "examen" }[l.state] || (fresh ? "nieuw" : null);
  const blk = h("button", {
    type: "button",
    class: `cal-blk k-${l.kind || "les"} s-${l.state} ${fresh ? "changed" : ""} ${flash.has(l.id) ? "flash" : ""} ${isToday && l.end <= now ? "past" : ""} ${isToday && l.start <= now && now < l.end && ACTIVE(l) ? "now" : ""} ${compact ? "compact" : ""}`,
    style,
    title: fresh ? changedLine(l, today) : null,
    onclick: () => {
      // Geopend = gezien: het 'nieuw'-labeltje verdwijnt
      if (isNew(l)) {
        remember(SEEN, [l]);
        blk.classList.remove("changed");
        blk.removeAttribute("title");
        blk.querySelector(".b-badge.new")?.remove();
      }
      lessonSheet(l.id, l);
    },
    "aria-label": `${l.title}, ${fmt(l.start)} tot ${fmt(l.end)}${l.location ? ", " + l.location : ""}${fresh ? ", nieuw: " + changedLine(l, today) : ""}`,
  },
    h("span", { class: "b-title" }, l.title),
    h("span", { class: "b-time" }, `${fmt(l.start)}–${fmt(l.end)}`),
    l.location ? h("span", { class: "b-loc" }, l.location) : null,
    badge ? h("span", { class: `b-badge${badge === "nieuw" ? " new" : ""}` }, badge) : null);
  return blk;
}

// ---- Pauzes en na school (eigen rooster) ----------------------------------------------
const CHILL_TEXT = { chilling: "is al aan het chillen", want_chill: "wil chillen" };
const compareLink = (ids) => `#/vergelijk?ids=${[...new Set([myPerson()?.id, ...ids].filter(Boolean))].join(",")}`;

function who(list) {
  if (!list.length) return "";
  const first = list.slice(0, 2).map((p) => p.name);
  return list.length > 2 ? `${first.join(", ")} +${list.length - 2}` : names(first);
}

// Elementen voor één dag: pauzes (geel als je ze met iemand deelt) en de tijd na je laatste les.
// pos(start, end) geeft de stijl (top/height of left/width).
function slotEls(d, ov, ctx, pos, { isToday, now, hi, small }) {
  const out = [];
  for (const sl of ov.slots) {
    const len = sl.end - sl.start;
    const shared = sl.people.length > 0;
    if (!shared && len < 45) continue;
    const past = isToday && sl.end <= now;
    const tight = small(sl.start, sl.end);
    out.push(h("button", {
      type: "button", class: `slot brk-slot${shared ? " shared" : ""}${past ? " past" : ""}${tight ? " tight" : ""}`, style: pos(sl.start, sl.end),
      "aria-label": `Pauze ${fmt(sl.start)} tot ${fmt(sl.end)}${shared ? `, ook pauze: ${names(sl.people.map((p) => p.name))}` : ", niemand anders"}`,
      onclick: () => breakSheet(d, sl, ov, ctx),
    },
      tight ? null : h("span", { class: "s-main" }, `pauze ${dur(len)}`),
      shared ? h("span", { class: "s-who" }, icon("users"), who(sl.people)) : null));
  }
  const a = ov.after;
  if (a && a.start < hi && !(isToday && hi <= now)) {
    const n = new Set([...a.done_same, ...a.chill, ...a.free].map((p) => p.id)).size;
    const label = a.me_chill ? "Jij blijft in Antwerpen" : n ? `na school · ${n} ${n === 1 ? "ander" : "anderen"}` : "na school";
    out.push(h("button", {
      type: "button", class: `slot after-slot${a.me_chill ? " chill" : ""}${n ? " shared" : ""}`, style: pos(a.start, hi),
      "aria-label": `Na school, vanaf ${fmt(a.start)}`,
      onclick: () => afterSheet(d, ov, ctx),
    }, h("span", { class: "s-main" }, label),
    a.chill.length ? h("span", { class: "s-who" }, icon("sun"), who(a.chill)) : a.done_same.length ? h("span", { class: "s-who" }, icon("users"), who(a.done_same)) : null));
  }
  return out;
}

function personRow(p, sub, onclick) {
  return h("button", { type: "button", class: "row-btn slot-person", onclick },
    avatar(p, "sm"), h("span", { class: "row-text" }, h("span", { class: "row-main" }, p.name), sub ? h("span", { class: "row-sub" }, sub) : null),
    icon("chevron", "ico chev"));
}

function breakSheet(d, sl, ov, ctx) {
  const ppl = sl.people;
  const isPast = d.day === ov.today && sl.end <= brusselsMinutes();
  const body = h("div", { class: "slot-sheet" },
    h("p", { class: "muted" }, `${dayWord(d.day, ov.today)[0].toUpperCase()}${dayWord(d.day, ov.today).slice(1)} · ${dur(sl.end - sl.start)} geen les`));
  if (!ppl.length) {
    body.append(h("p", { class: "slot-none" }, "Niemand die je kent heeft dan pauze."));
    sheet(`Pauze ${fmt(sl.start)}–${fmt(sl.end)}`, body);
    return;
  }
  // Wie elke pauze met je deelt: voorstellen om samen te vergelijken
  const same = ppl.filter((p) => ov.same_breaks.includes(p.id));
  if (same.length) {
    body.append(h("div", { class: "slot-same" },
      h("span", null, `${names(same.map((p) => p.name))} ${same.length === 1 ? "heeft" : "hebben"} ${dayWord(d.day, ov.today)} dezelfde pauzes als jij.`),
      h("button", { type: "button", class: "btn small", onclick: () => { closeSheet(); go(compareLink(same.map((p) => p.id))); } }, "Vergelijk")));
  }
  body.append(h("p", { class: "picker-group" }, ppl.length === 1 ? "Heeft ook pauze" : "Hebben ook pauze"));
  for (const p of ppl) {
    const sub = [`${fmt(p.start)}–${fmt(p.end)}`, p.same_campus ? null : "andere campus", p.chill ? CHILL_TEXT[p.chill] : null].filter(Boolean).join(" · ");
    body.append(personRow(p, sub, () => { closeSheet(); personSheet(p, { day: d.day, start: p.start, end: p.end }); }));
  }
  const one = ppl.length === 1 ? ppl[0].name : null;
  body.append(h("div", { class: "sheet-actions slot-actions" },
    isPast ? null : h("button", { type: "button", class: "btn primary wide", onclick: () => {
      closeSheet();
      breakRequestSheet({ people: ppl.map((p) => ({ id: p.id, name: p.name })), day: d.day, start: sl.start, end: sl.end, onDone: ctx.reload });
    } }, icon("pause"), one ? `Pauze vragen aan ${one}` : "Samen pauze vragen"),
    h("button", { type: "button", class: "btn wide", onclick: () => { closeSheet(); go(compareLink(ppl.map((p) => p.id))); } },
      icon("vergelijk"), one ? `Vergelijk met ${one}` : `Vergelijk met deze ${ppl.length}`)));
  sheet(`Pauze ${fmt(sl.start)}–${fmt(sl.end)}`, body);
}

function afterSheet(d, ov, ctx) {
  const a = ov.after;
  const isToday = d.day === ov.today;
  const body = h("div", { class: "slot-sheet" });
  // Jij: blijf je? (check-ins gelden enkel voor vandaag)
  if (isToday) {
    if (a.me_chill) {
      body.append(h("div", { class: "slot-me" }, h("span", { class: "dot" }), h("span", null, `Jij: ${CHECKIN_LABEL[a.me_chill]}`),
        h("button", { type: "button", class: "link", onclick: () => { closeSheet(); go("#/afspreken"); } }, "Wijzig")));
    } else {
      body.append(h("button", { type: "button", class: "btn primary wide", onclick: () => { closeSheet(); checkinSheet("want_chill", ctx.reload); } },
        icon("sun"), "Ik blijf in Antwerpen"),
      h("p", { class: "muted small" }, "Je vriendengroep krijgt een melding."));
    }
  } else {
    body.append(h("p", { class: "muted small" }, `Of je ${dayWord(d.day, ov.today)} blijft, laat je die dag weten.`));
  }
  const section = (title, list, sub) => {
    if (!list.length) return;
    body.append(h("p", { class: "picker-group" }, title));
    for (const p of list) body.append(personRow(p, sub(p), () => { closeSheet(); personSheet(p, { day: d.day, start: a.start, end: a.end }); }));
  };
  if (isToday) section("Blijven in Antwerpen", a.chill, (p) => `${CHECKIN_LABEL[p.status]}${p.until ? ` tot ${fmt(p.until)}` : ""}`);
  section(`Ook klaar rond ${fmt(a.start)}`, a.done_same.filter((p) => !a.chill.some((c) => c.id === p.id)), (p) => `klaar om ${fmt(p.end)}`);
  section("Hebben dan nog pauze", a.free.filter((p) => !a.chill.some((c) => c.id === p.id)), (p) => `vrij ${fmt(p.start)}–${fmt(p.end)}`);
  if (!a.chill.length && !a.done_same.length && !a.free.length) body.append(h("p", { class: "slot-none" }, "Niemand die je kent is rond dan klaar."));
  const ids = [...new Set([...a.chill, ...a.done_same].map((p) => p.id))];
  if (ids.length) {
    body.append(h("div", { class: "sheet-actions slot-actions" },
      h("button", { type: "button", class: "btn wide", onclick: () => { closeSheet(); go(compareLink(ids)); } }, icon("vergelijk"), "Vergelijk met hen")));
  }
  sheet(`Na school · vanaf ${fmt(a.start)}`, body);
}

// 'Vergelijk met Kayra en Corneel? Jullie hebben dezelfde pauzes' (tot je het wegklikt, per dag)
function samePrompt(data, overviews) {
  const first = data.days[firstShown(data, prefs.days)];
  const ov = first && overviews.get(first.day);
  if (!ov?.same_breaks?.length) return null;
  const ids = ov.same_breaks.slice(0, 4);
  const key = `${ov.day}:${ids.join(",")}`;
  if (store.get("samePromptOff") === key) return null;
  const nameOf = new Map(ov.mates.map((m) => [m.id, m.name]));
  const box = h("div", { class: "same-prompt" },
    icon("users"),
    h("span", null, `Vergelijk met ${names(ids.map((id) => nameOf.get(id)))}? Jullie hebben ${dayWord(ov.day, data.today)} dezelfde pauzes.`),
    h("button", { type: "button", class: "btn small primary", onclick: () => go(compareLink(ids)) }, "Vergelijk"),
    h("button", { type: "button", class: "icon-btn", "aria-label": "Niet meer tonen", onclick: () => { store.set("samePromptOff", key); box.remove(); } }, icon("close")));
  return box;
}

// Uren op het scherm; na je laatste les minstens een uur ruimte om 'na school' aan te tikken
function rangeFor(data, ctx) {
  const blocks = data.days.flatMap((d) => d.lessons);
  for (const ov of ctx.overviews.values()) if (ov.after) blocks.push({ start: ov.after.start, end: Math.min(24 * 60, ov.after.start + 60) });
  return hourRange(blocks);
}

// Verticaal: dagen als kolommen, de tijd van boven naar onder
function drawVertical(body, data, ctx) {
  const { n, flash } = ctx;
  const [lo, hi] = rangeFor(data, ctx);
  const span = hi - lo;
  const wrap = h("div", { class: `calv cols-${n}`, style: { "--cols": String(n) } });
  body.append(wrap);
  const ppm = Math.max(tiny ? 0.4 : 0.75, Math.min(2.4, (freeHeight(wrap, 56) - 8) / span));
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
    const ov = ctx.overviews.get(d.day);
    if (ov) {
      colBody.append(...slotEls(d, ov, ctx, (s, e) => ({ top: y(s), height: `${Math.max(12, (e - s) * ppm - 2)}px` }),
        { isToday, now, hi, small: (s, e) => (e - s) * ppm < 34 }));
    } else {
      for (let i = 1; i < active.length; i++) {
        const gs = Math.max(...active.slice(0, i).map((l) => l.end)), ge = active[i].start;
        if (ge - gs >= 45) colBody.append(h("span", { class: "gap-label", style: { top: y(gs), height: `${(ge - gs) * ppm}px` } }, `pauze ${dur(ge - gs)}`));
      }
    }
    for (const l of d.lessons) {
      colBody.append(lessonBlock(l, { top: y(l.start), height: `${Math.max(14, (l.end - l.start) * ppm - 2)}px` }, flash, isToday, now, (l.end - l.start) * ppm < 46, data.today));
    }
    if (!d.lessons.length) colBody.append(h("span", { class: "no-class-v" }, isToday ? "Geen les vandaag" : "Geen les"));
    if (isToday && now > lo && now < hi) colBody.append(h("b", { class: "now-line", style: { top: y(now) } }));
    if (!ov && isToday && data.checkin && ["chilling", "want_chill"].includes(data.checkin.status) && active.length) {
      const from = Math.max(...active.map((l) => l.end)), until = Math.min(hi, data.checkin.until_min || hi);
      if (until > from) colBody.append(h("span", { class: "chill-band", style: { top: y(from), height: `${(until - from) * ppm}px` } }, "blijft in Antwerpen"));
    }
    col.append(colBody);
    scroller.append(col);
  });
  wrap.append(gutter, scroller);

  // Kleine app: rechts een smalle strook met + (dag erbij) en, als je er bijzette, − (dag minder)
  if (tiny) {
    wrap.append(h("div", { class: "calv-rail" },
      h("button", { type: "button", class: "calv-add", "aria-label": "Dag erbij", title: "Dag erbij", disabled: n >= 5,
        onclick: () => { extraDays++; ctx.redraw(); } }, icon("plus")),
      extraDays ? h("button", { type: "button", class: "calv-add minus", "aria-label": "Dag minder", title: "Dag minder",
        onclick: () => { extraDays = Math.max(0, extraDays - 1); ctx.redraw(); } }, h("span", { "aria-hidden": "true" }, "−")) : null));
  }

  const i = firstShown(data, n);
  requestAnimationFrame(() => {
    const first = scroller.children[0], target = scroller.children[i];
    if (first && target) scroller.scrollLeft = target.offsetLeft - first.offsetLeft;
  });
  let sraf = 0;
  scroller.addEventListener("scroll", () => {
    cancelAnimationFrame(sraf);
    sraf = requestAnimationFrame(() => {
      const w = scroller.children[0]?.offsetWidth || 1;
      shownDay = data.days[Math.round(scroller.scrollLeft / w)]?.day || shownDay;
    });
  }, { passive: true });
  scroller.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    scroller.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * scroller.clientWidth, behavior: "smooth" });
  });
}

// Horizontaal: elke dag een rij, de tijd van links naar rechts
function drawHorizontal(body, data, ctx) {
  const { n, flash } = ctx;
  const [lo, hi] = rangeFor(data, ctx);
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
    const ov = ctx.overviews.get(d.day);
    if (ov) {
      const px = (s, e) => ((e - s) / span) * (wrap.clientWidth || window.innerWidth);
      track.append(...slotEls(d, ov, ctx, (s, e) => ({ left: pct(s), width: `calc(${((e - s) / span) * 100}% - 2px)` }),
        { isToday, now, hi, small: (s, e) => px(s, e) < 70 }));
    }
    for (const l of d.lessons) {
      const narrow = ((l.end - l.start) / span) * window.innerWidth < 70;
      track.append(lessonBlock(l, { left: pct(l.start), width: `calc(${((l.end - l.start) / span) * 100}% - 2px)` }, flash, isToday, now, narrow, data.today));
    }
    if (!d.lessons.length) track.append(h("span", { class: "no-class-h" }, isToday ? "Geen les vandaag" : "Geen les"));
    if (isToday && now > lo && now < hi) track.append(h("b", { class: "now-line-v", style: { left: pct(now) } }));
    const row = h("div", { class: `calh-row ${isToday ? "today" : ""}` }, h("span", { class: "calh-label" }, h("b", null, head.main), h("span", null, head.sub)), track);
    rows.push(row);
    wrap.append(row);
  });
  const i = firstShown(data, n);
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
