/**
 * GalaxyScene ties together the simulation, the WebGL renderer and a
 * cinematic "director" — a plain object whose fields (sim time, camera,
 * exposure, bloom …) are driven entirely by Anime.js timelines, animatables
 * and springs. The render loop itself is an Anime.js Timer, so everything
 * shares one clock and pauses with the document.
 */

import { createAnimatable, createTimer, type AnimatableObject, type Timer } from 'animejs';
import { GalaxySim } from './simulation';
import { GalaxyRenderer, type GlassFrame } from './renderer';
import { ATTRIB_STRIDE, PT } from './model';
import { Rng, TAU, clamp, mat4, smoothstep, type Mat4, type Vec3 } from './math';

export type Quality = 'high' | 'medium' | 'low';

interface Tier {
  scale: number;
  maxPixels: number;
  maxDpr: number;
  steps: number;
  sky: number;
}

const TIERS: Record<Quality, Tier> = {
  high: { scale: 1, maxPixels: 2_600_000, maxDpr: 2, steps: 10, sky: 6500 },
  medium: { scale: 0.58, maxPixels: 1_500_000, maxDpr: 1.5, steps: 8, sky: 4500 },
  low: { scale: 0.32, maxPixels: 850_000, maxDpr: 1.25, steps: 6, sky: 3000 },
};

export function detectQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse) return cores >= 8 && mem >= 6 ? 'medium' : 'low';
  if (cores >= 8 && mem >= 8) return 'high';
  return cores >= 4 ? 'medium' : 'low';
}

/** Every field here is a target for Anime.js. */
export interface Director {
  simTime: number;
  distance: number;
  azimuth: number;
  elevation: number;
  roll: number;
  fov: number;
  tx: number;
  ty: number;
  tz: number;
  shiftX: number;
  shiftY: number;
  shake: number;
  autoOrbit: number;
  exposure: number;
  bloom: number;
  burst: number;
  flash: number;
  vignette: number;
  saturation: number;
  aberration: number;
  grain: number;
  streak: number;
  nebula: number;
  fade: number;
  skyFade: number;
  youth: number;
  dust: number;
}

export const DEFAULT_DIRECTOR: Director = {
  simTime: 0,
  distance: 11,
  azimuth: 0,
  elevation: 0.95,
  roll: 0,
  fov: 0.72,
  tx: 0,
  ty: 0,
  tz: 0,
  shiftX: 0,
  shiftY: 0,
  shake: 0,
  autoOrbit: 0,
  exposure: 1,
  bloom: 0.9,
  burst: 0,
  flash: 0,
  vignette: 0.85,
  saturation: 1.08,
  aberration: 0.012,
  grain: 0.035,
  streak: 0.6,
  nebula: 0.32,
  fade: 1,
  skyFade: 1,
  youth: 1,
  dust: 1,
};

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
  depth: number;
}

export interface FrameInfo {
  simTime: number;
  separation: number;
  dynamic: boolean;
  cores: [ScreenPoint, ScreenPoint];
  center: ScreenPoint;
  fps: number;
}

export interface SceneOptions {
  quality?: Quality;
  onFrame?: (info: FrameInfo) => void;
  /** Supplies liquid-glass panes for each frame (cssWidth, cssHeight, canvasPxPerCssPx). */
  glass?: (cssW: number, cssH: number, k: number) => GlassFrame;
}

export class GalaxyScene {
  readonly canvas: HTMLCanvasElement;
  readonly sim: GalaxySim;
  readonly renderer: GalaxyRenderer;
  readonly director: Director = { ...DEFAULT_DIRECTOR };
  readonly quality: Quality;
  /** Pointer parallax, eased by an Anime.js animatable. */
  readonly parallax: AnimatableObject;
  /** User drag offsets (azimuth/elevation), animated with springs on release. */
  readonly user = { azimuth: 0, elevation: 0, zoom: 1 };
  onFrame?: (info: FrameInfo) => void;
  glass?: (cssW: number, cssH: number, k: number) => GlassFrame;

  private readonly tier: Tier;
  private readonly timer: Timer;
  private readonly parallaxState = { x: 0, y: 0 };
  private readonly view: Mat4 = mat4.create();
  private readonly proj: Mat4 = mat4.create();
  private readonly viewProj: Mat4 = mat4.create();
  private readonly invViewProj: Mat4 = mat4.create();
  private readonly rollMat: Mat4 = mat4.create();
  private camPos: Vec3 = [0, 0, 10];
  private cssW = 1;
  private cssH = 1;
  private renderScale = 1;
  private elapsed = 0;
  private orbitAccum = 0;
  private frameTimes: number[] = [];
  private adaptCooldown = 0;
  private fps = 60;
  private readonly resizeObserver: ResizeObserver;
  private readonly info: FrameInfo = {
    simTime: 0,
    separation: 0,
    dynamic: false,
    cores: [
      { x: 0, y: 0, visible: false, depth: 0 },
      { x: 0, y: 0, visible: false, depth: 0 },
    ],
    center: { x: 0, y: 0, visible: false, depth: 0 },
    fps: 60,
  };
  private disposed = false;

  private constructor(canvas: HTMLCanvasElement, renderer: GalaxyRenderer, quality: Quality, opts: SceneOptions) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.quality = quality;
    this.tier = TIERS[quality];
    this.onFrame = opts.onFrame;
    this.glass = opts.glass;
    this.sim = new GalaxySim({ scale: this.tier.scale, maxStepsPerFrame: this.tier.steps });
    const set = this.sim.set;
    renderer.setParticles(set.attribs, set.count, {
      additiveCount: set.additiveCount,
      dustStart: set.dustStart,
      dustCount: set.dustCount,
    });
    this.buildSky();

    this.parallax = createAnimatable(this.parallaxState, {
      x: { duration: 1400 },
      y: { duration: 1400 },
      ease: 'out(3)',
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    canvas.addEventListener('webglcontextlost', this.onContextLost);

    // Highest priority ticks last: the frame is drawn after every DOM animation
    // of this tick has run, so liquid glass lands exactly on its element.
    this.timer = createTimer({
      priority: 1000,
      onUpdate: (t) => this.frame(t.deltaTime),
    });
  }

  static create(canvas: HTMLCanvasElement, opts: SceneOptions = {}): GalaxyScene | null {
    const renderer = GalaxyRenderer.create(canvas);
    if (!renderer) return null;
    const quality = opts.quality ?? detectQuality();
    return new GalaxyScene(canvas, renderer, quality, opts);
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.timer.pause();
  };

  /** Distant background stars on a large sphere. */
  private buildSky(): void {
    const rng = new Rng(99);
    const N = this.tier.sky;
    const pos = new Float32Array(N * 3);
    const attr = new Float32Array(N * ATTRIB_STRIDE);
    const R = 160;
    for (let i = 0; i < N; i++) {
      const u = rng.range(-1, 1);
      const th = rng.range(0, TAU);
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = R * s * Math.cos(th);
      pos[i * 3 + 1] = R * u;
      pos[i * 3 + 2] = R * s * Math.sin(th);
      const o = i * ATTRIB_STRIDE;
      const t = rng.next();
      const col: Vec3 = t < 0.15 ? [0.7, 0.8, 1.0] : t < 0.7 ? [1.0, 0.95, 0.88] : t < 0.92 ? [1.0, 0.82, 0.62] : [1.0, 0.66, 0.5];
      const bright = Math.pow(rng.next(), 6);
      attr[o] = col[0];
      attr[o + 1] = col[1];
      attr[o + 2] = col[2];
      attr[o + 3] = 0.35 + bright * 4.5;
      attr[o + 4] = 0.12 + bright * 0.3;
      attr[o + 5] = -1e6;
      attr[o + 6] = 0;
      attr[o + 7] = PT.Halo;
    }
    this.renderer.setSky(pos, attr);
  }

  get cssSize(): { width: number; height: number } {
    return { width: this.cssW, height: this.cssH };
  }

  get aspect(): number {
    return this.cssW / Math.max(1, this.cssH);
  }

  /** CSS pixels covered by one world unit at unit depth (divide by depth). */
  get pixelsPerUnit(): number {
    return (this.proj[5]! * this.cssH) / 2;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier.maxDpr);
    let w = this.cssW * dpr * this.renderScale;
    let h = this.cssH * dpr * this.renderScale;
    const px = w * h;
    if (px > this.tier.maxPixels) {
      const k = Math.sqrt(this.tier.maxPixels / px);
      w *= k;
      h *= k;
    }
    this.canvas.width = Math.max(1, Math.round(w));
    this.canvas.height = Math.max(1, Math.round(h));
    this.renderer.resize(this.canvas.width, this.canvas.height);
  }

  /** Normalised pointer position (−1…1) → eased camera parallax. */
  pointer(nx: number, ny: number): void {
    this.parallax.x!(clamp(nx, -1, 1));
    this.parallax.y!(clamp(ny, -1, 1));
  }

  /** Calm screens do not need 60 fps of cosmos; this saves battery. */
  setFrameRate(fps: number): void {
    this.timer.fps = fps;
  }

  pause(): void {
    this.timer.pause();
  }

  resume(): void {
    if (!this.disposed) this.timer.resume();
  }

  private frame(deltaMs: number): void {
    if (this.disposed) return;
    // The first tick of a fresh Timer can report a bogus delta; never trust it blindly.
    const dt = Number.isFinite(deltaMs) ? clamp(deltaMs, 0, 100) / 1000 : 0;
    this.elapsed += dt;
    this.trackPerformance(deltaMs);

    const d = this.director;
    this.sim.advance(Math.max(0, d.simTime));
    this.renderer.updatePositions(this.sim.pos);
    this.orbitAccum += d.autoOrbit * dt;
    this.updateCamera();

    const f = this.info;
    const c = this.sim.cores;
    this.project(c[0]!, c[1]!, c[2]!, f.cores[0]);
    this.project(c[3]!, c[4]!, c[5]!, f.cores[1]);
    const mA = this.sim.galaxies[0]!.spec.mass;
    const mB = this.sim.galaxies[1]!.spec.mass;
    const w = mB / (mA + mB);
    this.project(c[0]! + (c[3]! - c[0]!) * w, c[1]! + (c[4]! - c[1]!) * w, c[2]! + (c[5]! - c[2]!) * w, f.center);

    this.renderer.render({
      view: this.view,
      viewProj: this.viewProj,
      invViewProj: this.invViewProj,
      camPos: this.camPos,
      focal: (this.proj[5]! * this.canvas.height) / 2,
      simTime: this.sim.time,
      time: this.elapsed,
      exposure: d.exposure,
      bloom: d.bloom,
      burst: d.burst,
      flash: d.flash,
      flashPos: [f.center.x / this.cssW, 1 - f.center.y / this.cssH],
      vignette: d.vignette,
      saturation: d.saturation,
      aberration: d.aberration,
      grain: d.grain,
      streak: d.streak,
      nebula: d.nebula,
      fade: d.fade,
      skyFade: d.skyFade,
      youth: d.youth,
      dust: d.dust,
      glass: this.glass?.(this.cssW, this.cssH, this.canvas.width / this.cssW),
      pixelRatio: this.canvas.width / this.cssW,
    });

    f.simTime = this.sim.time;
    f.separation = this.sim.separation;
    f.dynamic = this.sim.dynamic;
    f.fps = this.fps;
    this.onFrame?.(f);
  }

  private updateCamera(): void {
    const d = this.director;
    const aspect = this.aspect;
    // Portrait screens: pull back and roll the shot so the approach runs top → bottom.
    const portrait = smoothstep(1.05, 0.62, aspect);
    const fit = 1 + portrait * 0.55;
    const roll = d.roll + portrait * (-Math.PI / 2) * 0.82;

    const shakeT = this.elapsed * 23;
    const shake = d.shake * 0.04;
    const sx = (Math.sin(shakeT) + Math.sin(shakeT * 1.7 + 1.3) * 0.5) * shake;
    const sy = (Math.cos(shakeT * 1.3) + Math.sin(shakeT * 2.1 + 0.4) * 0.5) * shake;

    const px = this.parallaxState.x;
    const py = this.parallaxState.y;
    const az = d.azimuth + this.orbitAccum + this.user.azimuth + px * 0.12;
    const el = clamp(d.elevation + this.user.elevation - py * 0.07, -1.45, 1.45);
    const dist = d.distance * fit * this.user.zoom;
    const target: Vec3 = [d.tx + sx, d.ty + sy, d.tz];
    this.camPos = [
      target[0] + dist * Math.sin(az) * Math.cos(el),
      target[1] + dist * Math.sin(el),
      target[2] + dist * Math.cos(az) * Math.cos(el),
    ];
    mat4.lookAt(this.view, this.camPos, target, [0, 1, 0]);
    if (roll !== 0) {
      const r = this.rollMat;
      r.fill(0);
      r[0] = Math.cos(roll);
      r[1] = Math.sin(roll);
      r[4] = -Math.sin(roll);
      r[5] = Math.cos(roll);
      r[10] = 1;
      r[15] = 1;
      mat4.multiply(this.view, r, this.view);
    }
    mat4.perspective(this.proj, d.fov, aspect, 0.05, 600);
    // Lens shift keeps the subject clear of the overlaid typography.
    this.proj[8] = -(d.shiftX * (1 - portrait));
    this.proj[9] = -(d.shiftY + portrait * 0.22);
    mat4.multiply(this.viewProj, this.proj, this.view);
    mat4.invert(this.invViewProj, this.viewProj);
  }

  project(x: number, y: number, z: number, out: ScreenPoint): ScreenPoint {
    const m = this.viewProj;
    const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
    const cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
    const cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    out.depth = cw;
    if (cw <= 0.01) {
      out.visible = false;
      return out;
    }
    const nx = cx / cw;
    const ny = cy / cw;
    out.x = (nx * 0.5 + 0.5) * this.cssW;
    out.y = (1 - (ny * 0.5 + 0.5)) * this.cssH;
    out.visible = nx > -1.2 && nx < 1.2 && ny > -1.2 && ny < 1.2;
    return out;
  }

  /** Dynamic resolution: if frames are consistently slow, render fewer pixels. */
  private trackPerformance(deltaMs: number): void {
    if (!(deltaMs > 0 && deltaMs < 250)) return;
    const ft = this.frameTimes;
    ft.push(deltaMs);
    if (ft.length > 90) ft.shift();
    if (ft.length < 30) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    this.fps = 1000 / avg;
    if (this.adaptCooldown > 0) {
      this.adaptCooldown--;
      return;
    }
    if (avg > 26 && this.renderScale > 0.55) {
      this.renderScale = Math.max(0.55, this.renderScale * 0.82);
      this.resize();
      this.frameTimes = [];
      this.adaptCooldown = 120;
    } else if (avg < 15 && this.renderScale < 1) {
      this.renderScale = Math.min(1, this.renderScale * 1.1);
      this.resize();
      this.frameTimes = [];
      this.adaptCooldown = 240;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.timer.cancel();
    this.parallax.revert();
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.dispose();
  }
}
