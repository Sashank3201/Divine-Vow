/** Your sky — every milestone is a star; your streak draws the constellation. */

import { animate, spring, stagger, svg, utils } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store } from '../core/store';
import { MILESTONES, humanDuration, streakMs, type Milestone } from '../core/journey';
import { icons } from '../ui/icons';
import { $, $$, el, esc } from '../ui/dom';

const POS: Array<[number, number]> = [
  [130, 720],
  [250, 615],
  [325, 470],
  [470, 525],
  [565, 395],
  [500, 255],
  [650, 190],
  [790, 280],
  [860, 140],
  [705, 65],
];

export function skyView(ctx: AppContext): View {
  const s = store.get();
  const ms = streakMs(s);
  const lit = MILESTONES.map((m) => ms >= m.at);
  const ever = MILESTONES.map((m) => !!s.everMilestones[m.id]);
  const nextIdx = lit.indexOf(false);
  const litCount = lit.filter(Boolean).length;

  const bgStars = Array.from({ length: 140 }, () => [utils.random(0, 1000), utils.random(0, 860), utils.random(0.4, 1.8, 1)] as const);

  const root = el(`
    <div class="view view--app">
      <div class="container" style="max-width:980px">
        <header class="view-head" data-anim>
          <span class="eyebrow">Your sky</span>
          <h1 class="h1">${litCount ? `${litCount} of ${MILESTONES.length} stars lit` : 'Your first star is close'}</h1>
          <p class="lede" style="margin-top:12px">Each milestone of your current orbit lights a star. Tap one to read its story.</p>
        </header>
        <section class="glass" data-anim style="padding:clamp(10px,3vw,24px)">
          <div class="sky">
            <svg viewBox="0 0 1000 860" role="img" aria-label="Constellation of milestones">
              <defs>
                <radialGradient id="sky-glow"><stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="#ffe7b3" stop-opacity="0.8"/><stop offset="1" stop-color="#f4c97c" stop-opacity="0"/></radialGradient>
                <linearGradient id="sky-line" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f4c97c"/><stop offset="1" stop-color="#bcaeff"/></linearGradient>
              </defs>
              <g data-bg>${bgStars.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="0.35"/>`).join('')}</g>
              <g>
                ${POS.slice(1)
                  .map(([x, y], i) => {
                    const [px, py] = POS[i]!;
                    return `<line x1="${px}" y1="${py}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,0.09)" stroke-width="1.2" stroke-dasharray="3 6"/>`;
                  })
                  .join('')}
              </g>
              <g data-lines>
                ${POS.slice(1)
                  .map(([x, y], i) => {
                    if (!lit[i + 1]) return '';
                    const [px, py] = POS[i]!;
                    return `<line x1="${px}" y1="${py}" x2="${x}" y2="${y}" stroke="url(#sky-line)" stroke-width="2" stroke-linecap="round"/>`;
                  })
                  .join('')}
              </g>
              ${MILESTONES.map((m, i) => {
                const [x, y] = POS[i]!;
                const on = lit[i];
                const before = !on && ever[i];
                const isNext = i === nextIdx;
                return `<g class="sky__star ${on ? 'is-lit' : ''}" data-star="${i}" transform="translate(${x} ${y})" tabindex="0" role="button" aria-label="${esc(m.name)}">
                  <circle r="34" fill="transparent"/>
                  ${on ? `<circle r="30" fill="url(#sky-glow)" opacity="0.55" data-glow/>` : ''}
                  ${isNext ? `<circle r="16" fill="none" stroke="${m.hue}" stroke-width="1.2" data-pulse/>` : ''}
                  ${before ? `<circle r="9" fill="none" stroke="#f4c97c" stroke-width="1" opacity="0.5"/>` : ''}
                  ${
                    on
                      ? `<path d="M0 -14 C 1.4 -4, 4 -1.4, 14 0 C 4 1.4, 1.4 4, 0 14 C -1.4 4, -4 1.4, -14 0 C -4 -1.4, -1.4 -4, 0 -14 Z" fill="${m.hue}" data-core/>`
                      : `<circle r="3.4" fill="rgba(255,255,255,0.45)"/>`
                  }
                  <text y="${i === 9 ? -26 : 34}" text-anchor="middle">${esc(m.name)}</text>
                </g>`;
              }).join('')}
            </svg>
          </div>
        </section>
        <section class="glass glass--pad sky-detail" data-anim data-detail style="margin-top:16px"></section>
      </div>
    </div>
  `);

  const detail = $('[data-detail]', root)!;
  const show = (i: number) => {
    const m: Milestone = MILESTONES[i]!;
    const at = store.get().milestones[m.id];
    const everAt = store.get().everMilestones[m.id];
    const status = lit[i]
      ? `<span class="pill">${icons.check}Reached ${at ? new Date(at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''}</span>`
      : `<span class="pill pill--teal">${icons.clock}In ${esc(humanDuration(m.at - streakMs()))}</span>${everAt ? ' <span class="pill pill--rose">Reached in a past orbit</span>' : ''}`;
    detail.innerHTML = `
      <div class="row wrap" style="justify-content:space-between">
        <div class="card-title" style="color:${m.hue}">${icons.star4}${esc(m.name)} · ${esc(humanDuration(m.at))}</div>
        <div class="row wrap" style="--gap:8px">${status}</div>
      </div>
      <h3 class="h2" style="font-size:28px;margin-top:12px">${esc(m.title)}</h3>
      <p class="lede" style="margin-top:8px">${esc(m.blurb)}</p>`;
    if (!ctx.reduced) animate(detail.children, { opacity: { from: 0, to: 1 }, y: { from: 10, to: 0 }, delay: stagger(60), duration: 500, ease: 'out(3)' });
    $$('[data-star]', root).forEach((g, k) => g.setAttribute('aria-pressed', String(k === i)));
  };

  root.addEventListener('click', (e) => {
    const g = (e.target as Element).closest<SVGGElement>('[data-star]');
    if (!g) return;
    const i = Number(g.dataset.star);
    animate(g.querySelector('[data-core], circle:last-of-type')!, { scale: [1, 1.6, 1], duration: 600, ease: 'out(3)' });
    show(i);
  });
  root.addEventListener('keydown', (e) => {
    const g = (e.target as Element).closest?.<SVGGElement>('[data-star]');
    if (g && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      show(Number(g.dataset.star));
    }
  });

  return {
    el: root,
    preset: 'calm',
    enter() {
      show(Math.max(0, nextIdx === -1 ? MILESTONES.length - 1 : nextIdx > 0 ? nextIdx - 1 : 0));
      if (ctx.reduced) return;
      // Background twinkle: every star on its own random rhythm.
      animate($$('[data-bg] circle', root), {
        opacity: () => [utils.random(0.1, 0.3, 2), utils.random(0.5, 0.9, 2)],
        duration: () => utils.random(1400, 4200),
        delay: () => utils.random(0, 3000),
        loop: true,
        alternate: true,
        ease: 'inOutSine',
      });
      const lines = $$<SVGLineElement>('[data-lines] line', root);
      if (lines.length) animate(svg.createDrawable(lines), { draw: ['0 0', '0 1'], delay: stagger(260, { start: 500 }), duration: 900, ease: 'inOut(3)' });
      animate($$('[data-core]', root), {
        scale: { from: 0, to: 1 },
        rotate: { from: -90, to: 0 },
        delay: stagger(260, { start: 400 }),
        ease: spring({ stiffness: 160, damping: 12 }),
      });
      animate($$('[data-glow]', root), { scale: [0.8, 1.15], opacity: [0.35, 0.6], duration: 2200, loop: true, alternate: true, ease: 'inOutSine', delay: stagger(300) });
      const pulse = $('[data-pulse]', root);
      if (pulse) animate(pulse, { scale: [1, 1.9], opacity: [0.9, 0], duration: 1800, loop: true, ease: 'out(2)' });
    },
  };
}
