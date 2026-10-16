/**
 * Sanctuary — the home screen. A living counter, your cosmic journey,
 * a daily check-in, your reasons and one tap to the SOS toolkit.
 */

import { animate, createTimer, scrambleText, stagger, svg, utils, type Timer } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store, dateKey, type Mood } from '../core/store';
import {
  DAY,
  JOURNEY_BEATS,
  JOURNEY_DAYS,
  currentRank,
  humanDuration,
  nextMilestone,
  parts,
  streakMs,
  totalFreeMs,
} from '../core/journey';
import { AFFIRMATIONS, MOODS, dailyPick } from '../core/content';
import { icons } from '../ui/icons';
import { $, $$, el, esc } from '../ui/dom';
import { openModal, toast } from '../ui/overlay';
import { relapseFlow } from '../ui/relapse';
import { sound } from '../ui/sound';

const pad = (n: number) => String(n).padStart(2, '0');

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Still awake';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

export function sanctuaryView(ctx: AppContext): View {
  const root = el(`<div class="view view--app"><div class="container" data-body></div></div>`);
  const body = $('[data-body]', root)!;
  let timer: Timer | null = null;
  let affIndex = AFFIRMATIONS.indexOf(dailyPick(AFFIRMATIONS));

  const render = () => {
    const s = store.get();
    const vow = s.vow!;
    const ms = streakMs(s);
    const p = parts(ms);
    const rank = currentRank(ms);
    const { next, progress } = nextMilestone(ms);
    const days = ms / DAY;
    const journeyDay = Math.min(days, JOURNEY_DAYS);
    const beatNow = [...JOURNEY_BEATS].reverse().find((b) => b.day <= journeyDay) ?? JOURNEY_BEATS[0]!;
    const beatNext = JOURNEY_BEATS.find((b) => b.day > journeyDay);
    const today = s.checkins.find((c) => c.date === dateKey());
    const won = s.urges.filter((u) => u.outcome === 'won').length;
    const name = s.settings.name;

    body.innerHTML = `
      <div class="greet" data-anim>
        <div>
          <p class="greet__date">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <p class="greet__hello">${greeting()}${name ? `, ${esc(name)}` : ''}.</p>
        </div>
        ${rank ? `<span class="pill">${icons.star4}${esc(rank.name)}</span>` : `<span class="pill pill--teal">${icons.sparkle}First hours</span>`}
      </div>

      <div class="sanctuary">
        <div class="sanctuary__main">
          <section class="glass glass--gold counter" data-anim aria-label="Your streak">
            <div class="ring counter__ring">
              <svg viewBox="0 0 220 220" aria-hidden="true">
                <defs>
                  <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#ffe7b3"/><stop offset="0.6" stop-color="#f4c97c"/><stop offset="1" stop-color="#bcaeff"/>
                  </linearGradient>
                </defs>
                <g data-ticks>
                  ${Array.from({ length: 60 }, (_, i) => {
                    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
                    const r0 = 103;
                    const r1 = i % 5 === 0 ? 96 : 99;
                    return `<line x1="${(110 + Math.cos(a) * r0).toFixed(2)}" y1="${(110 + Math.sin(a) * r0).toFixed(2)}" x2="${(110 + Math.cos(a) * r1).toFixed(2)}" y2="${(110 + Math.sin(a) * r1).toFixed(2)}" stroke="rgba(255,255,255,${i % 5 === 0 ? 0.35 : 0.14})" stroke-width="1.2" data-tick="${i}"/>`;
                  }).join('')}
                </g>
                <circle cx="110" cy="110" r="86" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="8"/>
                <circle cx="110" cy="110" r="86" fill="none" stroke="url(#ring-g)" stroke-width="8" stroke-linecap="round" transform="rotate(-90 110 110)" data-progress-ring/>
                <circle r="5" fill="#fff" data-orbiter style="filter: drop-shadow(0 0 6px #ffe7b3)"/>
              </svg>
              <div class="counter__days">
                <span class="counter__days-num num" data-days>${p.days}</span>
                <span class="counter__days-label">${p.days === 1 ? 'day' : 'days'} free</span>
              </div>
            </div>
            <div class="counter__info">
              <div class="counter__clock num" aria-label="Hours, minutes and seconds">
                <span class="counter__unit"><span data-h>${pad(p.hours)}</span><small>hrs</small></span>
                <span class="counter__unit"><span data-m>${pad(p.minutes)}</span><small>min</small></span>
                <span class="counter__unit"><span data-s>${pad(p.seconds)}</span><small>sec</small></span>
              </div>
              <p class="counter__free">free from ${esc(vow.codename)}</p>
              <p class="counter__next" data-next>${
                next ? `Next: <strong>${esc(next.name)}</strong> in ${esc(humanDuration(next.at - ms))}` : 'You have reached every star. Keep shining.'
              }</p>
            </div>
          </section>

          <a class="sos-cta" href="#/sos" data-anim>
            <span class="sos-cta__icon">${icons.lifebuoy}</span>
            <span>
              <span class="sos-cta__title">I feel the pull</span><br/>
              <span class="sos-cta__sub">Open your toolkit. This will pass.</span>
            </span>
            ${icons.arrowRight}
          </a>

          <section class="glass glass--pad" data-anim>
            <div class="card-title">${icons.orbit}Cosmic journey</div>
            <h3 class="h3" style="margin-top:12px">Day ${Math.floor(journeyDay)} of ${JOURNEY_DAYS} · ${esc(beatNow.label)}</h3>
            <p class="muted" style="margin-top:6px">${esc(beatNow.text)}${beatNext ? ` Next: <strong style="color:#fff">${esc(beatNext.label)}</strong> on day ${beatNext.day}.` : ''}</p>
            <div class="journey-card__bar">
              <span class="journey-card__fill" data-journey-fill></span>
              ${JOURNEY_BEATS.map(
                (b) =>
                  `<span class="journey-card__beat ${journeyDay >= b.day ? 'is-reached' : ''}" style="left:${((b.day / JOURNEY_DAYS) * 100).toFixed(2)}%"><span>${esc(b.label)}</span></span>`,
              ).join('')}
            </div>
            <p class="muted" style="font-size:13.5px">The galaxies behind this screen are exactly where your streak has brought them.</p>
          </section>

          <section class="glass glass--pad" data-anim>
            <div class="row" style="justify-content:space-between">
              <div class="card-title">${icons.sparkle}Today's light</div>
              <button class="btn btn--quiet btn--sm" type="button" data-another>Another</button>
            </div>
            <p class="affirmation" style="margin-top:14px" data-affirmation>${esc(AFFIRMATIONS[affIndex]!)}</p>
          </section>
        </div>

        <div class="sanctuary__side">
          <section class="glass glass--pad" data-anim data-checkin>
            ${today ? checkinDone(today.mood) : checkinForm()}
          </section>

          <section class="glass glass--pad" data-anim>
            <div class="card-title">${icons.heart}Your why</div>
            <ul class="why-list" style="margin-top:16px">
              ${vow.reasons.map((r) => `<li>${icons.star4}<span>${esc(r)}</span></li>`).join('')}
            </ul>
            <button class="btn btn--ghost btn--sm" type="button" data-read-vow style="margin-top:18px">${icons.feather}Read your vow</button>
          </section>

          <section class="stat-row" data-anim>
            <div class="stat"><span class="stat__value num">${won}</span><span class="stat__label">Urges outlasted</span></div>
            <div class="stat"><span class="stat__value num">${esc(humanDuration(Math.max(s.bestStreakMs, ms)))}</span><span class="stat__label">Best streak</span></div>
            <div class="stat"><span class="stat__value num">${esc(humanDuration(totalFreeMs(s)))}</span><span class="stat__label">Total free</span></div>
          </section>

          <button class="slip-link" type="button" data-slip>I slipped — help me begin again</button>
        </div>
      </div>
    `;

    // ── Animate the counter in ───────────────────────────────────────────
    const ring = svg.createDrawable($('[data-progress-ring]', body)!);
    const daysEl = $('[data-days]', body)!;
    const orbiter = $<SVGCircleElement>('[data-orbiter]', body)!;
    const placeOrbiter = (prog: number) => {
      const a = prog * Math.PI * 2 - Math.PI / 2;
      orbiter.setAttribute('cx', (110 + Math.cos(a) * 86).toFixed(2));
      orbiter.setAttribute('cy', (110 + Math.sin(a) * 86).toFixed(2));
    };
    const state = { prog: 0, days: 0 };
    utils.set(ring, { draw: '0 0' });
    animate(state, {
      prog: progress,
      days: p.days,
      duration: ctx.reduced ? 0 : 2200,
      delay: ctx.reduced ? 0 : 300,
      ease: 'inOut(3)',
      onUpdate: () => {
        daysEl.textContent = String(Math.round(state.days));
        placeOrbiter(state.prog);
        utils.set(ring, { draw: `0 ${Math.max(0.001, state.prog).toFixed(4)}` });
      },
    });
    const fill = $('[data-journey-fill]', body)!;
    animate(fill, { width: { from: '0%', to: `${((journeyDay / JOURNEY_DAYS) * 100).toFixed(2)}%` }, duration: ctx.reduced ? 0 : 2400, delay: 400, ease: 'inOut(3)' });
    if (!ctx.reduced) {
      animate($$('.journey-card__beat', body), { scale: { from: 0, to: 1 }, delay: stagger(120, { start: 600 }), duration: 800, ease: 'outElastic(1, .6)' });
    }
  };

  const checkinForm = () => `
    <div class="card-title">${icons.sunrise}Daily check-in</div>
    <h3 class="h3" style="margin:12px 0 16px">How are you, really?</h3>
    <div class="mood-picker" role="radiogroup" aria-label="Mood">
      ${MOODS.map((m) => `<button class="mood" type="button" data-mood="${m.value}" role="radio" aria-checked="false"><span class="mood__orb" style="background:${m.color}"></span>${m.label}</button>`).join('')}
    </div>`;

  const checkinDone = (mood: Mood) => {
    const m = MOODS.find((x) => x.value === mood)!;
    const streak = checkinStreak();
    return `
      <div class="card-title">${icons.check}Checked in today</div>
      <div class="row" style="margin-top:14px;--gap:14px">
        <span class="mood__orb" style="width:42px;height:42px;background:${m.color}"></span>
        <div>
          <p class="h3">Feeling ${m.label.toLowerCase()}</p>
          <p class="muted" style="font-size:13.5px">${streak > 1 ? `${streak} days of honest check-ins in a row.` : 'Honesty is a kind of strength.'}</p>
        </div>
      </div>`;
  };

  const checkinStreak = () => {
    const keys = new Set(store.get().checkins.map((c) => c.date));
    let n = 0;
    const d = new Date();
    while (keys.has(dateKey(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  };

  // ── Live ticking ─────────────────────────────────────────────────────────
  let lastSecond = -1;
  const tick = () => {
    const ms = streakMs();
    const p = parts(ms);
    if (p.seconds === lastSecond) return;
    lastSecond = p.seconds;
    const set = (sel: string, v: string) => {
      const n = $(sel, body);
      if (!n || n.textContent === v) return;
      n.textContent = v;
      if (!ctx.reduced) animate(n, { y: { from: -8, to: 0 }, opacity: { from: 0.2, to: 1 }, duration: 420, ease: 'out(3)' });
    };
    set('[data-s]', pad(p.seconds));
    set('[data-m]', pad(p.minutes));
    set('[data-h]', pad(p.hours));
    const tickEl = $(`[data-tick="${p.seconds}"]`, body);
    if (tickEl && !ctx.reduced) {
      animate(tickEl, { stroke: ['#ffe7b3', 'rgba(255,255,255,0.14)'], duration: 2400, ease: 'out(2)' });
    }
    const days = $('[data-days]', body);
    if (days && Number(days.textContent) < p.days && p.seconds === 0) render();
  };

  const onClick = (e: MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!t) return;
    if (t.dataset.mood) {
      const mood = Number(t.dataset.mood) as Mood;
      store.update((s) => {
        s.checkins = s.checkins.filter((c) => c.date !== dateKey());
        s.checkins.push({ date: dateKey(), mood, strength: mood, at: Date.now() });
      });
      sound.chime(mood);
      const card = $('[data-checkin]', body)!;
      animate(t, { scale: [1, 1.12, 1], duration: 400 });
      window.setTimeout(() => {
        card.innerHTML = checkinDone(mood);
        animate(card.children, { opacity: { from: 0, to: 1 }, y: { from: 12, to: 0 }, delay: stagger(80), duration: 700, ease: 'out(3)' });
      }, 350);
      toast(mood <= 2 ? 'Thank you for being honest. Be gentle with yourself today.' : 'Noted. Carry that light with you.', { icon: icons.heart });
    } else if (t.hasAttribute('data-another')) {
      affIndex = (affIndex + 1 + utils.random(0, AFFIRMATIONS.length - 2)) % AFFIRMATIONS.length;
      const node = $('[data-affirmation]', body)!;
      if (ctx.reduced) node.textContent = AFFIRMATIONS[affIndex]!;
      else animate(node, { innerHTML: scrambleText({ text: esc(AFFIRMATIONS[affIndex]!), chars: 'lowercase', revealRate: 90, settleDuration: 260 }) });
    } else if (t.hasAttribute('data-read-vow')) {
      const v = store.get().vow!;
      openModal(
        `<div class="stack" style="--gap:18px">
          <span class="eyebrow">Your vow</span>
          <p class="vow-quote" style="font-size:24px">“${esc(v.vowText)}”</p>
          <div class="divider"></div>
          <p class="vow-signature">${esc(v.signature || '—')}</p>
          <p class="muted" style="font-size:13px">Sealed ${new Date(v.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
          <div class="row" style="justify-content:flex-end"><a class="btn btn--quiet btn--sm" href="#/settings" data-close>Edit</a><button class="btn btn--primary btn--sm" type="button" data-close>Close</button></div>
        </div>`,
        { label: 'Your vow' },
      );
    } else if (t.hasAttribute('data-slip')) {
      relapseFlow(ctx, render);
    }
  };
  root.addEventListener('click', onClick);

  const unsub = store.subscribe((s, prev) => {
    if (s.vow?.startAt !== prev.vow?.startAt) render();
  });

  return {
    el: root,
    preset: 'sanctuary',
    enter() {
      render();
      timer = createTimer({ frameRate: 8, onUpdate: tick });
    },
    destroy() {
      timer?.cancel();
      unsub();
    },
  };
}
