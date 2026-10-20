/**
 * Home — the galaxy, exactly where your main habit's streak has brought it,
 * the day count, your other habits and two liquid-glass buttons. From the
 * evening on, the second button is the night check-in.
 */

import { animate, spring, stagger, utils } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store, dateKey } from '../core/store';
import {
  JOURNEY_DAYS,
  beatFor,
  buildStatus,
  checkedIn,
  checkinOpen,
  dayWord,
  habitStreak,
  mainDays,
  mainHabit,
  orderedHabits,
} from '../core/journey';
import { icons } from '../ui/icons';
import { $, $$, el, esc } from '../ui/dom';
import { runCheckins } from '../ui/checkin';

const MAX_PILLS = 4;

export function homeView(ctx: AppContext): View {
  const root = el(`
    <div class="screen home">
      <header class="topline">
        <span class="brand">Divine Vow</span>
        <div class="inline" style="--gap:10px">
          <a class="icon-btn" data-glass="control" data-morph href="#/dashboard" aria-label="Dashboard">${icons.chart}</a>
          <a class="icon-btn" data-glass="control" data-morph href="#/journal" aria-label="Journal">${icons.book}</a>
          <a class="icon-btn" data-glass="control" data-morph href="#/settings" aria-label="Settings">${icons.gear}</a>
        </div>
      </header>

      <div class="home__day" data-glass="control">
        <span class="home__day-num t-num" data-days>0</span>
        <span class="home__day-unit" data-unit>days</span>
      </div>
      <p class="home__phase" data-phase></p>
      <div class="home__habits" data-habits></div>

      <div class="home__actions" data-actions></div>
    </div>
  `);

  const daysEl = $('[data-days]', root)!;
  const unitEl = $('[data-unit]', root)!;
  const phaseEl = $('[data-phase]', root)!;
  const habitsEl = $('[data-habits]', root)!;
  const actionsEl = $('[data-actions]', root)!;
  let shown = -1;
  let interval = 0;
  let alive = true;
  let cleanupDrag = () => {};

  const setDays = (days: number, animated: boolean) => {
    unitEl.textContent = dayWord(days);
    if (!animated || ctx.reduced || shown < 0) {
      daysEl.textContent = String(days);
    } else if (days !== shown) {
      const o = { v: shown };
      animate(o, { v: days, duration: 1200, ease: 'out(3)', onUpdate: () => (daysEl.textContent = String(Math.round(o.v))) });
      animate(daysEl, { scale: [{ to: 1.18, duration: 220 }, { to: 1, duration: 700, ease: 'outElastic(1, .5)' }] });
    }
    shown = days;
  };

  const render = (animated = true) => {
    const s = store.get();
    const days = mainDays(s);
    setDays(days, animated);
    const doneTonight = checkedIn(dateKey(), s);
    const beat = beatFor(days);
    phaseEl.textContent = s.vow ? `Day ${Math.min(days, JOURNEY_DAYS)} of ${JOURNEY_DAYS} · ${beat.label}${doneTonight ? ' · Checked in' : ''}` : '';

    const main = mainHabit(s);
    const others = orderedHabits(s).filter((h) => h !== main);
    const pills = others.slice(0, MAX_PILLS).map((h) => {
      const n = habitStreak(h);
      const status = h.kind === 'build' ? buildStatus(h) : null;
      const doneToday = h.kind === 'build' && h.log[dateKey()] === true;
      const note = status?.warn && !doneToday ? ' · don’t miss today' : '';
      return `<a class="home__habit ${note ? 'is-warn' : ''}" data-glass="clear" data-morph href="#/dashboard">${doneToday ? icons.check : ''}<span>${esc(h.name)}</span><span class="t-num faint">${n}</span>${note ? `<span class="home__habit-note">${note}</span>` : ''}</a>`;
    });
    if (others.length > MAX_PILLS) pills.push(`<a class="home__habit" data-glass="clear" data-morph href="#/dashboard">+${others.length - MAX_PILLS}</a>`);
    if (!others.length && s.vow) pills.push(`<a class="home__habit" data-glass="clear" data-morph href="#/dashboard?add=1">${icons.plus}<span>Add a habit</span></a>`);
    habitsEl.innerHTML = pills.join('');

    const tonight = checkinOpen() && !doneTonight;
    const next = tonight ? 'checkin' : 'dashboard';
    if (actionsEl.dataset.mode !== next) {
      actionsEl.dataset.mode = next;
      actionsEl.innerHTML = `
        <a class="btn btn--lg" data-glass="control" data-morph href="#/sos">${icons.lifebuoy}<span>I have an urge</span></a>
        ${
          tonight
            ? `<button class="btn btn--lg" type="button" data-glass="accent" data-checkin>${icons.moon}<span>Check in</span></button>`
            : `<a class="btn btn--lg" data-glass="accent" data-morph href="#/dashboard"><span>Open dashboard</span></a>`
        }`;
    }
  };

  const checkin = (today: boolean) => {
    if (!alive) return;
    void runCheckins(ctx, { today, preset: 'home', onRecorded: () => render() }).then(() => alive && render());
  };

  root.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-checkin]')) checkin(true);
  });

  const onVisible = () => {
    if (document.hidden) return;
    render();
    checkin(false);
  };

  return {
    el: root,
    preset: 'home',
    enter() {
      render(false);
      if (!ctx.reduced) {
        const o = { v: 0 };
        const days = shown;
        daysEl.textContent = '0';
        animate(o, { v: days, duration: 1400, delay: 300, ease: 'out(3)', onUpdate: () => (daysEl.textContent = String(Math.round(o.v))) });
        const items = $$('.topline > *, .home__day, .home__phase, .home__habits > *, .home__actions > *', root);
        utils.set(items, { opacity: 0 });
        animate(items, {
          opacity: 1,
          y: { from: 14, to: 0 },
          scale: { from: 0.94, to: 1 },
          delay: stagger(70, { start: 100 }),
          ease: spring({ bounce: 0.25, duration: 700 }),
        });
      }
      // Days that ended without a check-in are asked about straight away.
      window.setTimeout(() => checkin(false), ctx.reduced ? 200 : 1100);
      interval = window.setInterval(() => render(), 30_000);
      document.addEventListener('visibilitychange', onVisible);
      cleanupDrag = ctx.cosmos.enableDrag(root);
    },
    destroy() {
      alive = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      cleanupDrag();
    },
    leave: async () => {
      if (ctx.reduced) return;
      await animate($$('.topline > *, .home__day, .home__phase, .home__habits > *, .home__actions > *', root), {
        opacity: 0,
        scale: 0.96,
        duration: 220,
        ease: 'in(2)',
      }).then();
    },
  };
}
