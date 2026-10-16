# Divine Vow

**Quit the habit that’s holding you back. One day at a time.**

A private streak tracker and urge toolkit. Behind every screen runs a live
gravitational simulation of the Milky Way and Andromeda colliding, and the UI
floats over it as liquid glass rendered on the GPU. The app never asks what
the habit is. You give it a name only you understand, and everything stays
on your device.

Built with **TypeScript**, **Anime.js 4.5** and raw **WebGL2**. Installable
as a **PWA** that works fully offline.

---

## Design

**Deep Space Glass.** The galaxy is the wallpaper. Panels are clear,
refractive glass with white text and system typography (SF Pro on Apple
devices, Inter elsewhere). Ice blue `#8FD3FF` is used only for key actions.
The copy is short and direct.

## Screens

| | |
|---|---|
| **Welcome** | The collision plays like a film: the name, one line, two glass buttons, and a caption pill that reshapes itself around each short, factual caption. Drag to orbit. |
| **Take the vow** | Five steps: name it privately, list your reasons, write the vow, pick a start time, then press and hold to seal it. |
| **Home** | The galaxy, exactly where your streak has brought it (day 17 first contact, day 75 merger, day 90 Milkomeda), a day counter and two buttons: *I have an urge* and *Open dashboard*. |
| **Dashboard** | Everything in one sheet: streak and next milestone, daily check-in, your reasons, galaxy journey, ten milestones, stats, when urges hit (by hour and weekday, top triggers) and recent journal entries. |
| **Urge** | Strength slider and timer, plus six tools: box / 4-7-8 / 5-5 breathing, a 10-minute ride-it-out timer, *Star catcher* (60-second game), quick actions, 5-4-3-2-1 grounding and your reasons. Ends with an honest check-in. |
| **Start again** | A slip resets the streak, not your history. Best streak, journal and stats are kept. |
| **Journal** | Notes, urges and restarts in one timeline, grouped by day, with moods and tags. |
| **Settings** | Edit the vow, PIN lock, sound, haptics, motion, galaxy quality, install, export / restore / erase. |
| **Lock** | Optional 4-digit PIN (SHA-256). The keypad is ten glass drops over the galaxy. |

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (service worker enabled)
npm run icons      # regenerate public/icons from scripts/icon.svg
```

The service worker is only registered in production builds.

### Deploying

`dist/` is a static site with relative paths and a hash router, so it can be
hosted anywhere (GitHub Pages, Netlify, Vercel, Cloudflare Pages). PWAs need
HTTPS to be installable.

A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and deploys
to **GitHub Pages** on every push to `main`. Enable it once under
*Settings → Pages → Build and deployment → Source: GitHub Actions*.

## Liquid glass

The glass is not CSS `backdrop-filter`. Every element marked `data-glass`
(`sheet`, `control`, `clear` or `accent`) is read each frame (its rectangle,
corner radius, opacity and pressed state) and passed to the galaxy's final
composite shader. There each pane is a rounded-box signed distance field
that:

- bends the galaxy behind it at the rim (lensing plus slight magnification),
- splits colour at the edge (dispersion),
- frosts the inside from a 1/8-resolution blur of the HDR frame,
- catches a specular rim light that follows the pointer (or the phone’s tilt),
- casts a soft contact shadow.

The DOM stays transparent, so the glass always matches the live galaxy
exactly. Sheets grow out of the button that opened them by animating real
geometry (left, top, width, height, radius) with Anime.js springs, and the
glass follows like liquid. Without WebGL2, a CSS approximation takes over.

## How the galaxy collision works

The hero is not a video. It is physics, running in your browser.

- **Orbit** (`src/galaxy/orbit.ts`): the two nuclei (with their dark halos)
  are softened point masses on a bound, nearly parabolic orbit. A
  dynamical-friction term drains orbital energy where the halos overlap,
  turning a fly-by into a merger. The orbit is integrated up front, so every
  event (pericentres, apocentre, merger) is known before the film starts.
- **Galaxies** (`src/galaxy/model.ts`): a barred Milky Way and a ringed,
  steeply inclined Andromeda with M32 and M110. Until contact the disks follow
  a density-wave model, so the spiral arms keep their shape while stars
  stream through them.
- **Simulation** (`src/galaxy/simulation.ts`): shortly before first contact,
  every particle gets its orbital velocity and is integrated with a
  drift-kick-drift leapfrog in the time-dependent field of both cores (the
  restricted three-body method of Toomre & Toomre, 1972). A starburst ignites
  at each passage; after the merger a new disk forms around the remnant.
- **Rendering** (`src/galaxy/renderer.ts`, `shaders.ts`): WebGL2 point sprites
  accumulate into an HDR target (additive starlight, multiplicative dust),
  over a nebula sampled from a 3D noise texture. Bloom, ACES tone mapping,
  vignette and grain finish the frame, then the liquid glass is composited.
  Quality tiers and dynamic resolution keep it smooth on phones.
- **Direction** (`src/hero/cinematic.ts`): one Anime.js timeline drives the
  scene’s director (cosmic time, camera, exposure, bloom, flashes) and fires
  the captions. Cosmic time follows a custom monotone-spline easing, so the
  film slows down at each impact.

## Anime.js

Timelines (the film, breathing patterns, liquid morphs), `createTimer` (render
loop, game loop, clocks), springs (sheets, buttons, toasts, keypad),
`createAnimatable` (camera parallax, magnetic buttons), `splitText` +
`stagger` (hero title), `svg.createDrawable` (the hold-to-seal ring),
function-based values (spark bursts) and custom easing functions.

## Project structure

```
src/
  galaxy/     math, orbit, model, simulation, shaders, renderer, scene
  hero/       cinematic timeline
  app/        cosmos controller, liquid-glass layer, router, PWA
  core/       store (localStorage), journey (streaks, milestones), content
  views/      welcome, vow, home, dashboard, sos (+ tools, game), journal, settings, lock, sheet
  ui/         dom helpers, icons, overlays, morphs, sound, celebrations, relapse flow
  styles/     base (tokens, type), ui (glass, sheets, controls), screens
scripts/      icon.svg + generate-icons.mjs
```

## A note on care

Divine Vow is a self-help tool, not a substitute for professional help. If
you are struggling or feel unsafe, reach out to someone you trust or a local
helpline.
