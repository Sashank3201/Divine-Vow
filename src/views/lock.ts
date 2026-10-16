/**
 * PIN lock. On the lock screen the keys are liquid-glass drops floating over
 * the galaxy; inside a sheet (setting a PIN) they are quiet fills.
 */

import { animate, spring, stagger, utils } from 'animejs';
import type { AppContext } from '../app/types';
import { hashPin, store } from '../core/store';
import { icons } from '../ui/icons';
import { $, $$, el, vibrate } from '../ui/dom';

const LEN = 4;

/** A keypad; calls onComplete each time LEN digits are typed. Return false to reject. */
export function pinPad(onComplete: (pin: string) => Promise<boolean> | boolean, opts: { glass?: boolean } = {}): HTMLElement {
  const glass = opts.glass ? 'data-glass="control"' : '';
  const keyClass = opts.glass ? 'key key--glass' : 'key';
  const pad = el(`
    <div class="pin">
      <div class="pin__dots" aria-hidden="true">${'<span></span>'.repeat(LEN)}</div>
      <div class="keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="${keyClass}" ${glass} type="button" data-key="${n}">${n}</button>`).join('')}
        <span></span>
        <button class="${keyClass}" ${glass} type="button" data-key="0">0</button>
        <button class="key key--plain" type="button" data-del aria-label="Delete">${icons.backspace}</button>
      </div>
    </div>
  `);
  let pin = '';
  let busy = false;
  const dots = $$('.pin__dots span', pad);
  const sync = () => dots.forEach((d, i) => d.classList.toggle('is-on', i < pin.length));
  const press = async (k: string) => {
    if (busy) return;
    if (k === 'del') pin = pin.slice(0, -1);
    else if (pin.length < LEN) pin += k;
    sync();
    vibrate(8);
    const dot = dots[pin.length - 1];
    if (dot && k !== 'del') animate(dot, { scale: [1.5, 1], duration: 300, ease: 'out(3)' });
    if (pin.length === LEN) {
      busy = true;
      const ok = await onComplete(pin);
      if (!ok) {
        vibrate([60, 40, 60]);
        await animate($('.pin__dots', pad)!, { x: [0, -14, 14, -10, 10, -4, 0], duration: 460, ease: 'inOut(2)' }).then();
        pin = '';
        sync();
      }
      busy = false;
    }
  };
  pad.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (b) void press(b.dataset.key ?? 'del');
  });
  pad.addEventListener('keydown', (e) => {
    if (/^\d$/.test(e.key)) void press(e.key);
    if (e.key === 'Backspace') void press('del');
  });
  return pad;
}

/** If a PIN is set, block the app until it is entered. */
export function requireUnlock(ctx: AppContext): Promise<void> {
  const hash = store.get().settings.pinHash;
  if (!hash) return Promise.resolve();
  return new Promise((resolve) => {
    const screen = el(`
      <div class="lock" role="dialog" aria-modal="true" aria-label="Unlock Divine Vow">
        <div class="lock__head">
          <p class="t-headline">Divine Vow</p>
          <p class="t-sub">Enter your PIN</p>
        </div>
        <div data-pad></div>
      </div>
    `);
    const pad = pinPad(
      async (pin) => {
        const ok = (await hashPin(pin)) === hash;
        if (ok) {
          window.removeEventListener('keydown', keys);
          if (!ctx.reduced) {
            await animate($$('.lock__head, .pin__dots, .key', screen), {
              opacity: 0,
              scale: 0.8,
              delay: stagger(16, { from: 'center' }),
              duration: 260,
              ease: 'in(2)',
            }).then();
          }
          screen.remove();
          resolve();
        }
        return ok;
      },
      { glass: true },
    );
    $('[data-pad]', screen)!.appendChild(pad);
    document.body.appendChild(screen);
    const keys = (e: KeyboardEvent) => pad.dispatchEvent(new KeyboardEvent('keydown', { key: e.key }));
    window.addEventListener('keydown', keys);
    if (!ctx.reduced) {
      const k = $$('.key', screen);
      utils.set(k, { opacity: 0 });
      animate(k, {
        opacity: 1,
        scale: { from: 0.6, to: 1 },
        delay: stagger(28, { grid: [3, 4], from: 'center' }),
        ease: spring({ bounce: 0.35, duration: 700 }),
      });
    }
  });
}
