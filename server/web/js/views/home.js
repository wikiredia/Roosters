// Home: check-in, jouw dag, samen pauze, nu-bord, meldingen, reizen, afspraken, iemand kiezen.
import { api } from "../api.js";
import { state, go, loadMe, myPerson, isPending, isApproved, isAdmin, toast, toastError, undoToast, sheet, closeSheet } from "../app.js";
import { h, clear, fmt, dur, names, avatar, icon, personColor, ago } from "../util.js";
import { sortGroups, sectionTitle, KIND_LABEL } from "./common.js";
import { checkinSheet, CHECKIN_LABEL } from "./afspreken.js";

export async function render(root) {
  const me = state.me;
  if (!me.device?.person && !isAdmin()) return renderOnboarding(root);
  if (isPending()) return renderPending(root);
  if (!me.device?.person && isAdmin()) {
    root.append(h("section", { class: "card" }, h("h2", null, "Wie ben jij?"),
      h("p", { class: "muted" }, "Dit toestel is admin, maar hangt nog aan niemand."), bigPicker(me.people, null, null, confirmClaim)));
    return;
  }
  const [data, groups] = await Promise.all([api.get("/home"), api.get("/groups").catch(() => null)]);
  draw(root, data, groups);
  // Elke minuut het nu-bord bijwerken
  const timer = setInterval(async () => {
    try {
      const fresh = await api.get("/home");
      const y = window.scrollY;
      draw(clear(root), fresh, groups);
      window.scrollTo({ top: y });
    } catch { /* stil */ }
  }, 60000);
  return () => clearInterval(timer);
}

function compareLink(ids, extra = []) {
  const q = new URLSearchParams({ ids: [...new Set(ids)].join(",") });
  if (extra.length) q.set("extra", extra.join(","));
  return `#/vergelijk?${q}`;
}

function draw(root, d, groups) {
  const me = d.me;
  if (d.admin?.pending) {
    root.append(h("button", { class: "card alert-card", onclick: () => go("#/opties/admin") },
      icon("shield"), h("span", null, `${d.admin.pending} ${d.admin.pending === 1 ? "toegangsverzoek" : "toegangsverzoeken"} wachten op jou`), icon("chevron", "ico chev")));
  }

  // Check-in: klein, niet in de weg
  root.append(checkinCard(d));

  // Jouw dag
  const day = h("section", { class: "card" }, sectionTitle("Jouw dag", h("a", { class: "link", href: "#/rooster" }, "Rooster")));
  if (!d.has_school_today) {
    day.append(h("p", { class: "big-line" }, "Geen les vandaag"));
  }
  if (d.my_breaks.length) {
    for (const b of d.my_breaks) {
      const who = names(b.people.map((p) => p.name));
      day.append(h("button", { class: `break-row ${b.now ? "now" : ""}`, onclick: () => go(compareLink([me.id, ...b.people.map((p) => p.id)])) },
        h("span", { class: "time" }, `${fmt(b.start)}–${fmt(b.end)}`),
        h("span", { class: "who" }, b.now ? `Nu pauze met ${who}` : `Pauze met ${who}`,
          !b.same_campus ? h("span", { class: "tag" }, "andere campus") : null),
        icon("chevron", "ico chev")));
    }
  } else if (d.has_school_today) {
    day.append(h("p", { class: "muted" }, "Vandaag (nog) geen pauze samen met iemand."));
  }
  root.append(day);

  // Samen pauze (iedereen)
  const tog = h("section", { class: "card" });
  tog.append(sectionTitle(d.summary ? `${d.summary} mensen hebben pauze samen` : "Samen pauze"));
  if (!d.together.length) tog.append(h("p", { class: "muted" }, "Vandaag geen gezamenlijke pauzes meer."));
  for (const w of d.together) {
    const ppl = names(w.people.map((p) => p.name));
    tog.append(h("button", { class: `together-row ${w.mine ? "mine" : ""} ${w.now ? "now" : ""}`, onclick: () => go(compareLink(w.people.map((p) => p.id), w.extra.map((p) => p.id))) },
      h("span", { class: "tw-head" }, h("span", { class: "campus" }, w.campus), h("span", { class: "time" }, `${w.now ? "nu · " : ""}${fmt(w.start)}–${fmt(w.end)}`)),
      h("span", { class: "tw-who" }, `${ppl} hebben pauze samen`),
      w.extra.length ? h("span", { class: "tw-extra" }, `Kunnen ook mee: ${names(w.extra.map((p) => p.name))}`) : null));
  }
  root.append(tog);

  // Nu-bord
  if (d.board.length) {
    const board = h("section", { class: "card" }, sectionTitle("Nu"));
    const list = h("ul", { class: "board" });
    for (const b of d.board) {
      list.append(h("li", { class: `st-${b.code}` },
        avatar(b, "sm"),
        h("span", { class: "b-name" }, b.name),
        h("span", { class: "b-text" }, b.text + (b.with ? ` met ${b.with}` : ""))));
    }
    board.append(list);
    root.append(board);
  }

  // Samen reizen
  const travel = d.travel || [];
  if (travel.length) {
    const tr = h("section", { class: "card" }, sectionTitle("Samen reizen"));
    for (const t of travel) {
      const when = t.day === d.today ? "Vandaag" : "Morgen";
      const text = t.kind === "heen"
        ? `${when} kan je met ${t.other.name} naar school (jij ${fmt(t.time)}, ${t.other.name} ${fmt(t.their_time)})`
        : `${when} kan je samen met ${t.other.name} naar huis (jij ${fmt(t.time)}, ${t.other.name} ${fmt(t.their_time)})`;
      tr.append(h("div", { class: "travel" }, h("p", null, text),
        t.pref === "always" ? null : h("div", { class: "row-actions" },
          h("button", { class: "btn small", onclick: (e) => travelPref(e, t.other, "always") }, "Ja, blijf voorstellen"),
          h("button", { class: "btn small ghost", onclick: (e) => travelPref(e, t.other, "never") }, `Nooit meer voor ${t.other.name}`))));
    }
    root.append(tr);
  }

  // Afspraken
  if (d.plans.length) {
    const pl = h("section", { class: "card" }, sectionTitle("Afspraken", h("a", { class: "link", href: "#/afspreken" }, "Alles")));
    for (const p of d.plans) pl.append(planRow(p, d.today));
    root.append(pl);
  }

  // Meldingen van vandaag
  if (d.feed.length) {
    const feed = h("section", { class: "card" }, sectionTitle("Meldingen"));
    for (const n of d.feed) feed.append(feedItem(n, me));
    root.append(feed);
  }

  // Bekijk rooster van ...
  if (groups) root.append(h("section", { class: "card" }, sectionTitle("Bekijk rooster van…"), bigPicker(groups.people, groups, me.id)));

  root.append(h("p", { class: "credit" }, "App is gemaakt en bijgehouden door Reda. Volledig gratis."));
}

function checkinCard(d) {
  const ci = d.checkin;
  if (ci && ci.status !== "skip") {
    const until = ci.until_min ? ` tot ${fmt(ci.until_min)}` : "";
    const withWho = ci.with_text ? ` met ${ci.with_text}` : "";
    return h("button", { class: "card checkin-done", onclick: () => go("#/afspreken") },
      h("span", { class: "dot" }), h("span", null, `${CHECKIN_LABEL[ci.status]}${withWho}${until}`), h("span", { class: "link" }, "Wijzig"));
  }
  if (ci?.status === "skip") return h("div");
  const card = h("section", { class: "card checkin" },
    h("p", { class: "ci-q" }, "Blijf je vandaag nog in Antwerpen?"),
    h("div", { class: "chips" },
      h("button", { class: "chip", onclick: () => checkinSheet("chilling", afterCheckin) }, "Al aant chillen"),
      h("button", { class: "chip", onclick: () => checkinSheet("want_chill", afterCheckin) }, "Ik wil chillen"),
      h("button", { class: "chip ghost", onclick: async () => {
        try { const r = await api.post("/checkin", { status: "skip" }); card.remove(); undoToast(r); } catch (e) { toastError(e); }
      } }, "Nee")));
  return card;
}

function afterCheckin() {
  go("#/home");
}

async function travelPref(e, other, pref) {
  e.target.closest(".travel")?.classList.add("done");
  try {
    const r = await api.post("/travel-pref", { other_id: other.id, pref });
    undoToast(r);
  } catch (err) { toastError(err); }
}

export function planRow(p, today) {
  const when = p.day === today ? "" : "morgen ";
  const coming = p.coming.map((c) => c.name);
  const row = h("div", { class: "plan" },
    h("div", { class: "plan-main" },
      h("span", { class: "time" }, `${when}${fmt(p.start)}`),
      h("span", { class: "place" }, p.place),
      h("span", { class: "muted small" }, `${p.creator.name}${p.note ? " · " + p.note : ""}`),
      h("span", { class: "small" }, coming.length ? `Komen: ${names(coming)}` : "")));
  if (!p.mine) {
    const going = p.my_response === "coming";
    row.append(h("button", { class: `btn small ${going ? "" : "primary"}`, onclick: async () => {
      try {
        await api.post(`/plans/${p.id}/respond`, { response: going ? "none" : "coming" });
        toast(going ? "Je komt niet meer" : "Leuk! De anderen weten dat je komt.");
        go(location.hash);
      } catch (e) { toastError(e); }
    } }, going ? "Toch niet" : "Ik kom"));
  }
  return row;
}

function feedItem(n, me) {
  const p = n.payload || {};
  const open = () => {
    if (p.open === "vergelijk" && p.people?.length) go(compareLink(p.people, p.extra || []));
    else if (p.open === "afspreken") go("#/afspreken");
    else if (p.open === "admin") go("#/opties/admin");
    else if (p.open === "admin-cert") go("#/opties/admin?cert=1");
    else if (p.open === "rooster") go("#/rooster");
  };
  const clickable = p.open && p.open !== "home";
  const item = h(clickable ? "button" : "div", { class: `feed-item k-${n.kind}`, onclick: clickable ? open : null },
    h("span", { class: "f-title" }, n.title, h("span", { class: "f-time" }, ago(n.created))),
    h("span", { class: "f-body" }, n.body));
  if (p.undo) {
    item.append(h("button", { class: "btn small ghost", onclick: async (e) => {
      e.stopPropagation();
      try { await api.post("/undo", { id: p.undo }); toast("Toestel losgekoppeld"); } catch (err) { toastError(err); }
    } }, "Ik was dit niet: ongedaan maken"));
  }
  return item;
}

// Grote keuzelijst met namen, gegroepeerd (mijn groepen eerst)
function bigPicker(people, groups, meId = null, onPick = null) {
  const pick = onPick || ((p) => go(`#/rooster/${p.id}`));
  const wrap = h("div", { class: "picker" });
  const used = new Set();
  if (groups?.groups?.length) {
    for (const g of sortGroups(groups.groups, meId)) {
      // Iedereen maar één keer: in de eerste (meest relevante) groep
      const members = people.filter((p) => g.members.includes(p.id) && !used.has(p.id));
      if (!members.length) continue;
      wrap.append(h("p", { class: "picker-group" }, g.name, h("span", { class: "muted" }, ` · ${KIND_LABEL[g.kind]}`)));
      const grid = h("div", { class: "name-grid" });
      for (const p of members) {
        used.add(p.id);
        grid.append(nameButton(p, meId, pick));
      }
      wrap.append(grid);
    }
  }
  const rest = people.filter((p) => !used.has(p.id));
  if (rest.length) {
    if (used.size) wrap.append(h("p", { class: "picker-group" }, "Anderen"));
    const grid = h("div", { class: "name-grid" });
    for (const p of rest) grid.append(nameButton(p, meId, pick));
    wrap.append(grid);
  }
  return wrap;
}

function nameButton(p, meId, pick) {
  return h("button", { class: "name-btn", type: "button", onclick: () => pick(p) },
    avatar(p), h("span", null, p.id === meId ? `${p.name} (jij)` : p.name));
}

// ---- Eerste bezoek: wie ben jij? ----------------------------------------------------
function renderOnboarding(root) {
  const me = state.me;
  if (me.link_offer) root.append(linkCard(me.link_offer));
  root.append(h("section", { class: "card hero" },
    h("h1", null, "Wie ben jij?"),
    h("p", { class: "muted" }, "Kies je naam. Dit toestel onthoudt het, je hoeft het maar één keer te doen."),
    bigPicker(me.people, null, null, confirmClaim),
    h("button", { class: "btn wide ghost", onclick: newNameSheet }, icon("plus"), "Ik sta er niet tussen")));
  root.append(h("p", { class: "credit" }, "App is gemaakt en bijgehouden door Reda. Volledig gratis."));
}

function confirmClaim(p) {
  sheet(`Ben jij ${p.name}?`, h("div", null,
    h("p", { class: "muted" }, me().gate
      ? "Reda krijgt een melding en laat je toe. Daarna kan je alles zien."
      : "Dit toestel wordt aan jou gekoppeld."),
    h("button", { class: "btn primary wide", onclick: () => claim({ person_id: p.id }) }, `Ja, ik ben ${p.name}`),
    h("button", { class: "btn ghost wide", onclick: closeSheet }, "Nee")));
}

const me = () => state.me;

function newNameSheet() {
  const input = h("input", { type: "text", maxlength: "40", autocomplete: "given-name", placeholder: "Je voornaam", "aria-label": "Je naam" });
  const form = h("form", { class: "stack", onsubmit: (e) => { e.preventDefault(); claim({ name: input.value }); } },
    input, h("button", { class: "btn primary wide", type: "submit" }, "Verder"));
  sheet("Hoe heet je?", form);
  setTimeout(() => input.focus(), 250);
}

async function claim(body) {
  try {
    await api.post("/claim", body);
    closeSheet();
    await loadMe();
    go("#/home");
  } catch (e) { toastError(e); }
}

function linkCard(offer) {
  const card = h("section", { class: "card link-card" },
    h("h2", null, "Koppelen met je andere scherm"),
    h("p", { class: "muted" }, "Tik op het getal dat je op je andere scherm ziet."));
  const row = h("div", { class: "link-numbers" });
  for (const n of offer.options) {
    row.append(h("button", { class: "num-btn", onclick: async () => {
      try {
        await api.post("/link/choose", { number: n });
        await loadMe();
        toast("Gekoppeld!");
        go("#/home");
      } catch (e) { toastError(e); await loadMe(); go("#/home"); }
    } }, String(n)));
  }
  card.append(row);
  return card;
}

// ---- Wachten op toegang ------------------------------------------------------------
async function renderPending(root) {
  const p = myPerson();
  root.append(h("section", { class: "card pending" },
    h("div", { class: "pending-ico" }, icon("shield")),
    h("h2", null, "Wacht tot Reda je toegang geeft"),
    h("p", null, `Je vroeg toegang als ${p?.name}. Zodra Reda je toelaat zie je hier de pauzes, wie er nog op campus is en alle roosters.`),
    h("p", { class: "ps" }, "PS: Als ik je toegang geef dan kan je dit wel doen, ik wil mn wifi niet gehackt dus bel ofzo als dit sneller moet gebeuren")));
  const todo = h("section", { class: "card" }, sectionTitle("Ondertussen"));
  todo.append(
    h("button", { class: "row-btn", onclick: () => go("#/opties") }, icon("rooster"),
      h("span", { class: "row-text" }, h("span", { class: "row-main" }, "Voeg je rooster toe"), h("span", { class: "row-sub" }, "Untis, Google, iCloud of een .ics-bestand")), icon("chevron", "ico chev")),
    h("button", { class: "row-btn", onclick: () => go("#/opties") }, icon("bell"),
      h("span", { class: "row-text" }, h("span", { class: "row-main" }, "Zet meldingen aan"), h("span", { class: "row-sub" }, "Dan weet je meteen wanneer je binnen bent")), icon("chevron", "ico chev")),
    h("div", { class: "row-btn", style: { cursor: "default" } }, icon("shield"),
      h("span", { class: "row-text" }, h("span", { class: "row-main" }, "Al toegang op een ander toestel?"),
        h("span", { class: "row-sub" }, "Open daar Opties → 'Koppel je beginscherm-app' en tik hier het getal aan. Dan hoef je niet te wachten."))));
  root.append(todo);
  if (state.me.link_offer) root.prepend(linkCard(state.me.link_offer));
  root.append(h("p", { class: "credit" }, "App is gemaakt en bijgehouden door Reda. Volledig gratis."));
  // Kijk af en toe of je al binnen bent
  const timer = setInterval(async () => {
    await loadMe().catch(() => {});
    if (isApproved()) { clearInterval(timer); toast("Je hebt toegang!"); go("#/home"); }
  }, 20000);
  return () => clearInterval(timer);
}

export { bigPicker, personColor };
