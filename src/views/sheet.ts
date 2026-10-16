/**
 * Shared scaffold for sheet screens: one liquid-glass sheet over the
 * galaxy, with a header, a scrolling body and an optional footer. Sheets
 * grow out of the control that opened them and shrink back into it.
 */

import { animate, spring } from 'animejs';
import type { AppContext } from '../app/types';
import { icons } from '../ui/icons';
import { $, el, esc } from '../ui/dom';
import { morphClose, morphOpen, takeOrigin } from '../ui/morph';

export interface SheetOptions {
  title: string;
  sub?: string;
  /** Extra header controls (HTML), placed before the close button. */
  actions?: string;
  body: string;
  foot?: string;
  size?: 'app' | 'narrow' | 'center';
  closable?: boolean;
  /** Where the close button goes when there is no in-app history. */
  closeTo?: string;
  className?: string;
}

export interface Sheet {
  root: HTMLElement;
  sheet: HTMLElement;
  inner: HTMLElement;
  body: HTMLElement;
  enter(): void;
  leave(nextPath: string): Promise<void>;
  /** Run a content change; if the sheet's height changes, it flows to the new size. */
  resize(change: () => void): void;
}

export function createSheet(ctx: AppContext, o: SheetOptions): Sheet {
  const size = o.size ?? 'app';
  const sizeClass = size === 'center' ? 'sheet--center' : size === 'narrow' ? 'sheet--app sheet--narrow' : 'sheet--app';
  const root = el(`
    <div class="screen ${o.className ?? ''}">
      <section class="sheet ${sizeClass}" data-glass="sheet" aria-label="${esc(o.title)}">
        <div class="sheet__inner" data-inner>
          <header class="sheet__head">
            <div class="sheet__title">
              <h1 class="t-large">${esc(o.title)}</h1>
              ${o.sub ? `<p class="t-sub" data-sub>${esc(o.sub)}</p>` : ''}
            </div>
            ${o.actions ?? ''}
            ${o.closable === false ? '' : `<button class="icon-btn icon-btn--fill" type="button" data-sheet-close aria-label="Close">${icons.close}</button>`}
          </header>
          <div class="sheet__body" data-body>${o.body}</div>
          ${o.foot ? `<footer class="sheet__foot">${o.foot}</footer>` : ''}
        </div>
      </section>
    </div>
  `);
  const sheet = $('.sheet', root)!;
  const inner = $('[data-inner]', root)!;
  const body = $('[data-body]', root)!;
  const origin = takeOrigin();

  root.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-sheet-close]')) ctx.router.back(o.closeTo ?? '/home');
  });

  return {
    root,
    sheet,
    inner,
    body,
    enter() {
      void morphOpen(sheet, inner, origin, ctx.reduced);
    },
    async leave(nextPath: string) {
      // Only melt back into the opening button when returning to its screen.
      const back = origin && origin.path === nextPath ? origin : null;
      await morphClose(sheet, inner, back, ctx.reduced);
    },
    resize(change) {
      const h0 = sheet.getBoundingClientRect().height;
      sheet.style.height = '';
      change();
      const h1 = sheet.getBoundingClientRect().height;
      if (ctx.reduced || Math.abs(h1 - h0) < 1) return;
      animate(sheet, {
        height: { from: h0, to: h1 },
        ease: spring({ bounce: 0.18, duration: 600 }),
        onComplete: () => (sheet.style.height = ''),
      });
    },
  };
}
