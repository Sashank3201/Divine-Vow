/**
 * Welcome — the hero. The collision plays like a film; on top there is only
 * the name, cut from liquid glass, one line and two glass buttons.
 */

import { animate, createAnimatable, splitText, spring, stagger, utils, type TextSplitter } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store } from '../core/store';
import { icons } from '../ui/icons';
import { $, $$, el } from '../ui/dom';
import { openModal } from '../ui/overlay';

export function welcomeView(ctx: AppContext): View {
  const hasVow = !!store.get().vow;
  const root = el(`
    <div class="screen welcome">
      <div class="topline topline--end">
        <button class="icon-btn" type="button" data-glass="control" data-action="replay" aria-label="Replay">${icons.replay}</button>
      </div>

      <section class="welcome__content" data-content>
        <h1 class="t-hero welcome__title" data-glass="text" data-title>Divine Vow</h1>
        <p class="welcome__line" data-line>Quit the habit that’s holding you back. One day at a time.</p>
        <div class="welcome__actions" data-actions>
          <a class="btn btn--lg" data-glass="accent" data-morph href="${hasVow ? '#/home' : '#/vow'}">${hasVow ? 'Continue' : 'Take the vow'}</a>
          <button class="btn btn--lg" type="button" data-glass="control" data-action="how">How it works</button>
        </div>
      </section>
    </div>
  `);

  const cleanups: Array<() => void> = [];
  const splitters: TextSplitter[] = [];
  const wide = () => innerWidth > 860;
  /** Laptops, and phones held sideways: copy bottom-left, galaxies up and right. */
  const side = () => wide() || (innerWidth > innerHeight * 1.3 && innerHeight <= 520);

  const startFilm = () => {
    ctx.cosmos.playCinematic({});
  };

  // ── Framing: the copy sits bottom-left (laptops) or along the bottom
  // (phones); the galaxies are lifted into the open sky above and beside it.
  const frame = (duration: number) => {
    const scene = ctx.cosmos.scene;
    ctx.cosmos.setShift(side() ? 0.16 : 0, side() ? 0.16 : 0.04, duration);
    if (scene) animate(scene.user, { zoom: wide() ? 1.12 : 1, duration, ease: 'inOut(3)' });
  };

  const intro = () => {
    if (ctx.reduced) return;
    const title = splitText($('[data-title]', root)!, { chars: { wrap: 'clip' } });
    const line = splitText($('[data-line]', root)!, { words: true });
    splitters.push(title, line);
    utils.set(title.chars as HTMLElement[], { y: '110%' });
    utils.set(line.words as HTMLElement[], { opacity: 0 });
    utils.set($$('[data-actions] > *, .topline > *', root), { opacity: 0 });
    animate(title.chars as HTMLElement[], { y: '0%', duration: 1100, delay: stagger(45, { start: 600 }), ease: 'out(4)' });
    animate(line.words as HTMLElement[], { opacity: 1, y: { from: 10, to: 0 }, duration: 800, delay: stagger(30, { start: 1300 }), ease: 'out(3)' });
    animate($$('[data-actions] > *', root), {
      opacity: 1,
      scale: { from: 0.86, to: 1 },
      delay: stagger(90, { start: 1800 }),
      ease: spring({ bounce: 0.3, duration: 700 }),
    });
    animate($$('.topline > *', root), { opacity: 1, duration: 700, delay: stagger(80, { start: 2200 }) });
  };

  // Buttons lean toward the pointer — the glass follows them.
  const magnetic = () => {
    if (ctx.reduced || matchMedia('(pointer: coarse)').matches) return;
    $$('[data-actions] > *', root).forEach((btn) => {
      const a = createAnimatable(btn, { x: 600, y: 600, ease: 'out(3)' });
      const mv = (e: PointerEvent) => {
        const r = btn.getBoundingClientRect();
        a.x!(((e.clientX - r.left) / r.width - 0.5) * 10);
        a.y!(((e.clientY - r.top) / r.height - 0.5) * 8);
      };
      const lv = () => {
        a.x!(0, 800, 'outElastic(1, .5)');
        a.y!(0, 800, 'outElastic(1, .5)');
      };
      btn.addEventListener('pointermove', mv);
      btn.addEventListener('pointerleave', lv);
      cleanups.push(() => {
        btn.removeEventListener('pointermove', mv);
        btn.removeEventListener('pointerleave', lv);
        a.revert();
      });
    });
  };

  const how = () => {
    openModal(
      `<div class="stack" style="--gap:18px">
        <h3 class="t-title">How it works</h3>
        <div class="how">
          <div class="how__item"><span class="how__num">1</span><div><p class="t-headline">Make a vow</p><p class="t-sub">Name the habit privately. Write why you’re quitting.</p></div></div>
          <div class="how__item"><span class="how__num">2</span><div><p class="t-headline">Track every day</p><p class="t-sub">Your streak, milestones, and a galaxy that moves with you. Day 90 completes the merger.</p></div></div>
          <div class="how__item"><span class="how__num">3</span><div><p class="t-headline">Get through urges</p><p class="t-sub">Breathing, a 10-minute timer, a quick game and more.</p></div></div>
          <div class="how__item"><span class="how__num">4</span><div><p class="t-headline">Stay private</p><p class="t-sub">No account. Nothing leaves this device.</p></div></div>
        </div>
        <a class="btn btn--accent btn--block" href="${hasVow ? '#/home' : '#/vow'}" data-close>${hasVow ? 'Continue' : 'Take the vow'}</a>
      </div>`,
      { label: 'How it works' },
    );
  };

  const onClick = (e: MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!t) return;
    if (t.dataset.action === 'replay') startFilm();
    else if (t.dataset.action === 'how') how();
  };
  root.addEventListener('click', onClick);

  return {
    el: root,
    preset: 'hero',
    enter() {
      intro();
      magnetic();
      frame(10);
      const onResize = () => frame(500);
      window.addEventListener('resize', onResize);
      cleanups.push(() => window.removeEventListener('resize', onResize));
      cleanups.push(ctx.cosmos.enableDrag(root));
      if (ctx.reduced) ctx.cosmos.still(0.6);
      else startFilm();
    },
    destroy() {
      cleanups.forEach((c) => c());
      splitters.forEach((s) => s.revert());
      const scene = ctx.cosmos.scene;
      if (scene) animate(scene.user, { zoom: 1, duration: 1200, ease: 'inOut(3)' });
    },
  };
}
