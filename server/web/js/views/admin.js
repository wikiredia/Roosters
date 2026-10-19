// Beheer (enkel Reda): toegang, certificaat, groepen, mensen, toestellen, ongedaan maken, backup.
import { api } from "../api.js";
import { go, isAdmin, toast, toastError, undoToast, sheet, closeSheet } from "../app.js";
import { h, ago, icon } from "../util.js";
import { sectionTitle, KIND_LABEL } from "./common.js";

export async function render(root) {
  if (!isAdmin()) {
    root.append(h("section", { class: "card" }, h("h2", null, "Alleen voor Reda"), h("p", { class: "muted" }, "Koppel dit toestel eerst met een admin-code (Opties, onderaan).")));
    return;
  }
  const d = await api.get("/admin/overview");
  const reload = () => go("#/opties/admin");
  const act = async (path, body, method = "post") => {
    try {
      const r = method === "del" ? await api.del(path) : method === "patch" ? await api.patch(path, body) : await api.post(path, body);
      undoToast(r, "Opgeslagen", reload);
      reload();
    } catch (e) { toastError(e); }
  };

  root.append(h("div", { class: "toolbar" }, h("a", { class: "btn small ghost", href: "#/opties" }, icon("back"), "Opties"), h("span", { class: "muted small" }, "Beheer")));

  // Goedkeuring aan/uit
  const gate = h("input", { type: "checkbox", role: "switch", checked: d.gate });
  gate.addEventListener("change", () => act("/admin/gate", { on: gate.checked }));
  root.append(h("section", { class: "card" },
    h("label", { class: "switch-row" }, h("span", { class: "row-text" }, h("span", { class: "row-main" }, "Goedkeuring verplicht"),
      h("span", { class: "row-sub" }, d.gate ? "Nieuwe toestellen wachten tot jij ze toelaat." : "Open: iedereen kan zich toevoegen. Zet aan wanneer iedereen erin zit.")), gate)));

  // Toegangsverzoeken
  const req = h("section", { class: "card" }, sectionTitle(`Toegangsverzoeken (${d.requests.length})`));
  if (!d.requests.length) req.append(h("p", { class: "muted" }, "Niemand wacht."));
  for (const r of d.requests) req.append(requestCard(r, act));
  root.append(req);

  // Certificaat
  root.append(certCard(d.cert));

  // Groepen
  root.append(groupsCard(d, act));

  // Mensen
  const ppl = h("section", { class: "card" }, sectionTitle(`Mensen (${d.people.length})`));
  for (const p of d.people) {
    const errs = p.sources.filter((s) => s.error);
    const sub = !p.sources.length ? "Geen rooster" : errs.length ? `Fout: ${errs[0].error}` : `${p.sources.length} bron(nen), bijgewerkt ${ago(p.sources.map((s) => s.last_ok).filter(Boolean).sort().pop())}`;
    ppl.append(h("div", { class: `who-row ${errs.length ? "err" : ""}` },
      h("span", { class: "row-text" }, h("span", { class: "row-main" }, p.name), h("span", { class: "row-sub" }, `${p.devices} toestel(len) · ${sub}`)),
      h("button", { class: "icon-btn", "aria-label": `${p.name} hernoemen`, onclick: () => renameSheet(p.name, (name) => act(`/admin/people/${p.id}`, { name }, "patch")) }, "✎"),
      h("button", { class: "icon-btn", "aria-label": `${p.name} verwijderen`, onclick: () => act(`/admin/people/${p.id}`, null, "del") }, icon("trash"))));
  }
  root.append(ppl);

  // Toestellen
  const devs = h("section", { class: "card" }, sectionTitle("Toestellen"));
  const people = d.people;
  for (const dv of d.devices) {
    const status = { approved: "toegelaten", denied: "geweigerd", blocked: "geblokkeerd", pending: "wacht (geen naam)" }[dv.status];
    const row = h("details", { class: "device" },
      h("summary", null, h("span", { class: `st st-${dv.status}` }), `${dv.person?.name || "—"} · ${dv.label}`, h("span", { class: "muted small" }, ` ${status}${dv.admin ? " · admin" : ""}`)),
      h("p", { class: "muted small" }, `Laatst gezien ${ago(dv.last_seen)} · ${dv.ip || "?"}${dv.city ? " · " + dv.city : ""}`));
    const btns = h("div", { class: "row-actions" });
    if (dv.status !== "approved") btns.append(h("button", { class: "btn small primary", onclick: () => act(`/admin/devices/${dv.id}`, { action: "approve" }) }, dv.status === "blocked" ? "Deblokkeren" : "Toelaten"));
    if (dv.status !== "blocked") btns.append(h("button", { class: "btn small ghost", onclick: () => act(`/admin/devices/${dv.id}`, { action: "block" }) }, "Blokkeren"));
    btns.append(h("button", { class: "btn small ghost", onclick: () => act(`/admin/devices/${dv.id}`, { action: dv.admin ? "unadmin" : "admin" }) }, dv.admin ? "Geen admin" : "Maak admin"));
    const sel = h("select", { "aria-label": "Koppel aan persoon" }, h("option", { value: "" }, "Koppel aan…"), people.map((p) => h("option", { value: p.id }, p.name)));
    sel.addEventListener("change", () => sel.value && act(`/admin/devices/${dv.id}`, { action: "person", person_id: Number(sel.value) }));
    btns.append(sel, h("button", { class: "icon-btn", "aria-label": "Toestel verwijderen", onclick: () => act(`/admin/devices/${dv.id}`, null, "del") }, icon("trash")));
    row.append(btns);
    devs.append(row);
  }
  root.append(devs);

  // Ongedaan maken
  const acts = h("section", { class: "card" }, sectionTitle("Recente acties"));
  if (!d.actions.length) acts.append(h("p", { class: "muted" }, "Nog niets."));
  for (const a of d.actions) {
    acts.append(h("div", { class: "who-row" },
      h("span", { class: "row-text" }, h("span", { class: `row-main ${a.undone ? "struck" : ""}` }, a.summary), h("span", { class: "row-sub" }, ago(a.created))),
      a.undone ? h("span", { class: "muted small" }, "ongedaan") : h("button", { class: "btn small ghost", onclick: async () => {
        try { await api.post("/undo", { id: a.id }); toast("Ongedaan gemaakt"); reload(); } catch (e) { toastError(e); }
      } }, "Ongedaan maken")));
  }
  root.append(acts);

  // Backup
  root.append(h("section", { class: "card" }, sectionTitle("Backup"),
    h("p", { class: "muted small" }, "Download alle gegevens als zip. Terugzetten op de server: sudo ./roosters.sh restore bestand.zip"),
    h("a", { class: "btn wide", href: "/api/admin/backup", download: "" }, "Download backup")));

  root.append(h("p", { class: "credit" }, "Plaatsbepaling bij IP: IP Geolocation by DB-IP (db-ip.com)."));

  if (location.hash.includes("cert")) document.getElementById("cert")?.scrollIntoView();
  // Nieuwe toegangsverzoeken verschijnen vanzelf
  const known = d.requests.map((r) => `${r.id}:${r.activity.length}:${!!r.location}`).join(",");
  const timer = setInterval(async () => {
    try {
      const fresh = await api.get("/admin/overview");
      if (fresh.requests.map((r) => `${r.id}:${r.activity.length}:${!!r.location}`).join(",") !== known) reload();
    } catch { /* stil */ }
  }, 20000);
  return () => clearInterval(timer);
}

function requestCard(r, act) {
  const card = h("div", { class: "request" },
    h("p", { class: "req-name" }, r.person?.name || "?", h("span", { class: "muted small" }, ` · ${r.label}`)),
    h("p", { class: "muted small" }, `${ago(r.created)} · IP ${r.ip || "?"}${r.city ? " · " + r.city : ""}`));
  if (r.location) {
    const url = `https://www.openstreetmap.org/?mlat=${r.location.lat}&mlon=${r.location.lon}#map=16/${r.location.lat}/${r.location.lon}`;
    card.append(h("p", { class: "small" }, icon("pin"), ` Locatie gedeeld (±${r.location.acc} m) · `,
      h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, "bekijk op kaart")));
  } else {
    card.append(h("p", { class: "muted small" }, "Geen locatie gedeeld."));
  }
  if (r.activity.length) {
    card.append(h("ul", { class: "activity" }, r.activity.slice(-8).reverse().map((a) => h("li", null, h("span", { class: "muted" }, ago(a.t) + ": "), a.what))));
  }
  card.append(h("div", { class: "row-actions" },
    h("button", { class: "btn small primary", onclick: () => act(`/admin/devices/${r.id}`, { action: "approve" }) }, "Toelaten"),
    h("button", { class: "btn small ghost", onclick: () => act(`/admin/devices/${r.id}`, { action: "deny" }) }, "Weigeren"),
    h("button", { class: "btn small ghost danger", onclick: () => act(`/admin/devices/${r.id}`, { action: "block" }) }, "Blokkeren")));
  return card;
}

function certCard(c) {
  const card = h("section", { class: `card ${c.ok ? "" : "error"}`, id: "cert" }, sectionTitle("Certificaat (https)"));
  if (c.mode !== "letsencrypt") {
    card.append(h("p", { class: "muted" }, c.note));
    return card;
  }
  if (!c.known) {
    card.append(h("p", { class: "muted" }, "Nog geen status: de certbot-container is nog niet klaar of draait niet."));
    return card;
  }
  card.append(h("p", null, c.ok ? `In orde · nog ${c.hours_left} uur geldig, wordt automatisch vernieuwd.` : `Vernieuwen mislukt sinds ${new Date(c.first_failure).toLocaleString("nl-BE")} (${c.failures}×).`));
  if (c.expires) card.append(h("p", { class: "muted small" }, `Verloopt ${new Date(c.expires).toLocaleString("nl-BE")}`));
  if (c.prompt) {
    const ta = h("textarea", { class: "prompt", readonly: true, rows: "10", "aria-label": "Debug-prompt voor Claude" });
    ta.value = c.prompt;
    card.append(h("p", { class: "small" }, "Plak deze prompt in Claude Code op je server:"), ta,
      h("button", { class: "btn wide primary", onclick: async () => {
        try { await navigator.clipboard.writeText(c.prompt); toast("Prompt gekopieerd"); } catch { ta.select(); toast("Selecteer en kopieer zelf"); }
      } }, icon("copy"), "Kopieer prompt"));
  }
  return card;
}

function groupsCard(d, act) {
  const card = h("section", { class: "card" }, sectionTitle("Groepen", h("button", { class: "link", onclick: () => newGroupSheet(act) }, "+ Nieuw")),
    h("p", { class: "muted small" }, "Campus = waar ze les hebben (bv. AP Spoor Noord). Woonplaats = voor samen reizen. Vriendengroep = mensen kiezen zelf."));
  for (const kind of ["campus", "home", "friends"]) {
    const gs = d.groups.filter((g) => g.kind === kind);
    card.append(h("p", { class: "picker-group" }, KIND_LABEL[kind]));
    if (!gs.length) card.append(h("p", { class: "muted small" }, "Nog geen."));
    for (const g of gs) {
      const members = d.people.filter((p) => p.groups.includes(g.id));
      card.append(h("div", { class: "who-row" },
        h("button", { class: "row-text plain", onclick: () => membersSheet(g, d.people, act) },
          h("span", { class: "row-main" }, g.name), h("span", { class: "row-sub" }, members.length ? members.map((p) => p.name).join(", ") : "Nog niemand")),
        h("button", { class: "icon-btn", "aria-label": `${g.name} hernoemen`, onclick: () => renameSheet(g.name, (name) => act(`/admin/groups/${g.id}`, { name }, "patch")) }, "✎"),
        h("button", { class: "icon-btn", "aria-label": `${g.name} verwijderen`, onclick: () => act(`/admin/groups/${g.id}`, null, "del") }, icon("trash"))));
    }
  }
  return card;
}

function newGroupSheet(act) {
  const name = h("input", { type: "text", required: true, maxlength: "80", placeholder: "Bv. AP Spoor Noord", "aria-label": "Naam" });
  const kind = h("select", { "aria-label": "Soort" },
    h("option", { value: "campus" }, "Campus"), h("option", { value: "home" }, "Woonplaats"), h("option", { value: "friends" }, "Vriendengroep"));
  const form = h("form", { class: "stack" }, h("label", { class: "field" }, h("span", null, "Naam"), name),
    h("label", { class: "field" }, h("span", null, "Soort (één van de drie)"), kind), h("button", { class: "btn primary wide", type: "submit" }, "Maken"));
  form.addEventListener("submit", (e) => { e.preventDefault(); closeSheet(); act("/admin/groups", { name: name.value, kind: kind.value }); });
  sheet("Nieuwe groep", form);
  setTimeout(() => name.focus(), 250);
}

function membersSheet(g, people, act) {
  const list = h("div", { class: "stack" });
  for (const p of people) {
    const box = h("input", { type: "checkbox", checked: p.groups.includes(g.id) });
    box.addEventListener("change", async () => {
      try { await api.post(`/admin/groups/${g.id}/members`, { person_id: p.id, member: box.checked }); }
      catch (e) { box.checked = !box.checked; toastError(e); }
    });
    list.append(h("label", { class: "check-row" }, box, h("span", null, p.name)));
  }
  // Bij sluiten de lijst verversen, maar enkel als we nog op Beheer staan
  sheet(g.name, list, { onClose: () => { if (location.hash === "#/opties/admin") go("#/opties/admin"); } });
}

function renameSheet(current, save) {
  const input = h("input", { type: "text", required: true, maxlength: "80", value: current, "aria-label": "Nieuwe naam" });
  const form = h("form", { class: "stack" }, input, h("button", { class: "btn primary wide", type: "submit" }, "Opslaan"));
  form.addEventListener("submit", (e) => { e.preventDefault(); closeSheet(); save(input.value.trim()); });
  sheet("Hernoemen", form);
  setTimeout(() => input.select(), 250);
}

