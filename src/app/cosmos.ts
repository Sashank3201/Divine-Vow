/**
 * Cosmos — the living background shared by every screen.
 *
 * Owns the GalaxyScene, the floating galaxy labels and the transitions
 * between "cinematic" (the hero film) and "journey" (the app, where cosmic
 * time follows the user's streak). All transitions are Anime.js tweens on
 * the scene director.
 */

import { animate, createTimer, utils, type JSAnimation, type Timeline, type Timer } from 'animejs';
import { GalaxyScene, type Director, type FrameInfo, type Quality } from '../galaxy/scene';
import { MILKY_WAY, ANDROMEDA } from '../galaxy/model';
import { createCinematic, type CinematicHandlers } from '../hero/cinematic';
import { $ } from '../ui/dom';

export type CameraPreset = 'hero' | 'sanctuary' | 'sos' | 'calm' | 'vow';

const PRESETS: Record<CameraPreset, Partial<Director>> = {
  hero: { distance: 10.2, elevation: 1.12, exposure: 1, bloom: 1, nebula: 0.32, fade: 1 },
  sanctuary: { distance: 12.5, elevation: 1.05, exposure: 0.95, bloom: 1, nebula: 0.32, fade: 1 },
  vow: { distance: 15, elevation: 1.25, exposure: 0.85, bloom: 1.1, nebula: 0.5, fade: 1 },
  sos: { distance: 18, elevation: 1.32, exposure: 0.7, bloom: 1.2, nebula: 0.6, fade: 1 },
  calm: { distance: 14, elevation: 1.1, exposure: 0.8, bloom: 1, nebula: 0.32, fade: 1 },
};

type FrameListener = (info: FrameInfo) => void;

interface Label {
  el: HTMLElement;
  opacity: number;
  target: number;
}

export class Cosmos {
  readonly scene: GalaxyScene | null;
  readonly canvas: HTMLCanvasElement;
  private readonly listeners = new Set<FrameListener>();
  private cinematic: Timeline | null = null;
  private idle: JSAnimation | null = null;
  private presetAnim: JSAnimation | null = null;
  private veilAnim: JSAnimation | null = null;
  private labels: Label[] = [];
  private labelMode: 'pair' | 'merged' | 'off' = 'off';
  private readonly reduced: boolean;
  private fallbackTimer: Timer | null = null;
  private simClock = 0;

  constructor(canvas: HTMLCanvasElement, quality: Quality | undefined, reduced: boolean) {
    this.canvas = canvas;
    this.reduced = reduced;
    this.scene = GalaxyScene.create(canvas, { quality, onFrame: (f) => this.frame(f) });
    if (!this.scene) {
      canvas.replaceWith(Object.assign(document.createElement('div'), { className: 'cosmos-fallback', id: 'cosmos' }));
      // Keep listeners alive with a synthetic clock so HUDs still tick.
      this.fallbackTimer = createTimer({
        frameRate: 30,
        onUpdate: (t) => {
          this.simClock += Math.min(Math.max(t.deltaTime, 0), 100) / 1000;
          this.listeners.forEach((l) => l(this.fakeFrame()));
        },
      });
    }
    this.buildLabels();
    this.bindPointer();
  }

  get available(): boolean {
    return !!this.scene;
  }

  get director(): Director | null {
    return this.scene?.director ?? null;
  }

  onFrame(fn: FrameListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private fakeFrame(): FrameInfo {
    const p = { x: 0, y: 0, visible: false, depth: 1 };
    return { simTime: this.director?.simTime ?? 0, separation: 6, dynamic: false, cores: [p, p], center: p, fps: 30 };
  }

  // ── Labels ────────────────────────────────────────────────────────────

  private buildLabels(): void {
    const root = $('#labels');
    if (!root) return;
    const make = (name: string, meta: string) => {
      const el = document.createElement('div');
      el.className = 'galaxy-label';
      el.innerHTML = `<span class="galaxy-label__ring"></span><span class="galaxy-label__line"></span><span class="galaxy-label__text"><span class="galaxy-label__name">${name}</span><span class="galaxy-label__meta">${meta}</span></span>`;
      root.appendChild(el);
      return { el, opacity: 0, target: 0 };
    };
    this.labels = [
      make(MILKY_WAY.name, 'Home · 100,000 light-years'),
      make(ANDROMEDA.name, '1 trillion stars · inbound'),
      make('Milkomeda', 'Born from the collision'),
    ];
  }

  setLabels(mode: 'pair' | 'merged' | 'off'): void {
    this.labelMode = mode;
  }

  /** Labels outside this vertical band are hidden (keeps them off overlaid copy). */
  labelFloor = Infinity;
  labelCeiling = 0;
  /** Labels never extend left of this x (the hero copy lives there). */
  labelSafeLeft = 0;

  private updateLabels(f: FrameInfo): void {
    if (!this.labels.length || !this.scene) return;
    const sep = f.separation;
    const t = f.simTime;
    const pairVisible = this.labelMode === 'pair' && sep > 2.6 && t < 26;
    const mergedVisible = (this.labelMode === 'pair' || this.labelMode === 'merged') && t > 34;
    const points = [f.cores[0], f.cores[1], f.center];
    const radii = [MILKY_WAY.radius, ANDROMEDA.radius, 1.8];
    const scale = this.scene.pixelsPerUnit;
    const boxes: Array<{ x: number; y: number; top: boolean; x0: number; y0: number } | undefined> = [];
    this.labels.forEach((l, i) => {
      const p = points[i]!;
      l.target = (i < 2 ? pairVisible : mergedVisible) && p.visible && p.y < this.labelFloor && p.y > this.labelCeiling ? 1 : 0;
      l.opacity += (l.target - l.opacity) * 0.08;
      const r = (radii[i]! * scale) / Math.max(p.depth, 0.1);
      // Labels point away from the companion galaxy, and flip back near a screen edge.
      const other = i === 0 ? points[1]! : i === 1 ? points[0]! : null;
      const w = 230;
      const fitsLeft = p.x - r * 0.62 - w > this.labelSafeLeft;
      const fitsRight = p.x + r * 0.62 + w < innerWidth;
      let flip = other ? p.x < other.x : false;
      if (flip && !fitsLeft) flip = false;
      if (!flip && !fitsRight) flip = true;
      // Narrow screens: neither side fits, so the label floats above the galaxy.
      const top = !fitsLeft && !fitsRight;
      l.el.classList.toggle('is-flipped', flip && !top);
      l.el.classList.toggle('is-top', top);
      const x = top ? utils.clamp(p.x, 90, innerWidth - 90) : flip ? p.x - r * 0.62 : p.x + r * 0.62;
      const y = top ? p.y - r * 0.8 : p.y - r * 0.62;
      boxes[i] = { x: top ? x - w / 2 : flip ? x - w : x, y: top ? y - 44 : y - 22, top, x0: x, y0: y };
      l.el.style.opacity = l.opacity.toFixed(3);
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      l.el.style.visibility = l.opacity < 0.01 ? 'hidden' : 'visible';
    });
    // If the two galaxy labels collide, float Andromeda's above its galaxy.
    const a = boxes[0];
    const b = boxes[1];
    const lb = this.labels[1];
    if (a && b && lb && Math.abs(a.x - b.x) < 230 && Math.abs(a.y - b.y) < 48) {
      const p = points[1]!;
      const r = (radii[1]! * scale) / Math.max(p.depth, 0.1);
      lb.el.classList.remove('is-flipped');
      lb.el.classList.add('is-top');
      lb.el.style.transform = `translate3d(${utils.clamp(p.x, 90, innerWidth - 90).toFixed(1)}px, ${(p.y - r * 0.8).toFixed(1)}px, 0)`;
    }
  }

  private frame(f: FrameInfo): void {
    // Keep the film in sync with the physics: if the integrator falls behind
    // (slow device), the timeline slows down so flashes still land on impact.
    const tl = this.cinematic;
    const d = this.director;
    if (tl && d) {
      const lag = d.simTime - f.simTime;
      const target = lag > 0.3 ? utils.clamp(1 - (lag - 0.3) * 1.6, 0.12, 1) : 1;
      // Anime.js re-anchors a timer whenever its speed is set, so only touch
      // it when the change is meaningful.
      const delta = target - tl.speed;
      if (Math.abs(delta) > 0.03) tl.speed = utils.clamp(tl.speed + delta * 0.35, 0.12, 1);
      else if (target === 1 && tl.speed !== 1 && Math.abs(delta) < 0.03) tl.speed = 1;
    }
    this.updateLabels(f);
    this.listeners.forEach((l) => l(f));
  }

  // ── Interaction ───────────────────────────────────────────────────────

  private bindPointer(): void {
    const scene = this.scene;
    if (!scene || this.reduced) return;
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType === 'touch') return;
        scene.pointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
      },
      { passive: true },
    );
    // Device tilt on phones nudges the camera, like looking through a window.
    window.addEventListener(
      'deviceorientation',
      (e) => {
        if (e.gamma == null || e.beta == null) return;
        scene.pointer(utils.clamp(e.gamma / 30, -1, 1), utils.clamp((e.beta - 45) / 40, -1, 1));
      },
      { passive: true },
    );
  }

  /** Drag on an element to orbit the camera; inertia and spring-back via Anime.js. */
  enableDrag(surface: HTMLElement): () => void {
    const scene = this.scene;
    if (!scene) return () => {};
    let dragging = false;
    let lx = 0;
    let ly = 0;
    let vx = 0;
    let vy = 0;
    let lt = 0;
    let anim: JSAnimation | null = null;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('a, button, input, textarea, [data-no-drag]')) return;
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      lt = performance.now();
      vx = vy = 0;
      anim?.pause();
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      const dt = Math.max(1, now - lt);
      scene.user.azimuth -= dx * 0.005;
      scene.user.elevation = utils.clamp(scene.user.elevation + dy * 0.004, -0.8, 0.45);
      vx = (-dx * 0.005) / dt;
      vy = (dy * 0.004) / dt;
      lx = e.clientX;
      ly = e.clientY;
      lt = now;
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      // Coast with the release velocity, then ease the tilt back home.
      anim = animate(scene.user, {
        azimuth: scene.user.azimuth + vx * 420,
        elevation: [
          { to: utils.clamp(scene.user.elevation + vy * 260, -0.8, 0.45), duration: 900, ease: 'out(3)' },
          { to: 0, duration: 2600, delay: 2200, ease: 'inOutSine' },
        ],
        duration: 1400,
        ease: 'out(3)',
      });
    };
    surface.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      surface.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }

  // ── Modes ─────────────────────────────────────────────────────────────

  playCinematic(handlers: CinematicHandlers): Timeline | null {
    const scene = this.scene;
    if (!scene) return null;
    this.stopAll();
    scene.user.azimuth = 0;
    scene.user.elevation = 0;
    this.setLabels('pair');
    const ev = scene.sim.events;
    scene.setFrameRate(240);
    this.cinematic = createCinematic(scene.director, ev, {
      ...handlers,
      complete: () => {
        this.startIdle();
        handlers.complete?.();
      },
    });
    this.cinematic.play();
    return this.cinematic;
  }

  /** After the film: the remnant keeps evolving slowly while the camera drifts. */
  private startIdle(): void {
    const d = this.director;
    if (!d) return;
    this.idle?.pause();
    this.idle = animate(d, {
      simTime: d.simTime + 30,
      autoOrbit: { to: 0.03, duration: 6000, ease: 'inOutSine' },
      duration: 600000,
      ease: 'linear',
    });
  }

  /** A gentle, motionless-ish scene for reduced-motion users. */
  still(simTime = 0.6): void {
    const d = this.director;
    if (!d) return;
    this.stopAll();
    Object.assign(d, { simTime, exposure: 1, flash: 0, burst: 0, shake: 0, autoOrbit: 0, streak: 0.3 });
    this.setLabels('pair');
  }

  get cinematicTimeline(): Timeline | null {
    return this.cinematic;
  }

  stopAll(): void {
    this.cinematic?.pause();
    this.cinematic = null;
    this.idle?.pause();
    this.idle = null;
    this.presetAnim?.pause();
    this.presetAnim = null;
  }

  /**
   * Journey mode: fly the camera to a preset and fast-forward (or rewind)
   * cosmic time to where the user's streak has brought the galaxies.
   */
  journey(simTarget: number, preset: CameraPreset, opts: { duration?: number; shiftY?: number; shiftX?: number } = {}): void {
    const scene = this.scene;
    const d = this.director;
    if (!scene || !d) return;
    this.cinematic?.pause();
    this.cinematic = null;
    this.idle?.pause();
    this.idle = null;
    this.presetAnim?.pause();
    scene.setFrameRate(preset === 'hero' ? 240 : 40);
    // Labels belong to the film; behind app screens they would just be noise.
    this.setLabels(preset === 'hero' ? (simTarget > 33 ? 'merged' : 'pair') : 'off');
    const p = PRESETS[preset];
    const duration = this.reduced ? 10 : (opts.duration ?? 3200);
    const rewinding = simTarget < scene.sim.time - 0.01;
    if (rewinding) {
      // Time cannot run backwards here — dissolve, restart the cosmos, fast-forward.
      d.fade = 0.0;
      d.simTime = 0;
    }
    const distanceAhead = Math.abs(simTarget - d.simTime);
    this.presetAnim = animate(d, {
      ...p,
      fade: { to: 1, duration: rewinding ? 1400 : 600, ease: 'out(2)' },
      simTime: {
        to: simTarget,
        duration: this.reduced ? 10 : utils.clamp(distanceAhead * 140, 900, 5200),
        ease: 'inOut(3)',
      },
      shiftX: opts.shiftX ?? 0,
      shiftY: opts.shiftY ?? 0,
      flash: 0,
      burst: simTarget > 6 && simTarget < 9 ? 0.4 : 0,
      shake: 0,
      streak: 0.4,
      youth: simTarget > 33 ? 0.35 : 1,
      dust: simTarget > 33 ? 0.22 : 1,
      autoOrbit: this.reduced ? 0 : 0.018,
      duration,
      ease: 'inOut(3)',
      onComplete: () => {
        // Breathe: cosmic time keeps creeping forward very slowly while you stay.
        if (!this.reduced && this.director) {
          this.idle = animate(this.director, { simTime: simTarget + 0.6, duration: 240000, ease: 'linear' });
        }
      },
    });
  }

  setVeil(opacity: number, duration = 900): void {
    const veil = $('#dim');
    if (!veil) return;
    this.veilAnim?.pause();
    this.veilAnim = animate(veil, { opacity, duration, ease: 'out(3)' });
  }

  setShift(shiftX: number, shiftY: number, duration = 1400): void {
    const d = this.director;
    if (!d) return;
    animate(d, { shiftX, shiftY, duration, ease: 'inOut(3)', composition: 'blend' });
  }

  pause(): void {
    this.scene?.pause();
    this.fallbackTimer?.pause();
  }

  resume(): void {
    this.scene?.resume();
    this.fallbackTimer?.resume();
  }
}
