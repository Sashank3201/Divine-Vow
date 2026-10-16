/** Particle bursts and milestone celebrations. */

import { animate, spring, createTimeline, stagger, svg, utils } from 'animejs';
import type { AppContext } from '../app/types';
import type { Milestone } from '../core/journey';
import { el, esc, vibrate } from './dom';
import { sound } from './sound';

const COLORS = ['#ffe7b3', '#f4c97c', '#ffffff', '#bcaeff', '#79d8ff', '#ff9fc6'];

/** Spray of glowing sparks from a screen point. */
export function burst(x: number, y: number, count = 36, spread = 220): void {
  const sparks: HTMLElement[] = [];
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'burst';
    const c = utils.randomPick(COLORS);
    s.style.color = c;
    s.style.background = c;
    const size = utils.random(3, 9);
    s.style.width = s.style.height = `${size}px`;
    s.style.left = `${x - size / 2}px`;
    s.style.top = `${y - size / 2}px`;
    document.body.appendChild(s);
    sparks.push(s);
  }
  animate(sparks, {
    x: () => utils.random(-spread, spread),
    y: () => utils.random(-spread, spread * 0.7),
    scale: [{ to: () => utils.random(1, 1.8, 2), duration: 200 }, { to: 0, duration: () => utils.random(700, 1400) }],
    opacity: [{ to: 1, duration: 80 }, { to: 0, duration: 900, delay: 300 }],
    ease: 'out(4)',
    delay: stagger(6),
    onComplete: () => sparks.forEach((s) => s.remove()),
  });
}

/** Pulse the cosmos with a soft flash — used for vows and milestones. */
export function cosmicFlash(ctx: AppContext, strength = 0.8): void {
  const d = ctx.cosmos.director;
  if (!d || ctx.reduced) return;
  animate(d, {
    flash: [{ to: strength, duration: 260, ease: 'out(3)' }, { to: 0, duration: 2200, ease: 'inOut(2)' }],
    bloom: [{ to: 1.8, duration: 260 }, { to: 1, duration: 2400 }],
    composition: 'blend',
  });
}

export function celebrate(m: Milestone, ctx: AppContext): void {
  const overlay = el(`
    <div class="celebrate" role="dialog" aria-modal="true" aria-label="Milestone reached">
      <div class="celebrate__inner">
        <div class="celebrate__star">
          <svg viewBox="-100 -100 200 200" aria-hidden="true">
            <defs>
              <radialGradient id="cel-g"><stop offset="0" stop-color="#fff"/><stop offset="0.4" stop-color="${m.hue}"/><stop offset="1" stop-color="${m.hue}" stop-opacity="0"/></radialGradient>
            </defs>
            <circle r="90" fill="url(#cel-g)" opacity="0.35" data-glow/>
            <g data-rays stroke="${m.hue}" stroke-width="1.2" opacity="0.7">
              ${Array.from({ length: 16 }, (_, i) => {
                const a = (i / 16) * Math.PI * 2;
                const r0 = 52;
                const r1 = i % 2 ? 78 : 96;
                return `<line x1="${(Math.cos(a) * r0).toFixed(1)}" y1="${(Math.sin(a) * r0).toFixed(1)}" x2="${(Math.cos(a) * r1).toFixed(1)}" y2="${(Math.sin(a) * r1).toFixed(1)}"/>`;
              }).join('')}
            </g>
            <path data-star d="M0 -64 C 6 -18, 18 -6, 64 0 C 18 6, 6 18, 0 64 C -6 18, -18 6, -64 0 C -18 -6, -6 -18, 0 -64 Z" fill="${m.hue}" stroke="#fff" stroke-width="1"/>
          </svg>
        </div>
        <span class="eyebrow">Milestone reached</span>
        <h2 class="celebrate__name gold-text">${esc(m.name)}</h2>
        <p class="celebrate__title">${esc(m.title)}</p>
        <p class="celebrate__text">${esc(m.blurb)}</p>
        <button class="btn btn--primary" type="button" data-continue>Continue</button>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  sound.chime(4);
  window.setTimeout(() => sound.chime(6), 260);
  vibrate([30, 60, 30, 60, 120]);
  cosmicFlash(ctx, 0.9);

  const rays = overlay.querySelectorAll<SVGLineElement>('[data-rays] line');
  const tl = createTimeline({ defaults: { ease: 'out(4)' } });
  tl.add(overlay, { opacity: { from: 0, to: 1 }, duration: 500 })
    .add(overlay.querySelector<SVGPathElement>('[data-star]')!, { scale: { from: 0, to: 1 }, rotate: { from: -180, to: 0 }, ease: spring({ stiffness: 140, damping: 11 }) }, 150)
    .add(svg.createDrawable(Array.from(rays)), { draw: ['0 0', '0 1'], duration: 900, delay: stagger(30) }, 350)
    .add(overlay.querySelector<SVGCircleElement>('[data-glow]')!, { scale: { from: 0.4, to: 1 }, opacity: { from: 0, to: 0.35 }, duration: 1400 }, 200)
    .add(overlay.querySelectorAll('.celebrate__inner > :not(.celebrate__star)'), {
      opacity: { from: 0, to: 1 },
      y: { from: 24, to: 0 },
      delay: stagger(90),
      duration: 900,
    }, 500);
  animate(overlay.querySelector('[data-rays]')!, { rotate: 360, duration: 40000, loop: true, ease: 'linear' });

  const r = overlay.querySelector('.celebrate__star')!.getBoundingClientRect();
  window.setTimeout(() => burst(r.left + r.width / 2, r.top + r.height / 2, 60, 260), 380);

  overlay.querySelector('[data-continue]')!.addEventListener('click', () => {
    animate(overlay, { opacity: 0, duration: 500, ease: 'in(2)', onComplete: () => overlay.remove() });
  });
}
