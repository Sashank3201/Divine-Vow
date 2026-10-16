/** Insights — when the pull is strongest, what helps, and how far you have come. */

import { animate, stagger, svg } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store, dateKey } from '../core/store';
import { DAY, humanDuration, streakMs, totalFreeMs } from '../core/journey';
import { icons } from '../ui/icons';
import { $, $$, el, esc } from '../ui/dom';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const TOOL_NAMES: Record<string, string> = {
  breathe: 'Breathing',
  surf: 'Urge surfing',
  game: 'Star catcher',
  move: 'Movement',
  ground: 'Grounding',
  why: 'Your why',
};

function hourLabel(h: number): string {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric' });
}

export function insightsView(ctx: AppContext): View {
  const s = store.get();
  const ms = streakMs(s);
  const urges = s.urges;
  const won = urges.filter((u) => u.outcome === 'won');
  const winRate = urges.length ? Math.round((won.length / urges.length) * 100) : 0;
  const byHour = new Array(24).fill(0) as number[];
  const byDay = new Array(7).fill(0) as number[];
  for (const u of urges) {
    const d = new Date(u.at);
    byHour[d.getHours()]!++;
    byDay[d.getDay()]!++;
  }
  for (const r of s.relapses) {
    const d = new Date(r.at);
    byHour[d.getHours()]!++;
    byDay[d.getDay()]!++;
  }
  const maxHour = Math.max(1, ...byHour);
  const maxDay = Math.max(1, ...byDay);
  const peakHour = byHour.indexOf(Math.max(...byHour));
  const peakDay = byDay.indexOf(Math.max(...byDay));
  const hasPattern = urges.length + s.relapses.length >= 3;

  const triggers = new Map<string, number>();
  [...urges.map((u) => u.trigger), ...s.relapses.map((r) => r.trigger)]
    .flatMap((t) => t.split(',').map((x) => x.trim()))
    .filter(Boolean)
    .forEach((t) => triggers.set(t, (triggers.get(t) ?? 0) + 1));
  const topTriggers = [...triggers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const tools = new Map<string, number>();
  won.forEach((u) => u.tools.forEach((t) => tools.set(t, (tools.get(t) ?? 0) + 1)));
  const topTools = [...tools.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxTool = Math.max(1, ...topTools.map((t) => t[1]));

  // Mood over the last 30 days (check-ins).
  const moodDays: Array<number | null> = [];
  const checkins = new Map(s.checkins.map((c) => [c.date, c.mood] as const));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    moodDays.push(checkins.get(dateKey(d)) ?? null);
  }
  const moodPts = moodDays
    .map((m, i) => (m == null ? null : ([(i / 29) * 600, 110 - ((m - 1) / 4) * 95] as const)))
    .filter((p): p is readonly [number, number] => p !== null);
  let moodPath = '';
  moodPts.forEach(([x, y], i) => {
    if (i === 0) moodPath = `M${x.toFixed(1)} ${y.toFixed(1)}`;
    else {
      const [px, py] = moodPts[i - 1]!;
      const mx = (px + x) / 2;
      moodPath += ` C ${mx.toFixed(1)} ${py.toFixed(1)}, ${mx.toFixed(1)} ${y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
  });

  const streaks = [...s.relapses.map((r) => r.streakMs), ms].slice(-12);
  const maxStreak = Math.max(1, ...streaks);

  // 24-hour radial clock of the pull.
  const clockSegs = byHour
    .map((n, h) => {
      const a0 = (h / 24) * Math.PI * 2 - Math.PI / 2 + 0.02;
      const a1 = ((h + 1) / 24) * Math.PI * 2 - Math.PI / 2 - 0.02;
      const r0 = 62;
      const r1 = 62 + 12 + (n / maxHour) * 46;
      const p = (r: number, a: number) => `${(150 + Math.cos(a) * r).toFixed(2)} ${(150 + Math.sin(a) * r).toFixed(2)}`;
      const opacity = n ? 0.35 + (n / maxHour) * 0.65 : 0.08;
      return `<path d="M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)} Z" fill="${n ? 'url(#clock-g)' : '#fff'}" opacity="${opacity.toFixed(2)}" data-seg/>`;
    })
    .join('');

  const root = el(`
    <div class="view view--app">
      <div class="container">
        <header class="view-head" data-anim>
          <span class="eyebrow">Insights</span>
          <h1 class="h1">Know your pull.</h1>
          <p class="lede" style="margin-top:12px">Patterns lose their power once you can see them. Everything here is computed on your device.</p>
        </header>

        <section class="tiles" data-anim>
          <div class="glass tile"><span class="tile__value num">${esc(humanDuration(ms))}</span><span class="tile__label">Current streak</span></div>
          <div class="glass tile"><span class="tile__value num">${esc(humanDuration(Math.max(s.bestStreakMs, ms)))}</span><span class="tile__label">Best streak</span></div>
          <div class="glass tile"><span class="tile__value num">${esc(humanDuration(totalFreeMs(s)))}</span><span class="tile__label">Total time free</span></div>
          <div class="glass tile"><span class="tile__value num" data-count="${won.length}">${won.length}</span><span class="tile__label">Urges outlasted</span></div>
          <div class="glass tile"><span class="tile__value num" data-count="${winRate}" data-suffix="%">${winRate}%</span><span class="tile__label">Held strong</span></div>
          <div class="glass tile"><span class="tile__value num" data-count="${s.relapses.length}">${s.relapses.length}</span><span class="tile__label">New beginnings</span></div>
        </section>

        <div class="insights-grid">
          <section class="glass glass--pad" data-anim>
            <div class="card-title">${icons.clock}Your pull, by hour</div>
            <svg class="clock-chart" viewBox="0 0 300 300" aria-hidden="true">
              <defs><linearGradient id="clock-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4c97c"/><stop offset="1" stop-color="#ff72a8"/></linearGradient></defs>
              ${clockSegs}
              <circle cx="150" cy="150" r="54" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)"/>
              <text x="150" y="146" text-anchor="middle" fill="#fff" font-size="18" font-family="Cinzel Variable, serif">${hasPattern ? esc(hourLabel(peakHour)) : '—'}</text>
              <text x="150" y="166" text-anchor="middle" fill="#9195bb" font-size="9" letter-spacing="2">PEAK HOUR</text>
              ${[0, 6, 12, 18].map((h) => {
                const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
                return `<text x="${(150 + Math.cos(a) * 138).toFixed(1)}" y="${(154 + Math.sin(a) * 138).toFixed(1)}" text-anchor="middle" fill="#5c618a" font-size="10">${esc(hourLabel(h))}</text>`;
              }).join('')}
            </svg>
            <p class="muted" style="text-align:center;font-size:14px">${
              hasPattern
                ? `The pull visits most around <strong style="color:#fff">${esc(hourLabel(peakHour))}</strong>. Plan something for that hour.`
                : 'Use the SOS toolkit a few times and your pattern will appear here.'
            }</p>
          </section>

          <section class="glass glass--pad" data-anim>
            <div class="card-title">${icons.calendar}By weekday</div>
            <div class="bars">
              ${byDay
                .map(
                  (n, i) => `<div class="bars__col"><span class="bars__bar" data-bar style="height:${((n / maxDay) * 100).toFixed(1)}%;opacity:${n ? 1 : 0.25}"></span><span class="bars__label">${WEEKDAYS[i]}</span></div>`,
                )
                .join('')}
            </div>
            <p class="muted" style="margin-top:14px;font-size:14px">${hasPattern ? `${WEEKDAY_NAMES[peakDay]} are the hardest. Be extra kind to yourself then.` : 'No pattern yet — and that is fine.'}</p>
          </section>

          <section class="glass glass--pad" data-anim>
            <div class="card-title">${icons.sunrise}Mood · last 30 days</div>
            ${
              moodPts.length >= 2
                ? `<svg class="spark" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true">
                    <defs><linearGradient id="mood-g" x1="0" x2="1"><stop offset="0" stop-color="#79d8ff"/><stop offset="1" stop-color="#f4c97c"/></linearGradient></defs>
                    ${[1, 2, 3, 4, 5].map((m) => `<line x1="0" x2="600" y1="${110 - ((m - 1) / 4) * 95}" y2="${110 - ((m - 1) / 4) * 95}" stroke="rgba(255,255,255,0.05)"/>`).join('')}
                    <path d="${moodPath}" stroke="url(#mood-g)" stroke-width="3" fill="none" stroke-linecap="round" data-mood-line/>
                    ${moodPts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#fff" data-mood-dot/>`).join('')}
                  </svg>`
                : '<p class="muted" style="margin-top:14px">Check in on your Sanctuary each day to see your mood take shape.</p>'
            }
          </section>

          <section class="glass glass--pad" data-anim>
            <div class="card-title">${icons.sparkle}What helps you</div>
            ${
              topTools.length
                ? `<div class="stack" style="--gap:12px;margin-top:16px">${topTools
                    .map(
                      ([t, n]) => `<div><div class="row" style="justify-content:space-between;font-size:14px"><span>${esc(TOOL_NAMES[t] ?? t)}</span><span class="muted num">${n}</span></div>
                      <div style="height:6px;border-radius:6px;background:rgba(255,255,255,0.06);margin-top:6px;overflow:hidden"><div data-tool-bar style="height:100%;width:${((n / maxTool) * 100).toFixed(1)}%;border-radius:6px;background:linear-gradient(90deg,#5eead4,#f4c97c);transform-origin:0 50%"></div></div></div>`,
                    )
                    .join('')}</div>`
                : '<p class="muted" style="margin-top:14px">When you outlast an urge, the tools you used will be counted here.</p>'
            }
            ${
              topTriggers.length
                ? `<div class="divider" style="margin:20px 0 14px"></div><div class="card-title">${icons.flame}Common triggers</div><div class="chips" style="margin-top:12px">${topTriggers
                    .map(([t, n]) => `<span class="pill pill--rose">${esc(t)} · ${n}</span>`)
                    .join('')}</div>`
                : ''
            }
          </section>

          <section class="glass glass--pad" data-anim style="grid-column: 1 / -1">
            <div class="card-title">${icons.orbit}Your orbits</div>
            <div class="bars" style="grid-template-columns:repeat(${streaks.length}, 1fr);height:140px">
              ${streaks
                .map(
                  (v, i) => `<div class="bars__col"><span class="bars__bar" data-bar style="height:${((v / maxStreak) * 100).toFixed(1)}%;${i === streaks.length - 1 ? 'background:linear-gradient(180deg,#fff,#f4c97c)' : ''}"></span><span class="bars__label">${i === streaks.length - 1 ? 'Now' : `#${i + 1}`}</span></div>`,
                )
                .join('')}
            </div>
            <p class="muted" style="margin-top:14px;font-size:14px">Every attempt is part of the journey. Each bar is a streak you lived.</p>
          </section>
        </div>
      </div>
    </div>
  `);

  return {
    el: root,
    preset: 'calm',
    enter() {
      if (ctx.reduced) return;
      const segs = $$('[data-seg]', root);
      segs.forEach((seg) => (seg.style.transformOrigin = '150px 150px'));
      animate(segs, { scale: { from: 0.6, to: 1 }, opacity: { from: 0 }, delay: stagger(30, { start: 400 }), duration: 700, ease: 'out(3)' });
      animate($$('[data-bar]', root), { scaleY: { from: 0, to: 1 }, delay: stagger(70, { start: 500 }), duration: 1000, ease: 'outElastic(1, .7)' });
      animate($$('[data-tool-bar]', root), { scaleX: { from: 0, to: 1 }, delay: stagger(90, { start: 600 }), duration: 1100, ease: 'out(4)' });
      const line = $('[data-mood-line]', root);
      if (line) animate(svg.createDrawable(line), { draw: ['0 0', '0 1'], duration: 1800, delay: 500, ease: 'inOut(3)' });
      animate($$('[data-mood-dot]', root), { scale: { from: 0, to: 1 }, delay: stagger(40, { start: 900 }), duration: 500, ease: 'outBack' });
      $$('[data-count]', root).forEach((n) => {
        const target = Number(n.dataset.count);
        const suffix = n.dataset.suffix ?? '';
        const o = { v: 0 };
        animate(o, { v: target, duration: 1600, delay: 300, ease: 'out(3)', onUpdate: () => (n.textContent = `${Math.round(o.v)}${suffix}`) });
      });
    },
  };
}
