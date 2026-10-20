/**
 * The night check-in: one screen with every habit. Quit habits start as
 * clean and good habits as not done, so a clean day is one tap. Days that
 * ended without a check-in are asked about first, oldest first; forgetting
 * never costs a streak. The galaxy only moves forward once a day is
 * confirmed.
 */

import type { AppContext } from '../app/types';
import type { CameraPreset } from '../app/cosmos';
import { store, dateKey, dayDate, shiftDay, type Mood } from '../core/store';
import {
  buildStatus,
  checkedIn,
  checkinOpen,
  dayWord,
  habitStreak,
  habitsOn,
  mainHabit,
  mainDays,
  pendingDays,
  recordDay,
  simTimeForDays,
  syncMilestones,
} from '../core/journey';
import { MOODS } from '../core/content';
import { icons } from './icons';
import { $$, esc, vibrate } from './dom';
import { openModal, toast } from './overlay';
import { celebrate } from './celebrate';
import { wantsMessage, writeMessage } from './messages';

interface DayResult {
  date: string;
  /** Quit habits marked as slipped. */
  slipped: string[];
}

export function dayLabel(date: string): string {
  const today = dateKey();
  if (date === today) return 'Tonight';
  if (date === shiftDay(today, -1)) return 'Yesterday';
  return dayDate(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** One day's check-in sheet. Resolves with what was recorded, or null if put off. */
function daySheet(date: string, step: string): Promise<DayResult | null> {
  const today = date === dateKey();
  const main = mainHabit();
  const habits = habitsOn(date);
  const quit = new Map<string, boolean>();
  const build = new Map<string, boolean>();
  for (const h of habits) {
    if (h.kind === 'quit') quit.set(h.id, h.log[date] !== false);
    else build.set(h.id, h.log[date] === true);
  }
  let mood: Mood | undefined;

  const rows = habits
    .map((h) => {
      const n = habitStreak(h);
      if (h.kind === 'quit') {
        const clean = quit.get(h.id)!;
        return `<div class="row checkin__row">
          <span class="row__body"><span class="row__title">${esc(h.name)}${h === main ? ' <span class="pill pill--accent pill--sm">Main</span>' : ''}</span><span class="row__sub">Day ${n}</span></span>
          <div class="segmented segmented--sm" data-quit="${h.id}">
            <button type="button" data-v="1" class="${clean ? 'is-on' : ''}">Clean</button>
            <button type="button" data-v="0" class="${clean ? '' : 'is-on'}">Slipped</button>
          </div>
        </div>`;
      }
      const done = build.get(h.id)!;
      const warn = buildStatus(h).warn;
      return `<button class="row row--button checkin__row" type="button" data-build="${h.id}" aria-pressed="${done}">
        <span class="row__body"><span class="row__title">${esc(h.name)}</span><span class="row__sub">${n} ${dayWord(n)}${warn ? ' · missed one, don’t miss two' : ''}</span></span>
        <span class="tick ${done ? 'is-on' : ''}">${icons.check}</span>
      </button>`;
    })
    .join('');

  return new Promise((resolve) => {
    let result: DayResult | null = null;
    const m = openModal(
      `<div class="stack checkin" style="--gap:16px">
        <div class="stack" style="--gap:4px">
          <p class="t-label">${esc(dayLabel(date))}${step ? ` · ${esc(step)}` : ''}</p>
          <h3 class="t-title">${today ? 'How did today go?' : 'You didn’t check in. How did it go?'}</h3>
        </div>
        <div class="group group--flush">${rows}</div>
        <div class="field">
          <span class="t-label">Mood (optional)</span>
          <div class="segmented" data-moods>${MOODS.map((x) => `<button type="button" data-mood="${x.value}">${x.label}</button>`).join('')}</div>
        </div>
        <div class="stack" style="--gap:6px">
          <button class="btn btn--accent btn--block btn--lg" type="button" data-confirm>Confirm</button>
          ${today ? '<button class="btn btn--plain" type="button" data-close style="align-self:center">Not now</button>' : ''}
        </div>
      </div>`,
      { label: `Check-in: ${dayLabel(date)}`, dismissable: today, onClose: () => resolve(result) },
    );

    m.body.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const seg = t.closest<HTMLElement>('[data-quit]');
      const b = t.closest<HTMLElement>('button');
      if (seg && b?.dataset.v) {
        quit.set(seg.dataset.quit!, b.dataset.v === '1');
        $$('button', seg).forEach((x) => x.classList.toggle('is-on', x === b));
        vibrate(8);
        return;
      }
      const row = t.closest<HTMLElement>('[data-build]');
      if (row) {
        const id = row.dataset.build!;
        const done = !build.get(id);
        build.set(id, done);
        row.setAttribute('aria-pressed', String(done));
        row.querySelector('.tick')!.classList.toggle('is-on', done);
        vibrate(done ? 14 : 6);
        return;
      }
      if (b?.dataset.mood) {
        const v = Number(b.dataset.mood) as Mood;
        mood = mood === v ? undefined : v;
        $$('[data-mood]', m.body).forEach((x) => x.classList.toggle('is-on', Number(x.dataset.mood) === mood));
        return;
      }
      if (b?.hasAttribute('data-confirm')) {
        const marks: Record<string, boolean> = {};
        quit.forEach((v, k) => (marks[k] = v));
        build.forEach((v, k) => (marks[k] = v));
        recordDay(date, marks, mood);
        result = { date, slipped: [...quit].filter(([, v]) => !v).map(([k]) => k) };
        void m.close();
      }
    });
  });
}

export interface CheckinOptions {
  /** Include tonight's check-in (if it is open and not done yet). */
  today: boolean;
  /** Camera preset of the screen the galaxy should settle into. */
  preset: CameraPreset;
  shiftY?: number;
  /** Called after each confirmed day. */
  onRecorded?: () => void;
}

let running = false;

/** Days that still need a check-in: missed ones first, then maybe tonight. */
export function daysToCheck(includeToday: boolean): string[] {
  const days = pendingDays();
  const today = dateKey();
  if (includeToday && checkinOpen() && !checkedIn(today)) days.push(today);
  return days;
}

/**
 * Runs the check-ins, then moves the galaxy, celebrates milestones and
 * offers to write a message to future you. Resolves true if a day was
 * recorded.
 */
export async function runCheckins(ctx: AppContext, opts: CheckinOptions): Promise<boolean> {
  if (running || !store.get().vow) return false;
  const days = daysToCheck(opts.today);
  if (!days.length) return false;
  running = true;
  try {
    const before = mainDays();
    const mainId = mainHabit()?.id;
    const results: DayResult[] = [];
    for (let i = 0; i < days.length; i++) {
      const r = await daySheet(days[i]!, days.length > 1 ? `${i + 1} of ${days.length}` : '');
      if (!r) break;
      results.push(r);
      opts.onRecorded?.();
    }
    if (!results.length) return false;

    const after = mainDays();
    const lostMain = results.some((r) => mainId && r.slipped.includes(mainId));
    const anySlip = results.some((r) => r.slipped.length);
    // The galaxy only moves now, when the day is confirmed.
    ctx.cosmos.journey(simTimeForDays(after), opts.preset, { shiftY: opts.shiftY ?? 0 });
    if (lostMain) {
      toast('Back to Day 0. Your history is kept.');
    } else if (after > before) {
      ctx.cosmos.flash(0.55);
      vibrate([20, 50, 40]);
      toast(after === 1 ? 'Day 1. The galaxy moves forward.' : `Day ${after}. The galaxy moves forward.`);
    } else {
      toast('Checked in.');
    }

    const fresh = syncMilestones();
    if (fresh.length) await celebrate(fresh[fresh.length - 1]!, ctx);
    if (!anySlip && (fresh.length || wantsMessage())) await writeMessage(fresh.length ? 'milestone' : 'checkin');
    return true;
  } finally {
    running = false;
  }
}
