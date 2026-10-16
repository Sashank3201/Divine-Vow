/**
 * "I feel the pull" — the emergency toolkit. Calm first, then something to
 * do with your hands, your breath or your body until the wave passes.
 */

import { animate, createTimer, stagger, type Timer } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store, uid } from '../core/store';
import { TRIGGERS, dailyPick, AFFIRMATIONS } from '../core/content';
import { icons } from '../ui/icons';
import { $, $$, el, esc, vibrate } from '../ui/dom';
import { openModal, toast } from '../ui/overlay';
import { burst, cosmicFlash } from '../ui/celebrate';
import { relapseFlow } from '../ui/relapse';
import { sound } from '../ui/sound';
import { breathePanel, groundPanel, movePanel, surfPanel, whyPanel, type Panel } from './sos/tools';
import { starCatcher } from './sos/game';

const TOOLS = [
  { id: 'breathe', name: 'Breathe', desc: 'Slow your body down. Box or 4-7-8.', icon: icons.wind, color: '#79d8ff' },
  { id: 'surf', name: 'Ride the wave', desc: 'Watch the urge rise and fall. Ten minutes.', icon: icons.wave, color: '#5eead4' },
  { id: 'game', name: 'Star catcher', desc: 'Sixty seconds of pure distraction.', icon: icons.gamepad, color: '#ffd98a' },
  { id: 'move', name: 'Move', desc: 'One small physical action, right now.', icon: icons.run, color: '#ff9fd2' },
  { id: 'ground', name: 'Ground', desc: '5-4-3-2-1: come back to this room.', icon: icons.anchor, color: '#bcaeff' },
  { id: 'why', name: 'Your why', desc: 'Remember what you are fighting for.', icon: icons.heart, color: '#f4c97c' },
] as const;

type ToolId = (typeof TOOLS)[number]['id'];

export function sosView(ctx: AppContext, params: URLSearchParams): View {
  const started = Date.now();
  const used = new Set<ToolId>();
  let intensity = 6;
  let peak = 6;
  let panel: Panel | null = null;
  let timer: Timer | null = null;

  const root = el(`
    <div class="view view--app">
      <div class="container sos">
        <header class="sos__head" data-anim>
          <span class="eyebrow">You opened this instead. That already counts.</span>
          <h1 class="sos__title">Breathe. This wave will pass.</h1>
          <p class="sos__timer">Riding it for <strong class="num" data-elapsed>0:00</strong></p>
        </header>

        <section class="glass glass--pad" data-anim style="margin-bottom:18px">
          <label class="field">
            <span class="row" style="justify-content:space-between">
              <span class="field__label">How strong is the pull?</span>
              <span class="pill num" data-intensity-label>6 / 10</span>
            </span>
            <input class="range" type="range" min="1" max="10" step="1" value="6" data-intensity aria-label="Urge intensity" />
          </label>
        </section>

        <div data-area>
          <div class="tools" data-tools>
            ${TOOLS.map(
              (t) => `<button class="glass tool" type="button" data-tool="${t.id}" style="--tool:${t.color}" data-anim>
                <span class="tool__icon">${t.icon}</span>
                <span class="tool__name">${t.name}</span>
                <span class="tool__desc">${t.desc}</span>
              </button>`,
            ).join('')}
          </div>
        </div>

        <footer class="sos__footer" data-anim>
          <button class="btn btn--primary btn--lg" type="button" data-passed>${icons.check}The wave has passed</button>
          <p class="muted" style="font-size:13.5px;text-align:center;max-width:460px">${esc(dailyPick(AFFIRMATIONS, 3))}</p>
        </footer>
      </div>
    </div>
  `);

  const area = $('[data-area]', root)!;
  const toolsMarkup = area.innerHTML;
  const elapsedEl = $('[data-elapsed]', root)!;
  const range = $<HTMLInputElement>('[data-intensity]', root)!;
  const intensityLabel = $('[data-intensity-label]', root)!;

  range.addEventListener('input', () => {
    intensity = Number(range.value);
    peak = Math.max(peak, intensity);
    intensityLabel.textContent = `${intensity} / 10`;
    // The cosmos calms as the pull eases.
    const d = ctx.cosmos.director;
    if (d && !ctx.reduced) animate(d, { exposure: 0.55 + (10 - intensity) * 0.05, bloom: 0.9 + intensity * 0.05, duration: 1200, ease: 'out(3)', composition: 'blend' });
  });

  const openTool = async (id: ToolId) => {
    used.add(id);
    const meta = TOOLS.find((t) => t.id === id)!;
    if (!ctx.reduced) {
      await animate($$('[data-tool]', area), { opacity: 0, scale: 0.94, y: 10, delay: stagger(30), duration: 260, ease: 'in(2)' }).then();
    }
    panel?.destroy();
    panel =
      id === 'breathe'
        ? breathePanel(ctx.reduced)
        : id === 'surf'
          ? surfPanel(() => intensity, ctx.reduced)
          : id === 'game'
            ? starCatcher()
            : id === 'move'
              ? movePanel(ctx.reduced)
              : id === 'ground'
                ? groundPanel(ctx.reduced)
                : whyPanel(ctx.reduced);
    area.innerHTML = '';
    const wrap = el(`<section class="glass panel">
      <div class="panel__head">
        <button class="icon-btn" type="button" data-back aria-label="Back to tools">${icons.arrowLeft}</button>
        <span class="panel__title" style="color:${meta.color}">${meta.name}</span>
      </div>
    </section>`);
    wrap.appendChild(panel.el);
    area.appendChild(wrap);
    if (!ctx.reduced) {
      animate(wrap, { opacity: { from: 0, to: 1 }, y: { from: 30, to: 0 }, scale: { from: 0.97, to: 1 }, duration: 700, ease: 'out(4)' });
    }
    vibrate(10);
  };

  const backToTools = async () => {
    const wrap = area.firstElementChild as HTMLElement | null;
    if (wrap && !ctx.reduced) await animate(wrap, { opacity: 0, y: 20, duration: 260, ease: 'in(2)' }).then();
    panel?.destroy();
    panel = null;
    area.innerHTML = toolsMarkup;
    if (!ctx.reduced) {
      animate($$('[data-tool]', area), { opacity: { from: 0, to: 1 }, y: { from: 20, to: 0 }, delay: stagger(50), duration: 600, ease: 'out(3)' });
    }
  };

  const logUrge = (outcome: 'won' | 'slipped', trigger: string) => {
    if (!store.get().vow) return;
    store.update((s) => {
      s.urges.push({
        id: uid(),
        at: started,
        intensity: peak,
        outcome,
        tools: [...used],
        trigger,
        note: '',
        durationSec: Math.round((Date.now() - started) / 1000),
      });
    });
  };

  const outcome = () => {
    const picked = new Set<string>();
    const m = openModal(
      `<div class="stack" style="--gap:18px">
        <span class="eyebrow">Check in</span>
        <h3 class="h2" style="font-size:30px">Did you stay true to your vow?</h3>
        <div class="field">
          <span class="field__label">What set it off? (optional)</span>
          <div class="chips">${TRIGGERS.map((t) => `<button class="chip" type="button" data-trigger="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        </div>
        <div class="stack" style="--gap:10px">
          <button class="btn btn--primary btn--lg btn--block" type="button" data-won>${icons.star4}I stayed strong</button>
          <button class="btn btn--ghost btn--block" type="button" data-slipped>I slipped</button>
          <button class="btn btn--quiet btn--block" type="button" data-close>I'm still riding it</button>
        </div>
      </div>`,
      { label: 'How did it go?' },
    );
    m.body.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-trigger]');
      if (!t) return;
      const v = t.dataset.trigger!;
      if (picked.has(v)) picked.delete(v);
      else picked.add(v);
      t.classList.toggle('is-on', picked.has(v));
    });
    m.body.querySelector('[data-won]')!.addEventListener('click', (e) => {
      logUrge('won', [...picked].join(', '));
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2, 70, 260);
      cosmicFlash(ctx, 0.9);
      sound.chime(4);
      window.setTimeout(() => sound.chime(7), 220);
      vibrate([30, 40, 30, 40, 100]);
      void m.close();
      const won = store.get().urges.filter((u) => u.outcome === 'won').length;
      toast(won > 1 ? `${won} urges outlasted. Another star for your galaxy.` : 'Your first urge outlasted. A new star is born.', { icon: icons.star4, duration: 5000 });
      window.setTimeout(() => ctx.router.go(store.get().vow ? '/sanctuary' : '/vow'), 900);
    });
    m.body.querySelector('[data-slipped]')!.addEventListener('click', () => {
      logUrge('slipped', [...picked].join(', '));
      void m.close().then(() => {
        if (store.get().vow) relapseFlow(ctx, () => ctx.router.go('/sanctuary'));
        else ctx.router.go('/vow');
      });
    });
  };

  const onClick = (e: MouseEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.tool) void openTool(b.dataset.tool as ToolId);
    else if (b.hasAttribute('data-back')) void backToTools();
    else if (b.hasAttribute('data-passed')) outcome();
  };
  root.addEventListener('click', onClick);

  return {
    el: root,
    preset: 'sos',
    enter() {
      timer = createTimer({
        frameRate: 4,
        onUpdate: () => {
          const s = Math.floor((Date.now() - started) / 1000);
          elapsedEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        },
      });
      const tool = params.get('tool') as ToolId | null;
      if (tool && TOOLS.some((t) => t.id === tool)) void openTool(tool);
    },
    destroy() {
      timer?.cancel();
      panel?.destroy();
    },
  };
}
