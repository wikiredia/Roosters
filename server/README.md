# Roosters-server (thuis)

De uitgebreide versie van Roosters voor op je eigen server: iedereen voegt zijn eigen rooster toe
(Untis, Google Agenda, iCloud, Outlook of een .ics-bestand), je ziet wie wanneer pauze heeft, wie er nog
op campus is, je kan afspreken en krijgt pushmeldingen. De GitHub Pages-versie in `site/` en de GitHub
Action blijven gewoon werken; deze map staat daar los van.

```
Internet ──► poort 80/443 ──► web (Apache: app + /api)  ──► api (Python) ──► db (MySQL, enkel intern)
                                    ▲                          worker (roosters ophalen, meldingen)
                         certbot (Let's Encrypt, elke 6 u)
```

## Installeren

Nodig: een Linux-server met Docker (met `docker compose`), je vaste publieke IP, en in je router
**port forwarding van TCP 80 en 443** naar die server.

```bash
git clone https://github.com/wikiredia/Roosters.git
cd Roosters/server
./roosters.sh init            # vraagt je IP, maakt .env met nieuwe geheimen
./roosters.sh up              # bouwt en start alles
./roosters.sh import-config   # neemt Reda & Kayra over uit ../config.json (optioneel)
sudo ./roosters.sh admin-code # code om je gsm admin te maken (10 min geldig)
```

Daarna op je gsm: open `https://<jouw-ip>` → Home → kies je naam → **Opties → Admin-code** (onderaan) →
tik de code in. Doe hetzelfde op je MacBook met een nieuwe code. Die toestellen blijven admin.

Het eerste certificaat duurt een minuutje. Tot dan krijg je een waarschuwing (tijdelijk eigen
certificaat); daarna is het een gewoon slotje, zonder dat iemand iets moet installeren.

## Opstarten met je vrienden

1. **Groepen maken** (Opties → Beheer → Groepen): campussen (bv. *AP Spoor Noord*), woonplaatsen
   (voor samen reizen) en vriendengroepen. Iedereen kiest zelf bij welke groepen hij/zij hoort.
2. **Link delen.** Zolang *Goedkeuring verplicht* uit staat, kan iedereen zichzelf toevoegen en zijn rooster
   koppelen. Een naam kiezen die al een goedgekeurd toestel heeft, moet ook dan op jou wachten
   (zodat niemand zich als iemand anders kan voordoen).
3. **Goedkeuring aanzetten** zodra iedereen erin zit (Beheer → *Goedkeuring verplicht*, of
   `sudo ./roosters.sh gate on`). Kijk dan even de lijst *Toestellen* na.
   Nieuwe toestellen zien vanaf dan "Wacht tot Reda je toegang geeft". Jij ziet per verzoek: de naam,
   het toestel, IP en ruwe plaats, de exacte locatie als ze die deelden, en wat ze probeerden (welk
   rooster openen, welke bron toevoegen). Toelaten, weigeren, blokkeren en weer deblokkeren kan altijd, en
   alles kan je ongedaan maken (Beheer → Recente acties).

**iPhone-beginscherm:** de app op het beginscherm deelt geen cookies met Safari. Wie al toegang heeft
in Safari, opent daar *Opties → Koppel je beginscherm-app*, onthoudt het getal, zet Roosters op het
beginscherm en tikt daar het juiste getal aan (één poging, 5 minuten, enkel vanaf hetzelfde netwerk).

## Wat er gebeurt op de achtergrond

- Roosters worden elke 2 uur opgehaald (overdag), 's nachts elke 8 uur, en meteen met *Vernieuwen*.
  Wijzigingen (vervallen, verplaatst, nieuw) worden gemarkeerd en voor vandaag/morgen gemeld.
- **Pauze** = geen les tussen je eerste en laatste les. Zelfde campus: vanaf 30 minuten samen.
  Andere campus: enkel langer dan 30 minuten. Wie "Al aant chillen" of "Ik wil chillen" kiest, is ook
  na de laatste les beschikbaar. Instellingen staan bovenaan `api/roosters/logic.py`.
- Meldingen: ochtendoverzicht bij je eerste les, "je kan nu op pauze met…", wie erbij komt of naar huis
  gaat, pauzes met andere campussen, wie blijft chillen, pauze-verzoeken en hun antwoord, "wil je chillen?",
  's avonds om 19u samen-reizen-voorstellen en wijzigingen in je eigen rooster (kort: oud → nieuw).
  Meerdere tegelijk worden één melding. Iedereen kiest in Opties waarover en van wie.
- **Pauzes samen**: tik een pauze die je met iemand deelt (Rooster, Vergelijk, Home) en vraag om ze samen
  te nemen: ik kom naar jou, jij komt naar mij of afspreken op een plek, van/tot. De ander antwoordt Ja, Nee
  of Ander uur (ook vanuit de pushmelding); het antwoord komt als melding terug. Vervangt de oude Afspraken.
  Wat al gevraagd of afgesproken is, ziet iedereen overal (planbalk onderaan, pauzes in je rooster, Home);
  hetzelfde nog eens vragen kan niet, en de meldingen stellen niet meer voor om te vragen wat al loopt.
- **Rooster**: eerst je rooster, schermvullend; weergave, *Zelfde pauze* (met + zet je iemand naast je in je
  rooster, hoogstens 3) en andere roosters staan eronder. **Vergelijk** onthoudt je recente selecties (presets).
- **Chat**: je vriendengroep (vastgepind), je woonplaats, en losse gesprekken (enkel als je er zelf een
  begint). Wat de groep aangaat ("Reda stopt nu met de les", "… wil chillen in Antwerpen", "… gaan samen
  pauze pakken") staat als klein blokje in de groepschat: geen pushmelding, enkel het rode bolletje op het
  Chat-icoon. Pushmeldingen voor chatberichten staan standaard uit (bel per chat).
- Certificaat: `certbot` vraagt een IP-certificaat aan bij Let's Encrypt (6 dagen geldig) en vernieuwt het
  ruim op tijd. Lukt dat niet, dan krijgen je admin-toestellen een pushmelding; tik erop en je krijgt in
  Beheer een kant-en-klare **debug-prompt voor Claude** (ook in het volume `tls`, `status.json`).
  Plak die in Claude Code op de server.

## Beveiliging in het kort

- Enkel Apache staat open. MySQL zit op een intern Docker-netwerk zonder internet; de containers draaien
  zonder root, met een alleen-lezen bestandssysteem en zonder extra rechten.
- Toegang via een cookie per toestel (HttpOnly, `__Host-`, 400 dagen en bij elk bezoek vernieuwd). In de
  database staan enkel hashes van die cookies. Geen wachtwoorden.
- Admin = toestel gekoppeld met een eenmalige code van de server (root nodig).
- Gedeelde agenda-links (Google/iCloud) zijn geheim: ze staan versleuteld in de database (sleutel =
  `SECRET_KEY` in `.env`) en komen nooit terug naar de browser. De persoonlijke export-link komt niet in
  de logs.
- Links die iemand plakt worden enkel opgehaald als ze naar een publiek adres wijzen (geen
  `192.168.x.x`, geen containers), met limieten op grootte, tijd en doorverwijzingen.
- Strikte Content-Security-Policy, alle tekst van buitenaf wordt als tekst getoond (geen HTML),
  CSRF-bescherming, snelheidslimieten op aanmelden, koppelen en vernieuwen.
- Locaties van toegangsverzoeken worden gewist zodra je beslist. Ruwe plaats bij IP komt uit de offline
  database van DB-IP (IP Geolocation by DB-IP, CC BY 4.0).
- `.env` (met je IP en alle sleutels) staat niet in git. Deze repo is publiek: zet daar nooit geheimen in.

## Beheer

| Wat | Hoe |
| --- | --- |
| Logs | `./roosters.sh logs` (of `logs api`, `logs worker`, `logs certbot`) |
| Status | `./roosters.sh status` |
| Updaten | `./roosters.sh update` (git pull + opnieuw bouwen) |
| Backup | Beheer → *Download backup* (zip, op elk toestel) |
| Meldingen testen | Beheer → *Stuur iedereen een testmelding* (komt een minuut later aan) |
| Terugzetten | `sudo ./roosters.sh restore backup.zip` (zelfde `SECRET_KEY` nodig voor de agenda-links) |
| Poorten testen | `./roosters.sh check-ports`, of op je gsm via 4G `http://<jouw-ip>` |

Testen zonder certificaat: zet in `.env` `TLS_MODE=off` en `COMPOSE_PROFILES=` (leeg). Locatie delen en
pushmeldingen werken dan niet (die vragen https).
