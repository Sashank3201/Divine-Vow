/**
 * The collision, directed. One Anime.js timeline drives every field of the
 * scene director — cosmic time, the camera, exposure, bloom, flashes and
 * shakes — and fires caption/chapter callbacks in sync with the physics.
 *
 * Cosmic time follows a custom easing: a monotone cubic spline through
 * hand-placed beats, so the simulation glides into slow motion at each
 * pericentre and fast-forwards through the quiet stretches without jerks.
 */

import { createTimeline, type EasingFunction, type Timeline } from 'animejs';
import type { Director } from '../galaxy/scene';

export interface Caption {
  at: number;
  text: string | null;
}

export interface Chapter {
  at: number;
  label: string;
}

export const CHAPTERS: Chapter[] = [
  { at: 0, label: 'Approach' },
  { at: 11000, label: 'First contact' },
  { at: 16500, label: 'Tidal dance' },
  { at: 29500, label: 'Return' },
  { at: 36500, label: 'Rebirth' },
];

export const CAPTIONS: Caption[] = [
  { at: 3800, text: 'Andromeda is approaching at 110 km/s.' },
  { at: 8600, text: 'In about 4.5 billion years, they meet.' },
  { at: 12300, text: 'First contact.' },
  { at: 17500, text: 'Tidal tails stretch 100,000 light-years.' },
  { at: 24800, text: 'Gravity pulls them back.' },
  { at: 31400, text: 'Second pass.' },
  { at: 35200, text: 'Merger.' },
  { at: 40500, text: 'A new galaxy forms: Milkomeda.' },
  { at: 47000, text: null },
];

export const CINEMATIC_DURATION = 48000;

/** Monotone cubic (Fritsch–Carlson) interpolation through (xs, ys). */
export function monotoneSpline(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d[i]!;
    const b = m[i + 1]! / d[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i]!;
      m[i + 1] = t * b * d[i]!;
    }
  }
  return (x: number) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let i = 0;
    while (x > xs[i + 1]!) i++;
    const h = xs[i + 1]! - xs[i]!;
    const t = (x - xs[i]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i]! +
      (t3 - 2 * t2 + t) * h * m[i]! +
      (-2 * t3 + 3 * t2) * ys[i + 1]! +
      (t3 - t2) * h * m[i + 1]!
    );
  };
}

/** Builds an Anime.js easing that maps timeline progress onto a spline of values. */
function splineEase(points: Array<[number, number]>, duration: number): { ease: EasingFunction; from: number; to: number } {
  const xs = points.map((p) => p[0] / duration);
  const ys = points.map((p) => p[1]);
  const from = ys[0]!;
  const to = ys[ys.length - 1]!;
  const f = monotoneSpline(xs, ys);
  return { ease: (p: number) => (f(p) - from) / (to - from), from, to };
}

type Point = [time: number, value: number, ease?: string];

/** Absolute-time points → Anime.js duration keyframes. */
function track(points: Point[]) {
  const frames: Array<{ to: number; duration: number; ease: string }> = [];
  for (let i = 1; i < points.length; i++) {
    const [t, v, ease] = points[i]!;
    frames.push({ to: v, duration: Math.max(1, t - points[i - 1]![0]), ease: ease ?? 'inOutSine' });
  }
  return frames;
}

export interface CinematicHandlers {
  caption?(text: string | null, index: number): void;
  chapter?(index: number): void;
  impact?(strength: number): void;
  progress?(p: number): void;
  complete?(): void;
}

export interface CinematicEvents {
  firstPericenter: number;
  secondPericenter: number;
  merger: number;
}

export function createCinematic(director: Director, ev: CinematicEvents, h: CinematicHandlers = {}): Timeline {
  const D = CINEMATIC_DURATION;

  // Beats in cosmic time. Peri-centres land on the flashes below.
  const sim = splineEase(
    [
      [0, 0],
      [3500, 0.9],
      [9500, ev.firstPericenter - 1.55],
      [12550, ev.firstPericenter],
      [16000, ev.firstPericenter + 1.7],
      [24000, 15.2],
      [31000, ev.secondPericenter - 0.8],
      [32350, ev.secondPericenter],
      [35250, ev.merger],
      [41000, ev.merger + 6.2],
      [D, ev.merger + 9.5],
    ],
    D,
  );

  const initial: Partial<Director> = {
    simTime: 0,
    distance: 17,
    elevation: 1.2,
    azimuth: -0.25,
    roll: 0,
    exposure: 0,
    bloom: 1.6,
    flash: 0,
    burst: 0,
    shake: 0,
    streak: 0.4,
    youth: 1,
    dust: 1,
    aberration: 0.012,
    autoOrbit: 0,
    fade: 1,
    skyFade: 1,
  };
  Object.assign(director, initial);

  const tl = createTimeline({
    autoplay: false,
    onUpdate: (self) => h.progress?.(self.progress),
    onComplete: () => h.complete?.(),
  });

  tl.add(
    director,
    {
      simTime: { from: sim.from, to: sim.to, duration: D, ease: sim.ease },
      distance: track([
        [0, 17],
        [3500, 10.5, 'inOutCubic'],
        [9500, 8.2],
        [12800, 6.4],
        [16500, 7.4],
        [23500, 13.8],
        [30500, 10.2],
        [35500, 7.4],
        [42000, 8.4],
        [D, 10.2],
      ]),
      elevation: track([
        [0, 1.2],
        [3500, 0.98],
        [9500, 0.9],
        [13000, 0.84],
        [23500, 1.12],
        [30500, 0.82],
        [35500, 0.94],
        [42000, 1.2],
        [D, 1.12],
      ]),
      azimuth: track([
        [0, -0.25],
        [9500, 0.08],
        [16500, 0.42],
        [23500, 0.78],
        [30500, 1.25],
        [42000, 1.72],
        [D, 1.95],
      ]),
      exposure: track([
        [0, 0],
        [2800, 1, 'outQuad'],
        [D, 1, 'linear'],
      ]),
      bloom: track([
        [0, 1.6],
        [3500, 0.9],
        [11900, 0.9],
        [12600, 1.75, 'outQuad'],
        [15500, 1.0],
        [31900, 1.0],
        [32400, 1.6, 'outQuad'],
        [34400, 1.1],
        [35200, 2.1, 'outQuad'],
        [38500, 1.1],
        [D, 1.0],
      ]),
      flash: track([
        [0, 0],
        [12100, 0, 'linear'],
        [12550, 0.55, 'outExpo'],
        [14700, 0, 'outQuad'],
        [32000, 0, 'linear'],
        [32400, 0.3, 'outExpo'],
        [33900, 0, 'outQuad'],
        [34850, 0, 'linear'],
        [35300, 0.8, 'outExpo'],
        [38000, 0, 'outQuad'],
      ]),
      burst: track([
        [0, 0],
        [11000, 0, 'linear'],
        [12700, 1, 'outQuad'],
        [18000, 0.25],
        [31500, 0.25],
        [33000, 0.9],
        [35500, 1.3],
        [41000, 0.2],
        [46000, 0],
      ]),
      shake: track([
        [0, 0],
        [12350, 0, 'linear'],
        [12600, 1, 'outExpo'],
        [14300, 0, 'outQuad'],
        [35050, 0, 'linear'],
        [35300, 1.35, 'outExpo'],
        [37400, 0, 'outQuad'],
      ]),
      streak: track([
        [0, 0.4],
        [12350, 0.4, 'linear'],
        [12700, 2.6, 'outExpo'],
        [15200, 0.5, 'outQuad'],
        [35050, 0.5, 'linear'],
        [35400, 3.2, 'outExpo'],
        [38600, 0.5, 'outQuad'],
      ]),
      aberration: track([
        [0, 0.012],
        [12400, 0.012, 'linear'],
        [12650, 0.032, 'outExpo'],
        [15000, 0.012],
        [35100, 0.012, 'linear'],
        [35350, 0.038, 'outExpo'],
        [38000, 0.012],
      ]),
      youth: track([
        [0, 1],
        [36000, 1, 'linear'],
        [44000, 0.35],
      ]),
      dust: track([
        [0, 1],
        [33000, 1, 'linear'],
        [42000, 0.22],
      ]),
    },
    0,
  );

  CHAPTERS.forEach((c, i) => {
    tl.label(c.label, c.at);
    tl.call(() => h.chapter?.(i), c.at);
  });
  CAPTIONS.forEach((c, i) => {
    if (c.at <= D) tl.call(() => h.caption?.(c.text, i), c.at);
  });
  tl.call(() => h.impact?.(0.7), 12450);
  tl.call(() => h.impact?.(0.45), 32300);
  tl.call(() => h.impact?.(1), 35200);

  return tl;
}

/** Captions scheduled after the timeline ends (it keeps the remnant alive). */
export const LATE_CAPTIONS = CAPTIONS.filter((c) => c.at > CINEMATIC_DURATION);
