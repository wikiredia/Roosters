// Gedeelde stukken: dagen-scroller, lesdetails, groepen sorteren.
import { api } from "../api.js";
import { sheet, closeSheet, toast, toastError } from "../app.js";
import { h, fmt, dayLabel, icon, avatar } from "../util.js";

// Horizontale scroller die per dag 'snapt'; geen pijlen, wel bolletjes
export function dayScroller(days, today, renderDay) {
  const track = h("div", { class: "days", tabindex: "0", "aria-label": "Dagen, veeg om verder te kijken" });
  const dots = h("div", { class: "dots", "aria-hidden": "true" });
  days.forEach((d, i) => {
    const lab = dayLabel(d.day, today);
    track.append(h("section", { class: "day", "aria-label": `${lab.main} ${lab.sub}` },
      h("header", { class: "day-head" }, h("span", { class: "day-main" }, lab.main), h("span", { class: "day-sub" }, lab.sub)),
      renderDay(d, i)));
    dots.append(h("i", { class: i === 0 ? "on" : "" }));
  });
  let raf = 0;
  track.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      [...dots.children].forEach((dot, j) => dot.classList.toggle("on", j === i));
    });
  }, { passive: true });
  track.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    track.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * track.clientWidth, behavior: "smooth" });
  });
  return h("div", { class: "days-wrap" }, track, days.length > 1 ? dots : null);
}

const STATE_LABEL = {
  cancelled: "Vervalt",
  removed: "Vervallen (niet meer in het rooster)",
  changed: "Gewijzigd",
  extra: "Extra les",
  exam: "Examen",
};

// Details van een les (titel enkel hier zichtbaar in Vergelijk)
export async function lessonSheet(id, block) {
  let d;
  try {
    d = await api.get(`/lesson/${id}`);
  } catch (e) {
    toastError(e);
    return;
  }
  const start = block?.start ?? d.start, end = block?.end ?? d.end;
  const rows = [
    ["Wanneer", `${fmt(start)} – ${fmt(end)}`],
    ["Lokaal", d.location],
    ["Docent", d.teacher],
    ["Status", STATE_LABEL[d.state]],
    ["Klas", (d.extra.klassen || []).join(", ")],
    ["Groep", d.extra.groep],
    ["Lokaalcode", d.extra.lokaal_code],
    ["Info", d.info],
    ["Bron", d.source],
    ["Gewijzigd", d.changed_at ? new Date(d.changed_at).toLocaleString("nl-BE") : null],
  ].filter(([, v]) => v);
  const list = h("dl", { class: "details" });
  for (const [k, v] of rows) list.append(h("dt", null, k), h("dd", null, v));
  const link = d.extra.link && /^https?:\/\//.test(d.extra.link)
    ? h("a", { class: "btn ghost", href: d.extra.link, target: "_blank", rel: "noopener noreferrer" }, "Link openen") : null;
  sheet(d.title, h("div", null, h("p", { class: "muted" }, d.person.name), list, link));
}

// Groepen van 'mij' eerst: vriendengroep, dan mijn andere groepen, dan de rest
const KIND_ORDER = { friends: 0, campus: 1, home: 2 };
export const KIND_LABEL = { friends: "Vriendengroep", campus: "Campus", home: "Woonplaats" };

export function sortGroups(groups, me) {
  return [...groups].sort((a, b) => {
    const ma = a.members.includes(me) ? 0 : 1, mb = b.members.includes(me) ? 0 : 1;
    if (ma !== mb) return ma - mb;
    if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return a.name.localeCompare(b.name);
  });
}

export function emptyState(title, text, action) {
  return h("div", { class: "empty" }, h("p", { class: "empty-title" }, title), text ? h("p", { class: "muted" }, text) : null, action || null);
}

export function sectionTitle(text, extra) {
  return h("div", { class: "sec-title" }, h("h2", null, text), extra || null);
}

export function chevronRow(main, sub, onclick, left) {
  return h("button", { class: "row-btn", type: "button", onclick },
    left || null,
    h("span", { class: "row-text" }, h("span", { class: "row-main" }, main), sub ? h("span", { class: "row-sub" }, sub) : null),
    icon("chevron", "ico chev"));
}

// Persoon aan/uit: een rondje met de naam ernaast, aangevinkt wordt het rondje een vinkje
export function personToggle(p, on, onToggle, cls = "") {
  const row = h("button", { type: "button", class: `pick-row ${cls}`, role: "checkbox", "aria-checked": String(!!on),
    onclick: () => {
      const next = row.getAttribute("aria-checked") !== "true";
      row.setAttribute("aria-checked", String(next));
      onToggle(next);
    } },
    h("span", { class: "pick-av" }, avatar(p), h("span", { class: "pick-check" }, icon("check"))),
    h("span", { class: "pick-name" }, p.name));
  return row;
}

// 'Wie ken je?': je vriendengroep ken je al; vink aan wie je buiten je vriendengroep kent.
// Enkel wie je kent, kan je kiezen bij Vergelijk.
export async function knownSheet(onDone) {
  let data;
  try {
    data = await api.get("/known");
  } catch (e) {
    toastError(e);
    return;
  }
  // Nieuwe mensen (nog niets over gezegd) bovenaan
  const isNew = (p) => (p.known === null ? 0 : 1);
  const people = [...data.people].sort((a, b) => isNew(a) - isNew(b) || a.name.localeCompare(b.name));
  if (!people.length) {
    sheet("Wie ken je?", h("p", { class: "muted" }, "Iedereen zit al in je vriendengroep."));
    return;
  }
  const sel = new Set(people.filter((p) => p.known).map((p) => p.id));
  const list = h("div", { class: "known-list" }, people.map((p) =>
    personToggle(p, sel.has(p.id), (on) => (on ? sel.add(p.id) : sel.delete(p.id)))));
  const search = people.length > 10 ? h("input", { type: "search", class: "pick-search", placeholder: "Zoek iemand", "aria-label": "Zoek iemand",
    oninput: () => { const q = search.value.trim().toLowerCase(); people.forEach((p, i) => { list.children[i].hidden = !!q && !p.name.toLowerCase().includes(q); }); } }) : null;
  const save = h("button", { class: "btn primary wide", onclick: async () => {
    save.disabled = true;
    try {
      await api.post("/known", { seen: people.map((p) => p.id), known: [...sel] });
      closeSheet();
      toast(sel.size ? `Je kent ${sel.size} ${sel.size === 1 ? "iemand" : "mensen"} buiten je vriendengroep` : "Opgeslagen");
      if (onDone) onDone();
    } catch (e) {
      toastError(e);
      save.disabled = false;
    }
  } }, "Opslaan");
  sheet("Wie ken je?", h("div", null,
    h("p", { class: "muted" }, "Je vriendengroep ken je al. Vink aan wie je verder nog kent: enkel die kan je kiezen bij Vergelijk."),
    search, list, h("div", { class: "sheet-actions" }, save)));
}
