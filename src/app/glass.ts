/**
 * Liquid glass, driven by the DOM.
 *
 * Any element with a `data-glass` attribute becomes a pane of liquid glass:
 * every frame its on-screen rectangle, corner radius and opacity are read
 * and handed to the WebGL compositor, which refracts the galaxy behind it.
 * The DOM element itself stays transparent and simply holds the content,
 * so Anime.js can move, scale and morph it and the glass follows exactly.
 *
 *   data-glass="sheet"    big frosted panels (readable text on top)
 *   data-glass="control"  buttons, pills, small surfaces
 *   data-glass="clear"    nearly clear glass, strongest refraction
 *   data-glass="accent"   glass tinted with the accent colour
 */

import { MAX_GLASS } from '../galaxy/shaders';
import type { GlassFrame } from '../galaxy/renderer';

const KINDS: Record<string, number> = { sheet: 0, control: 1, clear: 2, accent: 3 };

/** Accent #8FD3FF in display space. */
const ACCENT: [number, number, number] = [0x8f / 255, 0xd3 / 255, 0xff / 255];

export class GlassLayer {
  private els: HTMLElement[] = [];
  private dirty = true;
  private readonly frame: GlassFrame = {
    rects: new Float32Array(MAX_GLASS * 4),
    params: new Float32Array(MAX_GLASS * 4),
    count: 0,
    light: [-0.45, 0.89],
    accent: ACCENT,
  };
  private lx = -0.45;
  private ly = 0.89;
  private tx = -0.45;
  private ty = 0.89;

  constructor() {
    const mark = () => {
      this.dirty = true;
    };
    new MutationObserver(mark).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-glass'],
    });
    // The specular highlight follows the pointer (desktop) or the tilt (phone).
    window.addEventListener(
      'pointermove',
      (e) => this.aim(e.clientX / innerWidth, e.clientY / innerHeight),
      { passive: true },
    );
    window.addEventListener(
      'deviceorientation',
      (e) => {
        if (e.gamma == null || e.beta == null) return;
        this.aim(0.5 + e.gamma / 70, 0.5 - (e.beta - 40) / 90);
      },
      { passive: true },
    );
  }

  /** Light direction (screen space, y up) from a normalised pointer position. */
  private aim(mx: number, my: number): void {
    const x = (mx - 0.5) * 1.5 - 0.25;
    const y = 0.85 + (0.5 - my) * 0.7;
    const l = Math.hypot(x, y) || 1;
    this.tx = x / l;
    this.ty = y / l;
  }

  private opacity(el: HTMLElement): number {
    let a = 1;
    for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return 0;
      a *= Number.parseFloat(cs.opacity);
      if (a < 0.005) return 0;
    }
    return a;
  }

  /** Read every glass pane for this frame. `k` is canvas pixels per CSS pixel. */
  collect(cssW: number, cssH: number, k: number): GlassFrame {
    if (this.dirty) {
      this.els = Array.from(document.querySelectorAll<HTMLElement>('[data-glass]'));
      this.dirty = false;
    }
    const { rects, params } = this.frame;
    let n = 0;
    for (const el of this.els) {
      if (n >= MAX_GLASS) break;
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.right < -80 || r.bottom < -80 || r.left > cssW + 80 || r.top > cssH + 80) continue;
      const alpha = this.opacity(el);
      if (alpha <= 0) continue;
      const cs = getComputedStyle(el);
      const scale = el.offsetWidth ? r.width / el.offsetWidth : 1;
      const raw = cs.borderTopLeftRadius;
      const rad = raw.endsWith('%')
        ? (Number.parseFloat(raw) / 100) * Math.min(r.width, r.height)
        : Number.parseFloat(raw) * scale || 0;
      const o = n * 4;
      rects[o] = r.left * k;
      rects[o + 1] = (cssH - r.bottom) * k;
      rects[o + 2] = r.width * k;
      rects[o + 3] = r.height * k;
      params[o] = Math.min(rad, r.width / 2, r.height / 2) * k;
      params[o + 1] = alpha;
      params[o + 2] = KINDS[el.dataset.glass ?? ''] ?? 1;
      params[o + 3] = el.matches(':active') ? 1 : 0;
      n++;
    }
    this.frame.count = n;
    this.lx += (this.tx - this.lx) * 0.06;
    this.ly += (this.ty - this.ly) * 0.06;
    const l = Math.hypot(this.lx, this.ly) || 1;
    this.frame.light[0] = this.lx / l;
    this.frame.light[1] = this.ly / l;
    return this.frame;
  }
}
