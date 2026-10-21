# Roosters+: mobile app UI/UX design

## What you're designing
Roosters+ (written "Roostersplus" where "+" isn't allowed) is a mobile app (iOS + Android, built later in Expo / React Native) for **higher-education students in Belgium**, starting at AP Hogeschool in Antwerp. It answers one everyday question: **"Which of my friends are free right now, and when can we take a break together?"**

Students link their class timetable once (from their school's Untis timetable, or a calendar link). The app then shows their own schedule, overlays friends' schedules, finds shared breaks, and lets them ask a friend "take this break together?" with one tap.

Design **every screen listed below**, in **light and dark mode**, at **iPhone size (393×852)**. Show 2 key screens also at **small Android size (360×800)**. The UI language is **Dutch**. Show the Today screen and the paywall once in **English** as well, to check text length.

## Who it's for
Every student, not just tech-savvy ones: first-years, international students, people with dyslexia or low vision, people on cheap Android phones and slow school wifi. If a screen needs explaining, it's too complicated.

## Brand
- **Name:** Roosters+ (Dutch "roosters" = timetables; English "roosters" = male chickens. A wink, not a pun to push.)
- **App icon (final, keep exactly as-is):** a rounded square in deep navy (#161F2A). On it, four rounded blocks like a mini timetable: two electric blue (#2E5BFF) on the left, two rose (#F0487A) on the right, crossed by one horizontal yellow bar (#FFC21A). The yellow bar is "the break you share".
- **Color meaning** (carry this through the whole app):
  - Blue #2E5BFF = you / primary action
  - Rose #F0487A = friends / other people
  - Yellow #FFC21A = **together** (shared breaks, matches). The signature color, used sparingly so it means something.
  - Navy #161F2A = ink in light mode, background in dark mode
  - Neutrals: slightly warm, not cold slate. Light background around #F4F3EF, cards white.
  - Status: cancelled = red #E5484D, OK/accepted = green #1F9D55
- **Mascot (placeholder):** a small, friendly rooster made only from the icon's rounded blocks: blue body block, rose comb (three small rounded bumps), a yellow beak/"+" shape, two dot eyes. Flat, geometric, no gradients, no outlines. Use it **only** in onboarding, empty states, the paywall and success moments, never as decoration everywhere. It's a placeholder, so keep it simple and easy to swap.
- **Wordmark:** "Roosters" in the display font + a yellow "+".

## Typography
- **UI / body:** Atkinson Hyperlegible Next (Google Fonts). Use **tabular figures** for every time and number (times must line up in columns).
- **Display / headings / wordmark:** Bricolage Grotesque, used only for screen titles, big numbers and the wordmark.
- Base body size 17. All layouts must survive **200% system text size** (show one screen at 200% to prove it).

## Visual direction: must NOT look AI-generated
Avoid: purple/indigo gradients, glassmorphism and blur, glowing shadows, sparkle icons, emoji used as icons, every element in an identical rounded-2xl card, gray-on-gray low contrast, generic "dashboard" layouts, Inter/Geist-style default typography, stock 3D illustrations.

Aim for: a **printed school timetable / transit map / paper planner** feel. Confident flat color, clear grid, strong hierarchy, generous whitespace. Content first, chrome minimal. Thin rules and color blocks instead of shadows (at most one subtle shadow level for floating sheets). Corner radius 12 for cards, 8 for chips, fully round for avatars. Icons: one consistent line icon set (Phosphor style, 1.5px stroke). Personality comes from the color system, the timetable blocks and the mascot, not from effects.

## Accessibility (hard requirements)
- WCAG 2.2 AA contrast for all text, including text on yellow (use navy text on yellow, never white).
- **Never use color alone:** shared breaks get yellow + a "together" icon + a text label; cancelled lessons get red + strikethrough + the word "Vervalt".
- Touch targets at least 44×44 pt. One clear primary action per screen.
- Plain language at B1 level, short sentences. Dutch examples: "Kayra heeft pauze tot 12:30", "Samen pauze 12:30–13:30", "Vervalt: Databases 10:30–12:30".
- Support reduced motion: animations are optional garnish, never required to understand something.

## Navigation: 4 tabs
1. **Vandaag** (Today)
2. **Rooster** (Schedule, includes compare)
3. **Chat**
4. **Ik** (Me: friends, settings, Premium)

## Screens to design

### 1. Onboarding (target: under 60 seconds to first value)
1. Welcome: mascot, one sentence ("Zie wanneer je vrienden vrij zijn."), buttons: Continue with Apple, Continue with Google, Continue with email.
2. Email login: email field → 6-digit code screen (large boxes, paste support, "resend code" with countdown).
3. Pick your school (search list; AP Hogeschool at the top), then your campus.
4. Pick your class(es): searchable list (e.g. "1ITCSC2a – 1e jaar Toegepaste Informatica"), multiple allowed.
5. Pick your courses: chips for the courses in that class, all on by default; tap to switch off courses you don't take.
6. **Aha moment:** "Dit is je week", your schedule appears immediately.
7. Add friends: share your invite link (WhatsApp, Instagram, copy), or "Classmates already on Roosters+". Skippable.
8. Notification permission, asked in context: "Wil je een seintje als een vriend vrij is?" with a preview of such a notification. Then "Not now" or "Allow".

### 2. Vandaag (Today), the home screen
Must load instantly from cached data. Show "Bijgewerkt 4 min geleden" subtly.
- **Now / next** card: "Nu: pauze tot 12:30" or "Volgende: Databases 10:30 · B204".
- **Samen pauze vandaag:** list of shared breaks with friends (time range, avatars, campus). Tap one → ask to take it together.
- **Wie is er nu?** A "now board" of friends with one line each: "Heeft pauze tot 12:30", "Nog les tot 11:45", "Al naar huis", "Wil chillen". Sorted: free first. Small "ask to chill" button where it makes sense.
- **Open requests:** incoming "Reda wil pauze met jou om 12:30. Kan jij?" with Ja / Nee / Ander uur. Outgoing: "Gevraagd aan Kayra · wacht op antwoord".
- **Your status (check-in):** quick chips: "Ik chill nog" · "Ik wil chillen" · "Ik ga naar huis" · "Ik ben er niet".
- **Schedule changes** for today/tomorrow: "Gewijzigd: Databases 10:30 → 13:00 · B204 → C102".
- **Travel together** (after 19:00, for tomorrow): "Morgen kan je samen met Yeno naar school (beiden les om 8:30)".
- States: no classes today, weekend, no friends yet (empty state with mascot + invite), exam period.

### 3. Rooster (Schedule)
- **Day view** (default on phones) and **week view**. Vertical time axis 8:00–19:00, lessons as blocks (course, time, room).
- Lesson states: normal, **cancelled** (struck through, red, "Vervalt"), **changed** (with old → new), **extra/new**, **exam**.
- **Overlay friends:** "+" adds up to 3 friends as narrow columns next to yours. Shared free time is highlighted in yellow across the columns.
- **Compare mode:** pick people (recent selections as presets at the top), see "Samen vrij" windows listed first (matches first, "geen match" collapsed).
- Tap a lesson: bottom sheet with details (course, time, room, status, what changed).
- Tap a shared break: sheet to ask "Pauze samen?" with mode ("Ik kom naar jou" / "Jij komt naar mij" / "Afspreken op…" + place), from–until time, optional note.

### 4. Chat
- List: pinned friend-group chat, hometown chat, then 1-on-1 chats. Unread dots. Per-chat bell to mute/unmute push (off by default).
- Conversation: messages, plus small centered **event blocks** ("Reda stopt nu met de les", "Kayra en Yeno pakken samen pauze om 12:30") that look clearly different from messages.
- Message states for slow wifi: sending (clock), sent, failed ("Niet verstuurd. Tik om opnieuw te proberen").
- Long-press message: Report / Block user (store requirement).

### 5. Ik (Me)
- Profile (name, avatar color, school, campus)
- **Vrienden:** list, add (invite link + QR code), remove, block. Per friend: visibility "Volledig rooster" or "Enkel vrij/bezet".
- **Ghost mode:** "Verberg me tot…" (1 hour, today, until I turn it off)
- **Roosterbronnen:** linked classes + course filter, calendar links, last updated / errors ("Untis is even niet bereikbaar. We tonen je laatst gekende rooster.")
- **Meldingen:** per category toggles (break with friends, requests, schedule changes, travel together, chat), quiet hours
- **Taal:** Nederlands / English
- **Roosters+ Premium** entry
- Privacy, data export, **delete account** (with a clear, calm confirmation step), log out, log out everywhere

### 6. Premium (€2,99/month or €19,99/year)
- Paywall shown **in context** (e.g. when adding a 4th friend to compare), never as a popup at app start.
- Free forever: schedule, friends, compare up to 3, shared breaks, requests, chat, basic notifications.
- Premium: home & lock-screen widgets, Live Activity during a shared break, compare more people, extra calendar sources, themes & alternative app icons (mascot variants), smart notification rules, semester stats.
- Yearly preselected, shown as "€1,67 per maand · bespaar 44%", monthly next to it. Clear auto-renew text, links to terms & privacy, "Aankopen herstellen". **No dark patterns:** no fake timers, no hidden close button, no guilt-trip copy.
- Reverse-trial end screen: "Je proefperiode is voorbij. Dit verdwijnt:" with an honest list, and an easy "Gratis verdergaan".
- Also design: a **home-screen widget** (small and medium) and a **lock-screen widget**: "Volgende: Databases 10:30 · B204" / "Vrij met Kayra om 12:30".

### 7. System states (design these explicitly, they matter as much as the happy path)
- **Offline / slow wifi:** cached content stays visible; a small, non-blocking banner "Geen verbinding. Je ziet je laatst gekende rooster." No full-screen spinners anywhere. Use skeletons only on the very first load.
- **School wifi login page detected:** "Log eerst in op de schoolwifi" with a button to open it.
- **Network blocks the app:** "Dit netwerk blokkeert Roosters+. Probeer 4G."
- **Untis down:** last known schedule + "bijgewerkt gisteren 18:04".
- **Action queued:** a request sent while offline shows "Wordt verstuurd zodra je weer online bent".
- **Empty states** with the mascot: no friends, no classes today, no shared breaks today (with a nice alternative: "Morgen wel: 2 pauzes samen").
- **Push notification designs** (iOS + Android): "Pauze samen?" with Ja / Nee actions; "Kayra is nu vrij tot 12:30"; "Roosterwijziging morgen: Databases vervalt".

## Sample data (use consistently)
- You: **Reda**, AP Hogeschool, campus Spoor Noord, classes 2ITCSC1a + 1IT7.
- Friends: **Kayra** (campus Spoor Noord), **Yeno** (campus Meistraat), **Lotte**, **Amir**, **Sanne**, **Ilias**, **Noor**.
- Courses: Databases, Cloud Computing, Network Security, Python Advanced, Web Frameworks, DevOps, ICT Architecture.
- Rooms: B204, C102, A.1.05. Day: Tuesday, now = 11:20.

## Deliverables
1. All screens above, light + dark, with the states listed.
2. A small **component sheet**: buttons (primary/secondary/ghost/destructive), chips, list rows, cards, bottom sheet, tab bar, timetable block (all states), avatar + avatar stack, toast/banner, input, 6-digit code input, toggle, segmented control, empty state, paywall plan card.
3. **Design tokens** as CSS variables (colors for light + dark, type scale, spacing scale on a 4-pt grid, radii, the one shadow, motion durations), named so they map 1:1 to Tailwind/NativeWind (e.g. `--color-together`, `--radius-card`, `--space-4`).
4. Only use things React Native can render: flexbox layouts, solid colors, simple borders, a single shadow level, SVG icons. No CSS grid tricks, backdrop blur, or complex CSS gradients.
