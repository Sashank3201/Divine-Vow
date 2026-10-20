/** Spark bursts and the milestone sheet. */

import { animate, stagger, utils } from 'animejs';
import type { AppContext } from '../app/types';
import type { Milestone } from '../core/journey';
import { esc, vibrate } from './dom';
import { openModal } from './overlay';

const COLORS = ['#ffffff', '#dff3ff', '#8fd3ff'];

/** A small spray of white and ice-blue sparks from a screen point. */
export function burst(x: number, y: number, count = 28, spread = 180): void {
  const sparks: HTMLElement[] = [];
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'burst';
    const size = utils.random(2, 6);
    s.style.width = s.style.height = `${size}px`;
    s.style.left = `${x - size / 2}px`;
    s.style.top = `${y - size / 2}px`;
    s.style.background = utils.randomPick(COLORS);
    document.body.appendChild(s);
    sparks.push(s);
  }
  animate(sparks, {
    x: () => utils.random(-spread, spread),
    y: () => utils.random(-spread, spread * 0.7),
    opacity: [{ to: 1, duration: 60 }, { to: 0, duration: () => utils.random(600, 1100), delay: 200 }],
    scale: { to: 0.3 },
    duration: () => utils.random(800, 1300),
    ease: 'out(4)',
    delay: stagger(4),
    onComplete: () => sparks.forEach((s) => s.remove()),
  });
}

/** The milestone sheet; resolves once it is closed. */
export function celebrate(m: Milestone, ctx: AppContext): Promise<void> {
  return new Promise((resolve) => {
    const modal = openModal(
      `<div class="stack celebrate" style="--gap:6px;text-align:center;align-items:center">
        <svg class="celebrate__star" viewBox="-50 -50 100 100" aria-hidden="true"><path d="M0 -40 C 4 -11, 11 -4, 40 0 C 11 4, 4 11, 0 40 C -4 11, -11 4, -40 0 C -11 -4, -4 -11, 0 -40 Z" fill="#fff"/></svg>
        <p class="t-label">Milestone</p>
        <h2 class="t-large">${esc(m.name)}</h2>
        <p class="t-headline t-accent">${esc(m.title)}</p>
        <p class="t-sub">${esc(m.blurb)}</p>
        <button class="btn btn--accent btn--block" type="button" data-close style="margin-top:18px">Continue</button>
      </div>`,
      { label: `Milestone: ${m.name}`, onClose: resolve },
    );
    const star = modal.body.querySelector<SVGElement>('.celebrate__star')!;
    animate(star, { scale: { from: 0, to: 1 }, rotate: { from: -120, to: 0 }, duration: 900, ease: 'outElastic(1, .6)' });
    vibrate([30, 60, 30]);
    ctx.cosmos.flash(0.5);
    window.setTimeout(() => {
      const r = star.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2, 40, 200);
    }, 300);
  });
}
