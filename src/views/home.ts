/**
 * Home — the galaxy, exactly where your streak has brought it, a day count
 * and two liquid-glass buttons. Everything else lives in the dashboard.
 */

import { animate, createTimer, spring, stagger, utils, type Timer } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store } from '../core/store';
import { DAY, JOURNEY_BEATS, JOURNEY_DAYS, parts, streakMs } from '../core/journey';
import { icons } from '../ui/icons';
import { $, $$, el } from '../ui/dom';

const pad = (n: number) => String(n).padStart(2, '0');

export function homeView(ctx: AppContext): View {
  const root = el(`
    <div class="screen home">
      <header class="topline">
        <span class="brand">Divine Vow</span>
        <div class="inline" style="--gap:10px">
          <a class="icon-btn" data-glass="control" data-morph href="#/journal" aria-label="Journal">${icons.book}</a>
          <a class="icon-btn" data-glass="control" data-morph href="#/settings" aria-label="Settings">${icons.gear}</a>
        </div>
      </header>

      <div class="home__day" data-glass="control">
        <span class="home__day-num t-num" data-days>0</span>
        <span class="home__day-unit" data-unit>days</span>
        <span class="home__day-sep"></span>
        <span class="home__day-time t-num" data-clock>00:00:00</span>
      </div>
      <p class="home__phase" data-phase></p>

      <div class="home__actions">
        <a class="btn btn--lg" data-glass="control" data-morph href="#/sos">${icons.lifebuoy}<span>I have an urge</span></a>
        <a class="btn btn--lg" data-glass="accent" data-morph href="#/dashboard"><span>Open dashboard</span></a>
      </div>
    </div>
  `);

  const daysEl = $('[data-days]', root)!;
  const unitEl = $('[data-unit]', root)!;
  const clockEl = $('[data-clock]', root)!;
  const phaseEl = $('[data-phase]', root)!;
  let timer: Timer | null = null;
  let cleanupDrag = () => {};

  const render = () => {
    const ms = streakMs();
    const p = parts(ms);
    clockEl.textContent = `${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`;
    const day = Math.min(ms / DAY, JOURNEY_DAYS);
    const beat = [...JOURNEY_BEATS].reverse().find((b) => b.day <= day) ?? JOURNEY_BEATS[0]!;
    phaseEl.textContent = store.get().vow ? `Day ${Math.floor(day)} of ${JOURNEY_DAYS} · ${beat.label}` : '';
    return p.days;
  };

  return {
    el: root,
    preset: 'home',
    enter() {
      const days = render();
      unitEl.textContent = days === 1 ? 'day' : 'days';
      if (ctx.reduced) {
        daysEl.textContent = String(days);
      } else {
        const o = { v: 0 };
        animate(o, { v: days, duration: 1400, delay: 300, ease: 'out(3)', onUpdate: () => (daysEl.textContent = String(Math.round(o.v))) });
        const items = $$('.topline > *, .home__day, .home__phase, .home__actions > *', root);
        utils.set(items, { opacity: 0 });
        animate(items, {
          opacity: 1,
          y: { from: 14, to: 0 },
          scale: { from: 0.94, to: 1 },
          delay: stagger(70, { start: 100 }),
          ease: spring({ bounce: 0.25, duration: 700 }),
        });
      }
      timer = createTimer({ frameRate: 4, onUpdate: () => render() });
      cleanupDrag = ctx.cosmos.enableDrag(root);
    },
    destroy() {
      timer?.cancel();
      cleanupDrag();
    },
    leave: async () => {
      if (ctx.reduced) return;
      await animate($$('.topline > *, .home__day, .home__phase, .home__actions > *', root), {
        opacity: 0,
        scale: 0.96,
        duration: 220,
        ease: 'in(2)',
      }).then();
    },
  };
}

