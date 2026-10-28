# Roosters in je menubalk (Mac) en systeemvak (Windows)

Een klein venster met afgeronde hoeken dat openspringt onder het icoon in je menubalk (Mac) of boven
het icoon in het systeemvak (Windows), zoals Twinkle Tray of het Bluetooth-menu. Het toont gewoon je
eigen Roosters-server (`server/`) in de compacte weergave (`/?compact=1`): het hele venster is je
eigen rooster, met enkel ☰ (menu: Home, Chat, Afspreken, Opties, …) en Vergelijk bovenaan. Hoeveel
dagen je ziet, kies je in Opties → Kleine app (standaard 1); met de **+** rechts zet je er tijdelijk
een dag bij. Liever de vorige versie met tabbladen bovenaan? Opties → Kleine app → *Klassieke weergave*.
Elke update van de site zit er dus meteen in; de app zelf moet je enkel opnieuw bouwen als er in deze
map iets verandert.

Gemaakt met [Tauri 2](https://tauri.app): de app gebruikt de webweergave van je systeem
(Safari op Mac, Edge op Windows), daarom is ze maar een paar MB.

## Wat het doet

- **Klik op het icoon**: venster open/dicht. Klik ernaast of druk **Esc**: weg.
- **⌥⌘R** (Mac) of **Ctrl+Alt+R** (Windows): venster open/dicht van overal.
- **Naast het icoon** (Mac) of in de tooltip (Windows): wat er nu of straks is, bv. `☕ Kayra tot 12:00`,
  `📚 tot 12:30` of `📚 13:30`.
- **⚡ 45 W** (enkel Mac): een tweede icootje met hoeveel watt er nu je Mac in gaat. Het verschijnt
  zodra de lader erin zit en er stroom binnenkomt, en verdwijnt weer als je hem uittrekt. Ga erop
  staan voor de lader en je batterij (bv. `Laadt met 45 W (lader 96 W) · batterij 81%`). Op een Mac
  met Apple-chip is dat wat er echt uit de lader komt; op een Intel-Mac wat er de batterij in gaat.
- **Rechtsklik op het icoon**: Vernieuwen, Openen in je browser, Start bij inloggen, Serveradres wijzigen, Stoppen.
- Links naar buiten (les-links, *Openen in je browser*) gaan naar je standaardbrowser; het venster
  zelf toont enkel je eigen server.

## Installeren

1. Op je Roosters-server (in de browser van je computer): **Opties → Op je computer → Download**.
   Die knop haalt de nieuwste build uit de GitHub-release
   [`desktop-latest`](https://github.com/wikiredia/Roosters/releases/tag/desktop-latest), die de
   Action *Desktop-app bouwen* bijwerkt bij elke wijziging in `desktop/` op main (of met *Run workflow*).
   Bouwen op je eigen server kan niet: een Mac-app bouwen vraagt een Mac.
2. De app is niet ondertekend (dat kost een betaald Apple-ontwikkelaarsaccount), dus de eerste keer:
   - **Mac**: sleep Roosters naar Apps, dan **rechtsklik → Open → Open**. Lukt dat niet:
     `xattr -dr com.apple.quarantine /Applications/Roosters.app`
   - **Windows**: SmartScreen → **Meer info → Toch uitvoeren**.
3. Eerste start: vul het adres van je server in (hetzelfde als op je gsm). Het staat enkel op je
   computer (`server.txt` in de configmap van de app), niet in deze repo.
4. Koppel het toestel zoals de beginscherm-app: op je gsm **Opties → Koppel je beginscherm-app**, en
   in het venster het juiste getal aantikken (zelfde wifi).

## Zelf bouwen

Nodig: [Rust](https://rustup.rs) en Node 22.

```bash
cd desktop
npm ci
npx tauri dev     # starten om te testen
npx tauri build   # .dmg / installer in src-tauri/target/release/bundle
```

De app-iconen komen uit `server/web/icons/icon-512.png` (`npx tauri icon ../server/web/icons/icon-512.png -o src-tauri/icons`);
`src-tauri/icons/tray-template.png` is het zwart-witte menubalk-icoon.

## Hoe het in elkaar zit

- `src-tauri/src/lib.rs`: icoon, menu, venster (positie, verbergen bij focusverlies), sneltoets, en
  welke adressen het venster mag openen.
- `src/index.html`: het instelscherm voor het serveradres.
- `server/web/js/desktop.js` (op de server): Esc, links naar de browser en de tekst naast het icoon.
  Wordt enkel geladen in deze app.
- `src-tauri/build.rs` + `src-tauri/capabilities/`: Tauri weigert de eigen commando's vanaf een webadres
  (je server) tenzij een capability ze toelaat, en dat gebeurt stil. Daarom krijgt elk commando een
  permissie (`allow-<commando>`, gegenereerd door `build.rs`); `server.json` laat de pagina van je server
  enkel de tekst naast het icoon zetten, het venster verbergen, een link openen en het serveradres lezen.
  Nieuw commando? Zet het in `COMMANDS` in `build.rs` én in de juiste capability.
- Openen in je browser werkt ook zonder commando's: `lib.rs` opent nieuwe vensters (`target="_blank"`),
  adressen buiten je server en adressen van je server met `?roosters-browser=1` in je standaardbrowser.
- Afgeronde hoeken: op Mac een doorzichtig venster met wazig glas (`RADIUS` in `lib.rs`, de pagina rondt
  zich mee af in `server/web/css/compact.css`); op Windows 11 rondt het systeem een randloos venster met
  schaduw zelf af (Windows 10: rechte hoeken).
