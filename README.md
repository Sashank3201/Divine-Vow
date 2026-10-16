# Divine Vow

**A private sanctuary for breaking free from the habit that holds you back.**

Divine Vow opens with a real-time gravitational simulation of the Milky Way
colliding with Andromeda — two galaxies torn apart and reborn as one,
*Milkomeda*. Then it asks you to make a vow. It never asks what the habit is:
you give it a name only you understand, and everything stays on your device.

Built with **TypeScript** and **Anime.js 4.5**, rendered with raw **WebGL2**,
installable as a **PWA** that works fully offline.

---

## Features

| | |
|---|---|
| **The collision** | A cinematic hero: ~150k stars simulated live — approach, first contact, tidal tails, return, merger and the birth of a new spiral. Cosmic clock, live separation, chapters, captions, galaxy labels, drag-to-orbit, parallax, procedural sound. |
| **The vow ceremony** | Name it (without naming it), write your reasons and your vow, sign it, and *press and hold* to seal it while the universe leans in. |
| **Sanctuary** | Live streak counter with a ring to your next milestone, daily check-in, your reasons, affirmations, stats — and the galaxies behind the screen sit exactly where your streak has brought them (day 17 first contact, day 75 merger, day 90 Milkomeda). |
| **I feel the pull (SOS)** | Breathing orb (box / 4-7-8 / coherent), 10-minute urge-surfing wave, *Star Catcher* mini-game, movement cards, 5-4-3-2-1 grounding, and your why. Ends with an honest check-in. |
| **Compassionate reset** | Slipping is information, not failure: history and best streak are kept, the cosmos dissolves and begins a new orbit. |
| **Journal** | Reflections, urges outlasted and new beginnings in one timeline, with moods and tags. |
| **Your sky** | Ten milestones, Spark → Universe, drawn as a constellation that lights up as you go. |
| **Insights** | Urge clock by hour, weekday bars, mood trend, what helps, common triggers, streak history. |
| **Privacy** | No account, no server, no analytics. Optional PIN lock (SHA-256), export/import backup, erase everything. |
| **PWA** | Installable, offline-first (Workbox precache), app shortcuts (SOS, Journal), update prompts. |
| **Accessibility** | Respects `prefers-reduced-motion` (or override in Settings), keyboard support, live regions for captions. |

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (service worker enabled)
```

The service worker is only registered in production builds (`npm run build && npm run preview`).

### Deploying

`dist/` is a static site with relative paths and a hash router, so it can be
hosted anywhere (GitHub Pages, Netlify, Vercel, Cloudflare Pages…). PWAs need
HTTPS to be installable.

A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and deploys
to **GitHub Pages** on every push to `main`. Enable it once under
*Settings → Pages → Build and deployment → Source: GitHub Actions*.

## How the galaxy collision works

The hero is not a video — it is physics, running in your browser.

- **Orbit** (`src/galaxy/orbit.ts`): the two nuclei (with their dark halos) are
  softened point masses on a bound, nearly parabolic orbit. A
  Chandrasekhar-style dynamical-friction term drains orbital energy where the
  halos overlap, turning a fly-by into a merger. The orbit is integrated
  up-front, so every event (pericentres, apocentre, merger) is known before
  the film starts.
- **Galaxies** (`src/galaxy/model.ts`): a barred Milky Way and a ringed,
  steeply-inclined Andromeda with M32 and M110. Until contact the disks follow
  a **density-wave model** (Lin & Shu): each star travels an ellipse whose
  orientation twists with radius, so the spiral arms keep their shape while
  stars stream through them. Young stars, HII regions and dust are locked to
  the pattern. An extended, faint outer disk becomes the tidal tails.
- **Simulation** (`src/galaxy/simulation.ts`): shortly before first contact,
  every particle is handed its orbital velocity and integrated with a
  drift-kick-drift leapfrog in the time-dependent field of both cores — the
  restricted three-body method of Toomre & Toomre (1972) that first explained
  tidal tails and bridges. A starburst population ignites at each passage;
  after the merger a new disk forms inside-out around the remnant.
- **Rendering** (`src/galaxy/renderer.ts`, `shaders.ts`): WebGL2 point sprites
  accumulate into an HDR target (additive starlight, multiplicative dust
  extinction), over a procedural nebula sampled from a 3D noise texture. A
  13-tap Karis-averaged bloom chain, anamorphic streaks, chromatic aberration,
  ACES tone mapping, vignette and film grain finish the frame. Quality tiers and
  dynamic resolution keep it smooth on phones.
- **Direction** (`src/hero/cinematic.ts`): a single Anime.js timeline drives the
  scene's *director* — cosmic time, camera, exposure, bloom, flashes, shakes —
  and fires captions in sync. Cosmic time follows a custom easing (a monotone
  cubic spline) so the film glides into slow motion at each impact. If a device
  can't keep up, the timeline slows itself so flashes still land on impact.

## Anime.js, everywhere

Timelines (the film, intros, celebrations), `createTimer` (render loop, game
loop, counters), `createAnimatable` (camera parallax, magnetic buttons, card
tilt), springs (sheets, toasts, stars), `splitText` + `stagger` (title,
captions, manifesto), `scrambleText` (eyebrow, affirmations, surf prompts),
`onScroll` (scroll-scrubbed reveals, parallax, the drawing urge wave),
`svg.createDrawable` (rings, constellation lines, charts), `createLayout`
(journal filtering), function-based values (particle bursts), and custom
easing functions.

## Project structure

```
src/
  galaxy/     math, orbit, model, simulation, shaders, renderer, scene
  hero/       cinematic timeline
  app/        cosmos controller, router, shell, PWA
  core/       store (localStorage), journey (streaks & milestones), content
  views/      landing, vow, sanctuary, sos (+ tools, game), journal, sky, insights, settings, lock
  ui/         dom helpers, icons, overlays, sound, celebrations, relapse flow
  styles/     base, components, hero, views
scripts/      icon.svg + generate-icons.mjs (regenerates public/icons)
```

## A note on care

Divine Vow is a self-help companion, not a substitute for professional care. If
you are struggling or feel unsafe, please reach out to someone you trust or a
local helpline.
