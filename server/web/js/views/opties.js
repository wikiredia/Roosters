// Opties: rooster toevoegen, vakken, groepen, meldingen, agenda-export, toestellen, admin.
import { api } from "../api.js";
import {
  state, go, loadMe, myPerson, isApproved, isAdmin, isPending, toast, toastError, undoToast, sheet, closeSheet,
  pushSupport, pushEnabled, enablePush, disablePush,
} from "../app.js";
import { h, clear, ago, icon, store, isIOS, isStandalone } from "../util.js";
import { sectionTitle } from "./common.js";

export async function render(root) {
  const me = myPerson();
  const reload = () => go("#/opties");

  // Wie ben ik
  const who = h("section", { class: "card" }, sectionTitle("Jij"));
  if (me) {
    who.append(h("p", { class: "big-line" }, me.name),
      h("p", { class: "muted small" }, isPending() ? "Wacht op goedkeuring van Reda." : "Dit toestel hoort bij jou. Iets mis? Vraag het aan Reda."));
  } else {
    who.append(h("p", { class: "muted" }, "Je hebt nog niet gekozen wie je bent."), h("a", { class: "btn", href: "#/home" }, "Kies je naam"));
  }
  root.append(who);

  if (me) root.append(await sourcesCard(reload));
  if (me && isApproved()) {
    root.append(await coursesCard());
    root.append(await groupsCard(reload));
  }
  if (me) root.append(await notifyCard());
  if (me && isApproved()) {
    root.append(await exportCard());
    root.append(linkDeviceCard());
    root.append(await devicesCard(reload));
  }
  root.append(startCard());
  if (isAdmin()) {
    root.append(h("section", { class: "card" }, h("button", { class: "row-btn", onclick: () => go("#/opties/admin") },
      icon("shield"), h("span", { class: "row-text" }, h("span", { class: "row-main" }, "Beheer"), h("span", { class: "row-sub" }, "Toegang, groepen, mensen, backup")), icon("chevron", "ico chev"))));
  }
  root.append(adminCodeCard());
  root.append(h("p", { class: "credit" }, "App is gemaakt en bijgehouden door Reda. Volledig gratis."));
}

// ---- Roosterbronnen ------------------------------------------------------------
async function sourcesCard(reload) {
  const card = h("section", { class: "card" }, sectionTitle("Mijn rooster", h("button", { class: "link", onclick: () => addSourceSheet(reload) }, "+ Toevoegen")));
  let list = [];
  try { list = await api.get("/sources"); } catch (e) { card.append(h("p", { class: "muted" }, e.message)); return card; }
  if (!list.length) {
    card.append(h("p", { class: "muted" }, "Nog niets toegevoegd. Voeg je Untis-klas(sen), Google- of iCloud-agenda toe. Je mag er meerdere hebben."),
      h("button", { class: "btn primary wide", onclick: () => addSourceSheet(reload) }, icon("plus"), "Rooster toevoegen"));
  }
  for (const s of list) {
    const status = s.waiting ? "Wordt opgehaald zodra je toegang hebt"
      : s.error ? `Fout: ${s.error}` : `Bijgewerkt ${ago(s.last_ok)}`;
    card.append(h("div", { class: `source ${s.error ? "err" : ""}` },
      h("span", { class: "row-text" }, h("span", { class: "row-main" }, s.label), h("span", { class: "row-sub" }, s.detail), h("span", { class: "row-sub" }, status)),
      isApproved() ? h("button", { class: "icon-btn", "aria-label": `${s.label} verwijderen`, onclick: async () => {
        try { const r = await api.del(`/sources/${s.id}`); undoToast(r, null, reload); reload(); } catch (e) { toastError(e); }
      } }, icon("trash")) : null));
  }
  return card;
}

const GUIDES = {
  google: {
    title: "Google Agenda",
    steps: [
      "Open Google Agenda op een computer (calendar.google.com).",
      "Tandwiel → Instellingen → kies links je agenda met de lessen.",
      "Scroll naar 'Agenda integreren' → kopieer 'Geheim adres in iCal-indeling'.",
      "Plak het hieronder.",
    ],
    warn: "Dit geheime adres toont álle afspraken van die agenda. Gebruik liefst een aparte agenda voor school, of vul hieronder woorden in om enkel lessen te tonen.",
  },
  icloud: {
    title: "iCloud / Apple Agenda",
    steps: [
      "Open Agenda op je iPhone → tik onderaan op 'Agenda's'.",
      "Tik op (i) naast de agenda met je lessen.",
      "Zet 'Openbare agenda' aan en tik 'Deel link' → 'Kopieer'.",
      "Plak het hieronder.",
    ],
    warn: "Wie deze link heeft kan die agenda zien. Gebruik liefst een aparte agenda voor school.",
  },
  outlook: {
    title: "Outlook / Microsoft 365",
    steps: [
      "Open Outlook op het web → Instellingen → Agenda → Gedeelde agenda's.",
      "Bij 'Een agenda publiceren': kies je agenda en 'Kan alle details weergeven' → Publiceren.",
      "Kopieer de ICS-link en plak hem hieronder.",
    ],
  },
  untisical: {
    title: "Untis (persoonlijke iCal-link)",
    steps: [
      "Open WebUntis in je browser en log in.",
      "Ga naar je profiel → 'Delen' (of 'Freigaben').",
      "Maak een iCal-link aan en kopieer die.",
      "Plak het hieronder.",
    ],
  },
  other: { title: "Andere agenda-link (.ics / webcal)", steps: ["Plak een link die eindigt op .ics of begint met webcal://."] },
};

function addSourceSheet(reload) {
  const body = h("div", { class: "stack" },
    h("p", { class: "muted" }, "Waar staat je rooster?"),
    choice("Untis (school zoeken)", "Klasroosters van je school, zonder login", () => untisFlow(reload)),
    choice("Google Agenda", "Met een geheime iCal-link", () => icsFlow("google", reload)),
    choice("iCloud / Apple Agenda", "Met een openbare agenda-link", () => icsFlow("icloud", reload)),
    choice("Untis met login", "Je persoonlijke iCal-link uit WebUntis", () => icsFlow("untisical", reload)),
    choice("Outlook / Microsoft 365", "Gepubliceerde agenda (ICS)", () => icsFlow("outlook", reload)),
    choice("Andere link", ".ics of webcal://", () => icsFlow("other", reload)),
    choice("Bestand uploaden", ".ics-bestand (wordt niet automatisch bijgewerkt)", () => fileFlow(reload)));
  sheet("Rooster toevoegen", body);
}

function choice(main, sub, onclick) {
  return h("button", { class: "row-btn", type: "button", onclick },
    h("span", { class: "row-text" }, h("span", { class: "row-main" }, main), h("span", { class: "row-sub" }, sub)), icon("chevron", "ico chev"));
}

function afterAdd(r, reload) {
  closeSheet();
  if (r.waiting) toast(r.message);
  else if (r.ok) toast(`Toegevoegd · ${r.count} lessen gevonden`);
  else toast(`Toegevoegd, maar ophalen lukte niet: ${r.error}`, { kind: "error" });
  reload();
}

function icsFlow(kind, reload) {
  const g = GUIDES[kind];
  const url = h("input", { type: "url", required: true, placeholder: "https://… of webcal://…", inputmode: "url", autocomplete: "off", "aria-label": "Link" });
  const label = h("input", { type: "text", maxlength: "80", placeholder: "Naam (optioneel)", "aria-label": "Naam" });
  const kw = h("input", { type: "text", maxlength: "300", placeholder: "Bv. les, hoorcollege, labo", "aria-label": "Enkel afspraken met deze woorden" });
  const btn = h("button", { class: "btn primary wide", type: "submit" }, "Toevoegen");
  const form = h("form", { class: "stack" },
    h("ol", { class: "steps" }, g.steps.map((s) => h("li", null, s))),
    g.warn ? h("p", { class: "warn" }, g.warn) : null,
    h("label", { class: "field" }, h("span", null, "Link"), url),
    h("label", { class: "field" }, h("span", null, "Naam"), label),
    h("label", { class: "field" }, h("span", null, "Enkel afspraken met deze woorden (optioneel, komma's ertussen)"), kw),
    btn);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = "Bezig met ophalen…";
    try {
      const r = await api.post("/sources/ics", {
        url: url.value.trim(), label: label.value.trim() || null,
        keywords: kw.value.split(",").map((x) => x.trim()).filter(Boolean),
      });
      afterAdd(r, reload);
    } catch (err) {
      toastError(err);
      btn.disabled = false;
      btn.textContent = "Toevoegen";
    }
  });
  sheet(g.title, form);
}

function fileFlow(reload) {
  const file = h("input", { type: "file", accept: ".ics,text/calendar", required: true, "aria-label": "Agendabestand" });
  const form = h("form", { class: "stack" },
    h("p", { class: "muted" }, "Een .ics-bestand wordt één keer ingelezen. Voor automatische updates gebruik je beter een link."),
    file, h("button", { class: "btn primary wide", type: "submit" }, "Uploaden"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!file.files[0]) return;
    const fd = new FormData();
    fd.append("file", file.files[0]);
    try { afterAdd(await api.form("/sources/upload", fd), reload); } catch (err) { toastError(err); }
  });
  sheet("Bestand uploaden", form);
}

function untisFlow(reload) {
  const q = h("input", { type: "search", placeholder: "Naam of stad van je school", "aria-label": "School zoeken", autocomplete: "off" });
  const results = h("div", { class: "results" });
  const body = h("div", { class: "stack" }, q, results,
    h("p", { class: "muted small" }, "Toont je school geen publieke roosters? Kies dan 'Untis met login' en gebruik je persoonlijke iCal-link."));
  let timer = 0;
  q.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (q.value.trim().length < 3) { clear(results); return; }
      clear(results).append(h("p", { class: "muted small" }, "Zoeken…"));
      try {
        const schools = await api.get(`/untis/schools?q=${encodeURIComponent(q.value.trim())}`);
        clear(results);
        if (!schools.length) results.append(h("p", { class: "muted small" }, "Niets gevonden (of te veel resultaten: typ meer)."));
        for (const s of schools) results.append(choice(s.name, s.address, () => pickClass(s, reload)));
      } catch (e) { clear(results).append(h("p", { class: "warn" }, e.message)); }
    }, 400);
  });
  sheet("Untis: zoek je school", body);
  setTimeout(() => q.focus(), 250);
}

async function pickClass(school, reload) {
  const filter = h("input", { type: "search", placeholder: "Filter op klas, bv. 1IT", "aria-label": "Klas filteren" });
  const list = h("div", { class: "results" }, h("p", { class: "muted small" }, "Klassen laden…"));
  sheet(school.name.split(" - ")[0], h("div", { class: "stack" },
    h("p", { class: "muted small" }, "Kies je klas. Volg je vakken in meerdere klassen? Voeg ze allemaal toe en vink daarna in 'Vakken' uit wat je niet volgt."),
    filter, list));
  let classes;
  try {
    classes = await api.get(`/untis/classes?server=${encodeURIComponent(school.server)}&login=${encodeURIComponent(school.login)}`);
  } catch (e) { clear(list).append(h("p", { class: "warn" }, e.message)); return; }
  const draw = () => {
    clear(list);
    const f = filter.value.trim().toLowerCase();
    const shown = classes.filter((c) => !f || c.name.toLowerCase().includes(f) || c.long.toLowerCase().includes(f)).slice(0, 80);
    for (const c of shown) {
      list.append(choice(c.name, c.long !== c.name ? c.long : "", async () => {
        try {
          const r = await api.post("/sources/untis", { server: school.server, login: school.login, school: school.name, class_id: c.id, class_name: c.name });
          afterAdd(r, reload);
        } catch (e) { toastError(e); }
      }));
    }
    if (!shown.length) list.append(h("p", { class: "muted small" }, "Geen klas gevonden."));
  };
  filter.addEventListener("input", draw);
  draw();
}

// ---- Vakken uitvinken ------------------------------------------------------------
async function coursesCard() {
  const card = h("section", { class: "card" }, sectionTitle("Vakken"),
    h("p", { class: "muted small" }, "Vink uit wat je niet volgt. Die lessen verdwijnen uit je rooster en tellen niet mee voor pauzes."));
  let list;
  try { list = await api.get("/courses"); } catch { return card; }
  if (!list.length) { card.append(h("p", { class: "muted" }, "Nog geen vakken gevonden.")); return card; }
  const wrap = h("div", { class: "course-list" });
  for (const c of list) {
    const box = h("input", { type: "checkbox", checked: !c.hidden });
    box.addEventListener("change", async () => {
      try {
        const r = await api.post("/courses", { course: c.course, hidden: !box.checked });
        undoToast(r, null, () => go("#/opties"));
      } catch (e) { box.checked = !box.checked; toastError(e); }
    });
    wrap.append(h("label", { class: "check-row" }, box, h("span", null, c.course), h("span", { class: "muted small" }, c.count ? `${c.count}×` : "")));
  }
  card.append(wrap);
  return card;
}

// ---- Groepen -------------------------------------------------------------------
async function groupsCard(reload) {
  const card = h("section", { class: "card" }, sectionTitle("Mijn groepen"),
    h("p", { class: "muted small" }, "Groepen zorgen voor nuttige meldingen en een slimme homepagina. Reda maakt de groepen, jij kiest waar je bij hoort."));
  let data;
  try { data = await api.get("/groups"); } catch { return card; }
  const me = data.me;
  for (const kind of ["campus", "home", "friends"]) {
    const gs = data.groups.filter((g) => g.kind === kind);
    card.append(h("p", { class: "picker-group" }, { campus: "Campus", home: "Woonplaats", friends: "Vriendengroepen" }[kind]));
    if (!gs.length) { card.append(h("p", { class: "muted small" }, "Nog geen groepen.")); continue; }
    const chips = h("div", { class: "chips" });
    for (const g of gs) {
      const inIt = g.members.includes(me);
      chips.append(h("button", { class: `chip ${inIt ? "on" : ""}`, "aria-pressed": String(inIt), onclick: async () => {
        try { const r = await api.post(`/groups/${g.id}/${inIt ? "leave" : "join"}`); undoToast(r, null, reload); reload(); } catch (e) { toastError(e); }
      } }, inIt ? icon("check") : null, g.name));
    }
    card.append(chips);
  }
  return card;
}

// ---- Meldingen -----------------------------------------------------------------
async function notifyCard() {
  const card = h("section", { class: "card" }, sectionTitle("Meldingen"));
  const sup = pushSupport();
  if (!sup.ok) {
    card.append(h("p", { class: "muted" }, sup.why));
    if (state.me.secure && isIOS() && !isStandalone()) card.append(linkHelp());
    return card;
  }
  const on = await pushEnabled().catch(() => false);
  const toggle = h("button", { class: `btn wide ${on ? "ghost" : "primary"}` }, icon("bell"), on ? "Meldingen uitzetten op dit toestel" : "Meldingen aanzetten");
  toggle.addEventListener("click", async () => {
    try {
      if (on) { await disablePush(); toast("Meldingen uit"); } else { await enablePush(); toast("Meldingen aan"); }
      go("#/opties");
    } catch (e) { toast(e.message, { kind: "error" }); }
  });
  card.append(toggle);
  if (on) card.append(h("button", { class: "btn small ghost", onclick: async () => {
    try { const r = await api.post("/push/test"); toast(r.ok ? "Testmelding verstuurd" : "Versturen lukte niet"); } catch (e) { toastError(e); }
  } }, "Stuur een testmelding"));
  if (!isApproved()) return card;
  let prefs;
  try { prefs = await api.get("/notify-prefs"); } catch { return card; }
  card.append(h("p", { class: "picker-group" }, "Waarover?"));
  for (const k of prefs.kinds) {
    const box = h("input", { type: "checkbox", checked: k.on });
    box.addEventListener("change", () => api.post("/notify-prefs", { kind: k.kind, value: box.checked ? "1" : "0" }).catch(toastError));
    card.append(h("label", { class: "check-row" }, box, h("span", null, k.label)));
  }
  card.append(h("p", { class: "picker-group" }, "Van wie?"));
  for (const s of prefs.scopes) {
    const r = h("input", { type: "radio", name: "scope", value: s.value, checked: prefs.scope === s.value });
    r.addEventListener("change", () => api.post("/notify-prefs", { kind: "scope", value: s.value }).catch(toastError));
    card.append(h("label", { class: "check-row" }, r, h("span", null, s.label)));
  }
  return card;
}

// ---- Agenda-export ---------------------------------------------------------------
async function exportCard() {
  const card = h("section", { class: "card" }, sectionTitle("In je eigen agenda"),
    h("p", { class: "muted small" }, "Zet je rooster (zonder de vakken die je uitvinkte) in Apple Agenda, Google Agenda of Outlook. Deze link is geheim: deel hem niet."));
  const out = h("div", { class: "stack" });
  const show = (d) => {
    clear(out).append(
      h("a", { class: "btn primary wide", href: d.webcal }, "Abonneren (iPhone / Mac)"),
      h("div", { class: "copy-row" }, h("input", { type: "text", readonly: true, value: d.url, "aria-label": "Agenda-link" }),
        h("button", { class: "icon-btn", "aria-label": "Kopiëren", onclick: async () => {
          try { await navigator.clipboard.writeText(d.url); toast("Gekopieerd"); } catch { toast("Kopiëren lukte niet: selecteer en kopieer zelf."); }
        } }, icon("copy"))),
      h("p", { class: "muted small" }, "Google Agenda: Instellingen → Agenda toevoegen → Via URL → plak de link. Google ververst dit maar om de paar uur."),
      h("button", { class: "btn small ghost", onclick: async () => {
        try { show(await api.post("/feed-link/reset")); toast("Nieuwe link gemaakt; de oude werkt niet meer."); } catch (e) { toastError(e); }
      } }, "Nieuwe link maken (oude stopt)"));
  };
  card.append(h("button", { class: "btn wide", onclick: async (e) => {
    e.target.remove();
    try { show(await api.get("/feed-link")); } catch (err) { toastError(err); }
  } }, "Toon mijn agenda-link"), out);
  return card;
}

// ---- Tweede toestel koppelen ---------------------------------------------------
function linkHelp() {
  return h("p", { class: "muted small" }, "Al toegang in Safari? Open dan in Safari: Opties → 'Koppel je beginscherm-app'.");
}

function linkDeviceCard() {
  const card = h("section", { class: "card" }, sectionTitle("Koppel je beginscherm-app"),
    h("p", { class: "muted small" }, "Op iPhone onthoudt de app op je beginscherm niet dat je al toegang hebt in Safari. Koppel ze zo:"));
  const btn = h("button", { class: "btn wide", onclick: async () => {
    try {
      const r = await api.post("/link/start");
      let left = r.expires_in;
      const timer = h("p", { class: "muted small" });
      const tick = () => { timer.textContent = left > 0 ? `Nog ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} geldig` : "Verlopen, start opnieuw."; left--; };
      tick();
      const iv = setInterval(() => { tick(); if (left < -1) clearInterval(iv); }, 1000);
      sheet("Onthoud dit getal", h("div", { class: "stack center" },
        h("p", { class: "big-number" }, String(r.number)),
        h("p", null, "Klik op 'share', voeg aan je homescreen, en klik op dit getal als je de pagina opent vanaf je homescreen."),
        timer), { onClose: () => clearInterval(iv) });
    } catch (e) { toastError(e); }
  } }, "Start koppelen");
  card.append(btn);
  return card;
}

async function devicesCard(reload) {
  const card = h("section", { class: "card" }, sectionTitle("Mijn toestellen"));
  let list;
  try { list = await api.get("/devices"); } catch { return card; }
  for (const d of list) {
    card.append(h("div", { class: "who-row" },
      h("span", { class: "row-text" }, h("span", { class: "row-main" }, d.label + (d.this ? " (dit toestel)" : "")),
        h("span", { class: "row-sub" }, `Laatst gezien ${ago(d.last_seen)}${d.admin ? " · admin" : ""}`)),
      d.this ? null : h("button", { class: "icon-btn", "aria-label": "Toestel verwijderen", onclick: async () => {
        try { const r = await api.del(`/devices/${d.id}`); undoToast(r, null, reload); reload(); } catch (e) { toastError(e); }
      } }, icon("trash"))));
  }
  return card;
}

function startCard() {
  const cur = store.get("start", "home");
  const card = h("section", { class: "card" }, sectionTitle("Openen op"));
  for (const [v, l] of [["home", "Home (of meteen je rooster als er niets nieuws is)"], ["rooster", "Altijd mijn rooster"]]) {
    const r = h("input", { type: "radio", name: "start", value: v, checked: cur === v });
    r.addEventListener("change", () => { store.set("start", v); toast("Onthouden"); });
    card.append(h("label", { class: "check-row" }, r, h("span", null, l)));
  }
  return card;
}

function adminCodeCard() {
  const det = h("details", { class: "card subtle" }, h("summary", null, "Admin-code"));
  const input = h("input", { type: "text", inputmode: "numeric", maxlength: "9", placeholder: "0000 0000", autocomplete: "one-time-code", "aria-label": "Admin-code" });
  det.append(h("form", { class: "stack", onsubmit: async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/pair", { code: input.value });
      await loadMe();
      toast("Dit toestel is nu admin");
      go("#/opties/admin");
    } catch (err) { toastError(err); }
  } }, h("p", { class: "muted small" }, "Enkel voor Reda: de code van 'sudo ./roosters.sh admin-code'."), input, h("button", { class: "btn wide", type: "submit" }, "Maak dit toestel admin")));
  return det;
}

