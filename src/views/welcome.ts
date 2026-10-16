/**
 * Welcome — the hero. The collision plays like a film; on top there is only
 * the name, one line, two liquid-glass buttons and a caption pill that
 * reshapes itself around each short, factual caption.
 */

import { animate, createAnimatable, splitText, spring, stagger, utils, type TextSplitter } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store } from '../core/store';
import { icons } from '../ui/icons';
import { $, $$, el } from '../ui/dom';
import { openModal } from '../ui/overlay';
import { sound } from '../ui/sound';

export function welcomeView(ctx: AppContext): View {
  const hasVow = !!store.get().vow;
  const root = el(`
    <div class="screen welcome">
      <div class="topline topline--end">
        <button class="icon-btn" type="button" data-glass="control" data-action="replay" aria-label="Replay">${icons.replay}</button>
        <button class="icon-btn" type="button" data-glass="control" data-action="sound" aria-label="Sound">${sound.enabled ? icons.volume : icons.mute}</button>
      </div>

      <div class="caption" data-glass="control" aria-live="polite" hidden>
        <span class="caption__text" data-caption></span>
        <span class="caption__measure" aria-hidden="true" data-measure></span>
      </div>

      <section class="welcome__content" data-content>
        <h1 class="t-hero welcome__title" data-title>Divine Vow</h1>
        <p class="welcome__line" data-line>Quit the habit that’s holding you back. One day at a time.</p>
        <div class="welcome__actions" data-actions>
          <a class="btn btn--lg" data-glass="accent" data-morph href="${hasVow ? '#/home' : '#/vow'}">${hasVow ? 'Continue' : 'Take the vow'}</a>
          <button class="btn btn--lg" type="button" data-glass="control" data-action="how">How it works</button>
        </div>
      </section>
    </div>
  `);

  const content = $('[data-content]', root)!;
  const pill = $('.caption', root)!;
  const captionText = $('[data-caption]', root)!;
  const measure = $('[data-measure]', root)!;
  const cleanups: Array<() => void> = [];
  const splitters: TextSplitter[] = [];
  const wide = () => innerWidth > 860;

  // ── Caption pill: width springs to fit each new line ─────────────────
  let captionToken = 0;
  const setCaption = async (text: string | null) => {
    const token = ++captionToken;
    if (!text) {
      await animate(pill, { opacity: 0, scale: 0.9, duration: 380, ease: 'in(2)' }).then();
      if (token === captionToken) pill.hidden = true;
      return;
    }
    measure.textContent = text;
    const target = measure.offsetWidth + 36;
    if (pill.hidden) {
      pill.hidden = false;
      captionText.textContent = text;
      pill.style.width = `${target}px`;
      animate(pill, { opacity: { from: 0, to: 1 }, scale: { from: 0.8, to: 1 }, ease: spring({ bounce: 0.3, duration: 600 }) });
      return;
    }
    await animate(captionText, { opacity: 0, duration: 160, ease: 'in(2)' }).then();
    if (token !== captionToken) return;
    captionText.textContent = text;
    animate(pill, { width: target, ease: spring({ bounce: 0.25, duration: 560 }) });
    animate(captionText, { opacity: 1, duration: 300, delay: 120, ease: 'out(2)' });
  };

  const startFilm = () => {
    void setCaption(null);
    ctx.cosmos.playCinematic({
      caption: (t) => void setCaption(t),
      impact: (s) => sound.impact(s),
    });
  };

  // ── Framing: on wide screens the galaxies sit to the right of the copy ─
  const frame = (duration: number) => {
    const scene = ctx.cosmos.scene;
    ctx.cosmos.setShift(wide() ? 0.32 : 0, 0, duration);
    ctx.cosmos.labelSafeLeft = wide() ? content.getBoundingClientRect().right + 12 : 0;
    ctx.cosmos.labelFloor = wide() ? Infinity : innerHeight * 0.45;
    ctx.cosmos.labelCeiling = wide() ? 0 : 120;
    if (scene) animate(scene.user, { zoom: wide() ? 1.22 : 1, duration, ease: 'inOut(3)' });
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
    else if (t.dataset.action === 'sound') {
      const on = sound.toggle();
      t.innerHTML = on ? icons.volume : icons.mute;
    }
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
      ctx.cosmos.labelSafeLeft = 0;
      ctx.cosmos.labelFloor = Infinity;
      ctx.cosmos.labelCeiling = 0;
      const scene = ctx.cosmos.scene;
      if (scene) animate(scene.user, { zoom: 1, duration: 1200, ease: 'inOut(3)' });
    },
  };
}
