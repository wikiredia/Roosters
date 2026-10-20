// Samen plannen: pauze-verzoeken ("Reda wil pauze met jou, kan jij?") en wat iedereen ermee kan
// doen vanaf elke plek in de app (Rooster, Vergelijk, Home, Chat).
//
// Contract (andere schermen gebruiken enkel deze exports):
//   breakRequestSheet({ people: [{id, name}], day: "YYYY-MM-DD", start, end, onDone })
//       Onderblad om pauze samen te vragen: ik kom naar jou / jij komt naar mij / afspreken op een plek,
//       van/tot (standaard de hele pauze). Verstuurt POST /api/breaks.
//   plannedBreaksCard({ title }) -> Promise<HTMLElement|null>
//       Kaart met geplande pauzes en verzoeken die onderweg zijn (null als er niets is). Voor Home.
//   personSheet(person, { day, start, end } = {})
//       Onderblad voor één persoon: Vergelijk, Pauze vragen (als er een moment is), Stuur bericht
//       (#/chat/dm/<id>), Vraag om te chillen (POST /api/ping {to_id, kind: "chill"}).
//   loadPlans(force) -> Promise<{items, others}> en planFor({ day, start, end, ids }) -> {item, state, who} | null
//       Wat er al gevraagd of gepland is (gedeeld, één keer opgehaald). Zo stelt geen enkel scherm nog voor
//       om iets te vragen dat al loopt: state = planned (gaat door), asked (wacht op antwoord), ask (vraag aan jou).
//   planSheet() : onderblad met al je plannen en wat anderen gepland hebben (de planbalk opent dit).
// Extra voor Afspreken: breaksCard({ always, title }) en planBreakSheet().
// Na elke wijziging komt er een 'roosters:breaks'-event op window; elke kaart ververst zich dan zelf.
import { api } from "../api.js";
import { state, go, myPerson, toast, toastError, sheet, closeSheet } from "../app.js";
import { h, clear, fmt, names, avatar, icon, dayLabel } from "../util.js";
import { sectionTitle, chevronRow, personToggle } from "./common.js";

export const CHANGED = "roosters:breaks";
const changed = () => { plans = null; window.dispatchEvent(new Event(CHANGED)); };

// ---- Gedeelde stand: wat is er al gevraagd/gepland? ------------------------------
let plans = null;      // {items, others, at}
let loading = null;

export async function loadPlans(force = false) {
  if (!myPerson()) return { items: [], others: [] };
  if (plans && !force && Date.now() - plans.at < 30000) return plans;
  if (!loading) {
    loading = api.get("/breaks")
      .then((r) => { plans = { items: r.items || [], others: r.others || [], at: Date.now() }; return plans; })
      .catch(() => plans || { items: [], others: [] })
      .finally(() => { loading = null; });
  }
  return loading;
}

export const cachedPlans = () => plans || { items: [], others: [] };

// Hoe staat een verzoek er voor jou voor? null = gaat niet door (geweigerd)
export function planState(it) {
  if (it.mine) {
    if (it.members.some((m) => m.response === "accepted")) return "planned";
    return it.members.some((m) => m.response === "pending") ? "asked" : null;
  }
  if (it.my_response === "pending") return "ask";
  return it.my_response === "accepted" ? "planned" : null;
}

// Met wie (behalve jij) loopt dit verzoek nog?
export function planPeople(it) {
  const me = myPerson()?.id;
  if (it.mine) return it.members.filter((m) => m.response !== "declined");
  return [it.from, ...it.members.filter((m) => m.id !== me && m.response === "accepted")];
}

// Alles wat al loopt op (een stuk van) dit moment met (een van) deze mensen, het 'sterkste' eerst
// (een vraag aan jou, dan wat afgesproken is, dan waar je op wacht).
export function plansFor({ day, start = null, end = null, ids = null }) {
  const rank = { ask: 0, planned: 1, asked: 2 };
  const out = [];
  for (const it of cachedPlans().items) {
    if (day && it.day !== day) continue;
    if (start != null && !(it.start < end && it.end > start)) continue;
    const state = planState(it);
    if (!state) continue;
    const who = planPeople(it);
    if (ids && !who.some((p) => ids.includes(p.id))) continue;
    out.push({ item: it, state, who });
  }
  return out.sort((a, b) => rank[a.state] - rank[b.state] || a.item.start - b.item.start);
}

export const planFor = (q) => plansFor(q)[0] || null;

export const PLAN_LABEL = { planned: "Afgesproken", asked: "Gevraagd", ask: "Vraagt jou" };

const toMin = (v) => { const [hh, mm] = (v || "").split(":").map(Number); return hh * 60 + mm; };
const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const span = (it) => `${fmt(it.start)}–${fmt(it.end)}`;
const today = () => state.me?.today;

// "", "morgen " of "donderdag "
function whenWord(day) {
  if (!day || day === today()) return "";
  const lab = dayLabel(day, today());
  return `${lab.main.toLowerCase()} `;
}

// Wie gaat naar wie, gezien door wie het leest
function howText(it) {
  if (it.mode === "meet") return it.place ? `op ${it.place}` : "samen ergens";
  if (it.mine) {
    const others = it.members.filter((m) => m.response !== "declined").map((m) => m.name);
    return it.mode === "i_come" ? `jij gaat naar ${names(others)}` : `${names(others)} ${others.length === 1 ? "komt" : "komen"} naar jou`;
  }
  return it.mode === "i_come" ? `${it.from.name} komt naar jou` : `jij gaat naar ${it.from.name}`;
}

// ---- Pauze samen vragen ---------------------------------------------------------
export function breakRequestSheet({ people = [], day = null, start = null, end = null, onDone = null, force = false } = {}) {
  if (!people.length) return;
  // Al gevraagd of afgesproken met (een van) hen? Dan eerst dat tonen in plaats van opnieuw vragen.
  const running = !force && start != null ? plansFor({ day: day || today(), start, end, ids: people.map((p) => p.id) }) : [];
  if (running.length) {
    const busy = new Set(running.flatMap((r) => r.who.map((p) => p.id)));
    const rest = people.filter((p) => !busy.has(p.id));
    const body = h("div", { class: "stack" }, h("div", { class: "plan-existing" }, running.map((r) => breakRow(r.item))),
      rest.length ? h("button", { class: "btn wide", type: "button", onclick: () => breakRequestSheet({ people: rest, day, start, end, onDone, force: true }) },
        icon("plus"), `Ook ${names(rest.map((p) => p.name))} vragen`) : null);
    sheet(PLAN_LABEL[running[0].state], body);
    return;
  }
  const sel = new Set(people.map((p) => p.id));
  const n = () => sel.size;
  let mode = "meet";
  const modeSeg = h("div", { class: "seg brq-modes", role: "group", "aria-label": "Waar" });
  const place = h("input", { type: "text", maxlength: "120", placeholder: "Bv. cafetaria, het plein, de Fnac", "aria-label": "Waar afspreken" });
  const placeField = h("label", { class: "field" }, h("span", null, "Waar?"), place);
  const drawModes = () => {
    const many = n() > 1;
    const opts = [["i_come", many ? "Ik kom naar jullie" : "Ik kom naar jou"], ["you_come", many ? "Jullie komen naar mij" : "Jij komt naar mij"], ["meet", "Afspreken op…"]];
    clear(modeSeg);
    for (const [v, label] of opts) {
      modeSeg.append(h("button", { type: "button", "aria-pressed": String(mode === v), onclick: () => { mode = v; drawModes(); } }, label));
    }
    placeField.hidden = mode !== "meet";
  };
  const from = h("input", { type: "time", step: "300", required: true, value: start != null ? toTime(start) : "12:00", "aria-label": "Van" });
  const until = h("input", { type: "time", step: "300", required: true, value: end != null ? toTime(end) : "12:30", "aria-label": "Tot" });
  const note = h("input", { type: "text", maxlength: "200", placeholder: "Optioneel, bv. 'ik trakteer koffie'", "aria-label": "Opmerking" });
  const btn = h("button", { class: "btn primary wide", type: "submit" }, icon("pause"), "Vraag pauze samen");
  const who = people.length > 1
    ? h("div", { class: "brq-people" }, people.map((p) => personToggle(p, true, (on) => {
      on ? sel.add(p.id) : sel.delete(p.id);
      btn.disabled = !n();
      drawModes();
    })))
    : h("p", { class: "brq-one" }, avatar(people[0], "sm"), h("b", null, people[0].name));
  const when = whenWord(day);
  const form = h("form", { class: "stack" },
    who,
    start != null ? h("p", { class: "muted small" }, `${when ? when[0].toUpperCase() + when.slice(1) : "Vandaag "}samen vrij van ${fmt(start)} tot ${fmt(end)}.`) : null,
    modeSeg, placeField,
    h("div", { class: "brq-times" },
      h("label", { class: "field" }, h("span", null, "Van"), from),
      h("label", { class: "field" }, h("span", null, "Tot"), until)),
    h("label", { class: "field" }, h("span", null, "Opmerking"), note),
    btn);
  drawModes();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!n()) return;
    btn.disabled = true;
    try {
      await api.post("/breaks", {
        to_ids: [...sel], day, start_min: toMin(from.value), end_min: toMin(until.value),
        mode, place: mode === "meet" ? place.value.trim() || null : null, note: note.value.trim() || null,
      });
      closeSheet();
      toast(`Gevraagd aan ${names(people.filter((p) => sel.has(p.id)).map((p) => p.name))}. Je krijgt een melding met het antwoord.`);
      changed();
      if (onDone) onDone();
    } catch (err) {
      toastError(err);
      btn.disabled = false;
    }
  });
  sheet(people.length === 1 ? `Pauze met ${people[0].name}` : "Pauze samen", form);
}

// Ander uur voorstellen op een verzoek dat je kreeg
function proposeSheet(it) {
  const from = h("input", { type: "time", step: "300", required: true, value: toTime(it.start), "aria-label": "Van" });
  const until = h("input", { type: "time", step: "300", required: true, value: toTime(it.end), "aria-label": "Tot" });
  const form = h("form", { class: "stack" },
    h("p", { class: "muted" }, `${it.from.name} vroeg ${span(it)}. Wanneer past het jou wel?`),
    h("div", { class: "brq-times" }, h("label", { class: "field" }, h("span", null, "Van"), from), h("label", { class: "field" }, h("span", null, "Tot"), until)),
    h("button", { class: "btn primary wide", type: "submit" }, "Stel voor"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.post(`/breaks/${it.id}/propose`, { start_min: toMin(from.value), end_min: toMin(until.value) });
      closeSheet();
      toast(`${it.from.name} krijgt je voorstel`);
      changed();
    } catch (err) { toastError(err); }
  });
  sheet("Ander uur", form);
}

// ---- Eén verzoek of geplande pauze ------------------------------------------------
async function act(fn, ok) {
  try {
    await fn();
    if (ok) toast(ok);
    changed();
  } catch (e) { toastError(e); }
}

function memberChips(it) {
  const mark = { accepted: "✓", declined: "✕", pending: "…" };
  return h("span", { class: "brq-chips" }, it.members.map((m) =>
    h("span", { class: `brq-chip r-${m.response}`, title: { accepted: "komt", declined: "kan niet", pending: "nog geen antwoord" }[m.response] },
      `${mark[m.response]} ${m.name}`)));
}

export function breakRow(it) {
  const accepted = it.members.filter((m) => m.response === "accepted").map((m) => m.name);
  const respond = (response, ok) => act(() => api.post(`/breaks/${it.id}/respond`, { response }), ok);
  const cancel = () => act(() => api.post(`/breaks/${it.id}/cancel`), "Geannuleerd");
  let title, actions = [];
  if (!it.mine && it.my_response === "pending") {
    const others = it.members.filter((m) => m.id !== myPerson()?.id).map((m) => m.name);
    title = `${it.from.name} wil pauze met jou${others.length ? ` en ${names(others)}` : ""}`;
    actions = [
      h("button", { class: "btn small primary", onclick: () => respond("accepted", `${it.from.name} weet dat je komt`) }, "Ja"),
      h("button", { class: "btn small", onclick: () => respond("declined", `${it.from.name} weet dat je niet kan`) }, "Nee"),
      h("button", { class: "btn small ghost", onclick: () => proposeSheet(it) }, "Ander uur"),
    ];
  } else if (!it.mine && it.my_response === "accepted") {
    const rest = accepted.filter((nm) => nm !== myPerson()?.name);
    title = `Pauze met ${names([it.from.name, ...rest])}`;
    actions = [h("button", { class: "btn small ghost", onclick: () => respond("declined", `${it.from.name} weet dat je toch niet kan`) }, "Kan niet meer")];
  } else if (!it.mine) {
    title = `Je kan niet met ${it.from.name}`;
    actions = [h("button", { class: "btn small ghost", onclick: () => respond("accepted", `${it.from.name} weet dat je toch komt`) }, "Toch wel")];
  } else if (it.state === "planned") {
    title = `Pauze met ${names(accepted)}`;
    actions = [h("button", { class: "btn small ghost", onclick: cancel }, "Annuleren")];
  } else if (it.state === "declined") {
    title = `${names(it.members.map((m) => m.name))} ${it.members.length === 1 ? "kan" : "kunnen"} niet`;
    actions = [h("button", { class: "btn small ghost", onclick: cancel }, "Wissen")];
  } else {
    title = `Gevraagd aan ${names(it.members.map((m) => m.name))}`;
    actions = [h("button", { class: "btn small ghost", onclick: cancel }, "Intrekken")];
  }
  const kind = it.state === "planned" && (it.mine || it.my_response === "accepted") ? "planned"
    : !it.mine && it.my_response === "pending" ? "ask" : it.state === "declined" || it.my_response === "declined" ? "off" : "wait";
  return h("div", { class: `brq-row k-${kind} ${it.now ? "now" : ""}` },
    h("span", { class: "brq-time" }, h("b", null, fmt(it.start)), h("span", null, fmt(it.end)), whenWord(it.day) ? h("span", { class: "brq-day" }, whenWord(it.day).trim()) : null),
    h("span", { class: "brq-main" },
      h("span", { class: "brq-title" }, it.now && kind === "planned" ? h("span", { class: "brq-now" }, "nu") : null, title),
      h("span", { class: "brq-sub" }, howText(it), it.note ? ` · ${it.note}` : ""),
      it.mine && it.members.length > 0 && it.state !== "declined" ? memberChips(it) : null,
      it.conflicts.length && kind !== "off" ? h("span", { class: "brq-warn" }, `Gaat niet meer: ${names(it.conflicts)}`) : null,
      h("span", { class: "brq-actions" }, actions)));
}

// ---- Kaarten ----------------------------------------------------------------------
// always: ook tonen als er niets is (Afspreken); anders null (Home)
export async function breaksCard({ always = false, title = "Pauzes samen", action = null } = {}) {
  let data;
  try { data = await api.get("/breaks"); } catch (e) {
    if (!always) return null;
    return h("section", { class: "card" }, sectionTitle(title), h("p", { class: "muted" }, e.message));
  }
  if (!always && !data.items.length) return null;
  const card = h("section", { class: "card brq-card" });
  const fill = (items) => {
    clear(card).append(sectionTitle(title, action || (always ? null : h("a", { class: "link", href: "#/afspreken" }, "Alles"))));
    // Vragen aan jou eerst, dan wat gepland is, dan wat nog wacht
    const rank = (it) => (!it.mine && it.my_response === "pending" ? 0 : it.state === "planned" ? 1 : it.state === "pending" ? 2 : 3);
    const sorted = [...items].sort((a, b) => rank(a) - rank(b) || a.day.localeCompare(b.day) || a.start - b.start);
    if (!sorted.length) card.append(h("p", { class: "muted" }, "Nog niets gepland. Tik een pauze aan in je rooster of bij Vergelijk om iemand te vragen."));
    for (const it of sorted) card.append(breakRow(it));
  };
  fill(data.items);
  const onChange = async () => {
    if (!card.isConnected) { window.removeEventListener(CHANGED, onChange); return; }
    try {
      const fresh = await api.get("/breaks");
      if (!always && !fresh.items.length) { card.remove(); window.removeEventListener(CHANGED, onChange); return; }
      fill(fresh.items);
    } catch { /* stil */ }
  };
  window.addEventListener(CHANGED, onChange);
  return card;
}

export function plannedBreaksCard({ title = "Pauzes samen" } = {}) {
  return breaksCard({ always: false, title });
}

// ---- Pauze plannen: kies een moment dat je met iemand gemeen hebt ---------------------
export async function planBreakSheet() {
  const body = h("div", { class: "stack" });
  const tabs = h("div", { class: "seg brq-days", role: "group", "aria-label": "Dag" });
  const list = h("div", { class: "brq-slots" });
  // Vandaag en de twee volgende weekdagen
  const days = [];
  const d = new Date(today() + "T12:00:00Z");
  while (days.length < 3) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const show = async (day) => {
    [...tabs.children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.day === day)));
    clear(list).append(h("p", { class: "muted small" }, "Laden…"));
    let ov;
    try { ov = await api.get(`/overview?day=${day}`); } catch (e) { clear(list).append(h("p", { class: "warn" }, e.message)); return; }
    clear(list);
    const now = day === today() ? ov.now_min : 0;
    const slots = ov.slots.filter((s) => s.end > now && s.people.length);
    for (const s of slots) {
      const box = h("div", { class: "brq-slot" }, h("p", { class: "brq-slot-head" }, icon("pause"), h("b", null, `${fmt(s.start)}–${fmt(s.end)}`), h("span", { class: "muted" }, "pauze")));
      for (const p of s.people) {
        box.append(chevronRow(p.name, `${fmt(p.start)}–${fmt(p.end)} vrij${p.same_campus ? "" : " · andere campus"}`,
          () => breakRequestSheet({ people: [p], day, start: Math.max(p.start, now ? roundUp(now) : 0), end: p.end }), avatar(p, "sm")));
      }
      // Met iedereen tegelijk, als er een gemeenschappelijk stuk is
      const st = Math.max(...s.people.map((p) => p.start)), en = Math.min(...s.people.map((p) => p.end));
      if (s.people.length > 1 && en - st >= 15) {
        box.append(h("button", { class: "btn small brq-all", type: "button", onclick: () => breakRequestSheet({ people: s.people, day, start: st, end: en }) },
          icon("users"), `Met iedereen (${fmt(st)}–${fmt(en)})`));
      }
      list.append(box);
    }
    const after = ov.after;
    const later = after ? [...after.free, ...after.done_same.filter((p) => !after.free.some((f) => f.id === p.id))] : [];
    if (after && later.length && after.end > now) {
      const box = h("div", { class: "brq-slot" }, h("p", { class: "brq-slot-head" }, icon("sun"), h("b", null, `Na school, vanaf ${fmt(after.start)}`)));
      for (const p of later) {
        const st = Math.max(after.start, p.end || p.start || after.start);
        box.append(chevronRow(p.name, p.chill ? "blijft in Antwerpen" : `klaar om ${fmt(p.end)}`,
          () => breakRequestSheet({ people: [p], day, start: st, end: Math.min(st + 60, 23 * 60) }), avatar(p, "sm")));
      }
      list.append(box);
    }
    if (!list.children.length) list.append(h("p", { class: "muted" }, "Geen pauzes samen met iemand op deze dag."));
  };
  for (const day of days) {
    const lab = dayLabel(day, today());
    tabs.append(h("button", { type: "button", "data-day": day, "aria-pressed": "false", onclick: () => show(day) }, lab.main));
  }
  body.append(tabs, list);
  sheet("Pauze plannen", body);
  show(days[0]);
}

const roundUp = (m) => Math.ceil(m / 5) * 5;

// ---- Eén persoon: wat kan je doen? ----------------------------------------------------
export function personSheet(person, { day = null, start = null, end = null } = {}) {
  const me = myPerson();
  const close = (fn) => () => { closeSheet(); fn(); };
  const rows = h("div", { class: "brq-person" },
    start != null && end != null
      ? chevronRow(`Pauze samen vragen`, `${whenWord(day)}${fmt(start)}–${fmt(end)}`, () => breakRequestSheet({ people: [person], day, start, end }), icon("pause"))
      : null,
    chevronRow("Vergelijk roosters", me ? `Jij en ${person.name}` : null, close(() => go(`#/vergelijk?ids=${[me?.id, person.id].filter(Boolean).join(",")}`)), icon("vergelijk")),
    chevronRow(`Rooster van ${person.name}`, null, close(() => go(`#/rooster/${person.id}`)), icon("rooster")),
    me ? chevronRow("Stuur een bericht", null, close(() => go(`#/chat/dm/${person.id}`)), icon("chat")) : null,
    me ? chevronRow("Vraag of die wil chillen", "Krijgt een melding van jou", async () => {
      try {
        await api.post("/ping", { to_id: person.id, kind: "chill" });
        closeSheet();
        toast(`${person.name} krijgt je vraag`);
      } catch (e) { toastError(e); }
    }, icon("sun")) : null);
  return sheet(person.name, rows);
}

// ---- Al je plannen in één onderblad (planbalk onderaan) --------------------------------
// Jouw verzoeken en afspraken, en wat anderen die je kent vandaag samen gepland hebben.
export async function planSheet() {
  const body = h("div", { class: "plan-sheet" });
  const mine = await breaksCard({ always: true, title: "Jouw plannen",
    action: h("button", { class: "link", onclick: () => { closeSheet(); planBreakSheet(); } }, "+ Plannen") });
  mine.classList.remove("card");
  body.append(mine);
  const { others } = await loadPlans();
  if (others.length) {
    body.append(h("div", { class: "plan-others" }, sectionTitle("Plannen van anderen"),
      others.map((o) => h("div", { class: `plan-other${o.now ? " now" : ""}` },
        h("span", { class: "brq-time" }, h("b", null, fmt(o.start)), h("span", null, fmt(o.end))),
        h("span", { class: "fold-avs" }, o.people.slice(0, 3).map((p) => avatar(p, "xs"))),
        h("span", { class: "row-text" },
          h("span", { class: "row-main" }, `${o.now ? "Nu: " : ""}${names(o.people.map((p) => p.name))}`),
          h("span", { class: "row-sub" }, o.place ? `pauze samen · ${o.place}` : "pauze samen"))))));
  }
  body.append(h("a", { class: "btn ghost wide", href: "#/afspreken", onclick: () => closeSheet() }, "Alles bij Afspreken"));
  sheet("Plannen", body);
}
