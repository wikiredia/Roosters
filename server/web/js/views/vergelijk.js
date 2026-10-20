// Vergelijken: eerst mensen kiezen (wie je vaak kiest, je vrienden, je campus), dan een tijdlijn per dag.
import { api } from "../api.js";
import { state, go, myPerson } from "../app.js";
import { h, append, clear, fmt, names, avatar, personColor, brusselsMinutes, store, icon } from "../util.js";
import { dayScroller, lessonSheet, sortGroups, personToggle, knownSheet, emptyState } from "./common.js";
import { prefs, viewControls, hourRange, freeHeight } from "./grid.js";

export async function render(root, { query }) {
  const ids = (query.get("ids") || "").split(",").map(Number).filter(Boolean);
  if (ids.length) return showCompare(root, ids, (query.get("extra") || "").split(",").map(Number).filter(Boolean));
  return showPicker(root, query.has("edit"));
}

// Kiezen: bovenaan wie je vaak vergelijkt, dan je vrienden en je campus, de andere groepen ingeklapt.
// Elke persoon = een rondje met de naam ernaast; aangevinkt wordt het rondje een vinkje.
// Het tabblad openen begint leeg; 'Wijzig selectie' (?edit) houdt de vorige keuze.
async function showPicker(root, keep) {
  const me = myPerson();
  const data = await api.get("/groups?known=1");
  const people = new Map(data.people.map((p) => [p.id, p]));
  const sel = new Set(keep ? (store.get("compareSel") || []).filter((id) => people.has(id) && id !== me?.id) : []);
  let withMe = !!me && (!keep || (store.get("compareSel") || []).includes(me.id));

  const rowsById = new Map();
  const groupBtns = [];
  const meBtn = h("button", { type: "button", class: "link small", onclick: () => { withMe = !withMe; sync(); } });
  const goBtn = h("button", { class: "btn primary wide" });
  const chosen = () => (withMe ? [me.id, ...sel] : [...sel]);
  const sync = () => {
    for (const [id, list] of rowsById) for (const r of list) r.setAttribute("aria-checked", String(sel.has(id)));
    for (const g of groupBtns) g.btn.textContent = g.members.every((id) => sel.has(id)) ? "Geen" : "Allemaal";
    meBtn.textContent = withMe ? "Zonder mij" : "Met mij";
    const n = names([...sel].slice(0, 2).map((id) => people.get(id).name).concat(sel.size > 2 ? [`${sel.size - 2} anderen`] : []));
    goBtn.textContent = !sel.size ? "Kies met wie" : withMe ? `Vergelijk met ${n}` : sel.size < 2 ? "Kies nog iemand" : `Vergelijk ${n}`;
    goBtn.disabled = chosen().length < 2;
    store.set("compareSel", chosen());
  };
  const personRow = (p, cls = "") => {
    const row = personToggle(p, sel.has(p.id), (on) => { on ? sel.add(p.id) : sel.delete(p.id); sync(); }, cls);
    if (!rowsById.has(p.id)) rowsById.set(p.id, []);
    rowsById.get(p.id).push(row);
    return row;
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
  const others = (ids) => [...new Set(ids)].filter((id) => id !== me?.id && people.has(id));
  // Bovenaan staat iedereen maar één keer (in het eerste vak waar hij/zij past); 'Allemaal' geldt wel voor de hele groep
  const listed = new Set();
  const section = (title, ids) => {
    const all = others(ids);
    const list = all.filter((id) => !listed.has(id));
    if (!list.length) return null;
    list.forEach((id) => listed.add(id));
    return h("section", { class: "card pick-card" },
      h("div", { class: "pick-head" }, h("h2", null, title), all.length > 1 ? allBtn(all) : null),
      list.map((id) => personRow(people.get(id))));
  };

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

  const groups = sortGroups(data.groups, me?.id);
  const mine = (kind) => groups.filter((g) => g.kind === kind && g.members.includes(me?.id)).flatMap((g) => g.members);
  const usual = data.usual || [];
  sections.append(...[section("Vaak vergeleken", usual), section("Jouw vrienden", mine("friends")), section("Jouw campus", mine("campus"))].filter(Boolean));

  // De rest ingeklapt: andere groepen (je woonplaats eerst), dan wie in geen enkele groep zit
  const top = others([...usual, ...mine("friends"), ...mine("campus")]);
  const inGroup = new Set(data.groups.flatMap((g) => g.members));
  const fold = (title, ids) => {
    const list = others(ids);
    if (!list.length) return null;
    const box = h("details", { class: "pick-fold" },
      h("summary", null, h("span", { class: "pick-fold-name" }, title), h("span", { class: "muted small" }, list.length), icon("chevron", "ico chev")));
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
    ...groups.filter((g) => g.kind === "home" || !g.members.includes(me?.id)).map((g) => fold(g.name, g.members)),
    fold(data.groups.length ? "Zonder groep" : "Iedereen", data.people.filter((p) => !inGroup.has(p.id)).map((p) => p.id)),
  ].filter(Boolean);
  if (folds.length) {
    // Niets bovenaan (nieuw, geen groepen): de eerste groep staat al open
    if (!top.length) folds[0].open = true;
    sections.append(h("section", { class: "card pick-card" }, h("div", { class: "pick-head" }, h("h2", null, top.length ? "Andere groepen" : "Groepen")), folds));
  }

  // Wie je niet kent staat er niet tussen; aanpassen kan hier ook (niet enkel op Home)
  const knownLink = data.unknown && me
    ? h("p", { class: "pick-more" }, h("button", { type: "button", class: "link", onclick: () => knownSheet(() => go("#/vergelijk?edit=1")) },
      `Mis je iemand? Duid aan wie je kent (${data.unknown})`))
    : null;
  if (!data.people.some((p) => p.id !== me?.id)) {
    root.append(emptyState("Nog niemand om mee te vergelijken", "Je ziet hier je vriendengroep en wie je aanduidt dat je kent.",
      me ? h("button", { class: "btn primary", onclick: () => knownSheet(() => go("#/vergelijk?edit=1")) }, "Wie ken je?") : null));
    return;
  }
  append(root, [h("div", { class: "pick-top" }, h("h1", null, "Vergelijk"), me ? meBtn : null), search, results, sections, knownLink,
    h("div", { class: "sticky-bottom" }, goBtn)]);
  goBtn.addEventListener("click", () => go(`#/vergelijk?ids=${chosen().join(",")}`));
  sync();
}

async function showCompare(root, ids, extra) {
  const data = await api.get(`/compare?ids=${ids.join(",")}`);
  const nameOf = new Map((state.me.people || []).map((p) => [p.id, p.name]));
  const holder = h("div");
  const draw = () => {
    clear(root);
    root.append(h("div", { class: "toolbar" },
      h("button", { class: "btn small ghost", onclick: () => { store.set("compareSel", ids); go("#/vergelijk?edit=1"); } }, icon("back"), "Wijzig selectie"),
      h("span", { class: "muted small" }, `${ids.length} roosters · tik een les voor alle details`)),
      viewControls(draw, { withDays: false, equalWidth: true }));
    // Wie ook mee kan: met één tik hun rooster erbij zetten
    const more = extra.filter((id) => nameOf.has(id) && !ids.includes(id));
    if (more.length) {
      const add = (id) => {
        const q = new URLSearchParams({ ids: [...ids, id].join(",") });
        const rest = more.filter((x) => x !== id);
        if (rest.length) q.set("extra", rest.join(","));
        go(`#/vergelijk?${q}`);
      };
      root.append(h("div", { class: "extra-names" },
        h("span", null, more.length === 1 ? "Kan ook mee:" : "Kunnen ook mee:"),
        more.map((id) => h("span", { class: "extra-person" }, h("b", null, nameOf.get(id)),
          h("button", { type: "button", class: "btn small extra-add", onclick: () => add(id) }, icon("plus"), "voeg rooster toe")))));
    }
    clear(holder);
    root.append(holder);
    // Zoveel mogelijk van het scherm gebruiken: dag-kop en uitleg eronder eraf
    const avail = freeHeight(holder, 110);
    const vertical = prefs.orient === "v";
    holder.append(dayScroller(data.days, data.today, (d) => (vertical ? columns(d, d.day === data.today, avail) : rows(d, d.day === data.today, avail))));
    fitNames(holder);
  };
  draw();
  let t = 0;
  const onResize = () => { clearTimeout(t); t = setTimeout(() => fitNames(holder), 120); };
  window.addEventListener("resize", onResize);
  return () => { clearTimeout(t); window.removeEventListener("resize", onResize); };
}

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
function weights(d) {
  const matched = new Set(d.matches.flatMap((m) => m.ids));
  const boost = !prefs.equal && matched.size > 0 && matched.size < d.people.length;
  return new Map(d.people.map((p) => [p.id, boost && matched.has(p.id) ? 1.5 : 1]));
}

// Samen pauze per persoon, overlappende matches samengevoegd tot één band;
// een match met iedereen loopt over de hele dag-kaart
function matchesOf(d, pid) {
  const out = [];
  for (const m of d.matches.filter((x) => x.ids.length < d.people.length && x.ids.includes(pid)).sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && m.start <= last.end) last.end = Math.max(last.end, m.end);
    else out.push({ start: m.start, end: m.end });
  }
  return out;
}
const everyone = (d) => d.matches.filter((m) => m.ids.length === d.people.length);
const highlight = (w, pid) => (w.get(pid) > 1 ? " is-match" : "");

function info(d) {
  const box = h("div", { class: "tl-info" });
  const nameOf = new Map(d.people.map((p) => [p.id, p.name]));
  if (d.matches.length) {
    for (const m of d.matches) {
      box.append(h("p", { class: "match-line" }, h("span", { class: "swatch" }), h("b", null, `${fmt(m.start)}–${fmt(m.end)}`),
        m.ids.length === d.people.length && m.ids.length > 2 ? "iedereen samen pauze" : names(m.ids.map((id) => nameOf.get(id)))));
    }
  } else if (d.people.filter((p) => p.present).length >= 2) {
    box.append(h("p", { class: "muted" }, "Niemand heeft samen pauze."));
  }
  const absent = d.people.filter((p) => !p.blocks.length).map((p) => p.name);
  if (absent.length) box.append(h("p", { class: "muted small" }, `Geen les: ${names(absent)}`));
  return box;
}

// Horizontaal: één rij per persoon, rijen worden hoger als er weinig mensen zijn
function rows(d, isToday, avail) {
  const [lo, hi] = hourRange(d.people.flatMap((p) => p.blocks));
  const span = hi - lo;
  const pct = (m) => `${((m - lo) / span) * 100}%`;
  const width = (a, b) => `${((b - a) / span) * 100}%`;
  const w = weights(d);
  const unit = (avail - 30) / Math.max(1, [...w.values()].reduce((a, b) => a + b, 0));

  const wrap = h("div", { class: "tl" });
  const axis = h("div", { class: "tl-axis" });
  for (let t = lo; t <= hi; t += 60) {
    if ((t - lo) % (span > 9 * 60 ? 120 : 60) === 0) axis.append(h("span", { style: { left: pct(t) } }, `${t / 60}u`));
  }
  wrap.append(h("div", { class: "tl-row head" }, h("span"), axis));

  const area = h("div", { class: "tl-area" });
  for (const p of d.people) {
    const rowH = Math.max(36, Math.min(180, Math.floor(unit * w.get(p.id)) - 6));
    const track = h("div", { class: "tl-track" });
    for (let t = lo + 60; t < hi; t += 60) track.append(h("i", { class: "hr", style: { left: pct(t) } }));
    for (const m of matchesOf(d, p.id)) track.append(h("i", { class: "match-band", style: { left: pct(m.start), width: width(m.start, m.end) } }));
    for (const b of p.blocks) {
      track.append(lessonCard(p, b, { left: pct(b.start), width: `calc(${width(b.start, b.end)} - 2px)` }));
    }
    if (!p.blocks.length) track.append(h("span", { class: "tl-none" }, p.checkin === "absent" ? "is er niet" : "geen les"));
    area.append(h("div", { class: `tl-row${highlight(w, p.id)}`, style: { "--row": `${rowH}px`, "--av": `${Math.max(26, Math.min(44, rowH))}px` } },
      h("span", { class: "tl-name fit-name", title: p.name, style: { "--k": personColor(p.id) } }, avatar(p), h("span", null, p.name)), track));
  }
  const bands = h("div", { class: "tl-bands" });
  for (const m of everyone(d)) bands.append(h("i", { style: { left: pct(m.start), width: width(m.start, m.end) } }));
  if (isToday) {
    const now = brusselsMinutes();
    if (now > lo && now < hi) bands.append(h("b", { class: "tl-now", style: { left: pct(now) } }));
  }
  area.append(h("div", { class: "tl-row overlay" }, h("span"), bands));
  wrap.append(area, info(d));
  return wrap;
}

// Verticaal: één kolom per persoon, de tijd van boven naar onder over de hele schermhoogte
function columns(d, isToday, avail) {
  const [lo, hi] = hourRange(d.people.flatMap((p) => p.blocks));
  const span = hi - lo;
  const ppm = Math.max(0.6, Math.min(2.4, (avail - 46) / span));
  const height = Math.round(span * ppm);
  const y = (m) => `${Math.round((m - lo) * ppm)}px`;
  const w = weights(d);

  const wrap = h("div", { class: "tlv" });
  const gutter = h("div", { class: "tlv-gutter" }, h("div", { class: "tlv-head" }));
  const gbody = h("div", { class: "tlv-gbody", style: { height: `${height}px` } });
  for (let t = lo; t <= hi; t += 60) gbody.append(h("span", { style: { top: y(t) } }, `${t / 60}u`));
  gutter.append(gbody);

  const cols = h("div", { class: "tlv-cols" });
  for (const p of d.people) {
    const body = h("div", { class: "tlv-body", style: { height: `${height}px` } });
    for (let t = lo + 60; t < hi; t += 60) body.append(h("i", { class: "hr", style: { top: y(t) } }));
    for (const m of matchesOf(d, p.id)) body.append(h("i", { class: "match-band", style: { top: y(m.start), height: `${(m.end - m.start) * ppm}px` } }));
    for (const b of p.blocks) {
      body.append(lessonCard(p, b, { top: y(b.start), height: `${Math.max(10, (b.end - b.start) * ppm - 2)}px` }));
    }
    if (!p.blocks.length) body.append(h("span", { class: "tlv-none" }, p.checkin === "absent" ? "is er niet" : "geen les"));
    cols.append(h("div", { class: `tlv-col${highlight(w, p.id)}`, style: { flex: `${w.get(p.id)} 1 0` } },
      h("div", { class: "tlv-head fit-name", title: p.name, style: { "--k": personColor(p.id) } }, avatar(p, "sm"), h("span", null, p.name)),
      body));
  }
  const bands = h("div", { class: "tlv-bands", style: { height: `${height}px` } });
  for (const m of everyone(d)) bands.append(h("i", { style: { top: y(m.start), height: `${(m.end - m.start) * ppm}px` } }));
  if (isToday) {
    const now = brusselsMinutes();
    if (now > lo && now < hi) bands.append(h("b", { class: "tlv-now", style: { top: y(now) } }));
  }
  cols.append(bands);
  wrap.append(gutter, cols);
  return h("div", { class: "tl tl-vertical" }, wrap, info(d));
}
