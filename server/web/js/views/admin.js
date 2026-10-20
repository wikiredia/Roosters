// Beheer (enkel Reda): toegang, certificaat, groepen, mensen, toestellen, ongedaan maken, backup.
//
// Groepen en mensen aanpassen gebeurt in een kladversie: niets wordt meteen opgeslagen. Onderaan
// staat dan "N wijzigingen · Opslaan · Annuleren"; Opslaan stuurt alles in één keer (één keer
// ongedaan te maken). Toestellen toelaten/weigeren gebeurt wel meteen, zonder de pagina te herladen.
import { api } from "../api.js";
import { isAdmin, toast, toastError, undoToast, sheet, closeSheet } from "../app.js";
import { h, ago, icon, store } from "../util.js";
import { KIND_LABEL } from "./common.js";

// Niet-opgeslagen wijzigingen blijven bewaard als je even naar een ander scherm gaat
let draftOps = [];

export async function render(root) {
  if (!isAdmin()) {
    root.append(h("section", { class: "card" }, h("h2", null, "Alleen voor Reda"), h("p", { class: "muted" }, "Koppel dit toestel eerst met een admin-code (Opties, onderaan).")));
    return;
  }
  let base = await api.get("/admin/overview");
  if (draftOps.length) toast("Je niet-opgeslagen wijzigingen staan nog klaar");
  let wc = working(base, draftOps);

  // Vaste plekken op de pagina; elk deel tekent zichzelf opnieuw zonder de rest aan te raken
  const slot = () => h("div");
  const s = { gate: slot(), req: slot(), cert: slot(), groups: slot(), people: slot(), devices: slot(), actions: slot() };
  const bar = h("div", { class: "save-bar", hidden: true });

  // ---- Kladversie ----
  const dirty = () => draftOps.length > 0;
  const edit = (fn) => {
    fn(wc);
    draftOps = diff(base, wc);
    drawStaged();
  };
  const drawStaged = () => {
    s.groups.replaceChildren(groupsCard(wc, edit));
    s.people.replaceChildren(peopleCard(wc, edit));
    drawBar();
  };
  const drawBar = () => {
    const n = draftOps.length;
    bar.hidden = !n;
    bar.replaceChildren(
      h("span", { class: "save-count" }, `${n} ${n === 1 ? "wijziging" : "wijzigingen"}`),
      h("button", { class: "btn small ghost", onclick: () => { draftOps = []; wc = working(base, []); drawStaged(); } }, "Annuleren"),
      h("button", { class: "btn small primary", onclick: save }, "Opslaan"));
  };
  const save = async () => {
    const btn = bar.querySelector(".primary");
    if (btn) { btn.disabled = true; btn.textContent = "Opslaan…"; }
    try {
      const r = await api.post("/admin/batch", { ops: draftOps });
      draftOps = [];
      await refresh();
      undoToast(r, "Opgeslagen", refresh);
    } catch (e) {
      toastError(e);
      drawBar();
    }
  };

  // ---- Alles opnieuw ophalen, kladversie behouden ----
  const refresh = async () => {
    try {
      base = await api.get("/admin/overview");
    } catch (e) { toastError(e); return; }
    wc = working(base, draftOps);
    draftOps = diff(base, wc);
    drawAll();
  };
  // Meteen uitgevoerd (toestellen, goedkeuring): daarna enkel de gegevens opfrissen
  const act = async (path, body, method = "post") => {
    try {
      const r = method === "del" ? await api.del(path) : method === "patch" ? await api.patch(path, body) : await api.post(path, body);
      undoToast(r, "Opgeslagen", refresh);
      await refresh();
    } catch (e) { toastError(e); }
  };

  const drawAll = () => {
    s.gate.replaceChildren(gateCard(base, act));
    s.req.replaceChildren(requestsCard(base, act));
    s.cert.replaceChildren(certCard(base.cert));
    s.devices.replaceChildren(devicesCard(base, act));
    s.actions.replaceChildren(actionsCard(base, refresh));
    drawStaged();
  };

  root.append(
    h("div", { class: "toolbar" }, h("a", { class: "btn small ghost", href: "#/opties" }, icon("back"), "Opties"), h("span", { class: "muted small" }, "Beheer")),
    s.gate, s.req, s.cert, s.groups, s.people, s.devices, s.actions,
    fold("push", "Meldingen testen", null, false, [
      h("p", { class: "muted small" }, "Over een minuut krijgt elk toestel waarop meldingen aanstaan een testmelding."),
      h("button", { class: "btn wide", onclick: async () => {
        try {
          const r = await api.post("/admin/push-test");
          toast(r.devices ? `Over een minuut krijgen ${r.devices} ${r.devices === 1 ? "toestel" : "toestellen"} een testmelding` : "Nog niemand heeft meldingen aangezet");
        } catch (e) { toastError(e); }
      } }, icon("bell"), "Stuur iedereen een testmelding")]),
    fold("backup", "Backup", null, false, [
      h("p", { class: "muted small" }, "Download alle gegevens als zip. Terugzetten op de server: sudo ./roosters.sh restore bestand.zip"),
      h("a", { class: "btn wide", href: "/api/admin/backup", download: "" }, "Download backup")]),
    h("p", { class: "credit" }, "Plaatsbepaling bij IP: IP Geolocation by DB-IP (db-ip.com)."),
    bar);
  drawAll();

  if (location.hash.includes("cert")) {
    const c = document.getElementById("cert");
    if (c) { c.open = true; c.scrollIntoView(); }
  }

  // Weggaan met niet-opgeslagen wijzigingen: eerst vragen
  const onLeaveClick = (e) => {
    if (!dirty()) return;
    const el = e.target.closest?.('a[href^="#"], .tabs button');
    if (!el || el.closest(".save-bar")) return;
    if (!confirm(`Je hebt ${draftOps.length === 1 ? "1 wijziging" : `${draftOps.length} wijzigingen`} die nog niet opgeslagen ${draftOps.length === 1 ? "is" : "zijn"}. Toch weggaan? (Ze blijven bewaard tot je terugkomt.)`)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const onUnload = (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } };
  document.addEventListener("click", onLeaveClick, true);
  window.addEventListener("beforeunload", onUnload);

  // Nieuwe toegangsverzoeken verschijnen vanzelf (enkel dat deel, de kladversie blijft staan)
  const sig = (d) => d.requests.map((r) => `${r.id}:${r.activity.length}:${!!r.location}`).join(",");
  const timer = setInterval(async () => {
    try {
      const fresh = await api.get("/admin/overview");
      if (sig(fresh) === sig(base)) return;
      base = { ...base, requests: fresh.requests, devices: fresh.devices };
      s.req.replaceChildren(requestsCard(base, act));
      s.devices.replaceChildren(devicesCard(base, act));
    } catch { /* stil */ }
  }, 20000);
  return () => {
    clearInterval(timer);
    document.removeEventListener("click", onLeaveClick, true);
    window.removeEventListener("beforeunload", onUnload);
  };
}

// ---- Kladversie: werkkopie = gegevens van de server + wat je aanpaste --------------

function working(base, ops) {
  const wc = {
    groups: base.groups.map((g) => ({ ...g, deleted: false, isNew: false })),
    people: base.people.map((p) => ({ ...p, deleted: false })),
    members: new Set(base.people.flatMap((p) => p.groups.map((gid) => `${gid}:${p.id}`))),
    seq: 0,
  };
  const group = (id) => wc.groups.find((g) => g.id === id);
  const person = (id) => wc.people.find((p) => p.id === id);
  for (const o of ops) {
    if (o.op === "group_create") {
      wc.groups.push({ id: o.tmp, name: o.name, kind: o.kind, deleted: false, isNew: true });
      wc.seq = Math.max(wc.seq, Number(String(o.tmp).slice(1)) || 0);
    } else if (o.op === "group_rename" && group(o.group_id)) group(o.group_id).name = o.name;
    else if (o.op === "group_delete" && group(o.group_id)) group(o.group_id).deleted = true;
    else if (o.op === "member") {
      const key = `${o.group_tmp || o.group_id}:${o.person_id}`;
      if (o.member) wc.members.add(key); else wc.members.delete(key);
    } else if (o.op === "person_rename" && person(o.person_id)) person(o.person_id).name = o.name;
    else if (o.op === "person_delete" && person(o.person_id)) person(o.person_id).deleted = true;
  }
  return wc;
}

// Wat verschilt de werkkopie van de server? -> lijst van stappen voor POST /admin/batch
function diff(base, wc) {
  const ops = [];
  const origGroups = new Map(base.groups.map((g) => [g.id, g]));
  const origPeople = new Map(base.people.map((p) => [p.id, p]));
  const orig = new Set(base.people.flatMap((p) => p.groups.map((gid) => `${gid}:${p.id}`)));
  const live = new Map(wc.groups.map((g) => [String(g.id), g]));
  for (const g of wc.groups) {
    if (g.isNew) {
      if (!g.deleted) ops.push({ op: "group_create", tmp: g.id, name: g.name, kind: g.kind });
    } else if (g.deleted) ops.push({ op: "group_delete", group_id: g.id });
    else if (g.name !== origGroups.get(g.id)?.name) ops.push({ op: "group_rename", group_id: g.id, name: g.name });
  }
  for (const p of wc.people) {
    const o = origPeople.get(p.id);
    if (p.deleted) ops.push({ op: "person_delete", person_id: p.id });
    else if (o && p.name !== o.name) ops.push({ op: "person_rename", person_id: p.id, name: p.name });
  }
  const memberOp = (key, member) => {
    const [gid, pid] = key.split(":");
    const g = live.get(gid);
    const p = wc.people.find((x) => x.id === Number(pid));
    if (!g || g.deleted || !p || p.deleted) return; // valt toch weg
    ops.push(g.isNew ? { op: "member", group_tmp: g.id, person_id: p.id, member }
      : { op: "member", group_id: g.id, person_id: p.id, member });
  };
  for (const key of wc.members) if (!orig.has(key)) memberOp(key, true);
  for (const key of orig) if (!wc.members.has(key)) memberOp(key, false);
  return ops;
}

const isMember = (wc, g, p) => wc.members.has(`${g.id}:${p.id}`);
const membersOf = (wc, g) => wc.people.filter((p) => !p.deleted && isMember(wc, g, p));
const groupsOf = (wc, p) => wc.groups.filter((g) => !g.deleted && isMember(wc, g, p));

// ---- In- en uitklappen (onthouden per toestel) ---------------------------------------

function fold(key, title, extra, openByDefault, children, cls = "") {
  const open = store.get(`admin.open.${key}`, openByDefault);
  const det = h("details", { class: `card fold ${cls}`, open, id: key === "cert" ? "cert" : null },
    h("summary", { class: "fold-head" }, h("h2", null, title), extra || null, icon("chevron", "ico chev fold-chev")),
    h("div", { class: "fold-body" }, children));
  det.addEventListener("toggle", () => store.set(`admin.open.${key}`, det.open));
  return det;
}

// Lange lijsten: eerst een paar tonen, de rest achter 'Toon alles'
function limited(items, n = 8) {
  if (items.length <= n + 2) return items;
  const more = h("button", { class: "link small show-more", type: "button" }, `Toon alles (${items.length})`);
  const rest = items.slice(n);
  rest.forEach((el) => { el.hidden = true; });
  more.addEventListener("click", () => { rest.forEach((el) => { el.hidden = false; }); more.remove(); });
  return [...items, more];
}

const count = (n) => h("span", { class: "fold-count" }, String(n));

// ---- Meteen uitgevoerd: goedkeuring, toegang, toestellen --------------------------

function gateCard(d, act) {
  const gate = h("input", { type: "checkbox", role: "switch", checked: d.gate });
  gate.addEventListener("change", () => act("/admin/gate", { on: gate.checked }));
  return h("section", { class: "card" },
    h("label", { class: "switch-row" }, h("span", { class: "row-text" }, h("span", { class: "row-main" }, "Goedkeuring verplicht"),
      h("span", { class: "row-sub" }, d.gate ? "Nieuwe toestellen wachten tot jij ze toelaat." : "Open: iedereen kan zich toevoegen. Zet aan wanneer iedereen erin zit.")), gate));
}

function requestsCard(d, act) {
  const body = d.requests.length ? d.requests.map((r) => requestCard(r, act)) : [h("p", { class: "muted" }, "Niemand wacht.")];
  // Wachten er mensen? Dan altijd open
  const det = fold("req", "Toegangsverzoeken", count(d.requests.length), true, body, d.requests.length ? "has-new" : "");
  if (d.requests.length) det.open = true;
  return det;
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
  const parts = [];
  if (c.mode !== "letsencrypt") parts.push(h("p", { class: "muted" }, c.note));
  else if (!c.known) parts.push(h("p", { class: "muted" }, "Nog geen status: de certbot-container is nog niet klaar of draait niet."));
  else {
    parts.push(h("p", null, c.ok ? `In orde · nog ${c.hours_left} uur geldig, wordt automatisch vernieuwd.` : `Vernieuwen mislukt sinds ${new Date(c.first_failure).toLocaleString("nl-BE")} (${c.failures}×).`));
    if (c.expires) parts.push(h("p", { class: "muted small" }, `Verloopt ${new Date(c.expires).toLocaleString("nl-BE")}`));
    if (c.prompt) {
      const ta = h("textarea", { class: "prompt", readonly: true, rows: "10", "aria-label": "Debug-prompt voor Claude" });
      ta.value = c.prompt;
      parts.push(h("p", { class: "small" }, "Plak deze prompt in Claude Code op je server:"), ta,
        h("button", { class: "btn wide primary", onclick: async () => {
          try { await navigator.clipboard.writeText(c.prompt); toast("Prompt gekopieerd"); } catch { ta.select(); toast("Selecteer en kopieer zelf"); }
        } }, icon("copy"), "Kopieer prompt"));
    }
  }
  const bad = c.mode === "letsencrypt" && c.known && !c.ok;
  const det = fold("cert", "Certificaat (https)", h("span", { class: `fold-state ${bad ? "bad" : "ok"}` }, bad ? "probleem" : "in orde"), bad, parts, bad ? "error" : "");
  if (bad) det.open = true;
  return det;
}

function devicesCard(d, act) {
  const people = d.people;
  const rows = d.devices.map((dv) => {
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
    return row;
  });
  return fold("devices", "Toestellen", count(d.devices.length), false, rows.length ? limited(rows, 10) : [h("p", { class: "muted" }, "Nog geen.")]);
}

function actionsCard(d, refresh) {
  const rows = d.actions.map((a) => h("div", { class: "who-row" },
    h("span", { class: "row-text" }, h("span", { class: `row-main ${a.undone ? "struck" : ""}` }, a.summary), h("span", { class: "row-sub" }, ago(a.created))),
    a.undone ? h("span", { class: "muted small" }, "ongedaan") : h("button", { class: "btn small ghost", onclick: async () => {
      try { await api.post("/undo", { id: a.id }); toast("Ongedaan gemaakt"); refresh(); } catch (e) { toastError(e); }
    } }, "Ongedaan maken")));
  return fold("actions", "Recente acties", null, false, rows.length ? limited(rows, 6) : [h("p", { class: "muted" }, "Nog niets.")]);
}

// ---- Kladversie: groepen en mensen -----------------------------------------------

const changedMark = (on) => (on ? h("span", { class: "draft-tag" }, "niet opgeslagen") : null);

function groupsCard(wc, edit) {
  const body = [h("p", { class: "muted small" }, "Campus = waar ze les hebben (bv. AP Spoor Noord). Woonplaats = voor samen reizen. Vriendengroep = mensen kiezen zelf. Tik een groep om leden te kiezen.")];
  for (const kind of ["campus", "home", "friends"]) {
    const gs = wc.groups.filter((g) => g.kind === kind);
    body.push(h("p", { class: "picker-group" }, KIND_LABEL[kind]));
    if (!gs.length) body.push(h("p", { class: "muted small" }, "Nog geen."));
    for (const g of gs) {
      const members = membersOf(wc, g);
      if (g.deleted) {
        body.push(h("div", { class: "who-row draft-deleted" },
          h("span", { class: "row-text" }, h("span", { class: "row-main struck" }, g.name), h("span", { class: "row-sub" }, "wordt verwijderd bij Opslaan")),
          h("button", { class: "btn small ghost", onclick: () => edit((w) => { w.groups.find((x) => x.id === g.id).deleted = false; }) }, "Toch houden")));
        continue;
      }
      body.push(h("div", { class: "who-row" },
        h("button", { class: "row-text plain", onclick: () => membersSheet(g, wc, edit) },
          h("span", { class: "row-main" }, g.name, g.isNew ? h("span", { class: "draft-tag" }, "nieuw") : null),
          h("span", { class: "row-sub" }, members.length ? members.map((p) => p.name).join(", ") : "Nog niemand")),
        h("button", { class: "icon-btn", "aria-label": `${g.name} hernoemen`, onclick: () => renameSheet(g.name, (name) => edit((w) => { w.groups.find((x) => x.id === g.id).name = name; })) }, icon("pencil")),
        h("button", { class: "icon-btn", "aria-label": `${g.name} verwijderen`, onclick: () => edit((w) => {
          const x = w.groups.find((y) => y.id === g.id);
          if (x.isNew) w.groups = w.groups.filter((y) => y.id !== g.id); else x.deleted = true;
        }) }, icon("trash"))));
    }
  }
  return fold("groups", "Groepen", h("button", { class: "link", type: "button", onclick: (e) => { e.preventDefault(); newGroupSheet(edit); } }, "+ Nieuw"), true, body);
}

function peopleCard(wc, edit) {
  const list = h("div");
  const rows = wc.people.map((p) => {
    const gs = groupsOf(wc, p);
    if (p.deleted) {
      return h("div", { class: "who-row draft-deleted", "data-name": p.name.toLowerCase() },
        h("span", { class: "row-text" }, h("span", { class: "row-main struck" }, p.name), h("span", { class: "row-sub" }, "wordt verwijderd bij Opslaan")),
        h("button", { class: "btn small ghost", onclick: () => edit((w) => { w.people.find((x) => x.id === p.id).deleted = false; }) }, "Toch houden"));
    }
    const errs = p.sources.filter((src) => src.error);
    const sub = !p.sources.length ? "Geen rooster" : errs.length ? `Fout: ${errs[0].error}` : `${p.sources.length} bron(nen), bijgewerkt ${ago(p.sources.map((src) => src.last_ok).filter(Boolean).sort().pop())}`;
    return h("button", { class: `row-btn person-row ${errs.length ? "err" : ""}`, type: "button", "data-name": p.name.toLowerCase(), onclick: () => personSheet(p, wc, edit) },
      h("span", { class: "row-text" },
        h("span", { class: "row-main" }, p.name),
        h("span", { class: "row-sub" }, gs.length ? gs.map((g) => g.name).join(" · ") : "In geen enkele groep"),
        h("span", { class: "row-sub" }, `${p.devices} toestel(len) · ${sub}`)),
      icon("chevron", "ico chev"));
  });
  list.append(...rows);
  const search = wc.people.length > 8 ? h("input", { type: "search", class: "pick-search", placeholder: "Zoek iemand", "aria-label": "Zoek iemand",
    oninput: () => { const q = search.value.trim().toLowerCase(); for (const r of rows) r.hidden = !!q && !r.dataset.name.includes(q); } }) : null;
  return fold("people", "Mensen", count(wc.people.filter((p) => !p.deleted).length), true,
    [h("p", { class: "muted small" }, "Tik iemand om in één keer de groepen te kiezen."), search, list]);
}

// Eén persoon: alle groepen als aan/uit-knopjes, hernoemen, verwijderen
function personSheet(p, wc, edit) {
  const body = h("div", { class: "stack person-groups" });
  const draw = () => {
    const cur = wc.people.find((x) => x.id === p.id);
    body.replaceChildren();
    for (const kind of ["campus", "home", "friends"]) {
      const gs = wc.groups.filter((g) => g.kind === kind && !g.deleted);
      body.append(h("p", { class: "picker-group" }, KIND_LABEL[kind]));
      if (!gs.length) { body.append(h("p", { class: "muted small" }, "Nog geen groepen.")); continue; }
      body.append(h("div", { class: "chips" }, gs.map((g) => {
        const on = isMember(wc, g, cur);
        return h("button", { class: `chip ${on ? "on" : ""}`, type: "button", "aria-pressed": String(on), onclick: () => {
          edit((w) => { const k = `${g.id}:${p.id}`; if (w.members.has(k)) w.members.delete(k); else w.members.add(k); });
          draw();
        } }, on ? icon("check") : null, g.name);
      })));
    }
    body.append(h("div", { class: "row-actions sheet-row-actions" },
      h("button", { class: "btn small ghost", onclick: () => renameSheet(cur.name, (name) => edit((w) => { w.people.find((x) => x.id === p.id).name = name; })) }, icon("pencil"), "Hernoemen"),
      h("button", { class: "btn small ghost danger", onclick: () => { closeSheet(); edit((w) => { w.people.find((x) => x.id === p.id).deleted = true; }); } }, icon("trash"), "Verwijderen")),
    h("p", { class: "muted small" }, "Wordt pas bewaard als je onderaan op Opslaan tikt."),
    h("button", { class: "btn primary wide", onclick: closeSheet }, "Klaar"));
  };
  draw();
  sheet(p.name, body);
}

// Eén groep: wie zit erin (aanvinken)
function membersSheet(g, wc, edit) {
  const list = h("div", { class: "stack" });
  for (const p of wc.people.filter((x) => !x.deleted)) {
    const box = h("input", { type: "checkbox", checked: isMember(wc, g, p) });
    box.addEventListener("change", () => edit((w) => { const k = `${g.id}:${p.id}`; if (box.checked) w.members.add(k); else w.members.delete(k); }));
    list.append(h("label", { class: "check-row" }, box, h("span", null, p.name)));
  }
  sheet(g.name, h("div", null, list, h("p", { class: "muted small" }, "Wordt pas bewaard als je onderaan op Opslaan tikt."),
    h("div", { class: "sheet-actions" }, h("button", { class: "btn primary wide", onclick: closeSheet }, "Klaar"))));
}

function newGroupSheet(edit) {
  const name = h("input", { type: "text", required: true, maxlength: "80", placeholder: "Bv. AP Spoor Noord", "aria-label": "Naam" });
  const kind = h("select", { "aria-label": "Soort" },
    h("option", { value: "campus" }, "Campus"), h("option", { value: "home" }, "Woonplaats"), h("option", { value: "friends" }, "Vriendengroep"));
  const form = h("form", { class: "stack" }, h("label", { class: "field" }, h("span", null, "Naam"), name),
    h("label", { class: "field" }, h("span", null, "Soort (één van de drie)"), kind), h("button", { class: "btn primary wide", type: "submit" }, "Maken"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const n = name.value.trim();
    if (!n) return;
    closeSheet();
    edit((w) => { w.seq += 1; w.groups.push({ id: `n${w.seq}`, name: n, kind: kind.value, deleted: false, isNew: true }); });
  });
  sheet("Nieuwe groep", form);
  setTimeout(() => name.focus(), 250);
}

function renameSheet(current, save) {
  const input = h("input", { type: "text", required: true, maxlength: "80", value: current, "aria-label": "Nieuwe naam" });
  const form = h("form", { class: "stack" }, input, h("button", { class: "btn primary wide", type: "submit" }, "Wijzigen"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim();
    closeSheet();
    if (v && v !== current) save(v);
  });
  sheet("Hernoemen", form);
  setTimeout(() => input.select(), 250);
}
