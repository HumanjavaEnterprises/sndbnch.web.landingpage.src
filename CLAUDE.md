# CLAUDE.md — sndbnch.web.landingpage.src

## What This Is

Landing page for **Sound Bench** at [sndbnch.com](https://sndbnch.com). Static HTML hosted on GitHub Pages.

## Repo Structure

```
docs/              ← GitHub Pages source (served from main branch)
  index.html       ← Single-page site (HTML + inline CSS, no build step)
  CNAME            ← Custom domain: sndbnch.com
```

## How to Work With This Repo

- **No build step.** Edit `docs/index.html` directly. Push to `main` and GitHub Pages deploys.
- **Design system:** Dark theme. `--bg: #0c0a0f`, `--accent: #e8925a` (warm amber/copper), `--text: #f0eff5`. System font stack.
- **No JavaScript.** Pure HTML + CSS.
- **Minimal by design.** This page says "this exists" — not a pitch, not a pre-launch story.

## Domains

- sndbnch.com (primary, pointed at GitHub Pages)
- sndben.ch (short/brand, redirect to sndbnch.com)

## Conventions

- Inline CSS only
- No frameworks, no build tools
- Keep it minimal — the page should feel like a spec sheet, not a sales page
