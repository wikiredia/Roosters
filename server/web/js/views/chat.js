// Chat: je vriendengroep (vastgepind), je woonplaats, en losse gesprekken.
// Routes: #/chat (lijst), #/chat/<chatId>, #/chat/dm/<personId> (opent of maakt een gesprek).
// Gebeurtenissen ("Reda stopt nu met de les") staan als klein blokje in het midden; die geven geen
// pushmelding, enkel het rode bolletje. Pushmeldingen voor berichten: per chat met de bel (standaard uit).
import { api } from "../api.js";
import {
  go, replaceRoute, myPerson, toast, toastError, sheet, closeSheet, showError, refreshBadge, setBadge,
  pushSupport, pushEnabled, enablePush,
} from "../app.js";
import { h, clear, icon, avatar, names, brusselsDate, store, personColor } from "../util.js";
import { emptyState } from "./common.js";
import { personSheet } from "./social.js";

const POLL_MS = 4000;
const LIST_POLL_MS = 10000;

export async function render(root, { parts }) {
  if (!myPerson()) {
    root.append(emptyState("Kies eerst wie je bent", "Op Home kies je je naam.", h("a", { class: "btn", href: "#/home" }, "Naar Home")));
    return;
  }
  if (parts[0] === "dm" && Number(parts[1])) return openDm(root, Number(parts[1]));
  if (Number(parts[0])) return conversation(root, Number(parts[0]));
  return list(root);
}

// ---- Kleine hulpjes ------------------------------------------------------------------

const timeFmt = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" });
const hhmm = (iso) => timeFmt.format(new Date(iso));

function dayKey(iso) {
  return brusselsDate(new Date(iso));
}

function dayTitle(key, today) {
  const d = new Date(key + "T12:00:00Z"), t = new Date(today + "T12:00:00Z");
  const diff = Math.round((t - d) / 86400000);
  if (diff === 0) return "Vandaag";
  if (diff === 1) return "Gisteren";
  const opts = diff < 7 ? { weekday: "long" } : { weekday: "short", day: "numeric", month: "long" };
  const s = new Intl.DateTimeFormat("nl-BE", { ...opts, timeZone: "UTC" }).format(d);
  return s[0].toUpperCase() + s.slice(1);
}

// Tijd in de lijst: vandaag het uur, anders de dag
function shortWhen(iso, today) {
  const key = dayKey(iso);
  if (key === today) return hhmm(iso);
  return dayTitle(key, today);
}

// Punaise (vastgepind): geen icoon in util.js, dus hier zelf getekend
function pinIcon() {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", "ico chat-pin");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", "M9 3h6l-1 6 4 4H6l4-4zM12 13v8");
  s.append(p);
  return s;
}

function chatAvatar(c) {
  if (c.type === "dm" && c.other) return avatar(c.other);
  return h("span", { class: `avatar chat-group-av ${c.type}`, "aria-hidden": "true" }, icon(c.type === "home" ? "home" : "users"));
}

function preview(c) {
  const m = c.last;
  if (!m) return c.type === "home" ? "Samen naar huis of naar school? Laat het hier weten." : "Nog niets gezegd.";
  if (m.kind === "event") return m.body;
  const who = m.mine ? "Jij" : c.type === "dm" ? "" : m.person?.name || "";
  return who ? `${who}: ${m.body}` : m.body;
}

// ---- Lijst ---------------------------------------------------------------------------

async function list(root) {
  const holder = h("div", { class: "chat-list-wrap" });
  root.append(h("div", { class: "pick-top" }, h("h1", null, "Chat")), holder);
  const draw = (data) => {
    clear(holder);
    setBadge("chat", data.chats.reduce((n, c) => n + c.unread, 0));
    const groups = data.chats.filter((c) => c.type !== "dm");
    const dms = data.chats.filter((c) => c.type === "dm");
    if (!data.chats.length) {
      holder.append(emptyState("Nog geen groepschat",
        "Zodra je in een vriendengroep of woonplaats zit (Opties → Mijn groepen), chat je hier met de groep.",
        h("button", { class: "btn", onclick: newChatSheet }, icon("plus"), "Nieuw gesprek")));
      return;
    }
    if (groups.length) holder.append(h("section", { class: "card chat-card" }, groups.map((c) => chatRow(c, data.today))));
    if (dms.length) {
      holder.append(h("p", { class: "picker-group chat-sub" }, "Gesprekken"),
        h("section", { class: "card chat-card dms" }, dms.map((c) => chatRow(c, data.today))));
    }
    holder.append(h("p", { class: "chat-new" }, h("button", { type: "button", class: "link small", onclick: newChatSheet }, icon("plus"), "Nieuw gesprek")));
  };
  const load = async () => {
    const data = await api.get("/chat");
    data.today = brusselsDate();
    return data;
  };
  try {
    draw(await load());
  } catch (e) {
    showError(holder, e);
    return;
  }
  const timer = setInterval(async () => {
    if (document.hidden) return;
    try { draw(await load()); } catch { /* stil */ }
  }, LIST_POLL_MS);
  return () => clearInterval(timer);
}

function chatRow(c, today) {
  return h("button", { type: "button", class: `chat-row ${c.unread ? "unread" : ""} t-${c.type}`, onclick: () => go(`#/chat/${c.id}`) },
    chatAvatar(c),
    h("span", { class: "row-text" },
      h("span", { class: "chat-row-top" },
        h("span", { class: "row-main" }, c.title),
        c.pinned ? pinIcon() : null,
        c.push ? icon("bell", "ico chat-bell-on") : null,
        h("span", { class: "chat-when" }, c.last ? shortWhen(c.last.created, today) : "")),
      h("span", { class: "chat-row-bottom" },
        h("span", { class: `row-sub chat-preview ${c.last?.kind === "event" ? "ev" : ""}` }, preview(c)),
        c.unread ? h("span", { class: "chat-count", "aria-label": `${c.unread} ongelezen` }, c.unread > 99 ? "99+" : String(c.unread)) : null)));
}

// Nieuw gesprek: enkel wie je kent, rustig onderaan (niet in je gezicht)
async function newChatSheet() {
  let data;
  try { data = await api.get("/groups?known=1"); } catch (e) { toastError(e); return; }
  const me = myPerson();
  const people = data.people.filter((p) => p.id !== me.id);
  const listEl = h("div", { class: "chat-people" }, people.map((p) =>
    h("button", { type: "button", class: "pick-row", onclick: () => { closeSheet(); go(`#/chat/dm/${p.id}`); } },
      h("span", { class: "pick-av" }, avatar(p)), h("span", { class: "pick-name" }, p.name))));
  const search = people.length > 8 ? h("input", { type: "search", class: "pick-search", placeholder: "Zoek iemand", "aria-label": "Zoek iemand",
    oninput: () => { const q = search.value.trim().toLowerCase(); people.forEach((p, i) => { listEl.children[i].hidden = !!q && !p.name.toLowerCase().includes(q); }); } }) : null;
  sheet("Nieuw gesprek", h("div", null,
    people.length ? h("p", { class: "muted small" }, "Een gesprek met één persoon. Je ziet hier wie je kent.") : h("p", { class: "muted" }, "Nog niemand die je kent."),
    search, listEl));
  if (search) setTimeout(() => search.focus(), 250);
}

async function openDm(root, pid) {
  try {
    const r = await api.post(`/chat/dm/${pid}`);
    replaceRoute(`#/chat/${r.id}`);
  } catch (e) {
    showError(root, e);
    root.append(h("p", { class: "chat-new" }, h("a", { class: "link", href: "#/chat" }, "Naar Chat")));
  }
}

// ---- Gesprek ---------------------------------------------------------------------------

async function conversation(root, chatId) {
  const me = myPerson();
  let first;
  try {
    first = await api.get(`/chat/${chatId}/messages`);
  } catch (e) {
    showError(root, e);
    root.append(h("p", { class: "chat-new" }, h("a", { class: "link", href: "#/chat" }, "Terug naar Chat")));
    return;
  }
  const chat = first.chat;
  const today = brusselsDate();
  const nameOf = new Map([[me.id, me.name], ...chat.members.map((m) => [m.id, m.name])]);
  let msgs = first.messages;
  const ids = new Set(msgs.map((m) => m.id));
  let more = first.more;
  let readUpto = first.last_read;
  // 'Nieuw'-streep: vanaf het eerste ongelezen bericht van iemand anders (enkel bij openen)
  const newFrom = msgs.find((m) => m.id > first.last_read && !m.mine)?.id || null;

  root.classList.add("chat-open");
  const log = h("div", { class: "chat-log", role: "log", "aria-live": "polite", "aria-label": "Berichten" });
  const input = h("textarea", { class: "chat-input", rows: "1", maxlength: "2000", placeholder: "Bericht", "aria-label": "Bericht" });
  const sendBtn = h("button", { type: "button", class: "chat-send", "aria-label": "Versturen", disabled: true }, icon("send"));
  const bell = h("button", { type: "button", class: "icon-btn chat-bell" });
  const head = h("header", { class: "chat-head" },
    h("button", { type: "button", class: "icon-btn", "aria-label": "Terug naar Chat", onclick: () => go("#/chat") }, icon("back")),
    chatAvatar(chat),
    h("span", { class: "row-text" },
      h("span", { class: "row-main chat-title" }, chat.title, chat.pinned ? pinIcon() : null),
      h("span", { class: "row-sub chat-members" }, chat.type === "dm" ? "Gesprek met jullie twee" : names(chat.members.map((m) => (m.id === me.id ? "jij" : m.name))))),
    h("button", { type: "button", class: "icon-btn", "aria-label": "Roosters vergelijken", title: "Roosters vergelijken",
      onclick: () => go(`#/vergelijk?ids=${[...new Set([me.id, ...chat.members.map((m) => m.id)])].join(",")}`) }, icon("vergelijk")),
    bell);
  const screen = h("div", { class: "chat-screen" }, head, log,
    h("form", { class: "chat-compose", onsubmit: (e) => { e.preventDefault(); send(); } }, input, sendBtn));
  root.append(screen);

  // ---- Bel: pushmeldingen voor deze chat (standaard uit) ----
  let push = chat.push;
  const drawBell = () => {
    clear(bell).append(icon(push ? "bell" : "bellOff"));
    bell.classList.toggle("on", push);
    bell.setAttribute("aria-pressed", String(push));
    bell.setAttribute("aria-label", push ? "Meldingen voor deze chat uitzetten" : "Meldingen voor deze chat aanzetten");
    bell.title = push ? "Meldingen aan voor deze chat" : "Meldingen uit (tik om aan te zetten)";
  };
  drawBell();
  bell.addEventListener("click", async () => {
    const next = !push;
    try {
      if (next && pushSupport().ok && !(await pushEnabled().catch(() => false))) await enablePush();
    } catch (e) {
      toast(e.message, { kind: "error" });
    }
    try {
      await api.post(`/chat/${chatId}/push`, { on: next });
      push = next;
      drawBell();
      const why = pushSupport();
      toast(push ? (why.ok ? `Je krijgt een melding bij nieuwe berichten in ${chat.title}` : `Aan, maar: ${why.why}`) : "Geen meldingen meer voor deze chat");
    } catch (e) { toastError(e); }
  });

  // ---- Berichten tekenen ----
  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const drawLog = ({ keep = false, toBottom = false } = {}) => {
    const oldHeight = log.scrollHeight, oldTop = log.scrollTop, stick = toBottom || nearBottom();
    clear(log);
    if (more) {
      log.append(h("p", { class: "chat-more" }, h("button", { type: "button", class: "link small", onclick: loadOlder }, "Oudere berichten")));
    } else if (!msgs.length) {
      log.append(h("div", { class: "chat-empty" },
        h("p", { class: "empty-title" }, chat.type === "dm" ? `Zeg hoi tegen ${chat.title}` : `Welkom in ${chat.title}`),
        h("p", { class: "muted small" }, chat.type === "dm"
          ? "Enkel jullie twee zien dit gesprek."
          : "Wat de groep aangaat (wie stopt met de les, wie wil chillen, wie samen pauze neemt) verschijnt hier vanzelf.")));
    }
    let prev = null;
    for (const m of msgs) {
      const key = dayKey(m.created);
      if (!prev || dayKey(prev.created) !== key) log.append(h("div", { class: "chat-day" }, h("span", null, dayTitle(key, today))));
      if (m.id === newFrom) log.append(h("div", { class: "chat-new-line" }, h("span", null, "Nieuw")));
      if (m.kind === "event") {
        log.append(eventBlock(m));
        prev = m;
        continue;
      }
      const sameAsPrev = prev && prev.kind === "text" && prev.person?.id === m.person?.id && dayKey(prev.created) === key
        && new Date(m.created) - new Date(prev.created) < 5 * 60000 && m.id !== newFrom;
      log.append(bubble(m, chat.type !== "dm" && !m.mine && !sameAsPrev, sameAsPrev));
      prev = m;
    }
    if (keep) log.scrollTop = oldTop + (log.scrollHeight - oldHeight);
    else if (stick) log.scrollTop = log.scrollHeight;
  };

  const bubble = (m, showName, grouped) => {
    const b = h("div", { class: `chat-msg ${m.mine ? "mine" : "theirs"} ${grouped ? "grouped" : ""}`, "data-id": m.id },
      !m.mine && chat.type !== "dm" ? (grouped ? h("span", { class: "chat-av-space" }) : avatar(m.person || { id: 0, name: "?" }, "xs")) : null,
      h("div", { class: "chat-bubble", tabindex: m.mine ? "0" : null, role: m.mine ? "button" : null,
        "aria-label": m.mine ? "Jouw bericht, tik voor opties" : null,
        onclick: m.mine ? () => ownMessageSheet(m) : null,
        onkeydown: m.mine ? (e) => { if (e.key === "Enter") ownMessageSheet(m); } : null },
      showName ? h("span", { class: "chat-name", style: { color: personColor(m.person?.id || 0) } }, m.person?.name || "") : null,
      h("span", { class: "chat-text" }, m.body),
      h("span", { class: "chat-time" }, hhmm(m.created))));
    return b;
  };

  const eventBlock = (m) => {
    const p = m.payload || {};
    const people = (p.people || []).filter((id) => nameOf.has(id) || id === me.id);
    const others = people.filter((id) => id !== me.id);
    const tappable = p.open === "pauzes" || people.length > 0;
    const open = () => {
      if (p.open === "pauzes") return go("#/afspreken");
      if (others.length === 1) return personSheet({ id: others[0], name: nameOf.get(others[0]) }, { day: p.day, start: p.start, end: p.end });
      go(`#/vergelijk?ids=${[...new Set([me.id, ...people])].join(",")}`);
    };
    return h("div", { class: "chat-event-row", "data-id": m.id },
      h(tappable ? "button" : "div", { type: tappable ? "button" : null, class: "chat-event", onclick: tappable ? open : null },
        h("span", null, m.body), h("span", { class: "chat-time" }, hhmm(m.created))));
  };

  const ownMessageSheet = (m) => {
    sheet("Jouw bericht", h("div", { class: "stack" },
      h("p", { class: "chat-quote" }, m.body),
      h("button", { class: "btn wide", onclick: async () => {
        try { await navigator.clipboard.writeText(m.body); toast("Gekopieerd"); } catch { toast("Kopiëren lukte niet"); }
        closeSheet();
      } }, icon("copy"), "Kopiëren"),
      h("button", { class: "btn wide ghost danger", onclick: async () => {
        try {
          await api.del(`/chat/${chatId}/messages/${m.id}`);
          msgs = msgs.filter((x) => x.id !== m.id);
          closeSheet();
          drawLog({ keep: true });
        } catch (e) { toastError(e); }
      } }, icon("trash"), "Verwijderen voor iedereen")));
  };

  const add = (list) => {
    let added = false;
    for (const m of list) {
      if (ids.has(m.id)) continue;
      ids.add(m.id);
      msgs.push(m);
      added = true;
    }
    if (added) msgs.sort((a, b) => a.id - b.id);
    return added;
  };

  async function loadOlder() {
    if (!msgs.length) return;
    try {
      const r = await api.get(`/chat/${chatId}/messages?before=${msgs[0].id}`);
      more = r.more;
      for (const m of r.messages) if (!ids.has(m.id)) { ids.add(m.id); msgs.unshift(m); }
      msgs.sort((a, b) => a.id - b.id);
      drawLog({ keep: true });
    } catch (e) { toastError(e); }
  }

  // ---- Gelezen ----
  const markRead = async () => {
    const top = msgs.length ? msgs[msgs.length - 1].id : 0;
    if (document.hidden || top <= readUpto || !nearBottom()) return;
    readUpto = top;
    try { await api.post(`/chat/${chatId}/read`, { upto: top }); } catch { /* stil */ }
    refreshBadge();
  };
  log.addEventListener("scroll", () => {
    if (log.scrollTop < 40 && more) loadOlder();
    markRead();
  }, { passive: true });

  // ---- Versturen ----
  const draftKey = `chat.draft.${chatId}`;
  input.value = store.get(draftKey, "") || "";
  const grow = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(140, input.scrollHeight)}px`;
    sendBtn.disabled = !input.value.trim();
  };
  input.addEventListener("input", () => { grow(); store.set(draftKey, input.value); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  let sending = false;
  async function send() {
    const text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    sendBtn.disabled = true;
    try {
      const r = await api.post(`/chat/${chatId}/messages`, { body: text });
      input.value = "";
      store.set(draftKey, "");
      grow();
      add([r.message]);
      readUpto = Math.max(readUpto, r.message.id);
      drawLog({ toBottom: true });
    } catch (e) {
      toastError(e);
    } finally {
      sending = false;
      sendBtn.disabled = !input.value.trim();
      input.focus();
    }
  }

  // ---- Hoogte: het gesprek vult het scherm, enkel de berichten scrollen ----
  const fit = () => {
    const vh = window.visualViewport?.height || window.innerHeight;
    const top = screen.getBoundingClientRect().top + window.scrollY - (window.visualViewport?.offsetTop || 0);
    const tabs = document.querySelector(".tabs");
    let bottom = 0;
    if (tabs && getComputedStyle(tabs).display !== "none") {
      const r = tabs.getBoundingClientRect();
      if (r.height && r.top > window.innerHeight / 2) bottom = window.innerHeight - r.top;
    }
    screen.style.height = `${Math.max(260, vh - top - bottom - 10)}px`;
  };
  fit();
  grow();
  drawLog({ toBottom: true });
  requestAnimationFrame(() => { fit(); log.scrollTop = log.scrollHeight; markRead(); });
  if (!("ontouchstart" in window)) input.focus();

  const onResize = () => { const stick = nearBottom(); fit(); if (stick) log.scrollTop = log.scrollHeight; };
  window.addEventListener("resize", onResize);
  window.visualViewport?.addEventListener("resize", onResize);

  // ---- Nieuwe berichten ophalen zolang de chat open is ----
  let busy = false;
  const poll = async () => {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const top = msgs.length ? msgs[msgs.length - 1].id : 0;
      const r = await api.get(`/chat/${chatId}/messages?after=${top}`);
      const gone = r.deleted.filter((id) => ids.has(id));
      if (gone.length) msgs = msgs.filter((m) => !gone.includes(m.id));
      if (add(r.messages) || gone.length) drawLog();
      markRead();
    } catch { /* stil, volgende keer opnieuw */ }
    busy = false;
  };
  const timer = setInterval(poll, POLL_MS);
  const onVisible = () => { if (!document.hidden) poll(); };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(timer);
    window.removeEventListener("resize", onResize);
    window.visualViewport?.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisible);
    root.classList.remove("chat-open");
  };
}
