# Roosters in je menubalk (Mac) en systeemvak (Windows)

Een klein venster dat openspringt onder het icoon in je menubalk (Mac) of boven het icoon in het
systeemvak (Windows), zoals Twinkle Tray of het Bluetooth-menu. Het toont gewoon je eigen
Roosters-server (`server/`) in de compacte weergave (`/?compact=1`): Rooster, Vergelijk en
Afspreken bovenaan, de rest onder ⋯. Elke update van de site zit er dus meteen in; de app zelf
moet je enkel opnieuw bouwen als er in deze map iets verandert.

Gemaakt met [Tauri 2](https://tauri.app): de app gebruikt de webweergave van je systeem
(Safari op Mac, Edge op Windows), daarom is ze maar een paar MB.

## Wat het doet

- **Klik op het icoon**: venster open/dicht. Klik ernaast of druk **Esc**: weg.
- **⌥⌘R** (Mac) of **Ctrl+Alt+R** (Windows): venster open/dicht van overal.
- **Naast het icoon** (Mac) of in de tooltip (Windows): wat er nu of straks is, bv. `☕ Kayra tot 12:00`,
  `📚 tot 12:30` of `📚 13:30`.
- **Rechtsklik op het icoon**: Vernieuwen, Openen in je browser, Start bij inloggen, Serveradres wijzigen, Stoppen.
- Links naar buiten (les-links, *Openen in je browser*) gaan naar je gewone browser; het venster
  zelf toont enkel je eigen server.

## Installeren

1. GitHub → **Actions → Desktop-app bouwen** → laatste run → onderaan bij *Artifacts*:
   `roosters-mac` (.dmg) of `roosters-windows` (installer). Of start zelf een run met *Run workflow*.
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
- `src-tauri/capabilities/server.json`: de pagina van je server mag enkel de vijf commando's uit
  `lib.rs` gebruiken (tekst naast het icoon, venster verbergen, link openen, serveradres lezen/zetten).
