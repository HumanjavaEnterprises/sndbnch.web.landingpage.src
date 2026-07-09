# sndbnch.web.landingpage.src — agent notes

**Read `README.md` first** — it fully documents this repo (it's the source of truth for
deploy + waitlist wiring). This file only flags the cross-repo gotchas.

- **Marketing page ONLY.** The `sndbn.ch` coming-soon / waitlist front door. Served from
  **`docs/`** via GitHub Pages (`main` → `/docs`). Custom domain pinned by `docs/CNAME`
  = `sndbn.ch`. No build step; open `docs/index.html` or `cd docs && python3 -m http.server`.
- **Waitlist writes NO email infra of its own** — it POSTs to SendRelay
  `https://api.sendrelay.app/optin` with `purpose: "sndbnch-waitlist"` (CASL double
  opt-in, 6-mo window). Confirm link lands on `docs/thanks.html`.
- **OG card:** `docs/og-image.html` is the 1200×630 template screenshotted into
  `og-image.png`. A programmatic alternative (on-brand retrowave "GROOVE ARCADE"
  wordmark) lives at `sndbnch.srvr.rendertools.src/og_card.py`. Per the 2026-07-09 demo
  decisions (`sndbnch.bizdocs.src/product/demo-landing-decisions.md`), the card should
  show the **interface + promise**, not a rendered viz.
- **Domain family:** `sndbn.ch` = public site; `sndbnch.com` → 301 to it; `sndbnch.ca`
  unresolved (see README TODO). Bizdocs = `sndbnch.bizdocs.src`.
- One repo per commit; no Claude attribution on commits.
