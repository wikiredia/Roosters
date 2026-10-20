// Vergelijken: eerst mensen kiezen (met wie je pauze kan nemen, wie je vaak kiest, je vrienden, je campus),
// dan een tijdlijn per dag: wie samen pauze heeft eerst, de rest ingeklapt, en wie er ook nog pauze heeft.
import { api } from "../api.js";
import { state, go, myPerson, sheet, tiny } from "../app.js";
import { h, append, clear, fmt, names, avatar, personColor, brusselsMinutes, brusselsDate, store, icon, dayLabel, ago } from "../util.js";
import { dayScroller, lessonSheet, sortGroups, personToggle, knownSheet, emptyState } from "./common.js";
import { prefs, viewControls, hourRange, freeHeight } from "./grid.js";
import { breakRequestSheet, personSheet, loadPlans, planFor, PLAN_LABEL, CHANGED } from "./social.js";

export async function render(root, { query }) {
  const ids = (query.get("ids") || "").split(",").map(Number).filter(Boolean);
  if (ids.length) return showCompare(root, ids, (query.get("extra") || "").split(",").map(Number).filter(Boolean));
  return showPicker(root, query.has("edit"));
}

const times = (list) => list.map(([s, e]) => `${fmt(s)}–${fmt(e)}`).join(" · ");
const compareHash = (ids, extra = []) => {
  const q = new URLSearchParams({ ids: [...new Set(ids)].join(",") });
  if (extra.length) q.set("extra", extra.join(","));
  return `#/vergelijk?${q}`;
};

// Kiezen: wie je koos staat altijd bovenaan (chips met ×), daaronder je recente selecties (presets: één tik
// = meteen vergelijken), wie vandaag samen pauze heeft en wie je vaak kiest als grote rondjes, dan zoeken
// en alle groepen ingeklapt. Het tabblad openen begint leeg; 'Wijzig selectie' (?edit) houdt de vorige keuze.
async function showPicker(root, keep) {
  const me = myPerson();
  const [data, sugg] = await Promise.all([api.get("/groups?known=1"), me ? api.get("/compare/suggest").catch(() => null) : null]);
  const people = new Map(data.people.map((p) => [p.id, p]));
  const sel = new Set(keep ? (store.get("compareSel") || []).filter((id) => people.has(id) && id !== me?.id) : []);
  let withMe = !!me && (!keep || (store.get("compareSel") || []).includes(me.id));
  let shown = new Set(sel);

  const rowsById = new Map();
  const groupBtns = [];
  const meBtn = h("button", { type: "button", class: "link small", onclick: () => { withMe = !withMe; sync(); } });
  const goBtn = h("button", { class: "btn primary wide" });
  const tray = h("div", { class: "pick-tray", "aria-live": "polite" });
  const chosen = () => (withMe ? [me.id, ...sel] : [...sel]);
  const toggle = (id, on) => { on ? sel.add(id) : sel.delete(id); if (on) navigator.vibrate?.(6); sync(); };
  const sync = () => {
    for (const [id, list] of rowsById) for (const r of list) r.setAttribute("aria-checked", String(sel.has(id)));
    for (const g of groupBtns) g.btn.textContent = g.members.every((id) => sel.has(id)) ? "Geen" : "Allemaal";
    meBtn.textContent = withMe ? "Zonder mij" : "Met mij";
    // Bovenaan: wie gekozen is, de nieuwste 'popt' erbij
    clear(tray);
    if (withMe) tray.append(h("span", { class: "tray-chip me" }, avatar(me, "xs"), "Jij"));
    for (const id of sel) {
      const p = people.get(id);
      tray.append(h("button", { type: "button", class: `tray-chip${shown.has(id) ? "" : " pop"}`, "aria-label": `${p.name} weghalen`,
        style: { "--k": personColor(id) }, onclick: () => toggle(id, false) }, avatar(p, "xs"), p.name, icon("close")));
    }
    if (!sel.size) tray.append(h("span", { class: "tray-empty" }, "Tik op mensen om ze te kiezen"));
    else tray.append(h("button", { type: "button", class: "link small tray-clear", onclick: () => { sel.clear(); sync(); } }, "Wis"));
    shown = new Set(sel);
    const n = names([...sel].slice(0, 2).map((id) => people.get(id).name).concat(sel.size > 2 ? [`${sel.size - 2} anderen`] : []));
    goBtn.textContent = !sel.size ? "Kies met wie" : withMe ? `Vergelijk met ${n}` : sel.size < 2 ? "Kies nog iemand" : `Vergelijk ${n}`;
    goBtn.disabled = chosen().length < 2;
    store.set("compareSel", chosen());
  };
  const track = (id, el) => {
    if (!rowsById.has(id)) rowsById.set(id, []);
    rowsById.get(id).push(el);
    return el;
  };
  const personRow = (p, cls = "", sub = null) => {
    const row = personToggle(p, sel.has(p.id), (on) => toggle(p.id, on), cls);
    if (sub) {
      const name = row.querySelector(".pick-name");
      const text = h("span", { class: "pick-text" });
      name.replaceWith(text);
      text.append(name, h("span", { class: "pick-sub" }, sub));
    }
    return track(p.id, row);
  };
  // Groot rondje met de naam eronder (geen lange lijst): aangetikt wordt het een vinkje
  const tile = (p, sub = null, tag = null) => {
    const el = h("button", { type: "button", class: "pick-tile", role: "checkbox", "aria-checked": String(sel.has(p.id)),
      onclick: () => {
        const on = el.getAttribute("aria-checked") !== "true";
        el.classList.remove("bump");
        void el.offsetWidth;
        el.classList.add("bump");
        toggle(p.id, on);
      } },
    h("span", { class: "pick-av" }, avatar(p), h("span", { class: "pick-check" }, icon("check"))),
    h("span", { class: "pt-name" }, p.name),
    sub ? h("span", { class: "pt-sub" }, sub) : null,
    tag ? h("span", { class: "pt-tag" }, tag) : null);
    return track(p.id, el);
  };
  const allBtn = (ids) => {
    const btn = h("button", { type: "button", class: "link small", onclick: () => {
      const all = ids.every((id) => sel.has(id));
      for (const id of ids) all ? sel.delete(id) : sel.add(id);
      sync();
    } });
    groupBtns.push({ btn, members: ids });
    return btn;
  };
  // Hele groep of preset in één keer vergelijken (met jou erbij)
  const compareAll = (ids) => go(compareHash(me ? [me.id, ...ids] : ids));
  const others = (ids) => [...new Set(ids)].filter((id) => id !== me?.id && people.has(id));

  if (!data.people.some((p) => p.id !== me?.id)) {
    root.append(emptyState("Nog niemand om mee te vergelijken", "Je ziet hier je vriendengroep en wie je aanduidt dat je kent.",
      me ? h("button", { class: "btn primary", onclick: () => knownSheet(() => go("#/vergelijk?edit=1")) }, "Wie ken je?") : null));
    return;
  }

  // Recent: de laatste selecties als kaartjes, één tik = vergelijken
  const recent = (data.recent || []).map((r) => ({ ...r, ids: others(r.ids) })).filter((r) => r.ids.length);
  const recentCard = recent.length ? h("section", { class: "pick-sec" },
    h("div", { class: "pick-head" }, h("h2", null, "Recent")),
    h("div", { class: "preset-row" }, recent.map((r) => {
      const ppl = r.ids.map((id) => people.get(id));
      return h("button", { type: "button", class: "preset", onclick: () => compareAll(r.ids),
        "aria-label": `Vergelijk opnieuw met ${names(ppl.map((p) => p.name))}` },
      h("span", { class: "fold-avs" }, ppl.slice(0, 4).map((p) => avatar(p, "sm"))),
      h("span", { class: "preset-names" }, ppl.length > 3 ? `${names(ppl.slice(0, 2).map((p) => p.name))} +${ppl.length - 2}` : names(ppl.map((p) => p.name))),
      h("span", { class: "preset-when" }, whenAgo(r.last), r.n > 1 ? ` · ${r.n}×` : ""));
    }))) : null;

  // Vandaag samen pauze (of de volgende lesdag)
  const mates = (sugg?.mates || []).filter((m) => people.has(m.id));
  const same = new Set((sugg?.same_breaks || []).filter((id) => people.has(id)));
  let breakTitle = "Samen pauze";
  if (sugg?.day) {
    const lab = dayLabel(sugg.day, sugg.today);
    breakTitle = `${lab.main} samen pauze`;
  }
  const breakSec = mates.length ? h("section", { class: "pick-sec" },
    h("div", { class: "pick-head" }, h("h2", null, breakTitle), mates.length > 1 ? allBtn(mates.map((m) => m.id)) : null),
    h("div", { class: "tile-grid" }, mates.map((m) => tile(people.get(m.id), times(m.times.slice(0, 1)), same.has(m.id) ? "alle pauzes" : null)))) : null;

  // Vaak gekozen: wie je het meest kiest, met wanneer laatst
  const picks = data.picks || {};
  const usual = (data.usual || []).filter((id) => people.has(id) && id !== me?.id);
  const usualSec = usual.length ? h("section", { class: "pick-sec" },
    h("div", { class: "pick-head" }, h("h2", null, "Vaak gekozen")),
    h("div", { class: "tile-grid" }, usual.map((id) => tile(people.get(id), picks[id] ? whenAgo(picks[id].last) : null)))) : null;

  // Zoeken: een platte lijst zolang je typt
  const results = h("section", { class: "card pick-card", hidden: true });
  const sections = h("div");
  const search = h("input", { type: "search", class: "pick-search", placeholder: "Zoek iemand", "aria-label": "Zoek iemand",
    autocomplete: "off", oninput: () => {
      const q = search.value.trim().toLowerCase();
      sections.hidden = !!q;
      results.hidden = !q;
      clear(results);
      for (const [id, list] of rowsById) rowsById.set(id, list.filter((r) => !r.classList.contains("hit")));
      if (!q) return;
      const hits = data.people.filter((p) => p.id !== me?.id && p.name.toLowerCase().includes(q));
      if (hits.length) hits.forEach((p) => results.append(personRow(p, "hit")));
      else results.append(h("p", { class: "muted" }, "Niemand gevonden"));
      sync();
    } });

  // Alle groepen ingeklapt (je vriendengroep en campus eerst), dan wie in geen enkele groep zit
  const groups = sortGroups(data.groups, me?.id);
  const inGroup = new Set(data.groups.flatMap((g) => g.members));
  const fold = (title, ids, groupCompare) => {
    const list = others(ids);
    if (!list.length) return null;
    const box = h("details", { class: "pick-fold" },
      h("summary", null, h("span", { class: "pick-fold-name" }, title), h("span", { class: "muted small" }, list.length),
        groupCompare ? h("button", { type: "button", class: "link small fold-cmp", onclick: (e) => { e.preventDefault(); e.stopPropagation(); compareAll(list); } }, "Vergelijk") : null,
        icon("chevron", "ico chev")));
    let filled = false;
    box.addEventListener("toggle", () => {
      if (!box.open || filled) return;
      filled = true;
      box.append(h("div", { class: "pick-fold-body" }, list.length > 1 ? h("div", { class: "pick-fold-all" }, allBtn(list)) : null,
        list.map((id) => personRow(people.get(id)))));
      sync();
    });
    return box;
  };
  const folds = [
    ...groups.map((g) => fold(g.name, g.members, true)),
    fold(data.groups.length ? "Zonder groep" : "Iedereen", data.people.filter((p) => !inGroup.has(p.id)).map((p) => p.id), false),
  ].filter(Boolean);
  if (folds.length) {
    if (!recentCard && !breakSec && !usualSec) folds[0].open = true;
    sections.append(h("section", { class: "card pick-card" }, h("div", { class: "pick-head" }, h("h2", null, "Groepen")), folds));
  }

  // Wie je niet kent staat er niet tussen; aanpassen kan hier ook (niet enkel op Home)
  const knownLink = data.unknown && me
    ? h("p", { class: "pick-more" }, h("button", { type: "button", class: "link", onclick: () => knownSheet(() => go("#/vergelijk?edit=1")) },
      `Mis je iemand? Duid aan wie je kent (${data.unknown})`))
    : null;
  append(root, [h("div", { class: "pick-top" }, h("h1", null, "Vergelijk"), me ? meBtn : null), tray,
    recentCard, breakSec, usualSec, search, results, sections, knownLink,
    h("div", { class: "sticky-bottom" }, goBtn)]);
  goBtn.addEventListener("click", () => go(`#/vergelijk?ids=${chosen().join(",")}`));
  sync();
}

// "vandaag 10:40", "gisteren 14:00" of "3 dagen geleden"
function whenAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = brusselsDate(d), today = brusselsDate();
  const time = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).format(d);
  if (day === today) return `vandaag ${time}`;
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (day === brusselsDate(y)) return `gisteren ${time}`;
  return ago(iso);
}

async function showCompare(root, ids, extra) {
  const [data] = await Promise.all([api.get(`/compare?ids=${ids.join(",")}`), loadPlans().catch(() => null)]);
  const nameOf = new Map((state.me.people || []).map((p) => [p.id, p.name]));
  const me = myPerson()?.id ?? data.me;
  const holder = h("div");
  // Per dag: welke ingeklapte 'geen match' open staat (blijft zo bij hertekenen)
  const opened = new Set();
  const ctx = { ids, extra, me, opened, today: data.today, redraw: () => draw() };
  const draw = () => {
    const keepX = holder.querySelector(".days")?.scrollLeft;
    clear(root);
    // Bovenaan enkel wie je vergelijkt (en terug naar kiezen); de rest staat onder het rooster
    const who = ids.map((id) => ({ id, name: nameOf.get(id) || "?" }));
    root.append(h("div", { class: "cmp-top" },
      h("button", { class: "btn small ghost", onclick: () => { store.set("compareSel", ids); go("#/vergelijk?edit=1"); } }, icon("back"), "Wijzig"),
      h("span", { class: "cmp-who" }, h("span", { class: "fold-avs" }, who.slice(0, 5).map((p) => avatar(p, "xs"))),
        h("span", null, names(who.map((p) => (p.id === me ? "jij" : p.name)))))));
    clear(holder);
    root.append(holder);
    // Zoveel mogelijk van het scherm gebruiken: dag-kop en uitleg eronder eraf
    const avail = freeHeight(holder, 64);
    const vertical = tiny || prefs.orient === "v"; // kleine app: altijd verticaal
    holder.append(dayScroller(data.days, data.today, (d) => {
      const isToday = d.day === data.today;
      const plan = arrange(d, ctx);
      return h("div", { class: "cmp-day" },
        vertical ? columns(d, plan, isToday, avail, ctx) : rows(d, plan, isToday, avail, ctx),
        side(d, ctx));
    }));
    // Onder het rooster: weergave en wie er ook mee kan
    const more = extra.filter((id) => nameOf.has(id) && !ids.includes(id));
    root.append(h("div", { class: "cmp-below" },
      viewControls(draw, { withDays: false, equalWidth: true }),
      more.length ? h("div", { class: "extra-names" },
        h("span", null, more.length === 1 ? "Kan ook mee:" : "Kunnen ook mee:"),
        more.map((id) => h("span", { class: "extra-person" }, h("b", null, nameOf.get(id)),
          h("button", { type: "button", class: "btn small extra-add", onclick: () => addPerson(ctx, id) }, icon("plus"), "voeg toe")))) : null,
      h("p", { class: "muted small" }, "Tik een les voor alle details, een gele pauze om samen te plannen.")));
    fitNames(holder);
    if (keepX) {
      const track = holder.querySelector(".days");
      track.style.scrollBehavior = "auto";
      track.scrollLeft = keepX;
      track.style.scrollBehavior = "";
    }
  };
  draw();
  let t = 0;
  // Planbalk erbij of weg: opnieuw passend tekenen; anders enkel de namen passen
  let plan = document.body.classList.contains("has-plan");
  const onResize = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const now = document.body.classList.contains("has-plan");
      if (now !== plan) { plan = now; draw(); } else fitNames(holder);
    }, 120);
  };
  window.addEventListener("resize", onResize);
  const onPlans = () => loadPlans(true).then(() => { if (holder.isConnected) draw(); }).catch(() => {});
  window.addEventListener(CHANGED, onPlans);
  return () => { clearTimeout(t); window.removeEventListener("resize", onResize); window.removeEventListener(CHANGED, onPlans); };
}

function addPerson(ctx, id, more = []) {
  const add = [id, ...more].filter((x) => !ctx.ids.includes(x));
  go(compareHash([...ctx.ids, ...add], ctx.extra.filter((x) => !add.includes(x))));
}

// Wie ergens samen pauze heeft eerst (jij bovenaan), de rest erna. Te veel mensen zonder match?
// Dan zitten die achter één smalle kolom/rij "3 geen match" die je kan openklappen.
function arrange(d, ctx) {
  const matched = new Set(d.matches.flatMap((m) => m.ids));
  const mineFirst = (a, b) => (a.id === ctx.me ? -1 : b.id === ctx.me ? 1 : 0);
  const hit = d.people.filter((p) => matched.has(p.id)).sort(mineFirst);
  const miss = d.people.filter((p) => !matched.has(p.id)).sort(mineFirst);
  const fold = hit.length >= 2 && d.people.length >= 4 && (miss.length >= 2 || d.people.length >= 5);
  const open = ctx.opened.has(d.day);
  return { hit, miss, fold, open, shown: fold && !open ? hit : [...hit, ...miss] };
}

const toggleFold = (d, ctx) => {
  if (ctx.opened.has(d.day)) ctx.opened.delete(d.day); else ctx.opened.add(d.day);
  ctx.redraw();
};

// De naam gaat voor: past hij niet naast het rondje, dan valt het rondje weg
// (een streepje in de kleur van de persoon blijft onder de naam).
function fitNames(holder) {
  for (const el of holder.querySelectorAll(".fit-name")) {
    el.classList.remove("no-av");
    const name = el.lastElementChild;
    // Breedte telt; hoogte enkel bij de rijen (2 regels), met wat speling voor uitstekende letters
    const clamped = el.classList.contains("tl-name") && name.scrollHeight > name.clientHeight + 4;
    if (name.scrollWidth > name.clientWidth + 1 || clamped) el.classList.add("no-av");
  }
}

// Lescard: hoeveel er op staat hangt af van de grootte (zie .cmp in app.css).
// Volgorde: vaknaam en uur eerst, dan lokaal, dan docent.
function lessonCard(p, b, pos) {
  return h("button", {
    class: `cal-blk cmp s-${b.state}`, type: "button",
    style: { ...pos, "--k": personColor(p.id) },
    "aria-label": `${p.name}: ${b.title}, ${fmt(b.start)} tot ${fmt(b.end)}${b.location ? ", " + b.location : ""}`,
    onclick: () => lessonSheet(b.id, b),
  },
    h("span", { class: "c-in" },
      h("span", { class: "b-title" }, b.title),
      h("span", { class: "b-time" }, `${fmt(b.start)}–${fmt(b.end)}`),
      b.location ? h("span", { class: "b-loc" }, b.location) : null,
      b.teacher ? h("span", { class: "b-teach" }, b.teacher) : null));
}

// Wie met iemand samen pauze heeft, krijgt 1,5x de ruimte (uit te zetten met 'gelijke breedte')
function weights(d, shown) {
  const matched = new Set(d.matches.flatMap((m) => m.ids));
  const boost = !prefs.equal && matched.size > 0 && shown.some((p) => !matched.has(p.id));
  return new Map(shown.map((p) => [p.id, boost && matched.has(p.id) ? 1.5 : 1]));
}

// Samen pauze per persoon, overlappende matches samengevoegd tot één band (die onthoudt welke matches erin zitten);
// een match met iedereen loopt over de hele dag-kaart
function matchesOf(d, pid) {
  const out = [];
  for (const m of d.matches.filter((x) => x.ids.length < d.people.length && x.ids.includes(pid)).sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && m.start <= last.end) { last.end = Math.max(last.end, m.end); last.src.push(m); }
    else out.push({ start: m.start, end: m.end, src: [m] });
  }
  return out;
}
const everyone = (d) => d.matches.filter((m) => m.ids.length === d.people.length);
const highlight = (w, pid) => (w.get(pid) > 1 ? " is-match" : "");

// Een gele band aantikken: wie, wanneer, en meteen samen pauze vragen
function bandProps(d, list, ctx) {
  return {
    role: "button", tabindex: "0", "aria-label": `Samen pauze ${list.map((m) => `${fmt(m.start)}–${fmt(m.end)}`).join(", ")}`,
    onclick: (e) => { e.stopPropagation(); matchSheet(d, list, ctx); },
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); matchSheet(d, list, ctx); } },
  };
}

function matchSheet(d, list, ctx) {
  const nameOf = new Map(d.people.map((p) => [p.id, p.name]));
  const body = h("div", { class: "match-sheet" });
  for (const m of list) {
    const others = m.ids.filter((id) => id !== ctx.me).map((id) => ({ id, name: nameOf.get(id) }));
    const mine = m.ids.includes(ctx.me);
    const box = h("div", { class: "ms-match" },
      h("p", { class: "ms-when" }, h("span", { class: "swatch" }), h("b", null, `${fmt(m.start)}–${fmt(m.end)}`),
        names(m.ids.map((id) => (id === ctx.me ? "jij" : nameOf.get(id))))));
    if (mine && others.length) {
      const plan = planFor({ day: d.day, start: m.start, end: m.end, ids: others.map((p) => p.id) });
      box.append(h("button", { class: `btn ${plan ? "" : "primary "}wide`, type: "button",
        onclick: () => breakRequestSheet({ people: others, day: d.day, start: m.start, end: m.end }) },
      icon(plan ? "check" : "pause"), plan ? `${PLAN_LABEL[plan.state]} · ${names(plan.who.map((p) => p.name))}`
        : others.length === 1 ? `Pauze samen vragen aan ${others[0].name}` : "Pauze samen vragen"));
    }
    const ppl = h("div", { class: "ms-people" }, others.map((p) => h("button", { type: "button", class: "ms-person",
      onclick: () => personSheet(p, { day: d.day, start: m.start, end: m.end }) }, avatar(p, "sm"), h("span", null, p.name), icon("chevron", "ico chev"))));
    box.append(ppl);
    // Wie er op dat moment ook nog vrij is
    const also = d.also.filter((a) => a.start < m.end && a.end > m.start);
    if (also.length) {
      box.append(h("p", { class: "ms-also-title" }, "Hebben ook pauze:"),
        h("div", { class: "also-list" }, also.map((a) => alsoRow(a, ctx))));
    }
    body.append(box);
  }
  sheet("Samen pauze", body);
}

function alsoRow(a, ctx) {
  return h("button", { type: "button", class: "also-row", onclick: () => addPerson(ctx, a.id), "aria-label": `${a.name} toevoegen` },
    h("span", { class: "also-plus" }, icon("plus")), h("b", null, a.name), h("span", { class: "muted small" }, `${fmt(a.start)}–${fmt(a.end)}`));
}

// Naast (laptop) of onder (gsm) het rooster: de samen-pauzes, een knop om ze te plannen, en wie er ook pauze heeft
function side(d, ctx) {
  const box = h("aside", { class: "cmp-side" });
  const nameOf = new Map(d.people.map((p) => [p.id, p.name]));
  if (d.matches.length) {
    for (const m of d.matches) {
      box.append(h("button", { type: "button", class: "match-line", ...bandProps(d, [m], ctx) },
        h("span", { class: "swatch" }), h("b", null, `${fmt(m.start)}–${fmt(m.end)}`),
        h("span", { class: "ml-who" }, m.ids.length === d.people.length && m.ids.length > 2 ? "iedereen samen pauze" : names(m.ids.map((id) => nameOf.get(id)))),
        icon("chevron", "ico chev")));
    }
    // Eerstvolgende samen-pauze met jou: meteen vragen
    const now = d.day === ctx.today ? brusselsMinutes() : 0;
    const next = d.matches.find((m) => m.ids.includes(ctx.me) && m.ids.length > 1 && m.end > now);
    if (next) {
      const others = next.ids.filter((id) => id !== ctx.me).map((id) => ({ id, name: nameOf.get(id) }));
      // Al gevraagd of afgesproken? Dan de stand tonen, niet nog eens voorstellen om te vragen
      const plan = planFor({ day: d.day, start: next.start, end: next.end, ids: others.map((p) => p.id) });
      box.append(h("button", { type: "button", class: `btn small ${plan ? `plan-btn k-${plan.state}` : "primary"} ask-btn`,
        onclick: () => breakRequestSheet({ people: others, day: d.day, start: next.start, end: next.end }) },
      icon(plan ? "check" : "pause"), plan
        ? `${PLAN_LABEL[plan.state]} · ${fmt(plan.item.start)} met ${names(plan.who.map((p) => p.name))}`
        : `Pauze samen vragen · ${fmt(next.start)} met ${names(others.map((p) => p.name))}`));
    }
  } else if (d.people.filter((p) => p.present).length >= 2) {
    box.append(h("p", { class: "muted" }, "Niemand heeft samen pauze."));
  }
  const absent = d.people.filter((p) => !p.blocks.length).map((p) => p.name);
  if (absent.length) box.append(h("p", { class: "muted small" }, `Geen les: ${names(absent)}`));
  // Altijd: wie (die je kent) heeft er op die momenten ook pauze?
  if (ctx.me) {
    const list = d.also || [];
    const check = h("div", { class: "also" }, h("p", { class: "also-title" }, "Hebben ook pauze:"));
    if (list.length) {
      check.append(h("div", { class: "also-list" }, list.map((a) => alsoRow(a, ctx))));
      if (list.length > 1) check.append(h("button", { type: "button", class: "link small", onclick: () => addPerson(ctx, list[0].id, list.slice(1).map((a) => a.id)) }, "Allemaal toevoegen"));
    } else {
      check.append(h("p", { class: "muted small" }, "Niemand anders die je kent heeft dan pauze."));
    }
    box.append(check);
  }
  return box;
}

// Horizontaal: één rij per persoon, rijen worden hoger als er weinig mensen zijn
function rows(d, plan, isToday, avail, ctx) {
  const [lo, hi] = hourRange(d.people.flatMap((p) => p.blocks));
  const span = hi - lo;
  const pct = (m) => `${((m - lo) / span) * 100}%`;
  const width = (a, b) => `${((b - a) / span) * 100}%`;
  const w = weights(d, plan.shown);
  const foldRow = plan.fold ? 34 : 0;
  const unit = (avail - 30 - foldRow) / Math.max(1, [...w.values()].reduce((a, b) => a + b, 0));

  const wrap = h("div", { class: "tl" });
  const axis = h("div", { class: "tl-axis" });
  for (let t = lo; t <= hi; t += 60) {
    if ((t - lo) % (span > 9 * 60 ? 120 : 60) === 0) axis.append(h("span", { style: { left: pct(t) } }, `${t / 60}u`));
  }
  wrap.append(h("div", { class: "tl-row head" }, h("span"), axis));

  const area = h("div", { class: "tl-area" });
  const row = (p) => {
    const rowH = Math.max(36, Math.min(180, Math.floor(unit * w.get(p.id)) - 6));
    const track = h("div", { class: "tl-track" });
    for (let t = lo + 60; t < hi; t += 60) track.append(h("i", { class: "hr", style: { left: pct(t) } }));
    for (const m of matchesOf(d, p.id)) track.append(h("i", { class: "match-band", style: { left: pct(m.start), width: width(m.start, m.end) }, ...bandProps(d, m.src, ctx) }));
    for (const b of p.blocks) {
      track.append(lessonCard(p, b, { left: pct(b.start), width: `calc(${width(b.start, b.end)} - 2px)` }));
    }
    if (!p.blocks.length) track.append(h("span", { class: "tl-none" }, p.checkin === "absent" ? "is er niet" : "geen les"));
    return h("div", { class: `tl-row${highlight(w, p.id)}${plan.hit.includes(p) ? "" : " no-match"}`, style: { "--row": `${rowH}px`, "--av": `${Math.max(26, Math.min(44, rowH))}px` } },
      h("span", { class: "tl-name fit-name", title: p.name, style: { "--k": personColor(p.id) } }, avatar(p), h("span", null, p.name)), track);
  };
  plan.hit.forEach((p) => area.append(row(p)));
  if (plan.fold) {
    area.append(h("button", { type: "button", class: "tl-fold", "aria-expanded": String(plan.open), onclick: () => toggleFold(d, ctx) },
      h("span", { class: "fold-avs" }, plan.miss.slice(0, 4).map((p) => avatar(p, "xs"))),
      plan.open ? "Verberg wie geen match heeft" : `${plan.miss.length} geen match: ${names(plan.miss.map((p) => p.name))}`,
      icon("chevron", `ico chev${plan.open ? " up" : ""}`)));
  }
  if (!plan.fold || plan.open) plan.miss.forEach((p) => area.append(row(p)));
  const bands = h("div", { class: "tl-bands" });
  for (const m of everyone(d)) bands.append(h("i", { style: { left: pct(m.start), width: width(m.start, m.end) }, ...bandProps(d, [m], ctx) }));
  if (isToday) {
    const now = brusselsMinutes();
    if (now > lo && now < hi) bands.append(h("b", { class: "tl-now", style: { left: pct(now) } }));
  }
  area.append(h("div", { class: "tl-row overlay" }, h("span"), bands));
  wrap.append(area);
  return wrap;
}

// Verticaal: één kolom per persoon, de tijd van boven naar onder over de hele schermhoogte.
// Mensen zonder match zitten (bij veel mensen) achter één smalle kolom; open = zijwaarts scrollen.
function columns(d, plan, isToday, avail, ctx) {
  const [lo, hi] = hourRange(d.people.flatMap((p) => p.blocks));
  const span = hi - lo;
  const ppm = Math.max(0.6, Math.min(2.4, (avail - 46) / span));
  const height = Math.round(span * ppm);
  const y = (m) => `${Math.round((m - lo) * ppm)}px`;
  const w = weights(d, plan.shown);

  const wrap = h("div", { class: "tlv" });
  const gutter = h("div", { class: "tlv-gutter" }, h("div", { class: "tlv-head" }));
  const gbody = h("div", { class: "tlv-gbody", style: { height: `${height}px` } });
  for (let t = lo; t <= hi; t += 60) gbody.append(h("span", { style: { top: y(t) } }, `${t / 60}u`));
  gutter.append(gbody);

  const scrolls = plan.fold && plan.open;
  const cols = h("div", { class: `tlv-cols${scrolls ? " scrolls" : ""}` });
  const col = (p) => {
    const body = h("div", { class: "tlv-body", style: { height: `${height}px` } });
    for (let t = lo + 60; t < hi; t += 60) body.append(h("i", { class: "hr", style: { top: y(t) } }));
    for (const m of matchesOf(d, p.id)) body.append(h("i", { class: "match-band", style: { top: y(m.start), height: `${(m.end - m.start) * ppm}px` }, ...bandProps(d, m.src, ctx) }));
    for (const b of p.blocks) {
      body.append(lessonCard(p, b, { top: y(b.start), height: `${Math.max(10, (b.end - b.start) * ppm - 2)}px` }));
    }
    if (!p.blocks.length) body.append(h("span", { class: "tlv-none" }, p.checkin === "absent" ? "is er niet" : "geen les"));
    return h("div", { class: `tlv-col${highlight(w, p.id)}${plan.hit.includes(p) ? "" : " no-match"}`, style: { flex: `${w.get(p.id)} 1 0` } },
      h("div", { class: "tlv-head fit-name", title: p.name, style: { "--k": personColor(p.id) } }, avatar(p, "sm"), h("span", null, p.name)),
      body);
  };
  plan.hit.forEach((p) => cols.append(col(p)));
  let foldBtn = null;
  if (plan.fold) {
    foldBtn = h("button", { type: "button", class: "tlv-fold", "aria-expanded": String(plan.open), onclick: () => toggleFold(d, ctx),
      "aria-label": plan.open ? "Verberg wie geen match heeft" : `${plan.miss.length} zonder match tonen: ${names(plan.miss.map((p) => p.name))}` },
    h("span", { class: "fold-avs" }, plan.miss.slice(0, 3).map((p) => avatar(p, "xs"))),
    h("span", { class: "fold-text" }, plan.open ? "verberg" : `${plan.miss.length} geen match`),
    icon("chevron", `ico chev${plan.open ? " back" : ""}`));
    cols.append(h("div", { class: "tlv-col fold-col", style: { height: `${height + 46}px` } }, foldBtn));
  }
  if (!plan.fold || plan.open) plan.miss.forEach((p) => cols.append(col(p)));
  const bands = h("div", { class: "tlv-bands", style: { height: `${height}px` } });
  for (const m of everyone(d)) bands.append(h("i", { style: { top: y(m.start), height: `${(m.end - m.start) * ppm}px` }, ...bandProps(d, [m], ctx) }));
  if (isToday) {
    const now = brusselsMinutes();
    if (now > lo && now < hi) bands.append(h("b", { class: "tlv-now", style: { top: y(now) } }));
  }
  cols.append(bands);
  wrap.append(gutter, cols);
  // Net opengeklapt: zijwaarts naar wie geen match heeft
  if (scrolls) requestAnimationFrame(() => cols.scrollTo({ left: foldBtn.parentElement.offsetLeft - 8, behavior: "smooth" }));
  return h("div", { class: "tl tl-vertical" }, wrap);
}
