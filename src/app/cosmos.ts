/**
 * Cosmos — the living background behind every screen, and the canvas that
 * paints the liquid glass. Owns the GalaxyScene, the galaxy labels and the
 * transitions between the hero film and journey mode (where cosmic time
 * follows the user's streak). Every transition is an Anime.js tween on the
 * scene director.
 */

import { animate, createTimer, utils, type JSAnimation, type Timeline, type Timer } from 'animejs';
import { GalaxyScene, type Director, type FrameInfo, type Quality } from '../galaxy/scene';
import { MILKY_WAY, ANDROMEDA } from '../galaxy/model';
import { createCinematic, type CinematicHandlers } from '../hero/cinematic';
import { GlassLayer } from './glass';
import { $ } from '../ui/dom';

export type CameraPreset = 'hero' | 'home' | 'dashboard' | 'sos' | 'calm' | 'vow';

const PRESETS: Record<CameraPreset, Partial<Director>> = {
  hero: { distance: 10.2, elevation: 1.12, exposure: 1, bloom: 1, nebula: 0.22, fade: 1 },
  home: { distance: 10.5, elevation: 1.05, exposure: 1, bloom: 1, nebula: 0.22, fade: 1 },
  dashboard: { distance: 13, elevation: 1.1, exposure: 0.95, bloom: 1, nebula: 0.22, fade: 1 },
  sos: { distance: 17, elevation: 1.3, exposure: 0.8, bloom: 1.05, nebula: 0.26, fade: 1 },
  calm: { distance: 14, elevation: 1.15, exposure: 0.9, bloom: 1, nebula: 0.22, fade: 1 },
  vow: { distance: 15, elevation: 1.22, exposure: 0.95, bloom: 1.05, nebula: 0.24, fade: 1 },
};

type FrameListener = (info: FrameInfo) => void;

interface Label {
  el: HTMLElement;
  opacity: number;
}

export class Cosmos {
  readonly scene: GalaxyScene | null;
  readonly glass: GlassLayer;
  private readonly listeners = new Set<FrameListener>();
  private cinematic: Timeline | null = null;
  private idle: JSAnimation | null = null;
  private presetAnim: JSAnimation | null = null;
  private labels: Label[] = [];
  private labelMode: 'pair' | 'merged' | 'off' = 'off';
  private readonly reduced: boolean;
  private fallbackTimer: Timer | null = null;

  /** Labels are kept inside this vertical band and right of this x. */
  labelFloor = Infinity;
  labelCeiling = 0;
  labelSafeLeft = 0;
  /** Labels that would land on this box (the screen's text) are hidden. */
  labelAvoid: DOMRect | null = null;

  constructor(canvas: HTMLCanvasElement, quality: Quality | undefined, reduced: boolean) {
    this.reduced = reduced;
    this.glass = new GlassLayer();
    this.scene = GalaxyScene.create(canvas, {
      quality,
      onFrame: (f) => this.frame(f),
      glass: (w, h, k) => this.glass.collect(w, h, k),
    });
    if (!this.scene) {
      // No WebGL2: CSS approximates the glass and a gradient stands in for the cosmos.
      document.documentElement.classList.add('glass-css');
      canvas.replaceWith(Object.assign(document.createElement('div'), { className: 'cosmos-fallback', id: 'cosmos' }));
      this.fallbackTimer = createTimer({
        frameRate: 30,
        onUpdate: () => this.listeners.forEach((l) => l(this.fakeFrame())),
      });
    }
    this.buildLabels();
    this.bindPointer();
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
    return { simTime: 0, separation: 6, dynamic: false, cores: [p, p], center: p, fps: 30 };
  }

  // ── Labels ────────────────────────────────────────────────────────────

  private buildLabels(): void {
    const root = $('#labels');
    if (!root) return;
    const make = (name: string) => {
      const el = document.createElement('div');
      el.className = 'galaxy-label';
      el.textContent = name;
      root.appendChild(el);
      return { el, opacity: 0 };
    };
    this.labels = [make(MILKY_WAY.name), make(ANDROMEDA.name), make('Milkomeda')];
  }

  setLabels(mode: 'pair' | 'merged' | 'off'): void {
    this.labelMode = mode;
  }

  private updateLabels(f: FrameInfo): void {
    if (!this.labels.length || !this.scene) return;
    const t = f.simTime;
    const pairVisible = this.labelMode === 'pair' && f.separation > 2.6 && t < 26;
    const mergedVisible = this.labelMode !== 'off' && t > 36;
    const points = [f.cores[0], f.cores[1], f.center];
    const radii = [MILKY_WAY.radius, ANDROMEDA.radius, 1.8];
    const scale = this.scene.pixelsPerUnit;
    const W = 120;
    const boxes: Array<{ x: number; y: number }> = [];
    this.labels.forEach((l, i) => {
      const p = points[i]!;
      const r = (radii[i]! * scale) / Math.max(p.depth, 0.1);
      const other = i === 0 ? points[1]! : i === 1 ? points[0]! : null;
      const fitsLeft = p.x - r * 0.7 - W > this.labelSafeLeft;
      const fitsRight = p.x + r * 0.7 + W < innerWidth;
      let flip = other ? p.x < other.x : false;
      if (flip && !fitsLeft) flip = false;
      if (!flip && !fitsRight) flip = true;
      const top = (!fitsLeft && !fitsRight) || i === 2;
      const x = top ? utils.clamp(p.x, 60, innerWidth - 60) : flip ? p.x - r * 0.7 : p.x + r * 0.7;
      const y = top ? p.y - r * 0.75 : p.y - r * 0.45;
      boxes[i] = { x: flip && !top ? x - W : x, y };
      const bx = top ? x - W / 2 : flip ? x - W : x;
      const av = this.labelAvoid;
      const onText = !!av && bx < av.right + 16 && bx + W > av.left - 16 && y < av.bottom + 16 && y + 24 > av.top - 16;
      const show =
        (i < 2 ? pairVisible : mergedVisible) && p.visible && p.y < this.labelFloor && p.y > this.labelCeiling && !onText;
      l.opacity += ((show ? 1 : 0) - l.opacity) * 0.08;
      l.el.classList.toggle('is-flipped', flip && !top);
      l.el.classList.toggle('is-top', top);
      l.el.style.opacity = l.opacity.toFixed(3);
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      l.el.style.visibility = l.opacity < 0.01 ? 'hidden' : 'visible';
    });
    const a = boxes[0];
    const b = boxes[1];
    if (a && b && Math.abs(a.x - b.x) < W && Math.abs(a.y - b.y) < 24) {
      const p = points[1]!;
      const r = (radii[1]! * scale) / Math.max(p.depth, 0.1);
      const lb = this.labels[1]!;
      lb.el.classList.remove('is-flipped');
      lb.el.classList.add('is-top');
      lb.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y - r * 0.75).toFixed(1)}px, 0)`;
    }
  }

  private frame(f: FrameInfo): void {
    // Keep the film in sync with the physics on slow devices. Anime.js
    // re-anchors a timer whenever its speed is set, so only touch it when
    // the change is meaningful.
    const tl = this.cinematic;
    const d = this.director;
    if (tl && d) {
      const lag = d.simTime - f.simTime;
      const target = lag > 0.3 ? utils.clamp(1 - (lag - 0.3) * 1.6, 0.12, 1) : 1;
      const delta = target - tl.speed;
      if (Math.abs(delta) > 0.03) tl.speed = utils.clamp(tl.speed + delta * 0.35, 0.12, 1);
      else if (target === 1 && tl.speed !== 1) tl.speed = 1;
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
    window.addEventListener(
      'deviceorientation',
      (e) => {
        if (e.gamma == null || e.beta == null) return;
        scene.pointer(utils.clamp(e.gamma / 30, -1, 1), utils.clamp((e.beta - 45) / 40, -1, 1));
      },
      { passive: true },
    );
  }

  /** Drag empty space to orbit the camera; it coasts, then eases home. */
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
      if ((e.target as HTMLElement).closest('a, button, input, textarea, [data-glass]')) return;
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
    scene.setFrameRate(240);
    scene.user.azimuth = 0;
    scene.user.elevation = 0;
    this.setLabels('pair');
    this.cinematic = createCinematic(scene.director, scene.sim.events, {
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

  /** A still scene for reduced-motion users. */
  still(simTime = 0.6): void {
    const d = this.director;
    if (!d) return;
    this.stopAll();
    Object.assign(d, { simTime, exposure: 1, flash: 0, burst: 0, shake: 0, autoOrbit: 0, streak: 0.3 });
    this.setLabels('pair');
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
  journey(simTarget: number, preset: CameraPreset, opts: { shiftX?: number; shiftY?: number } = {}): void {
    const scene = this.scene;
    const d = this.director;
    if (!scene || !d) return;
    this.cinematic?.pause();
    this.cinematic = null;
    this.idle?.pause();
    this.idle = null;
    this.presetAnim?.pause();
    // Glass panes track the DOM every frame, so the canvas keeps full rate.
    scene.setFrameRate(240);
    this.setLabels('off');
    const p = PRESETS[preset];
    const rewinding = simTarget < scene.sim.time - 0.01;
    if (rewinding) {
      // Time cannot run backwards: dissolve, restart the cosmos, fast-forward.
      d.fade = 0;
      d.simTime = 0;
    }
    const ahead = Math.abs(simTarget - d.simTime);
    this.presetAnim = animate(d, {
      ...p,
      fade: { to: 1, duration: rewinding ? 1400 : 600, ease: 'out(2)' },
      simTime: { to: simTarget, duration: this.reduced ? 10 : utils.clamp(ahead * 140, 900, 5200), ease: 'inOut(3)' },
      shiftX: opts.shiftX ?? 0,
      shiftY: opts.shiftY ?? 0,
      flash: 0,
      burst: simTarget > 6 && simTarget < 9 ? 0.4 : 0,
      shake: 0,
      streak: 0.3,
      youth: simTarget > 33 ? 0.35 : 1,
      dust: simTarget > 33 ? 0.22 : 1,
      autoOrbit: this.reduced ? 0 : 0.016,
      duration: this.reduced ? 10 : 2600,
      ease: 'inOut(3)',
      onComplete: () => {
        if (!this.reduced && this.director) {
          this.idle = animate(this.director, { simTime: simTarget + 0.6, duration: 240000, ease: 'linear' });
        }
      },
    });
  }

  setShift(shiftX: number, shiftY: number, duration = 1400): void {
    const d = this.director;
    if (!d) return;
    animate(d, { shiftX, shiftY, duration, ease: 'inOut(3)', composition: 'blend' });
  }

  /** A soft cosmic flash — sealed vows, milestones, urges beaten. */
  flash(strength = 0.6): void {
    const d = this.director;
    if (!d || this.reduced) return;
    animate(d, {
      flash: [{ to: strength, duration: 260, ease: 'out(3)' }, { to: 0, duration: 2200, ease: 'inOut(2)' }],
      composition: 'blend',
    });
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
