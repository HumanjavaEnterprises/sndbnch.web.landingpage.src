# SndBnch — Marketing Landing Page

The public **coming-soon / waitlist** page for **SndBnch** — the sovereign
music-finishing-and-render product. *Upload your music → finish it (master + spatial)
→ render a square/vertical video + cover → post it anywhere.* Made on sovereign
compute, so you can **make as many as you want.**

> This is the **marketing page only.** The self-serve render app (upload → finish →
> download) is a separate surface; this repo is the front door + waitlist while it's
> being built. Framing and content follow the ecosystem's `triviatonite.web.landingpage.src`.

## What's in here

The site is served from **`docs/`** (GitHub Pages "Deploy from branch → `/docs`",
the ecosystem convention used by `voxrelay.web.landingpage.src`,
`triviatonite.web.landingpage.src`, et al.).

| File (under `docs/`) | Purpose |
|------|---------|
| `index.html` | The whole page — one polished long-scroll (hero · how-it-works · why-different · waitlist). |
| `faq.html` · `terms.html` · `privacy.html` | Supporting help/legal pages (pre-launch drafts). |
| `thanks.html` | Post-confirm landing (the `redirect` target of the SendRelay opt-in). |
| `styles.css` | All styling. Pure CSS, system fonts, tactile fabric direction re-themed for the studio/console SndBnch identity. No build step, no framework, no JS required for layout. |
| `favicon.svg` · `logo.svg` | The EQ/piano-roll spectrum mark. |
| `og-image.html` | 1200×630 template to screenshot into `og-image.png` (see comment at top of the file). |
| `CNAME` | Custom domain for GitHub Pages (**`sndbn.ch`**). |
| `.nojekyll` | Serve files as-is (skip Jekyll). |

## Design notes

- **Direction:** the ecosystem's tactile **fabric / skeuomorphic** system (decision
  D-29), re-themed for SndBnch: deep console-ink canvas, warm studio paper, a
  **spectrum accent** (signal-cyan + render-magenta + amber) that nods to the layer
  compositor (EQ / piano-roll / key-driven colour wash). Texture is decoration,
  **never information** (WCAG-AA holds; all texture is `aria-hidden` / background-only).
- **Tactile, not heavy:** texture is CSS-only (gradients + dashed "stitch" borders),
  so the page stays fast on mid-tier phones. No images required.
- **9:16-friendly hero.** Respects `prefers-reduced-motion`.

## Wiring the waitlist

The email form posts (via `fetch`, JSON) to the **SendRelay** opt-in endpoint —
SndBnch writes no email infra of its own (CASL double opt-in, 6-month window):

```
POST https://api.sendrelay.app/optin
{ email, purpose: "sndbnch-waitlist", lang: "en",
  redirect: "https://sndbn.ch/thanks.html",
  consent: true, consent_text, meta: { make, consent_window_months: 6 } }
```

On success it disables the form and shows the "check your inbox to confirm" state;
the confirm link lands on `thanks.html`. It degrades gracefully (never a full-page
nav) before the API is reachable.

## Deploy to GitHub Pages

1. Push this repo to GitHub (`HumanjavaEnterprises`).
2. **Settings → Pages → Source:** "Deploy from a branch".
3. **Branch:** `main`, **Folder:** `/docs`. Save.
4. Pages builds in ~1 minute. `docs/.nojekyll` ensures files serve as-is.

### Custom domain

- `docs/CNAME` pins the site to **`sndbn.ch`**.
- At the DNS provider for `sndbn.ch`, add either:
  - four apex `A` records → GitHub Pages IPs
    (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`), plus
    a `CNAME` on `www` → `<org>.github.io`; or
  - a `CNAME` on the apex/`www` → `<org>.github.io`.
- **Settings → Pages** → confirm the custom domain shows `sndbn.ch`, enable
  **Enforce HTTPS** once the cert provisions.

> **Domain map:** `sndbn.ch` is the public marketing site (this repo — the clever
> ".ch" completes "sndbnch"); `sndbnch.com` is the defensive / redirect domain.
> (The bizdocs also reference `sndbnch.ca` as the brand — point it here or redirect
> as you settle the family.)

## Before launch (TODO)

- [ ] Generate `docs/og-image.png` from `docs/og-image.html` (headless screenshot @ 1200×630) — until then the social card has no image.
- [ ] `docs/apple-touch-icon.png` (referenced by `index.html`) — export from `favicon.svg`.
- [ ] Confirm the SendRelay `sndbnch-waitlist` purpose exists on the API side.
- [ ] Point `sndbnch.com` (and `sndbnch.ca`, if used) → redirect to `sndbn.ch`.
- [ ] (Optional) FR translation — the ecosystem convention is bilingual; SndBnch is global-first, so EN ships v0.
- [ ] Expand `terms.html` / `privacy.html` from pre-launch drafts once uploads open (add the render data-retention detail from `sndbnch.bizdocs.src/product/data-policy.md`).

## Local preview

No build needed. Open `docs/index.html` directly, or serve the folder:

```sh
cd docs && python3 -m http.server 8000   # → http://localhost:8000
```
