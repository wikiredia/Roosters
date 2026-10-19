// Rooster van één persoon: vandaag en de volgende twee lesdagen, horizontaal swipen.
import { api } from "../api.js";
import { state, go, myPerson, toast, toastError, showError } from "../app.js";
import { h, clear, fmt, dur, icon, ago, brusselsMinutes, store } from "../util.js";
import { dayScroller, lessonSheet, emptyState } from "./common.js";

export async function render(root, { parts }) {
  const mine = myPerson();
  const pid = Number(parts[0]) || mine?.id || store.get("lastViewed");
  if (!pid) {
    root.append(emptyState("Kies eerst wie je bent", "Op Home kies je je naam.", h("a", { class: "btn", href: "#/home" }, "Naar Home")));
    return;
  }
  store.set("lastViewed", pid);

  const head = h("div", { class: "toolbar" });
  const body = h("div");
  root.append(head, body);

  // Kies wiens rooster (jij bovenaan)
  const people = [...(state.me.people || [])].sort((a, b) => (a.id === mine?.id ? -1 : b.id === mine?.id ? 1 : a.name.localeCompare(b.name)));
  const select = h("select", { class: "person-select", "aria-label": "Wiens rooster", onchange: () => go(`#/rooster/${select.value}`) },
    people.map((p) => h("option", { value: p.id, selected: p.id === pid }, p.id === mine?.id ? `${p.name} (jij)` : p.name)));
  const refreshBtn = h("button", { class: "icon-btn refresh", "aria-label": "Rooster opnieuw ophalen" }, icon("refresh"));
  const updated = h("span", { class: "updated" });
  head.classList.add("rooster-bar");
  head.append(h("div", { class: "select-wrap" }, select, updated), refreshBtn);

  let data;
  const load = async () => {
    data = await api.get(`/schedule/${pid}`);
    draw();
  };

  const draw = (flash = new Set()) => {
    clear(body);
    updated.textContent = data.updated ? `bijgewerkt ${ago(data.updated)}` : "";
    const errors = data.sources.filter((s) => s.error);
    if (!data.sources.length) {
      body.append(emptyState(
        pid === mine?.id ? "Je hebt nog geen rooster toegevoegd" : `${data.person.name} heeft nog geen rooster toegevoegd`,
        pid === mine?.id ? "Voeg je Untis-klas, Google- of iCloud-agenda toe." : null,
        pid === mine?.id ? h("a", { class: "btn primary", href: "#/opties" }, "Rooster toevoegen") : null));
      return;
    }
    body.append(dayScroller(data.days, data.today, (d) => dayList(d, data, flash)));
    for (const s of errors) body.append(h("p", { class: "source-error" }, `${s.label}: ${s.error}`));
  };

  const refresh = async () => {
    if (refreshBtn.classList.contains("busy")) return;
    refreshBtn.classList.add("busy");
    root.classList.add("refreshing");
    const before = new Map();
    for (const d of data?.days || []) for (const l of d.lessons) before.set(l.id, `${l.start}-${l.end}-${l.state}-${l.location}`);
    try {
      const r = await api.post(`/refresh/${pid}`);
      data = await api.get(`/schedule/${pid}`);
      const flash = new Set();
      for (const d of data.days) for (const l of d.lessons) {
        if (before.get(l.id) !== `${l.start}-${l.end}-${l.state}-${l.location}`) flash.add(l.id);
      }
      draw(r.changes ? flash : new Set());
      updated.classList.add("pulse");
      setTimeout(() => updated.classList.remove("pulse"), 1200);
      if (r.errors?.length) toast(`Niet alles gelukt: ${r.errors[0].error}`, { kind: "error" });
      else if (r.skipped) toast("Net nog vernieuwd · alles is up-to-date");
      else toast(r.changes ? `Bijgewerkt · ${r.changes} ${r.changes === 1 ? "wijziging" : "wijzigingen"}` : "Bijgewerkt · alles is up-to-date");
    } catch (e) {
      toastError(e);
    } finally {
      refreshBtn.classList.remove("busy");
      root.classList.remove("refreshing");
    }
  };
  refreshBtn.addEventListener("click", refresh);

  try {
    await load();
  } catch (e) {
    showError(body, e);
    return;
  }
  return pullToRefresh(root, refresh);
}

function dayList(d, data, flash) {
  const list = h("div", { class: "lessons" });
  const isToday = d.day === data.today;
  const now = brusselsMinutes();
  const lessons = d.lessons;
  if (!lessons.length) {
    list.append(h("div", { class: "no-class" }, isToday ? "Geen les vandaag" : "Geen les"));
    return list;
  }
  let prevEnd = null;
  for (const l of lessons) {
    const active = l.state !== "cancelled" && l.state !== "removed";
    if (prevEnd != null && active && l.start > prevEnd) {
      list.append(h("div", { class: "gap" }, h("span", null, `Pauze · ${dur(l.start - prevEnd)}`)));
    }
    const isNow = isToday && active && l.start <= now && now < l.end;
    const badge = { cancelled: "Vervalt", removed: "Vervallen", changed: "Gewijzigd", extra: "Extra", exam: "Examen" }[l.state];
    list.append(h("button", {
      class: `lesson s-${l.state} ${l.changed ? "changed" : ""} ${isNow ? "now" : ""} ${flash.has(l.id) ? "flash" : ""} ${isToday && l.end <= now ? "past" : ""}`,
      type: "button",
      onclick: () => lessonSheet(l.id, l),
    },
      h("span", { class: "l-time" }, h("b", null, fmt(l.start)), h("span", null, fmt(l.end))),
      h("span", { class: "l-main" },
        h("span", { class: "l-title" }, l.title),
        l.location ? h("span", { class: "l-loc" }, l.location) : null),
      badge ? h("span", { class: "badge" }, badge) : (l.changed ? h("span", { class: "badge new" }, "Nieuw") : null),
      isNow ? h("span", { class: "now-pill" }, "nu") : null));
    if (active) prevEnd = Math.max(prevEnd ?? 0, l.end);
  }
  if (isToday && data.checkin && ["chilling", "want_chill"].includes(data.checkin.status)) {
    list.append(h("div", { class: "gap chill" }, h("span", null,
      `Blijft daarna in Antwerpen${data.checkin.until_min ? ` tot ${fmt(data.checkin.until_min)}` : ""}`)));
  }
  return list;
}

// Naar beneden trekken bovenaan de pagina = vernieuwen
export function pullToRefresh(root, onRefresh) {
  const ind = h("div", { class: "ptr" }, icon("refresh"));
  root.prepend(ind);
  let y0 = null, dy = 0;
  const start = (e) => { if (window.scrollY <= 0) { y0 = e.touches[0].clientY; dy = 0; } };
  const move = (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0 && window.scrollY <= 0) {
      ind.style.height = `${Math.min(70, dy / 2)}px`;
      ind.style.opacity = String(Math.min(1, dy / 120));
      ind.classList.toggle("ready", dy > 120);
    }
  };
  const end = () => {
    if (y0 == null) return;
    const go = dy > 120;
    y0 = null;
    ind.style.height = "";
    ind.style.opacity = "";
    ind.classList.remove("ready");
    if (go) onRefresh();
  };
  window.addEventListener("touchstart", start, { passive: true });
  window.addEventListener("touchmove", move, { passive: true });
  window.addEventListener("touchend", end);
  return () => {
    window.removeEventListener("touchstart", start);
    window.removeEventListener("touchmove", move);
    window.removeEventListener("touchend", end);
  };
}
