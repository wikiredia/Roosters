# Roosters

Weekoverzicht van de lessen van Reda en Kayra, over elkaar gelegd: wanneer heeft iemand les, wanneer pauze, wanneer kunnen we samen met de motor heen of terug, en wanneer neemt Kayra de bus.

## Hoe het werkt

- `scripts/fetch.py` haalt elke ochtend (GitHub Action, rond 5u45) de weekroosters van deze en volgende week uit de publieke WebUntis-weergave van AP. Er is geen login nodig. Alleen begin- en eindtijden worden bewaard, geen vakken, lokalen of docenten.
- De Action publiceert de pagina met de verse `data.json` op GitHub Pages.
- De pagina laat het rooster maximaal één keer per dag binnen; met Vernieuwen haal je de laatste versie meteen op.
- Untis zelf nog eens laten uitlezen kan via **Actions → Rooster ophalen en publiceren → Run workflow**.

## Aanpassen

- Klassen en vakken per persoon: `config.json` (klas-ID's uit WebUntis, `include` = alleen deze vakken, `exclude` = deze vakken niet).
- Regels voor samen rijden: bovenaan `site/app.js` (`MAX_WAIT` = hoeveel minuten iemand maximaal wacht om samen te rijden, nu 120).

## Op je beginscherm

- iPhone: open de pagina in Safari, tik op Delen en kies **Zet op beginscherm**.
- Android: open de pagina in Chrome, menu (⋮) en kies **Toevoegen aan startscherm**.

## Server voor thuis

In `server/` staat een uitgebreidere versie om zelf te hosten (Docker Compose, MySQL, Apache): iedereen
voegt zijn eigen rooster toe (Untis, Google, iCloud, ...), met samen-pauze, afspreken en pushmeldingen.
Die staat los van deze GitHub Pages-versie. Zie [server/README.md](server/README.md).

## Roosters+ (v2, in opbouw)

In `app/` staat de volledige app voor iedereen: iOS en Android (Expo), met een backend die van je laptop naar
meerdere servers kan groeien. Zie [app/README.md](app/README.md). Bovenstaande versies blijven gewoon werken.
