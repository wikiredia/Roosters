// Afspreken: blijf je in Antwerpen (check-in), pauzes samen plannen (vroeger 'Afspraken'), samen reizen.
import { api } from "../api.js";
import { state, go, myPerson, toastError, undoToast, sheet, closeSheet } from "../app.js";
import { h, fmt, names, avatar } from "../util.js";
import { sectionTitle } from "./common.js";
import { breaksCard, planBreakSheet } from "./social.js";

export const CHECKIN_LABEL = {
  chilling: "Al aant chillen",
  want_chill: "Ik wil chillen",
  home: "Ik ga naar huis",
  absent: "Ik ben er vandaag niet",
};

function toMin(v) {
  if (!v) return null;
  const [hh, mm] = v.split(":").map(Number);
  return hh * 60 + mm;
}

// Onderblad voor 'Al aant chillen' / 'Ik wil chillen'
export function checkinSheet(status, done) {
  const people = (state.me.people || []).filter((p) => p.id !== myPerson()?.id);
  const time = h("input", { type: "time", step: "900", "aria-label": "Tot wanneer", value: "18:00" });
  const unknown = h("input", { type: "checkbox", onchange: () => { time.disabled = unknown.checked; } });
  const form = h("form", { class: "stack" });
  let withSel = null, withText = null;
  if (status === "chilling") {
    withSel = h("select", { multiple: true, size: String(Math.min(6, Math.max(3, people.length))), "aria-label": "Met wie" },
      people.map((p) => h("option", { value: p.id }, p.name)));
    withText = h("input", { type: "text", maxlength: "120", placeholder: "Of typ een naam (staat er niet tussen)" });
    form.append(h("label", { class: "field" }, h("span", null, "Met wie?"), withSel, withText));
  }
  form.append(
    h("label", { class: "field" }, h("span", null, "Tot wanneer?"), time),
    h("label", { class: "check-row" }, unknown, h("span", null, "Weet ik nog niet")),
    h("button", { class: "btn primary wide", type: "submit" }, "Opslaan"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { status, until_min: unknown.checked ? null : toMin(time.value) };
    if (withSel) {
      body.with_ids = [...withSel.selectedOptions].map((o) => Number(o.value));
      body.with_text = withText.value.trim() || null;
    }
    try {
      const r = await api.post("/checkin", body);
      closeSheet();
      undoToast(r);
      if (done) done();
    } catch (err) { toastError(err); }
  });
  sheet(CHECKIN_LABEL[status], form);
}

async function quickCheckin(status, reload) {
  try {
    const r = await api.post("/checkin", { status });
    undoToast(r, null, reload);
    reload();
  } catch (e) { toastError(e); }
}

export async function render(root) {
  const data = await api.get("/afspreken");
  const reload = () => go("#/afspreken");
  const me = myPerson();

  // Mijn check-in
  const mine = data.mine;
  const ci = h("section", { class: "card" }, sectionTitle("Na school"));
  if (mine) {
    const until = mine.until_min ? ` tot ${fmt(mine.until_min)}` : "";
    ci.append(h("p", { class: "big-line" }, `${CHECKIN_LABEL[mine.status] || ""}${mine.with.length ? " met " + names(mine.with) : ""}${until}`));
  } else {
    ci.append(h("p", { class: "muted" }, "Laat weten of je nog in Antwerpen blijft."));
  }
  const opts = h("div", { class: "choice-grid" },
    h("button", { class: "choice", onclick: () => checkinSheet("chilling", reload) }, h("b", null, "Al aant chillen"), h("span", null, "met wie, tot wanneer")),
    h("button", { class: "choice", onclick: () => checkinSheet("want_chill", reload) }, h("b", null, "Ik wil chillen"), h("span", null, "wie doet mee?")),
    h("button", { class: "choice", onclick: () => quickCheckin("home", reload) }, h("b", null, "Ik ga naar huis"), h("span", null, "pauzes vallen weg")),
    h("button", { class: "choice", onclick: () => quickCheckin("absent", reload) }, h("b", null, "Ik ben er niet"), h("span", null, "vandaag niet op school")));
  ci.append(opts);
  if (mine) ci.append(h("button", { class: "btn ghost small", onclick: () => quickCheckin("clear", reload) }, "Wissen"));
  if (!me) ci.replaceChildren(sectionTitle("Na school"), h("p", { class: "muted" }, "Kies eerst wie je bent op Home."));
  root.append(ci);

  // Wie is er nog?
  const others = data.checkins.filter((c) => !c.mine);
  const who = h("section", { class: "card" }, sectionTitle("Wie blijft er?"));
  if (!others.length) who.append(h("p", { class: "muted" }, "Nog niemand heeft iets laten weten vandaag."));
  for (const c of others) {
    who.append(h("div", { class: "who-row" }, avatar(c.person, "sm"),
      h("span", { class: "row-text" },
        h("span", { class: "row-main" }, c.person.name),
        h("span", { class: "row-sub" }, `${CHECKIN_LABEL[c.status]}${c.with.length ? " met " + names(c.with) : ""}${c.until_min ? " tot " + fmt(c.until_min) : ""}`))));
  }
  root.append(who);

  // Pauzes samen: verzoeken en wat gepland is (dit vervangt de oude 'Afspraken')
  if (me) {
    root.append(await breaksCard({ always: true, title: "Pauzes samen",
      action: h("button", { class: "link", onclick: () => planBreakSheet() }, "+ Pauze plannen") }));
  }

  // Samen reizen
  if (me) {
    const tr = h("section", { class: "card" }, sectionTitle("Samen reizen"));
    tr.append(h("p", { class: "muted small" }, "Je krijgt 's avonds een voorstel als iemand uit je woonplaats en campus rond hetzelfde uur begint of stopt. Hier beheer je met wie wel of niet."));
    for (const p of data.travel_prefs) {
      tr.append(h("div", { class: "who-row" }, avatar(p.other, "sm"),
        h("span", { class: "row-text" }, h("span", { class: "row-main" }, p.other.name),
          h("span", { class: "row-sub" }, p.pref === "always" ? "Altijd voorstellen (reismaatje)" : "Nooit voorstellen")),
        h("button", { class: "btn small ghost", onclick: async () => {
          try { const r = await api.post("/travel-pref", { other_id: p.other.id, pref: "none" }); undoToast(r, null, reload); reload(); } catch (e) { toastError(e); }
        } }, "Wissen")));
    }
    const pick = h("select", { "aria-label": "Reismaatje kiezen" }, h("option", { value: "" }, "Reismaatje toevoegen…"),
      (state.me.people || []).filter((p) => p.id !== me.id).map((p) => h("option", { value: p.id }, p.name)));
    pick.addEventListener("change", async () => {
      if (!pick.value) return;
      try { const r = await api.post("/travel-pref", { other_id: Number(pick.value), pref: "always" }); undoToast(r, null, reload); reload(); } catch (e) { toastError(e); }
    });
    tr.append(pick);
    root.append(tr);
  }
}
