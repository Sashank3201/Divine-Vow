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
 *   data-glass="text"     the element's letters themselves become glass (one per screen)
 */

import { MAX_GLASS } from '../galaxy/shaders';
import type { GlassFrame, TextGlass } from '../galaxy/renderer';

const KINDS: Record<string, number> = { sheet: 0, control: 1, clear: 2, accent: 3 };

/** Accent #8FD3FF in display space. */
const ACCENT: [number, number, number] = [0x8f / 255, 0xd3 / 255, 0xff / 255];

interface NodeInfo {
  /** Text that is not painted (e.g. splitText's visually-hidden copy). */
  skip: boolean;
  /** Nearest clipping ancestor (splitText's per-character wrappers). */
  clip: HTMLElement | null;
  font: string;
}

/**
 * A mask of the glyphs of one element, for glass lettering. Red holds the
 * crisp letter shapes, green a blurred copy the shader reads as a height
 * field (its slope gives each letter a rounded, refracting bevel). Glyph
 * positions come from the live layout, so letters animated by Anime.js
 * (splitText, transforms, clipping) are followed exactly.
 */
class TextMask {
  readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d')!;
  private readonly range = document.createRange();
  private nodes = new WeakMap<Text, NodeInfo>();
  private sig = '';
  version = 0;
  /** Mask origin and size in CSS pixels, and its pixels per CSS pixel. */
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  scale = 1;
  fontPx = 16;

  invalidate(): void {
    this.sig = '';
    this.nodes = new WeakMap();
  }

  private info(t: Text, root: HTMLElement): NodeInfo {
    let info = this.nodes.get(t);
    if (info) return info;
    let clip: HTMLElement | null = null;
    let skip = false;
    for (let n = t.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (n.clientWidth <= 1 && cs.position === 'absolute') skip = true;
      if (!clip && n !== root && cs.overflow !== 'visible') clip = n;
      if (n === root) break;
    }
    const cs = getComputedStyle(t.parentElement ?? root);
    info = { skip, clip, font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}` };
    this.nodes.set(t, info);
    return info;
  }

  update(el: HTMLElement): void {
    const s = Math.min(devicePixelRatio || 1, 2);
    const fontPx = Number.parseFloat(getComputedStyle(el).fontSize) || 16;
    const er = el.getBoundingClientRect();

    // Live glyph boxes (client coordinates).
    type Raw = { ch: string; r: DOMRect; clip: DOMRect | null; font: string };
    const raw: Raw[] = [];
    let minX = er.left;
    let maxX = er.right;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
      const info = this.info(t, el);
      if (info.skip) continue;
      const clip = info.clip?.getBoundingClientRect() ?? null;
      for (let i = 0; i < t.data.length; i++) {
        const ch = t.data[i]!;
        if (!ch.trim()) continue;
        this.range.setStart(t, i);
        this.range.setEnd(t, i + 1);
        const r = this.range.getBoundingClientRect();
        if (r.width === 0) continue;
        raw.push({ ch, r, clip, font: info.font });
        minX = Math.min(minX, r.left);
        maxX = Math.max(maxX, r.right);
      }
    }

    // The mask covers the element and any glyphs that overflow it sideways.
    const pad = Math.ceil(fontPx * 0.3);
    const ox = minX - pad;
    const oy = er.top - pad;
    const W = Math.ceil((maxX - minX + pad * 2) * s);
    const H = Math.ceil((er.height + pad * 2) * s);
    this.x = ox;
    this.y = oy;
    this.w = W / s;
    this.h = H / s;
    this.scale = s;
    this.fontPx = fontPx;

    type Glyph = { ch: string; x: number; top: number; bottom: number; clip: DOMRect | null; font: string };
    const glyphs: Glyph[] = [];
    let sig = `${W}x${H}@${s}`;
    for (const { ch, r, clip, font } of raw) {
      const g: Glyph = { ch, x: r.left - ox, top: r.top - oy, bottom: r.bottom - oy, clip, font };
      glyphs.push(g);
      sig += `|${ch}${g.x.toFixed(2)},${g.top.toFixed(2)}`;
      if (clip) sig += `c${(clip.top - oy).toFixed(1)},${(clip.bottom - oy).toFixed(1)}`;
    }
    if (sig === this.sig) return;
    this.sig = sig;
    this.version++;

    const c = this.canvas;
    const g = this.ctx;
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    g.shadowOffsetX = 0;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    g.textBaseline = 'alphabetic';

    let font = '';
    let asc = 0;
    const draw = (glyph: Glyph, dx: number, withClip: boolean) => {
      if (font !== glyph.font) {
        font = glyph.font;
        g.font = font.replace(/(\d+(?:\.\d+)?)px/, (_, n: string) => `${Number(n) * s}px`);
        asc = g.measureText('H').fontBoundingBoxAscent;
      }
      const clipped =
        withClip && glyph.clip && (glyph.top < glyph.clip.top - oy - 0.5 || glyph.bottom > glyph.clip.bottom - oy + 0.5);
      if (clipped) {
        g.save();
        g.beginPath();
        g.rect(0, (glyph.clip!.top - oy) * s, W, (glyph.clip!.bottom - glyph.clip!.top) * s);
        g.clip();
      }
      g.fillText(glyph.ch, glyph.x * s + dx, glyph.top * s + asc);
      if (clipped) g.restore();
    };

    // Green: a soft copy, drawn as the shadow of glyphs pushed off the canvas.
    const off = W + 400;
    g.shadowColor = '#00ff00';
    g.shadowBlur = fontPx * 0.05 * s;
    g.shadowOffsetX = off;
    g.fillStyle = '#00ff00';
    for (const glyph of glyphs) draw(glyph, -off, true);
    // Red: the crisp letters.
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    g.shadowOffsetX = 0;
    g.fillStyle = '#ff0000';
    for (const glyph of glyphs) draw(glyph, 0, true);
  }
}

export class GlassLayer {
  private els: HTMLElement[] = [];
  private textEl: HTMLElement | null = null;
  private readonly mask = new TextMask();
  private dirty = true;
  private readonly text: TextGlass = {
    canvas: this.mask.canvas,
    version: 0,
    rect: new Float32Array(4),
    param: new Float32Array(4),
    opt: new Float32Array(4),
  };
  private readonly frame: GlassFrame = {
    rects: new Float32Array(MAX_GLASS * 4),
    params: new Float32Array(MAX_GLASS * 4),
    count: 0,
    light: [-0.45, 0.89],
    accent: ACCENT,
    text: null,
  };
  private lx = -0.45;
  private ly = 0.89;
  private tx = -0.45;
  private ty = 0.89;

  constructor() {
    const mark = () => {
      this.dirty = true;
    };
    document.fonts?.addEventListener('loadingdone', () => this.mask.invalidate());
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
      const all = Array.from(document.querySelectorAll<HTMLElement>('[data-glass]'));
      this.textEl = all.find((el) => el.dataset.glass === 'text') ?? null;
      this.els = all.filter((el) => el !== this.textEl);
      this.dirty = false;
    }
    this.frame.text = this.collectText(cssH, k);
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

  private collectText(cssH: number, k: number): TextGlass | null {
    const el = this.textEl;
    if (!el || !el.isConnected) return null;
    const alpha = this.opacity(el);
    if (alpha <= 0) return null;
    const m = this.mask;
    m.update(el);
    if (m.w < 2 || m.h < 2) return null;
    const t = this.text;
    t.version = m.version;
    t.rect[0] = m.x * k;
    t.rect[1] = (cssH - m.y - m.h) * k;
    t.rect[2] = m.w * k;
    t.rect[3] = m.h * k;
    // Gradient step and shadow offset are in mask pixels; the bend is in canvas pixels.
    t.param[0] = alpha;
    t.param[1] = m.fontPx * 0.022 * m.scale;
    t.param[2] = m.fontPx * 0.04 * m.scale;
    t.param[3] = 1;
    t.opt[0] = m.fontPx * 0.1 * k;
    return t;
  }
}
