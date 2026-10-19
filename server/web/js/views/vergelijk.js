// Vergelijken: eerst mensen kiezen (mijn groepen eerst), dan een tijdlijn per dag zonder vaknamen.
import { api } from "../api.js";
import { state, go, myPerson } from "../app.js";
import { h, clear, fmt, names, avatar, personColor, brusselsMinutes, store, icon } from "../util.js";
import { dayScroller, lessonSheet, sortGroups, KIND_LABEL, sectionTitle } from "./common.js";
import { prefs, viewControls, hourRange, freeHeight } from "./grid.js";

export async function render(root, { query }) {
  const ids = (query.get("ids") || "").split(",").map(Number).filter(Boolean);
  if (ids.length) return showCompare(root, ids, (query.get("extra") || "").split(",").map(Number).filter(Boolean));
  return showPicker(root);
}

async function showPicker(root) {
  const me = myPerson();
  const data = await api.get("/groups");
  const people = new Map(data.people.map((p) => [p.id, p]));
  const sel = new Set((store.get("compareSel") || (me ? [me.id] : [])).filter((id) => people.has(id)));
  if (me) sel.add(me.id);

  const boxes = new Map();
  const countBtn = h("button", { class: "btn primary wide" });
  const sync = () => {
    for (const [id, list] of boxes) for (const b of list) b.checked = sel.has(id);
    for (const g of groupToggles) g.box.checked = g.members.length > 0 && g.members.every((id) => sel.has(id));
    countBtn.textContent = sel.size < 2 ? "Kies minstens één iemand" : `Vergelijk ${sel.size} roosters`;
    countBtn.disabled = sel.size < 2;
    store.set("compareSel", [...sel]);
  };
  const personRow = (p) => {
    const box = h("input", { type: "checkbox", onchange: () => { box.checked ? sel.add(p.id) : sel.delete(p.id); sync(); } });
    if (!boxes.has(p.id)) boxes.set(p.id, []);
    boxes.get(p.id).push(box);
    return h("label", { class: "check-row" }, box, avatar(p, "sm"), h("span", null, p.id === me?.id ? `${p.name} (jij)` : p.name));
  };
  const groupToggles = [];

  root.append(h("section", { class: "card" },
    sectionTitle("Vergelijk met…", h("button", { class: "link", onclick: () => { data.people.forEach((p) => sel.add(p.id)); sync(); } }, "Iedereen")),
    me ? personRow(people.get(me.id)) : null));

  const used = new Set(me ? [me.id] : []);
  for (const g of sortGroups(data.groups, me?.id)) {
    const members = g.members.filter((id) => people.has(id));
    if (!members.length) continue;
    const gbox = h("input", { type: "checkbox", "aria-label": `Hele groep ${g.name}`, onchange: () => {
      for (const id of members) gbox.checked ? sel.add(id) : (id !== me?.id && sel.delete(id));
      sync();
    } });
    groupToggles.push({ box: gbox, members });
    const card = h("section", { class: "card" },
      h("label", { class: "group-head" }, gbox, h("span", { class: "g-name" }, g.name), h("span", { class: "muted small" }, `${KIND_LABEL[g.kind]} · hele groep`)));
    for (const id of members) {
      if (id === me?.id) continue;
      used.add(id);
      card.append(personRow(people.get(id)));
    }
    root.append(card);
  }
  const rest = data.people.filter((p) => !used.has(p.id));
  if (rest.length) {
    const card = h("section", { class: "card" }, h("p", { class: "group-head plain" }, data.groups.length ? "Zonder groep" : "Iedereen"));
    rest.forEach((p) => card.append(personRow(p)));
    root.append(card);
  }
  countBtn.addEventListener("click", () => go(`#/vergelijk?ids=${[...sel].join(",")}`));
  root.append(h("div", { class: "sticky-bottom" }, countBtn));
  sync();
}

async function showCompare(root, ids, extra) {
  const data = await api.get(`/compare?ids=${ids.join(",")}`);
  const nameOf = new Map((state.me.people || []).map((p) => [p.id, p.name]));
  const holder = h("div");
  const draw = () => {
    clear(root);
    root.append(h("div", { class: "toolbar" },
      h("button", { class: "btn small ghost", onclick: () => { store.set("compareSel", ids); go("#/vergelijk"); } }, icon("back"), "Wijzig selectie"),
      h("span", { class: "muted small" }, `${ids.length} roosters · tik een blok voor het vak`)),
      viewControls(draw, { withDays: false }));
    if (extra.length) {
      root.append(h("p", { class: "extra-names" }, `Kunnen ook mee: ${names(extra.map((id) => nameOf.get(id)).filter(Boolean))}`));
    }
    clear(holder);
    root.append(holder);
    // Zoveel mogelijk van het scherm gebruiken: dag-kop en uitleg eronder eraf
    const avail = freeHeight(holder, 110);
    const vertical = prefs.orient === "v";
    holder.append(dayScroller(data.days, data.today, (d) => (vertical ? columns(d, d.day === data.today, avail) : rows(d, d.day === data.today, avail))));
  };
  draw();
}

function info(d) {
  const box = h("div", { class: "tl-info" });
  if (d.together.length) box.append(h("p", null, h("span", { class: "swatch" }), `Allemaal vrij: ${d.together.map(([s, e]) => `${fmt(s)}–${fmt(e)}`).join(", ")}`));
  else if (d.people.filter((p) => p.present).length >= 2) box.append(h("p", { class: "muted" }, "Geen moment waarop iedereen samen pauze heeft."));
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
  const rowH = Math.max(36, Math.min(120, Math.floor((avail - 30) / Math.max(1, d.people.length)) - 6));

  const wrap = h("div", { class: "tl", style: { "--row": `${rowH}px` } });
  const axis = h("div", { class: "tl-axis" });
  for (let t = lo; t <= hi; t += 60) {
    if ((t - lo) % (span > 9 * 60 ? 120 : 60) === 0) axis.append(h("span", { style: { left: pct(t) } }, `${t / 60}u`));
  }
  wrap.append(h("div", { class: "tl-row head" }, h("span"), axis));

  const area = h("div", { class: "tl-area" });
  for (const p of d.people) {
    const track = h("div", { class: "tl-track" });
    for (let t = lo + 60; t < hi; t += 60) track.append(h("i", { class: "hr", style: { left: pct(t) } }));
    for (const b of p.blocks) {
      track.append(h("button", {
        class: `blk s-${b.state}`, type: "button",
        style: { left: pct(b.start), width: width(b.start, b.end), background: personColor(p.id) },
        "aria-label": `${p.name} les ${fmt(b.start)} tot ${fmt(b.end)}`,
        onclick: () => lessonSheet(b.id, b),
      }, rowH >= 56 && (b.end - b.start) >= 60 ? h("span", { class: "blk-time" }, fmt(b.start)) : null));
    }
    if (!p.blocks.length) track.append(h("span", { class: "tl-none" }, p.checkin === "absent" ? "is er niet" : "geen les"));
    area.append(h("div", { class: "tl-row" }, h("span", { class: "tl-name" }, avatar(p, "xs"), h("span", null, p.name)), track));
  }
  const bands = h("div", { class: "tl-bands" });
  for (const [s, e] of d.together) bands.append(h("i", { style: { left: pct(s), width: width(s, e) } }));
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
  const many = d.people.length > 5;

  const wrap = h("div", { class: "tlv" });
  const gutter = h("div", { class: "tlv-gutter" }, h("div", { class: "tlv-head" }));
  const gbody = h("div", { class: "tlv-gbody", style: { height: `${height}px` } });
  for (let t = lo; t <= hi; t += 60) gbody.append(h("span", { style: { top: y(t) } }, `${t / 60}u`));
  gutter.append(gbody);

  const cols = h("div", { class: "tlv-cols" });
  for (const p of d.people) {
    const body = h("div", { class: "tlv-body", style: { height: `${height}px` } });
    for (let t = lo + 60; t < hi; t += 60) body.append(h("i", { class: "hr", style: { top: y(t) } }));
    for (const b of p.blocks) {
      body.append(h("button", {
        class: `blk-v s-${b.state}`, type: "button",
        style: { top: y(b.start), height: `${Math.max(10, (b.end - b.start) * ppm - 2)}px`, background: personColor(p.id) },
        "aria-label": `${p.name} les ${fmt(b.start)} tot ${fmt(b.end)}`,
        onclick: () => lessonSheet(b.id, b),
      }, !many && (b.end - b.start) * ppm >= 34 ? h("span", { class: "blk-time" }, `${fmt(b.start)}–${fmt(b.end)}`) : null));
    }
    if (!p.blocks.length) body.append(h("span", { class: "tlv-none" }, p.checkin === "absent" ? "is er niet" : "geen les"));
    cols.append(h("div", { class: "tlv-col" },
      h("div", { class: "tlv-head", title: p.name }, avatar(p, "xs"), many ? null : h("span", null, p.name)),
      body));
  }
  const bands = h("div", { class: "tlv-bands", style: { height: `${height}px` } });
  for (const [s, e] of d.together) bands.append(h("i", { style: { top: y(s), height: `${(e - s) * ppm}px` } }));
  if (isToday) {
    const now = brusselsMinutes();
    if (now > lo && now < hi) bands.append(h("b", { class: "tlv-now", style: { top: y(now) } }));
  }
  cols.append(bands);
  wrap.append(gutter, cols);
  return h("div", { class: "tl tl-vertical" }, wrap, info(d));
}
