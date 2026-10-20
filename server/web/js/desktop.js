// Enkel in de menubalk-/systeemvak-app (Tauri, zie desktop/): Esc sluit het venster, links gaan
// naar je gewone browser, en naast het icoon staat wat er nu of straks is.
import { api } from "./api.js";
import { myPerson } from "./app.js";
import { fmt, brusselsMinutes } from "./util.js";

const call = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
const invoke = (cmd, args) => call(cmd, args).catch(() => {});

// In je gewone browser openen. Lukt het commando niet (oude app, of de pagina mag geen commando's
// aanroepen), dan zelf navigeren: lib.rs vangt ?roosters-browser=1 (eigen server) en andere adressen
// op en opent ze in je browser i.p.v. in het venster.
export async function openInBrowser(href) {
  const url = new URL(href, location.href);
  try {
    await call("open_external", { url: url.href });
  } catch {
    if (url.origin === location.origin) url.searchParams.set("roosters-browser", "1");
    location.href = url.href;
  }
}

export function init() {
  document.body.classList.add("desktop");
  if (/Mac/.test(navigator.platform)) document.body.classList.add("mac");

  // Esc: eerst een open onderblad sluiten (dat doet app.js zelf), anders het venster
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.querySelector(".sheet")) invoke("hide_popover");
  });

  // Nieuwe vensters bestaan hier niet: zulke links in de browser openen
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (a.target === "_blank" || url.origin !== location.origin) {
      e.preventDefault();
      openInBrowser(url.href);
    }
  }, true);

  update();
  setInterval(update, 2 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) update(); });
}

async function update() {
  try {
    invoke("set_tray_title", { title: await glance() });
  } catch { /* offline of nog niet gekoppeld: laat het oude staan */ }
}

// Pauze met iemand nu > les nu > eerstvolgende pauze of les vandaag > niets
async function glance() {
  const me = myPerson();
  if (!me) return "";
  const [home, sch] = await Promise.all([api.get("/home"), api.get(`/schedule/${me.id}?weeks=1`)]);
  const now = brusselsMinutes();
  const lessons = (sch.days.find((d) => d.day === sch.today)?.lessons || []).filter((l) => l.state !== "cancelled" && l.state !== "removed");
  const who = (b) => b.people[0].name + (b.people.length > 1 ? ` +${b.people.length - 1}` : "");
  const breakNow = home.my_breaks.find((b) => b.now);
  if (breakNow) return `☕ ${who(breakNow)} tot ${fmt(breakNow.end)}`;
  const lesson = lessons.find((l) => l.start <= now && now < l.end);
  if (lesson) return `📚 tot ${fmt(lesson.end)}`;
  const nextBreak = home.my_breaks.find((b) => b.start > now);
  const next = lessons.find((l) => l.start > now);
  if (nextBreak && (!next || nextBreak.start <= next.start)) return `☕ ${fmt(nextBreak.start)} ${who(nextBreak)}`;
  if (next) return `📚 ${fmt(next.start)}`;
  return "";
}
