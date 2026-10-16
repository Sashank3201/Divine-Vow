/** Starting again after a slip. History and best streak are kept. */

import type { AppContext } from '../app/types';
import { store, uid } from '../core/store';
import { streakMs, humanDuration } from '../core/journey';
import { TRIGGERS } from '../core/content';
import { openModal, toast } from './overlay';
import { esc } from './dom';

export function relapseFlow(ctx: AppContext, onDone?: () => void): void {
  const state = store.get();
  if (!state.vow) return;
  const ms = streakMs(state);
  const best = Math.max(state.bestStreakMs, ms);
  const picked = new Set<string>();
  const m = openModal(
    `<div class="stack" style="--gap:16px">
      <div class="stack" style="--gap:6px">
        <h3 class="t-title">Start again</h3>
        <p class="t-sub">You lasted ${esc(humanDuration(ms))}. Your history and best streak are saved.</p>
      </div>
      <div class="field">
        <span class="t-label">What triggered it? (optional)</span>
        <div class="chips">${TRIGGERS.map((t) => `<button class="chip" type="button" data-trigger="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      </div>
      <textarea class="textarea" data-note rows="2" placeholder="What would help next time? (optional)" style="min-height:80px"></textarea>
      <div class="stack" style="--gap:8px">
        <button class="btn btn--accent btn--block" type="button" data-restart>Start again now</button>
        <button class="btn btn--fill btn--block" type="button" data-close>Cancel</button>
      </div>
    </div>`,
    { label: 'Start again' },
  );
  m.body.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-trigger]');
    if (!t) return;
    const v = t.dataset.trigger!;
    if (picked.has(v)) picked.delete(v);
    else picked.add(v);
    t.classList.toggle('is-on', picked.has(v));
  });
  m.body.querySelector('[data-restart]')!.addEventListener('click', () => {
    const note = (m.body.querySelector('[data-note]') as HTMLTextAreaElement).value.trim();
    const now = Date.now();
    store.update((s) => {
      s.relapses.push({ id: uid(), at: now, streakMs: ms, note, trigger: [...picked].join(', ') });
      s.bestStreakMs = best;
      s.milestones = {};
      if (s.vow) s.vow.startAt = now;
    });
    void m.close();
    ctx.cosmos.journey(0.4, 'home');
    toast('New streak started. Day 0.');
    onDone?.();
  });
}
