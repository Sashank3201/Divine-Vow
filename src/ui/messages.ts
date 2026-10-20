/**
 * Messages from past you. Written on strong days, shown first when an urge
 * hits.
 */

import { store, uid } from '../core/store';
import { DAY } from '../core/journey';
import { animate } from 'animejs';
import { $ } from './dom';
import { openModal, toast } from './overlay';

const PROMPTS: Record<'checkin' | 'won' | 'milestone' | 'manual', string> = {
  checkin: 'Strong day. Leave a few words for the next time an urge hits.',
  won: 'You just beat an urge. Tell the next one what it felt like to win.',
  milestone: 'Remember this moment. Write to the version of you who wants to give in.',
  manual: 'Next time an urge hits, this is the first thing you’ll see.',
};

/** True when it has been a while since the last message. */
export function wantsMessage(): boolean {
  const last = store.get().messages.at(-1);
  return !last || Date.now() - last.at > 7 * DAY;
}

/** Asks for a message to future you; resolves once the sheet is closed. */
export function writeMessage(reason: keyof typeof PROMPTS): Promise<void> {
  return new Promise((resolve) => {
    const m = openModal(
      `<div class="stack" style="--gap:14px">
        <div class="stack" style="--gap:6px">
          <h3 class="t-title">A message to future you</h3>
          <p class="t-sub">${PROMPTS[reason]}</p>
        </div>
        <textarea class="textarea" data-msg rows="4" maxlength="600" placeholder="e.g. You’ll feel worse in ten minutes, not better. Close it and go for a walk." autofocus></textarea>
        <div class="inline"><span class="spacer"></span><button class="btn btn--fill" type="button" data-close>${reason === 'manual' ? 'Cancel' : 'Skip'}</button><button class="btn btn--accent" type="button" data-save>Save</button></div>
      </div>`,
      { label: 'Message to future you', onClose: resolve },
    );
    m.body.querySelector('[data-save]')!.addEventListener('click', () => {
      const field = $<HTMLTextAreaElement>('[data-msg]', m.body)!;
      const text = field.value.trim();
      if (!text) {
        animate(field, { x: [0, -8, 8, -4, 4, 0], duration: 380 });
        return;
      }
      store.update((s) => {
        s.messages.push({ id: uid(), at: Date.now(), text });
      });
      void m.close();
      toast('Saved. You’ll see it when an urge hits.');
    });
  });
}
