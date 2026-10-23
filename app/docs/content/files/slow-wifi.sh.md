---
updated: 2026-10-23T17:30:00Z
---

Makes port 8001 behave like bad school wifi through toxiproxy: `on` (800 ms ± 400, ~50 KB/s, chopped packets), `awful` (2 s, ~10 KB/s, cut connections), `off`. Start toxiproxy with `docker compose --profile slow up`, and point the app at `:8001`. `cli` runs toxiproxy-cli in its container; `clear` removes all toxics first.
