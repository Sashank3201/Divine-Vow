/** PIN lock screen and PIN entry pad. */

import { animate, stagger } from 'animejs';
import type { AppContext } from '../app/types';
import { hashPin, store } from '../core/store';
import { brandMark, icons } from '../ui/icons';
import { $, $$, el, vibrate } from '../ui/dom';

const LEN = 4;

/** Renders a keypad; resolves with the entered PIN each time LEN digits are typed. */
export function pinPad(onComplete: (pin: string) => Promise<boolean> | boolean): HTMLElement {
  const pad = el(`
    <div class="lock__inner" style="gap:26px">
      <div class="lock__dots" aria-hidden="true">${'<span></span>'.repeat(LEN)}</div>
      <div class="keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="key" type="button" data-key="${n}">${n}</button>`).join('')}
        <span></span>
        <button class="key" type="button" data-key="0">0</button>
        <button class="key key--ghost" type="button" data-del aria-label="Delete">${icons.arrowLeft}</button>
      </div>
    </div>
  `);
  let pin = '';
  let busy = false;
  const dots = $$('.lock__dots span', pad);
  const sync = () => dots.forEach((d, i) => d.classList.toggle('is-on', i < pin.length));
  const press = async (k: string) => {
    if (busy) return;
    if (k === 'del') pin = pin.slice(0, -1);
    else if (pin.length < LEN) pin += k;
    sync();
    vibrate(8);
    const dot = dots[pin.length - 1];
    if (dot && k !== 'del') animate(dot, { scale: [1.6, 1], duration: 300, ease: 'out(3)' });
    if (pin.length === LEN) {
      busy = true;
      const ok = await onComplete(pin);
      if (!ok) {
        vibrate([60, 40, 60]);
        await animate($('.lock__dots', pad)!, { x: [0, -14, 14, -10, 10, -4, 0], duration: 460, ease: 'inOut(2)' }).then();
        pin = '';
        sync();
      }
      busy = false;
    }
  };
  pad.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    void press(b.dataset.key ?? 'del');
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
        <div class="lock__inner">
          ${brandMark.replace('class="brand__mark"', 'style="width:56px;height:56px"')}
          <p class="display" style="font-size:16px;letter-spacing:0.3em">Divine Vow</p>
          <p class="muted">Enter your PIN</p>
          <div data-pad style="width:100%"></div>
        </div>
      </div>
    `);
    const pad = pinPad(async (pin) => {
      const ok = (await hashPin(pin)) === hash;
      if (ok) {
        await animate(screen, { opacity: 0, scale: 1.04, filter: 'blur(10px)', duration: 600, ease: 'in(2)' }).then();
        screen.remove();
        window.removeEventListener('keydown', keys);
        resolve();
      }
      return ok;
    });
    $('[data-pad]', screen)!.appendChild(pad);
    document.body.appendChild(screen);
    const keys = (e: KeyboardEvent) => pad.dispatchEvent(new KeyboardEvent('keydown', { key: e.key }));
    window.addEventListener('keydown', keys);
    if (!ctx.reduced) animate($$('.key', screen), { opacity: { from: 0, to: 1 }, scale: { from: 0.8, to: 1 }, delay: stagger(30, { grid: [3, 4], from: 'center' }), duration: 500, ease: 'out(3)' });
  });
}
