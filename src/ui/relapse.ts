/** The compassionate reset: a slip is information, not the end of the story. */

import type { AppContext } from '../app/types';
import { store, uid } from '../core/store';
import { streakMs, humanDuration } from '../core/journey';
import { TRIGGERS } from '../core/content';
import { openModal, toast } from './overlay';
import { esc } from './dom';
import { icons } from './icons';

export function relapseFlow(ctx: AppContext, onDone?: () => void): void {
  const state = store.get();
  if (!state.vow) return;
  const ms = streakMs(state);
  const best = Math.max(state.bestStreakMs, ms);
  const picked = new Set<string>();
  const m = openModal(
    `<div class="stack" style="--gap:18px">
      <span class="eyebrow">It happened</span>
      <h3 class="h2" style="font-size:30px">You are still here.</h3>
      <p class="lede" style="font-size:19px">A slip is not the end of your story — it is information. You kept your vow for <strong style="color:#fff">${esc(humanDuration(ms))}</strong>. Your best streak, your journal and everything you have learned stay with you.</p>
      <div class="field">
        <span class="field__label">What was happening? (optional)</span>
        <div class="chips">${TRIGGERS.map((t) => `<button class="chip" type="button" data-trigger="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      </div>
      <label class="field">
        <span class="field__label">A note for your future self (optional)</span>
        <textarea class="textarea" data-note rows="3" placeholder="What would help next time?"></textarea>
      </label>
      <div class="row wrap" style="justify-content:flex-end">
        <button class="btn btn--quiet" type="button" data-close>Not now</button>
        <button class="btn btn--primary" type="button" data-restart>${icons.sunrise}Begin a new orbit</button>
      </div>
    </div>`,
    { label: 'Begin again' },
  );
  m.body.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-trigger]');
    if (t) {
      const v = t.dataset.trigger!;
      if (picked.has(v)) picked.delete(v);
      else picked.add(v);
      t.classList.toggle('is-on', picked.has(v));
    }
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
    ctx.cosmos.journey(0.4, 'sanctuary', { shiftY: -0.18 });
    toast('A new orbit begins. You have done this before — you can do it again.', { icon: icons.sunrise, duration: 6000 });
    onDone?.();
  });
}
