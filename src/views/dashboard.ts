/**
 * Dashboard — everything in one liquid-glass sheet: the main streak,
 * tonight's check-in, every habit, messages to future you, the journey,
 * milestones, stats, insights and recent journal.
 */

import { animate, stagger } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store, dateKey, shiftDay, type Habit, type HabitKind } from '../core/store';
import {
  JOURNEY_BEATS,
  JOURNEY_DAYS,
  MILESTONES,
  addHabit,
  beatFor,
  buildStatus,
  checkinOpen,
  checkinOpensLabel,
  cleanDays,
  currentRank,
  dayWord,
  habitStreak,
  mainDays,
  mainHabit,
  nextMilestone,
  orderedHabits,
  pendingDays,
  removeHabit,
  setDoneToday,
  setMain,
  simTimeForDays,
} from '../core/journey';
import { LINES, MOODS, dailyPick } from '../core/content';
import { icons } from '../ui/icons';
import { $, $$, esc, relativeDay } from '../ui/dom';
import { confirmDialog, openModal, toast } from '../ui/overlay';
import { relapseFlow } from '../ui/relapse';
import { runCheckins } from '../ui/checkin';
import { writeMessage } from '../ui/messages';
import { burst } from '../ui/celebrate';
import { createSheet } from './sheet';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

function hourLabel(h: number): string {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric' });
}

/** The last seven days of a habit, oldest first: kept, broken or open. */
function week(h: Habit): string {
  const today = dateKey();
  let out = '';
  for (let i = 6; i >= 0; i--) {
    const d = shiftDay(today, -i);
    const v = d < h.since ? undefined : h.log[d];
    out += `<i class="${v === true ? 'is-kept' : v === false ? 'is-broken' : ''}"></i>`;
  }
  return `<span class="week" aria-hidden="true">${out}</span>`;
}

const KIND_NOTE: Record<HabitKind, string> = {
  quit: 'One slip and it’s back to Day 0.',
  build: 'Missing one day is okay. Missing two in a row resets it.',
};

export function dashboardView(ctx: AppContext, params: URLSearchParams): View {
  const sheet = createSheet(ctx, {
    title: 'Dashboard',
    sub: new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    body: '<div class="dash" data-dash></div>',
  });
  const dash = $('[data-dash]', sheet.body)!;

  const tonightMarkup = () => {
    const s = store.get();
    const pending = pendingDays(s).length;
    const today = s.checkins.find((c) => c.date === dateKey());
    if (pending) {
      return `<div class="group__title">Check-in</div>
        <p class="t-title">${pending === 1 ? 'You missed a check-in' : `You missed ${pending} check-ins`}</p>
        <p class="t-sub">Tell the app how those days went. Forgetting doesn’t cost you a streak.</p>
        <button class="btn btn--accent btn--block" type="button" data-checkin style="margin-top:14px">Catch up</button>`;
    }
    if (today) {
      const mood = MOODS.find((x) => x.value === today.mood);
      return `<div class="group__title">Tonight</div>
        <p class="t-title">Checked in</p>
        <p class="t-sub">${mood ? `Feeling ${mood.label.toLowerCase()}. ` : ''}See you tomorrow night.</p>`;
    }
    if (checkinOpen()) {
      return `<div class="group__title">Tonight</div>
        <p class="t-title">Time to check in</p>
        <p class="t-sub">One tap. The galaxy moves forward when you do.</p>
        <button class="btn btn--accent btn--block" type="button" data-checkin style="margin-top:14px">${icons.moon}Check in</button>`;
    }
    return `<div class="group__title">Tonight</div>
      <p class="t-title">Check in tonight</p>
      <p class="t-sub">Opens at ${esc(checkinOpensLabel())}. One tap, and the galaxy moves forward a day.</p>`;
  };

  const habitRow = (h: Habit, main: Habit | null) => {
    const n = habitStreak(h);
    const status = h.kind === 'build' ? buildStatus(h) : null;
    const doneToday = h.log[dateKey()] === true;
    const sub =
      h.kind === 'quit'
        ? `Quit · best ${Math.max(h.best, n)}`
        : status?.warn && !doneToday
          ? 'Missed one. Don’t miss today.'
          : 'Good habit · don’t miss twice';
    return `<div class="habit ${status?.warn && !doneToday ? 'is-warn' : ''}">
      <button class="habit__main" type="button" data-edit="${h.id}">
        <span class="habit__name">${esc(h.name)}${h === main ? ' <span class="pill pill--accent pill--sm">Main</span>' : ''}</span>
        <span class="habit__sub">${esc(sub)}</span>
        ${week(h)}
      </button>
      <span class="habit__count"><span class="t-num">${n}</span><small>${dayWord(n)}</small></span>
      ${
        h.kind === 'build'
          ? `<button class="tick ${doneToday ? 'is-on' : ''}" type="button" data-done="${h.id}" aria-pressed="${doneToday}" aria-label="${esc(h.name)} done today">${icons.check}</button>`
          : ''
      }
    </div>`;
  };

  const render = (animated = false) => {
    const s = store.get();
    const vow = s.vow!;
    const main = mainHabit(s);
    const habits = orderedHabits(s);
    const days = main ? habitStreak(main) : 0;
    const best = main ? Math.max(main.best, days) : 0;
    const rank = currentRank(days);
    const { next, progress } = nextMilestone(days);
    const day = Math.min(days, JOURNEY_DAYS);
    const beat = beatFor(days);
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
    const messages = [...s.messages].reverse();

    dash.innerHTML = `
      <div class="dash__col">
        <section class="group streak" data-anim>
          <div class="group__title"><span>${main ? esc(main.name) : 'Main habit'}</span>${rank ? `<span class="pill">${esc(rank.name)}</span>` : ''}</div>
          <div class="streak__num t-num"><span>${days}</span><small>${dayWord(days)} clean</small></div>
          <div class="bar" style="margin-top:18px"><span class="bar__fill" data-next-fill></span></div>
          <p class="t-sub" style="margin-top:10px">${
            next
              ? `Next: <strong class="t-accent">${esc(next.name)}</strong> at ${esc(next.title)} · ${next.days - days} ${dayWord(next.days - days)} to go`
              : 'Every milestone reached.'
          }</p>
          <p class="t-foot" style="margin-top:4px">Best: ${best} ${dayWord(best)} · days count when you check in</p>
        </section>

        <div class="dash__actions" data-anim>
          <a class="btn btn--accent btn--block" href="#/sos">${icons.lifebuoy}I have an urge</a>
          <button class="btn btn--fill btn--block" type="button" data-slip>I slipped</button>
        </div>

        <section class="group" data-anim>${tonightMarkup()}</section>

        <section class="group group--flush" data-anim>
          <div class="group__title" style="padding:14px 18px 0"><span>Habits</span><button class="btn btn--plain" type="button" data-add>${icons.plus}Add</button></div>
          <div class="habits">${habits.map((h) => habitRow(h, main)).join('')}</div>
        </section>

        <section class="group" data-anim>
          <div class="group__title"><span>Messages to future you</span><button class="btn btn--plain" type="button" data-write>Write one</button></div>
          ${
            messages.length
              ? `<div class="msgs">${messages
                  .map(
                    (m) => `<div class="msg"><p class="msg__text">“${esc(m.text)}”</p><span class="msg__meta">${esc(relativeDay(m.at))}<button class="btn btn--plain" type="button" data-del-msg="${m.id}">Delete</button></span></div>`,
                  )
                  .join('')}</div>`
              : '<p class="t-sub">When an urge hits, the first thing you see is a message from you. Write one on a good day.</p>'
          }
        </section>

        <section class="group" data-anim>
          <div class="group__title"><span>Why you’re doing this</span><button class="btn btn--plain" type="button" data-read-vow>Your vow</button></div>
          <ul class="reasons">${vow.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        </section>

        <section class="group" data-anim>
          <div class="group__title"><span>Today’s line</span><button class="btn btn--plain" type="button" data-another>Another</button></div>
          <p class="t-headline" data-line>${esc(LINES[lineIndex]!)}</p>
        </section>
      </div>

      <div class="dash__col">
        <section class="group" data-anim>
          <div class="group__title"><span>Galaxy journey</span><span class="t-foot">Day ${day} of ${JOURNEY_DAYS}</span></div>
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
          <div class="group__title"><span>Milestones</span><span class="t-foot">${MILESTONES.filter((m) => days >= m.days).length} of ${MILESTONES.length}</span></div>
          <div class="milestones">
            ${MILESTONES.map((m) => {
              const lit = days >= m.days;
              const isNext = next?.id === m.id;
              return `<button class="ms ${lit ? 'is-lit' : ''} ${isNext ? 'is-next' : ''}" type="button" data-ms="${m.id}">
                <span class="ms__dot"></span><span class="ms__name">${esc(m.name)}</span><span class="ms__at">${m.days < 365 ? `${m.days}d` : '1y'}</span>
              </button>`;
            }).join('')}
          </div>
        </section>

        <section class="group" data-anim>
          <div class="group__title">Stats</div>
          <div class="stats">
            <div><span class="stats__v t-num">${won.length}</span><span class="stats__k">Urges beaten</span></div>
            <div><span class="stats__v t-num">${winRate}%</span><span class="stats__k">Held strong</span></div>
            <div><span class="stats__v t-num">${best}</span><span class="stats__k">Best streak</span></div>
            <div><span class="stats__v t-num">${main ? cleanDays(main) : 0}</span><span class="stats__k">Clean days</span></div>
            <div><span class="stats__v t-num">${s.relapses.length}</span><span class="stats__k">Restarts</span></div>
            <div><span class="stats__v t-num">${s.checkins.length}</span><span class="stats__k">Check-ins</span></div>
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

    const nextFill = $('[data-next-fill]', dash)!;
    const journeyFill = $('[data-journey-fill]', dash)!;
    if (animated && !ctx.reduced) {
      animate(nextFill, { width: { from: '0%', to: `${(progress * 100).toFixed(2)}%` }, duration: 1400, delay: 500, ease: 'out(3)' });
      animate(journeyFill, { width: { from: '0%', to: `${((day / JOURNEY_DAYS) * 100).toFixed(2)}%` }, duration: 1600, delay: 600, ease: 'out(3)' });
      animate($$('.hours span, .days span', dash), { scaleY: { from: 0, to: 1 }, delay: stagger(12, { start: 700 }), duration: 700, ease: 'out(3)' });
      animate($$('[data-anim]', dash), { opacity: { from: 0, to: 1 }, y: { from: 16, to: 0 }, delay: stagger(40, { start: 320 }), duration: 600, ease: 'out(3)' });
    } else {
      nextFill.style.width = `${(progress * 100).toFixed(2)}%`;
      journeyFill.style.width = `${((day / JOURNEY_DAYS) * 100).toFixed(2)}%`;
    }
  };

  const addFlow = () => {
    let kind: HabitKind = 'build';
    const today = dateKey();
    const m = openModal(
      `<div class="stack" style="--gap:14px">
        <h3 class="t-title">Add a habit</h3>
        <div class="segmented" data-kinds>
          <button type="button" data-kind="build" class="is-on">Good habit</button>
          <button type="button" data-kind="quit">Quit</button>
        </div>
        <p class="t-sub" data-kind-note>${KIND_NOTE.build}</p>
        <input class="input" data-name maxlength="40" placeholder="e.g. Gym, Read 10 pages, Bed by 11" autocomplete="off" autofocus />
        <label class="field" data-since hidden><span class="t-label">Clean since</span><input class="input" type="date" data-since-date value="${today}" max="${today}" /></label>
        <div class="inline" style="margin-top:6px"><span class="spacer"></span><button class="btn btn--fill" type="button" data-close>Cancel</button><button class="btn btn--accent" type="button" data-save>Add</button></div>
      </div>`,
      { label: 'Add a habit' },
    );
    const name = $<HTMLInputElement>('[data-name]', m.body)!;
    m.body.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      if (b.dataset.kind) {
        kind = b.dataset.kind as HabitKind;
        $$('[data-kind]', m.body).forEach((x) => x.classList.toggle('is-on', x === b));
        $('[data-kind-note]', m.body)!.textContent = KIND_NOTE[kind];
        $('[data-since]', m.body)!.hidden = kind !== 'quit';
        name.placeholder = kind === 'quit' ? 'A name only you understand' : 'e.g. Gym, Read 10 pages, Bed by 11';
      } else if (b.hasAttribute('data-save')) {
        const value = name.value.trim();
        if (!value) {
          animate(name, { x: [0, -8, 8, -4, 4, 0], duration: 380 });
          return;
        }
        const picked = $<HTMLInputElement>('[data-since-date]', m.body)!.value;
        const since = kind === 'quit' && /^\d{4}-\d{2}-\d{2}$/.test(picked) && picked <= today ? picked : today;
        addHabit(kind, value, since);
        void m.close();
        toast(kind === 'quit' ? `${value} added. Check in tonight.` : `${value} added. Tick it off when you do it.`);
      }
    });
  };

  const editFlow = (id: string) => {
    const h = store.get().habits.find((x) => x.id === id);
    if (!h) return;
    const isMain = h.id === mainHabit()?.id;
    const n = habitStreak(h);
    const m = openModal(
      `<div class="stack" style="--gap:14px">
        <div class="stack" style="--gap:4px">
          <h3 class="t-title">${esc(h.name)}</h3>
          <p class="t-sub">${h.kind === 'quit' ? 'Quit' : 'Good habit'} · ${n} ${dayWord(n)} · best ${Math.max(h.best, n)}</p>
        </div>
        <label class="field"><span class="t-label">Name</span><input class="input" data-name maxlength="40" value="${esc(h.name)}" autocomplete="off" /></label>
        <p class="t-foot">${isMain ? 'Your main habit. It drives the galaxy and the day counter.' : KIND_NOTE[h.kind]}</p>
        ${
          isMain
            ? ''
            : `<div class="group group--flush">
                ${h.kind === 'quit' ? `<button class="row row--button" type="button" data-make-main><span class="row__body"><span class="row__title">Make it the main habit</span><span class="row__sub">The galaxy and the day counter follow it.</span></span></button>` : ''}
                <button class="row row--button row--danger" type="button" data-delete><span class="row__body"><span class="row__title">Delete habit</span></span></button>
              </div>`
        }
        <div class="inline" style="margin-top:6px"><span class="spacer"></span><button class="btn btn--fill" type="button" data-close>Cancel</button><button class="btn btn--accent" type="button" data-save>Save</button></div>
      </div>`,
      { label: h.name },
    );
    m.body.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      if (b.hasAttribute('data-save')) {
        const value = $<HTMLInputElement>('[data-name]', m.body)!.value.trim();
        if (value && value !== h.name) {
          store.update((s) => {
            const x = s.habits.find((y) => y.id === id);
            if (x) x.name = value;
          });
        }
        void m.close();
      } else if (b.hasAttribute('data-make-main')) {
        setMain(id);
        await m.close();
        ctx.cosmos.journey(simTimeForDays(mainDays()), 'dashboard');
        toast(`${h.name} is your main habit now.`);
      } else if (b.hasAttribute('data-delete')) {
        await m.close();
        if (await confirmDialog({ title: `Delete ${h.name}?`, text: 'Its streak and history are deleted. This can’t be undone.', confirm: 'Delete', danger: true })) {
          removeHabit(id);
          toast('Habit deleted.');
        }
      }
    });
  };

  let lineIndex = LINES.indexOf(dailyPick(LINES));
  dash.addEventListener('click', async (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!t) return;
    if (t.dataset.done) {
      const done = t.getAttribute('aria-pressed') !== 'true';
      if (done) {
        const r = t.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, 18, 90);
      }
      setDoneToday(t.dataset.done, done);
    } else if (t.dataset.edit) {
      editFlow(t.dataset.edit);
    } else if (t.hasAttribute('data-add')) {
      addFlow();
    } else if (t.hasAttribute('data-checkin')) {
      await runCheckins(ctx, { today: true, preset: 'dashboard' });
    } else if (t.hasAttribute('data-write')) {
      await writeMessage('manual');
    } else if (t.dataset.delMsg) {
      const id = t.dataset.delMsg;
      if (await confirmDialog({ title: 'Delete this message?', text: 'You won’t see it during urges anymore.', confirm: 'Delete', danger: true })) {
        store.update((s) => {
          s.messages = s.messages.filter((x) => x.id !== id);
        });
      }
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
      relapseFlow(ctx);
    } else if (t.dataset.ms) {
      const m = MILESTONES.find((x) => x.id === t.dataset.ms)!;
      const at = store.get().milestones[m.id];
      const main = mainHabit();
      const left = m.days - (main ? habitStreak(main) : 0);
      toast(at ? `${m.name} · reached ${new Date(at).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : `${m.name} · ${left} ${dayWord(left)} to go`);
    }
  });

  // Everything on this sheet follows the store; later renders don't replay the entrance.
  const unsub = store.subscribe(() => {
    if (store.get().vow) render();
  });
  let lastOpen = checkinOpen();
  const interval = window.setInterval(() => {
    const open = checkinOpen();
    if (open !== lastOpen) {
      lastOpen = open;
      render();
    }
  }, 30_000);

  return {
    el: sheet.root,
    preset: 'dashboard',
    enter() {
      render(true);
      sheet.enter();
      if (params.get('add')) window.setTimeout(addFlow, ctx.reduced ? 50 : 500);
    },
    leave: (next) => sheet.leave(next),
    destroy() {
      window.clearInterval(interval);
      unsub();
    },
  };
}
