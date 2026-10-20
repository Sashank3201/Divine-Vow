/** Starting again after a slip. History and best streak are kept. */

import type { AppContext } from '../app/types';
import { store } from '../core/store';
import { dayWord, habitStreak, mainHabit, orderedHabits, recordSlip, simTimeForDays } from '../core/journey';
import { TRIGGERS } from '../core/content';
import { openModal, toast } from './overlay';
import { $$, esc } from './dom';

export function relapseFlow(ctx: AppContext, opts: { habitId?: string; onDone?: () => void } = {}): void {
  const state = store.get();
  if (!state.vow) return;
  const quit = orderedHabits(state).filter((h) => h.kind === 'quit');
  if (!quit.length) return;
  let habit = quit.find((h) => h.id === opts.habitId) ?? quit[0]!;
  const picked = new Set<string>();

  const summary = () => {
    const days = habitStreak(habit);
    const best = Math.max(habit.best, days);
    return days > 0
      ? `You had ${days} ${dayWord(days)}. Your best (${best} ${dayWord(best)}) and your history are kept.`
      : 'Your history is kept.';
  };

  const m = openModal(
    `<div class="stack" style="--gap:16px">
      <div class="stack" style="--gap:6px">
        <h3 class="t-title">Start again</h3>
        <p class="t-sub" data-summary>${esc(summary())}</p>
      </div>
      ${
        quit.length > 1
          ? `<div class="field"><span class="t-label">Which one?</span><div class="chips">${quit
              .map((h) => `<button class="chip ${h === habit ? 'is-on' : ''}" type="button" data-habit="${h.id}">${esc(h.name)}</button>`)
              .join('')}</div></div>`
          : ''
      }
      <div class="field">
        <span class="t-label">What triggered it? (optional)</span>
        <div class="chips">${TRIGGERS.map((t) => `<button class="chip" type="button" data-trigger="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      </div>
      <textarea class="textarea" data-note rows="2" placeholder="What would help next time? (optional)" style="min-height:80px"></textarea>
      <div class="stack" style="--gap:8px">
        <button class="btn btn--accent btn--block" type="button" data-restart>Back to Day 0</button>
        <button class="btn btn--fill btn--block" type="button" data-close>Cancel</button>
      </div>
    </div>`,
    { label: 'Start again' },
  );
  m.body.addEventListener('click', (e) => {
    const h = (e.target as HTMLElement).closest<HTMLElement>('[data-habit]');
    if (h) {
      habit = quit.find((x) => x.id === h.dataset.habit) ?? habit;
      $$('[data-habit]', m.body).forEach((x) => x.classList.toggle('is-on', x === h));
      m.body.querySelector('[data-summary]')!.textContent = summary();
      return;
    }
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-trigger]');
    if (!t) return;
    const v = t.dataset.trigger!;
    if (picked.has(v)) picked.delete(v);
    else picked.add(v);
    t.classList.toggle('is-on', picked.has(v));
  });
  m.body.querySelector('[data-restart]')!.addEventListener('click', () => {
    const note = (m.body.querySelector('[data-note]') as HTMLTextAreaElement).value.trim();
    const wasMain = habit.id === mainHabit()?.id;
    recordSlip(habit.id, [...picked].join(', '), note);
    void m.close();
    if (wasMain) ctx.cosmos.journey(simTimeForDays(0), 'home');
    toast(`${habit.name}: Day 0. Start again now.`);
    opts.onDone?.();
  });
}
