/**
 * Dashboard — everything in one liquid-glass sheet: streak, check-in,
 * journey, reasons, milestones, stats, insights and recent journal.
 */

import { animate, createTimer, stagger, type Timer } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store, dateKey, type Mood } from '../core/store';
import {
  DAY,
  JOURNEY_BEATS,
  JOURNEY_DAYS,
  MILESTONES,
  currentRank,
  humanDuration,
  nextMilestone,
  parts,
  shortAt,
  streakMs,
  totalFreeMs,
} from '../core/journey';
import { LINES, MOODS, dailyPick } from '../core/content';
import { icons } from '../ui/icons';
import { $, $$, esc, relativeDay } from '../ui/dom';
import { openModal, toast } from '../ui/overlay';
import { relapseFlow } from '../ui/relapse';
import { sound } from '../ui/sound';
import { createSheet } from './sheet';

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

function hourLabel(h: number): string {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric' });
}

function checkinStreak(): number {
  const keys = new Set(store.get().checkins.map((c) => c.date));
  let n = 0;
  const d = new Date();
  while (keys.has(dateKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function dashboardView(ctx: AppContext): View {
  const sheet = createSheet(ctx, {
    title: 'Dashboard',
    sub: new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    body: '<div class="dash" data-dash></div>',
  });
  const dash = $('[data-dash]', sheet.body)!;
  let timer: Timer | null = null;

  const checkinMarkup = () => {
    const today = store.get().checkins.find((c) => c.date === dateKey());
    if (today) {
      const m = MOODS.find((x) => x.value === today.mood)!;
      const n = checkinStreak();
      return `<div class="group__title">Today</div>
        <p class="t-title">Feeling ${m.label.toLowerCase()}</p>
        <p class="t-sub">${n > 1 ? `${n} days of check-ins in a row.` : 'Checked in.'} <button class="btn btn--plain" type="button" data-recheck>Change</button></p>`;
    }
    return `<div class="group__title">How are you today?</div>
      <div class="segmented" role="radiogroup" aria-label="Mood">
        ${MOODS.map((m) => `<button type="button" data-mood="${m.value}">${m.label}</button>`).join('')}
      </div>`;
  };

  const render = () => {
    const s = store.get();
    const vow = s.vow!;
    const ms = streakMs(s);
    const p = parts(ms);
    const rank = currentRank(ms);
    const { next, progress } = nextMilestone(ms);
    const day = Math.min(ms / DAY, JOURNEY_DAYS);
    const beat = [...JOURNEY_BEATS].reverse().find((b) => b.day <= day) ?? JOURNEY_BEATS[0]!;
    const beatNext = JOURNEY_BEATS.find((b) => b.day > day);
    const won = s.urges.filter((u) => u.outcome === 'won');
    const winRate = s.urges.length ? Math.round((won.length / s.urges.length) * 100) : 0;

    const byHour = new Array(24).fill(0) as number[];
    const byDay = new Array(7).fill(0) as number[];
    for (const at of [...s.urges.map((u) => u.at), ...s.relapses.map((r) => r.at)]) {
      const d = new Date(at);
      byHour[d.getHours()]!++;
      byDay[d.getDay()]!++;
    }
    const maxH = Math.max(1, ...byHour);
    const maxD = Math.max(1, ...byDay);
    const hasPattern = s.urges.length + s.relapses.length >= 3;
    const peakHour = byHour.indexOf(Math.max(...byHour));
    const peakDay = byDay.indexOf(Math.max(...byDay));
    const triggers = new Map<string, number>();
    [...s.urges.map((u) => u.trigger), ...s.relapses.map((r) => r.trigger)]
      .flatMap((t) => t.split(',').map((x) => x.trim()))
      .filter(Boolean)
      .forEach((t) => triggers.set(t, (triggers.get(t) ?? 0) + 1));
    const topTriggers = [...triggers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const recent = [...s.journal].sort((a, b) => b.at - a.at).slice(0, 3);

    dash.innerHTML = `
      <div class="dash__col">
        <section class="group streak" data-anim>
          <div class="group__title"><span>Current streak</span>${rank ? `<span class="pill">${esc(rank.name)}</span>` : ''}</div>
          <div class="streak__num t-num"><span data-days>${p.days}</span><small>${p.days === 1 ? 'day' : 'days'}</small></div>
          <p class="streak__clock t-num" data-clock>${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}</p>
          <div class="bar" style="margin-top:18px"><span class="bar__fill" data-next-fill></span></div>
          <p class="t-sub" style="margin-top:10px">${
            next ? `Next: <strong class="t-accent">${esc(next.name)}</strong> at ${esc(next.title)} · ${esc(humanDuration(next.at - ms))} left` : 'Every milestone reached.'
          }</p>
          <p class="t-foot" style="margin-top:4px">Free from ${esc(vow.codename)}</p>
        </section>

        <div class="dash__actions" data-anim>
          <a class="btn btn--accent btn--block" href="#/sos">${icons.lifebuoy}I have an urge</a>
          <button class="btn btn--fill btn--block" type="button" data-slip>I slipped</button>
        </div>

        <section class="group" data-anim data-checkin>${checkinMarkup()}</section>

        <section class="group" data-anim>
          <div class="group__title"><span>Why you’re quitting</span><button class="btn btn--plain" type="button" data-read-vow>Your vow</button></div>
          <ul class="reasons">${vow.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        </section>

        <section class="group" data-anim>
          <div class="group__title"><span>Today’s line</span><button class="btn btn--plain" type="button" data-another>Another</button></div>
          <p class="t-headline" data-line>${esc(dailyPick(LINES))}</p>
        </section>
      </div>

      <div class="dash__col">
        <section class="group" data-anim>
          <div class="group__title"><span>Galaxy journey</span><span class="t-foot">Day ${Math.floor(day)} of ${JOURNEY_DAYS}</span></div>
          <p class="t-title">${esc(beat.label)}</p>
          <p class="t-sub">${esc(beat.text)}</p>
          <div class="journey">
            <div class="bar"><span class="bar__fill" data-journey-fill></span></div>
            ${JOURNEY_BEATS.map(
              (b) => `<span class="journey__tick ${day >= b.day ? 'is-on' : ''}" style="left:${((b.day / JOURNEY_DAYS) * 100).toFixed(2)}%"></span>`,
            ).join('')}
          </div>
          <p class="t-foot">${beatNext ? `Next: ${esc(beatNext.label)} on day ${beatNext.day}` : 'Milkomeda complete.'}</p>
        </section>

        <section class="group" data-anim>
          <div class="group__title"><span>Milestones</span><span class="t-foot">${MILESTONES.filter((m) => ms >= m.at).length} of ${MILESTONES.length}</span></div>
          <div class="milestones">
            ${MILESTONES.map((m) => {
              const lit = ms >= m.at;
              const isNext = next?.id === m.id;
              return `<button class="ms ${lit ? 'is-lit' : ''} ${isNext ? 'is-next' : ''}" type="button" data-ms="${m.id}">
                <span class="ms__dot"></span><span class="ms__name">${esc(m.name)}</span><span class="ms__at">${shortAt(m.at)}</span>
              </button>`;
            }).join('')}
          </div>
        </section>

        <section class="group" data-anim>
          <div class="group__title">Stats</div>
          <div class="stats">
            <div><span class="stats__v t-num">${won.length}</span><span class="stats__k">Urges beaten</span></div>
            <div><span class="stats__v t-num">${winRate}%</span><span class="stats__k">Held strong</span></div>
            <div><span class="stats__v t-num">${esc(humanDuration(Math.max(s.bestStreakMs, ms)))}</span><span class="stats__k">Best streak</span></div>
            <div><span class="stats__v t-num">${esc(humanDuration(totalFreeMs(s)))}</span><span class="stats__k">Total time free</span></div>
            <div><span class="stats__v t-num">${s.relapses.length}</span><span class="stats__k">Restarts</span></div>
            <div><span class="stats__v t-num">${checkinStreak()}</span><span class="stats__k">Check-in streak</span></div>
          </div>
        </section>

        <section class="group" data-anim>
          <div class="group__title"><span>When urges hit</span>${hasPattern ? `<span class="t-foot">Peak ${esc(hourLabel(peakHour))}</span>` : ''}</div>
          <div class="hours">${byHour.map((n) => `<span style="--h:${(n / maxH).toFixed(3)}" class="${n ? 'is-on' : ''}"></span>`).join('')}</div>
          <div class="hours__axis t-foot"><span>${esc(hourLabel(0))}</span><span>${esc(hourLabel(6))}</span><span>${esc(hourLabel(12))}</span><span>${esc(hourLabel(18))}</span></div>
          <div class="days">${byDay.map((n, i) => `<div><span style="--h:${(n / maxD).toFixed(3)}" class="${n ? 'is-on' : ''}"></span><small>${WEEKDAYS[i]}</small></div>`).join('')}</div>
          <p class="t-sub" style="margin-top:12px">${
            hasPattern ? `Hardest: ${esc(WEEKDAY_NAMES[peakDay]!)} around ${esc(hourLabel(peakHour))}.` : 'Log a few urges and your pattern shows up here.'
          }</p>
          ${topTriggers.length ? `<div class="chips" style="margin-top:12px">${topTriggers.map(([t, n]) => `<span class="pill">${esc(t)} · ${n}</span>`).join('')}</div>` : ''}
        </section>

        <section class="group group--flush" data-anim>
          <div class="group__title" style="padding:14px 18px 0"><span>Journal</span><a class="btn btn--plain" href="#/journal">Open</a></div>
          ${
            recent.length
              ? `<div class="rows">${recent
                  .map(
                    (j) => `<a class="row row--button" href="#/journal"><span class="row__body"><span class="row__title">${esc(j.title || 'Reflection')}</span><span class="row__sub">${esc(relativeDay(j.at))} · ${esc(MOODS.find((m) => m.value === j.mood)?.label ?? '')}</span></span></a>`,
                  )
                  .join('')}</div>`
              : `<p class="t-sub" style="padding:4px 18px 16px">No entries yet.</p>`
          }
        </section>

        <p class="t-foot dash__note" data-anim>Everything here stays on this device.</p>
      </div>
    `;

    if (!ctx.reduced) {
      animate($('[data-next-fill]', dash)!, { width: { from: '0%', to: `${(progress * 100).toFixed(2)}%` }, duration: 1400, delay: 500, ease: 'out(3)' });
      animate($('[data-journey-fill]', dash)!, { width: { from: '0%', to: `${((day / JOURNEY_DAYS) * 100).toFixed(2)}%` }, duration: 1600, delay: 600, ease: 'out(3)' });
      animate($$('.hours span, .days span', dash), { scaleY: { from: 0, to: 1 }, delay: stagger(12, { start: 700 }), duration: 700, ease: 'out(3)' });
      animate($$('[data-anim]', dash), { opacity: { from: 0, to: 1 }, y: { from: 16, to: 0 }, delay: stagger(40, { start: 320 }), duration: 600, ease: 'out(3)' });
    } else {
      $('[data-next-fill]', dash)!.style.width = `${(progress * 100).toFixed(2)}%`;
      $('[data-journey-fill]', dash)!.style.width = `${((day / JOURNEY_DAYS) * 100).toFixed(2)}%`;
    }
  };

  const tick = () => {
    const p = parts(streakMs());
    const c = $('[data-clock]', dash);
    if (c) c.textContent = `${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`;
    const d = $('[data-days]', dash);
    if (d && Number(d.textContent) !== p.days) render();
  };

  let lineIndex = LINES.indexOf(dailyPick(LINES));
  dash.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!t) return;
    if (t.dataset.mood) {
      const mood = Number(t.dataset.mood) as Mood;
      store.update((s) => {
        s.checkins = s.checkins.filter((c) => c.date !== dateKey());
        s.checkins.push({ date: dateKey(), mood, strength: mood, at: Date.now() });
      });
      sound.chime(mood);
      const card = $('[data-checkin]', dash)!;
      card.innerHTML = checkinMarkup();
      animate(card.children, { opacity: { from: 0, to: 1 }, y: { from: 8, to: 0 }, delay: stagger(50), duration: 400, ease: 'out(3)' });
    } else if (t.hasAttribute('data-recheck')) {
      store.update((s) => {
        s.checkins = s.checkins.filter((c) => c.date !== dateKey());
      });
      $('[data-checkin]', dash)!.innerHTML = checkinMarkup();
    } else if (t.hasAttribute('data-another')) {
      lineIndex = (lineIndex + 1) % LINES.length;
      const node = $('[data-line]', dash)!;
      void animate(node, { opacity: 0, duration: 150, ease: 'in(2)' })
        .then()
        .then(() => {
          node.textContent = LINES[lineIndex]!;
          animate(node, { opacity: 1, duration: 300, ease: 'out(2)' });
        });
    } else if (t.hasAttribute('data-read-vow')) {
      const v = store.get().vow!;
      openModal(
        `<div class="stack" style="--gap:14px">
          <p class="t-label">Your vow</p>
          <p class="t-title" style="font-weight:600">“${esc(v.vowText)}”</p>
          <p class="t-sub">— ${esc(v.signature || 'You')}, ${new Date(v.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
          <button class="btn btn--fill btn--block" type="button" data-close>Close</button>
        </div>`,
        { label: 'Your vow' },
      );
    } else if (t.hasAttribute('data-slip')) {
      relapseFlow(ctx, render);
    } else if (t.dataset.ms) {
      const m = MILESTONES.find((x) => x.id === t.dataset.ms)!;
      const at = store.get().milestones[m.id];
      const left = m.at - streakMs();
      toast(at ? `${m.name} · reached ${new Date(at).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : `${m.name} · ${humanDuration(left)} to go`);
    }
  });

  const unsub = store.subscribe((s, prev) => {
    if (s.vow?.startAt !== prev.vow?.startAt) render();
  });

  return {
    el: sheet.root,
    preset: 'dashboard',
    enter() {
      render();
      sheet.enter();
      timer = createTimer({ frameRate: 4, onUpdate: tick });
    },
    leave: (next) => sheet.leave(next),
    destroy() {
      timer?.cancel();
      unsub();
    },
  };
}
