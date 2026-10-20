// Home: check-in, pauzes (verzoeken), jouw dag, samen pauze, nu-bord, reizen, meldingen, iemand kiezen.
import { api } from "../api.js";
import { state, go, replaceRoute, loadMe, myPerson, isPending, isApproved, isAdmin, toast, toastError, undoToast, sheet, closeSheet } from "../app.js";
import { h, clear, fmt, names, avatar, icon, personColor, ago, store, dayLabel } from "../util.js";
import { sortGroups, sectionTitle, KIND_LABEL, knownSheet } from "./common.js";
import { checkinSheet, CHECKIN_LABEL } from "./afspreken.js";
import { plannedBreaksCard, breakRequestSheet, loadPlans, cachedPlans, planState, planPeople, planFor, PLAN_LABEL, CHANGED } from "./social.js";

export async function render(root) {
  const me = state.me;
  if (!me.device?.person && !isAdmin()) return renderOnboarding(root);
  if (isPending()) return renderPending(root);
  if (!me.device?.person && isAdmin()) {
    root.append(h("section", { class: "card" }, h("h2", null, "Wie ben jij?"),
      h("p", { class: "muted" }, "Dit toestel is admin, maar hangt nog aan niemand."), bigPicker(me.people, null, null, confirmClaim)));
    return;
  }
  const auto = state.autoStart;
  state.autoStart = false;
  const load = () => Promise.all([api.get("/home"), api.get("/breaks").catch(() => null)]);
  const [[data, breaks], groups] = await Promise.all([load(), api.get("/groups").catch(() => null)]);
  // Bij het openen van de app: niets nieuws op Home? Dan meteen naar je rooster.
  if (auto && !somethingNew(data, breaks)) {
    replaceRoute("#/rooster");
    return;
  }
  store.set("feedSeen", Math.max(store.get("feedSeen", 0), ...data.feed.map((n) => n.id)));
  await loadPlans().catch(() => {});
  let last = data;
  draw(root, data, groups);
  const redraw = (d) => {
    const y = window.scrollY;
    draw(clear(root), d, groups);
    window.scrollTo({ top: y });
  };
  // Elke minuut het nu-bord bijwerken
  const timer = setInterval(async () => {
    try {
      [last] = await load();
      await loadPlans(true);
      redraw(last);
    } catch { /* stil */ }
  }, 60000);
  // Iets gevraagd of beantwoord: de vakjes en pauzes bovenaan tonen meteen de nieuwe stand
  const onPlans = () => loadPlans(true).then(() => { if (root.isConnected) redraw(last); }).catch(() => {});
  window.addEventListener(CHANGED, onPlans);
  return () => { clearInterval(timer); window.removeEventListener(CHANGED, onPlans); };
}

// Pauze-verzoeken waarop jij nog moet antwoorden (als die API er is)
function pendingBreaks(b) {
  if (!b) return 0;
  if (typeof b.pending_for_me === "number") return b.pending_for_me;
  const list = Array.isArray(b) ? b : b.incoming || b.requests || [];
  return list.filter((r) => r.my_response === "pending").length;
}

function somethingNew(d, breaks) {
  const seen = store.get("feedSeen", 0);
  return Boolean(
    d.admin?.pending ||
    d.known_new ||
    d.feed.some((n) => n.id > seen) ||
    pendingBreaks(breaks) ||
    d.travel.some((t) => !t.pref) ||
    d.my_breaks.some((b) => b.now)
  );
}

function compareLink(ids, extra = []) {
  const q = new URLSearchParams({ ids: [...new Set(ids)].join(",") });
  if (extra.length) q.set("extra", extra.join(","));
  return `#/vergelijk?${q}`;
}

// Bovenaan in één oogopslag: wat doe jij nu, je volgende pauze samen, je plannen, wie er op campus is.
// Elk vakje springt naar het stuk eronder. Daarna vaste blokken, elk met een icoon en een titel.
function draw(root, d, groups) {
  const me = d.me;
  const plans = cachedPlans();
  const live = plans.items.filter((it) => planState(it));
  const asks = live.filter((it) => planState(it) === "ask");
  const planned = live.filter((it) => planState(it) === "planned");
  const waiting = live.filter((it) => planState(it) === "asked");
  const nextBreak = d.my_breaks.find((b) => b.end > d.now_min);
  const onCampus = d.board.filter((b) => !["geen", "absent", "home"].includes(b.code));

  const lab = dayLabel(d.today, d.today);
  root.append(h("header", { class: "home-head" },
    h("h1", null, `Hoi ${me.name}`), h("p", { class: "muted" }, lab.sub)));

  const st = d.me_status;
  const tile = (target, ico, label, main, sub, kind = "") => h("button", { type: "button", class: `glance-tile ${kind}`, onclick: () => jump(target) },
    h("span", { class: "gt-label" }, icon(ico), label), h("span", { class: "gt-main" }, main), sub ? h("span", { class: "gt-sub" }, sub) : null);
  const planMain = asks.length ? `${asks.length} ${asks.length === 1 ? "vraag" : "vragen"} aan jou`
    : planned.length ? `${planned.length} afgesproken` : waiting.length ? `Wacht op ${waiting.length}` : "Niets gepland";
  const planSub = asks.length ? `van ${names(asks.map((it) => it.from.name))}`
    : planned.length ? `${fmt(planned[0].start)} met ${names(planPeople(planned[0]).map((p) => p.name))}`
      : waiting.length ? `${fmt(waiting[0].start)} · ${names(planPeople(waiting[0]).map((p) => p.name))}` : "Tik een pauze om te vragen";
  root.append(h("nav", { class: "glance", "aria-label": "Vandaag in het kort" },
    tile("sec-day", st?.code === "pauze" ? "pause" : st?.code === "les" ? "book" : "clock", "Nu",
      st ? shortStatus(st) : (d.has_school_today ? "Vandaag les" : "Geen les"), st?.sub || null, st?.code === "pauze" ? "hot" : ""),
    tile("sec-day", "users", "Pauze samen",
      nextBreak ? `${fmt(nextBreak.start)}–${fmt(nextBreak.end)}` : "Geen meer",
      nextBreak ? `met ${names(nextBreak.people.map((p) => p.name))}` : d.has_school_today ? "vandaag" : null, nextBreak?.now ? "hot" : ""),
    tile("sec-plans", "pin", "Plannen", planMain, planSub, asks.length ? "ask" : planned.length ? "ok" : ""),
    tile("sec-now", "home", "Op campus", onCampus.length ? `${onCampus.length} ${onCampus.length === 1 ? "persoon" : "mensen"}` : "Niemand",
      onCampus.length ? names(onCampus.slice(0, 3).map((b) => b.name)) : "die je kent")));

  // Te doen: enkel als er iets is
  if (d.admin?.pending) {
    root.append(h("button", { class: "card alert-card", onclick: () => go("#/opties/admin") },
      icon("shield"), h("span", null, `${d.admin.pending} ${d.admin.pending === 1 ? "toegangsverzoek" : "toegangsverzoeken"} wachten op jou`), icon("chevron", "ico chev")));
  }
  // Wie ken je? Blijft staan tot je iets zei over iedereen buiten je vriendengroep
  if (d.known_new) {
    root.append(h("button", { class: "card known-card", onclick: () => knownSheet(() => go("#/home")) },
      h("span", { class: "row-text" },
        h("span", { class: "row-main" }, "Wie ken je nog?"),
        h("span", { class: "row-sub" }, `${d.known_new} ${d.known_new === 1 ? "iemand" : "mensen"} buiten je vriendengroep. Wie je kent, kan je vergelijken.`)),
      icon("chevron", "ico chev")));
  }
  root.append(checkinCard(d));

  // Plannen: vragen aan jou, wat afgesproken is, waar je op wacht (vult zichzelf in)
  const planSlot = h("div", { class: "planned-slot", id: "sec-plans" });
  root.append(planSlot);
  plannedBreaksCard({ title: "Plannen" }).then((el) => {
    if (el) { el.id = "sec-plans"; el.querySelector(".sec-title h2")?.prepend(secIcon("pin")); el.classList.add("home-sec"); planSlot.replaceWith(el); } else planSlot.remove();
  }).catch(() => planSlot.remove());

  // Jouw pauzes vandaag: met wie, en of je al iets vroeg
  const day = h("section", { class: "card home-sec", id: "sec-day" }, secHead("pause", "Jouw pauzes vandaag", h("a", { class: "link", href: "#/rooster" }, "Rooster")));
  if (!d.has_school_today) day.append(h("p", { class: "big-line" }, "Geen les vandaag"));
  for (const b of d.my_breaks) {
    const who = names(b.people.map((p) => p.name));
    const plan = planFor({ day: d.today, start: b.start, end: b.end, ids: b.people.map((p) => p.id) });
    day.append(h("div", { class: `break-line ${b.now ? "now" : ""}` },
      h("button", { class: "break-row", onclick: () => go(compareLink([me.id, ...b.people.map((p) => p.id)])) },
        h("span", { class: "time" }, `${fmt(b.start)}–${fmt(b.end)}`),
        h("span", { class: "who" }, b.now ? `Nu met ${who}` : who,
          !b.same_campus ? h("span", { class: "tag" }, "andere campus") : null)),
      plan
        ? h("button", { class: `plan-chip k-${plan.state} home-ask`, type: "button", onclick: () => breakRequestSheet({ people: b.people, day: d.today, start: b.start, end: b.end }) },
          PLAN_LABEL[plan.state])
        : h("button", { class: "btn small ghost home-ask", type: "button", "aria-label": `Pauze samen vragen aan ${who}`,
          onclick: () => breakRequestSheet({ people: b.people, day: d.today, start: b.start, end: b.end, onDone: () => go("#/home") }) }, "Vraag")));
  }
  if (!d.my_breaks.length && d.has_school_today) day.append(h("p", { class: "muted" }, "Vandaag (nog) geen pauze samen met iemand."));
  // Alle samen-pauzes per campus: ingeklapt (meestal te veel om te lezen)
  if (d.together.length) {
    const fold = h("details", { class: "home-fold" }, h("summary", null, `Alle samen-pauzes vandaag · ${d.summary} mensen`, icon("chevron", "ico chev")));
    for (const w of d.together) {
      const ppl = names(w.people.map((p) => p.name));
      fold.append(h("button", { class: `together-row ${w.mine ? "mine" : ""} ${w.now ? "now" : ""}`, onclick: () => go(compareLink(w.people.map((p) => p.id), w.extra.map((p) => p.id))) },
        h("span", { class: "tw-head" }, h("span", { class: "campus" }, w.campus), h("span", { class: "time" }, `${w.now ? "nu · " : ""}${fmt(w.start)}–${fmt(w.end)}`)),
        h("span", { class: "tw-who" }, ppl),
        w.extra.length ? h("span", { class: "tw-extra" }, `Kunnen ook mee: ${names(w.extra.map((p) => p.name))}`) : null));
    }
    day.append(fold);
  }
  root.append(day);

  // Nu-bord: iedereen die je kent; tik = vergelijken, 'Chillen?' = vraag het met een melding
  if (d.board.length) root.append(nowCard(d));

  // Samen reizen: zelf gekozen reismaatjes groot, de rest klein
  const travel = d.travel || [];
  if (travel.length) root.append(travelCard(d, travel));

  // Meldingen: de laatste 3, de rest achter 'Toon alle'
  if (d.feed.length) {
    const feed = h("section", { class: "card home-sec", id: "sec-feed" }, secHead("bell", "Meldingen", h("span", { class: "muted small" }, String(d.feed.length))));
    d.feed.slice(0, 3).forEach((n) => feed.append(feedItem(n, me)));
    if (d.feed.length > 3) {
      const more = h("button", { type: "button", class: "link small feed-more", onclick: () => {
        more.remove();
        d.feed.slice(3).forEach((n) => feed.append(feedItem(n, me)));
      } }, `Toon alle ${d.feed.length}`);
      feed.append(more);
    }
    root.append(feed);
  }

  // Bekijk rooster van ... (ingeklapt)
  if (groups) {
    root.append(h("details", { class: "card home-sec home-fold-card" },
      h("summary", null, secHead("rooster", "Rooster van iemand bekijken"), icon("chevron", "ico chev")),
      bigPicker(groups.people, groups, me.id)));
  }

  root.append(h("p", { class: "credit" }, "App is gemaakt en bijgehouden door Reda. Volledig gratis."));
}

const secIcon = (name) => h("span", { class: "sec-ico" }, icon(name));
const secHead = (ico, text, extra) => h("div", { class: "sec-title" }, h("h2", null, secIcon(ico), text), extra || null);

// "Heeft nog les tot 12:15" -> "Les tot 12:15" (het vakje is klein)
function shortStatus(st) {
  return st.text.replace(/^Heeft nog les/, "Les").replace(/^Heeft pauze/, "Pauze").replace(/ in Antwerpen/, "");
}

// Naar een blok springen en het even laten oplichten
function jump(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.remove("flash-sec");
  void el.offsetWidth;
  el.classList.add("flash-sec");
}

// ---- Nu-bord -------------------------------------------------------------------------
function nowCard(d) {
  const me = d.me;
  const active = d.board.filter((b) => !["geen", "absent", "home"].includes(b.code));
  const board = h("section", { class: "card now-card home-sec", id: "sec-now" }, secHead("home", "Op campus",
    active.length ? h("a", { class: "link", href: compareLink([me.id, ...active.slice(0, 7).map((b) => b.id)]) }, "Vergelijk") : null));
  const list = h("ul", { class: "board" });
  for (const b of d.board) {
    const ping = b.can_ping ? h("button", { class: "btn small ping-btn", type: "button", "aria-label": `Vraag ${b.name} om te chillen`, onclick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const r = await api.post("/ping", { to_id: b.id, kind: "chill" });
        btn.replaceChildren(icon("check"), "Gevraagd");
        toast(r.message || `${b.name} krijgt een melding.`);
      } catch (err) { btn.disabled = false; toastError(err); }
    } }, icon("sun"), "Chillen?") : null;
    list.append(h("li", { class: `st-${b.code} ${b.friend ? "friend" : ""}` },
      h("button", { class: "b-main", type: "button", onclick: () => go(compareLink([me.id, b.id])), "aria-label": `Vergelijk met ${b.name}` },
        avatar(b, "sm"),
        h("span", { class: "b-who" },
          h("span", { class: "b-name" }, b.name),
          h("span", { class: "b-text" }, b.text + (b.with ? ` met ${b.with}` : "")),
          b.sub ? h("span", { class: "b-sub" }, b.sub) : null)),
      ping));
  }
  board.append(list);
  return board;
}

// ---- Samen reizen -----------------------------------------------------------------------
function travelCard(d, travel) {
  const tr = h("section", { class: "card home-sec" }, secHead("afspreken", "Samen reizen"));
  const text = (t) => {
    const when = t.day === d.today ? "Vandaag" : "Morgen";
    return t.kind === "heen"
      ? `${when} naar school met ${t.other.name} (jij ${fmt(t.time)}, ${t.other.name} ${fmt(t.their_time)})`
      : `${when} samen naar huis met ${t.other.name} (jij ${fmt(t.time)}, ${t.other.name} ${fmt(t.their_time)})`;
  };
  for (const t of travel) {
    if (t.buddy) {
      tr.append(h("div", { class: "travel buddy" }, avatar(t.other),
        h("span", { class: "row-text" },
          h("span", { class: "row-main" }, `${t.day === d.today ? "Vandaag" : "Morgen"} ${t.kind === "heen" ? "naar school" : "naar huis"} met ${t.other.name}`),
          h("span", { class: "row-sub" }, `Jij ${fmt(t.time)} · ${t.other.name} ${fmt(t.their_time)} · reismaatje`))));
      continue;
    }
    tr.append(h("div", { class: "travel small-travel" }, h("p", null, text(t)),
      t.pref ? null : h("span", { class: "travel-acts" },
        h("button", { class: "link small", onclick: (e) => travelPref(e, t.other, "always") }, "Reismaatje"),
        h("button", { class: "link small muted-link", onclick: (e) => travelPref(e, t.other, "never") }, "Niet meer"))));
  }
  return tr;
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
      } }, "Nee")),
    h("p", { class: "muted small ci-hint" }, "Je vriendengroep krijgt een melding als je wil chillen."));
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

// ---- Meldingen ---------------------------------------------------------------------
// Icoontje per soort: schild = toegang/toestellen, potlood = roosterwijziging, pauze = samen pauze
const FEED_ICON = {
  toegang: "shield", apparaat: "shield", cert: "shield", admin: "shield",
  wijziging: "pencil",
  pauze_nu: "pause", pauze_wijzig: "pause", andere_campus: "pause", pauze_verzoek: "pause", ochtend: "pause",
  blijven: "sun", chill_vraag: "sun",
  afspraak: "pin", reizen: "home", chat: "chat", test: "bell",
};

const side = (x) => `${x.title} · ${fmt(x.start)}–${fmt(x.end)}${x.location ? " · " + x.location : ""}`;

// Roosterwijziging: enkel oud → nieuw (vak, uur, lokaal)
function changeBody(c) {
  if (c.type === "vervallen" && c.was) return h("span", { class: "f-body chg" }, h("s", null, side(c.was)), h("b", { class: "chg-tag" }, "vervalt"));
  if (c.type === "nieuw" && c.new) return h("span", { class: "f-body chg" }, h("span", null, side(c.new)), h("b", { class: "chg-tag" }, "nieuw"));
  if (c.old && c.new) return h("span", { class: "f-body chg" }, h("s", null, side(c.old)), h("span", null, "→ ", side(c.new)));
  return null;
}

function feedItem(n, me) {
  const p = n.payload || {};
  const open = () => {
    if (p.open === "vergelijk" && p.people?.length) go(compareLink(p.people, p.extra || []));
    else if (p.open === "afspreken" || p.open === "pauzes") go("#/afspreken");
    else if (p.open === "chat" && p.chat) go(`#/chat/${p.chat}`);
    else if (p.open === "admin") go("#/opties/admin");
    else if (p.open === "admin-cert") go("#/opties/admin?cert=1");
    else if (p.open === "rooster") go("#/rooster");
  };
  const clickable = p.open && p.open !== "home";
  const item = h(clickable ? "button" : "div", { class: `feed-item k-${n.kind}`, onclick: clickable ? open : null },
    h("span", { class: "f-ico-wrap" }, icon(FEED_ICON[n.kind] || "bell", "ico f-ico")),
    h("span", { class: "f-content" },
      h("span", { class: "f-title" }, n.title, h("span", { class: "f-time" }, ago(n.created))),
      (p.change && changeBody(p.change)) || h("span", { class: "f-body" }, n.body)));
  if (p.undo) {
    item.querySelector(".f-content").append(h("button", { class: "btn small ghost", onclick: async (e) => {
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
      const label = [g.name, h("span", { class: "muted" }, ` · ${KIND_LABEL[g.kind]}`)];
      // Met wie je bent (meId): tik op de groep om iedereen ervan te vergelijken
      const ids = g.members.filter((id) => people.some((p) => p.id === id));
      wrap.append(meId && ids.length > 1
        ? h("button", { class: "picker-group group-cmp", type: "button", onclick: () => go(compareLink(ids.includes(meId) ? [meId, ...ids] : ids)) },
          ...label, h("span", { class: "gc-go" }, "Vergelijk groep"))
        : h("p", { class: "picker-group" }, ...label));
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
