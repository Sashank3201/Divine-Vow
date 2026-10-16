/** Urge — the emergency toolkit, in one sheet. */

import { animate, createTimer, stagger, type Timer } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store, uid } from '../core/store';
import { TRIGGERS } from '../core/content';
import { icons } from '../ui/icons';
import { $, $$, el, esc, vibrate } from '../ui/dom';
import { openModal, toast } from '../ui/overlay';
import { burst } from '../ui/celebrate';
import { relapseFlow } from '../ui/relapse';
import { sound } from '../ui/sound';
import { breathePanel, groundPanel, movePanel, surfPanel, whyPanel, type Panel } from './sos/tools';
import { starCatcher } from './sos/game';
import { createSheet } from './sheet';

const TOOLS = [
  { id: 'breathe', name: 'Breathe', desc: 'Box breathing', icon: icons.wind },
  { id: 'surf', name: 'Ride it out', desc: '10-minute timer', icon: icons.wave },
  { id: 'game', name: 'Star catcher', desc: '60-second game', icon: icons.gamepad },
  { id: 'move', name: 'Move', desc: 'One quick action', icon: icons.run },
  { id: 'ground', name: 'Ground', desc: '5-4-3-2-1', icon: icons.anchor },
  { id: 'why', name: 'Your reasons', desc: 'Why you started', icon: icons.heart },
] as const;

type ToolId = (typeof TOOLS)[number]['id'];

export function sosView(ctx: AppContext, params: URLSearchParams): View {
  const started = Date.now();
  const used = new Set<ToolId>();
  let intensity = 6;
  let peak = 6;
  let panel: Panel | null = null;
  let timer: Timer | null = null;

  const grid = `<div class="tools" data-tools>${TOOLS.map(
    (t) => `<button class="tool" type="button" data-tool="${t.id}">
      <span class="tool__icon">${t.icon}</span>
      <span class="tool__name">${t.name}</span>
      <span class="tool__desc">${t.desc}</span>
    </button>`,
  ).join('')}</div>`;

  const sheet = createSheet(ctx, {
    title: 'Urge',
    sub: 'Most urges fade within 15–30 minutes.',
    size: 'narrow',
    body: `
      <div class="group sos__meter">
        <div class="group__title"><span>Riding it out</span><span class="t-num" data-elapsed>0:00</span></div>
        <div class="inline" style="--gap:14px">
          <span class="t-label">Strength</span>
          <input class="range" type="range" min="1" max="10" step="1" value="6" data-intensity aria-label="Urge strength" style="--fill:55.5%" />
          <span class="t-num sos__value" data-intensity-label>6</span>
        </div>
      </div>
      <div data-area>${grid}</div>`,
    foot: `<button class="btn btn--accent btn--block btn--lg" type="button" data-passed>It passed</button>`,
  });

  const area = $('[data-area]', sheet.body)!;
  const range = $<HTMLInputElement>('[data-intensity]', sheet.body)!;
  const label = $('[data-intensity-label]', sheet.body)!;
  const elapsed = $('[data-elapsed]', sheet.body)!;

  range.addEventListener('input', () => {
    intensity = Number(range.value);
    peak = Math.max(peak, intensity);
    label.textContent = String(intensity);
    range.style.setProperty('--fill', `${(((intensity - 1) / 9) * 100).toFixed(1)}%`);
    const d = ctx.cosmos.director;
    if (d && !ctx.reduced) animate(d, { exposure: 0.55 + (10 - intensity) * 0.05, duration: 1200, ease: 'out(3)', composition: 'blend' });
  });

  const openTool = async (id: ToolId) => {
    used.add(id);
    const meta = TOOLS.find((t) => t.id === id)!;
    if (!ctx.reduced) await animate(area, { opacity: 0, y: 8, duration: 180, ease: 'in(2)' }).then();
    panel?.destroy();
    panel =
      id === 'breathe'
        ? breathePanel(ctx.reduced)
        : id === 'surf'
          ? surfPanel(() => intensity, ctx.reduced)
          : id === 'game'
            ? starCatcher()
            : id === 'move'
              ? movePanel()
              : id === 'ground'
                ? groundPanel(ctx.reduced)
                : whyPanel();
    const head = el(`<div class="panel-head">
      <button class="icon-btn icon-btn--fill" type="button" data-back aria-label="Back to tools">${icons.arrowLeft}</button>
      <span class="t-headline">${meta.name}</span>
    </div>`);
    sheet.resize(() => {
      area.innerHTML = '';
      area.append(head, panel!.el);
    });
    if (!ctx.reduced) animate(area, { opacity: 1, y: { from: 12, to: 0 }, duration: 380, ease: 'out(3)' });
    else area.style.opacity = '1';
    vibrate(10);
  };

  const backToTools = async () => {
    if (!ctx.reduced) await animate(area, { opacity: 0, duration: 160, ease: 'in(2)' }).then();
    panel?.destroy();
    panel = null;
    sheet.resize(() => (area.innerHTML = grid));
    if (!ctx.reduced) {
      animate(area, { opacity: 1, duration: 200 });
      animate($$('[data-tool]', area), { opacity: { from: 0, to: 1 }, y: { from: 12, to: 0 }, delay: stagger(35), duration: 420, ease: 'out(3)' });
    } else area.style.opacity = '1';
  };

  const log = (outcome: 'won' | 'slipped', trigger: string) => {
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
      `<div class="stack" style="--gap:16px">
        <h3 class="t-title">Did you stay clean?</h3>
        <div class="field">
          <span class="t-label">What triggered it? (optional)</span>
          <div class="chips">${TRIGGERS.map((t) => `<button class="chip" type="button" data-trigger="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        </div>
        <div class="stack" style="--gap:8px">
          <button class="btn btn--accent btn--block" type="button" data-won>Yes, I stayed clean</button>
          <button class="btn btn--fill btn--block" type="button" data-slipped>No, I slipped</button>
          <button class="btn btn--plain" type="button" data-close style="align-self:center">Not yet</button>
        </div>
      </div>`,
      { label: 'Did you stay clean?' },
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
      log('won', [...picked].join(', '));
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2, 40, 200);
      ctx.cosmos.flash(0.6);
      sound.chime(4);
      vibrate([30, 40, 80]);
      void m.close();
      const won = store.get().urges.filter((u) => u.outcome === 'won').length;
      toast(won > 1 ? `${won} urges beaten.` : 'First urge beaten.');
      window.setTimeout(() => ctx.router.go(store.get().vow ? '/home' : '/vow'), 700);
    });
    m.body.querySelector('[data-slipped]')!.addEventListener('click', () => {
      log('slipped', [...picked].join(', '));
      void m.close().then(() => {
        if (store.get().vow) relapseFlow(ctx, () => ctx.router.go('/home'));
        else ctx.router.go('/vow');
      });
    });
  };

  sheet.root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.tool) void openTool(b.dataset.tool as ToolId);
    else if (b.hasAttribute('data-back')) void backToTools();
    else if (b.hasAttribute('data-passed')) outcome();
  });

  return {
    el: sheet.root,
    preset: 'sos',
    enter() {
      sheet.enter();
      timer = createTimer({
        frameRate: 4,
        onUpdate: () => {
          const s = Math.floor((Date.now() - started) / 1000);
          elapsed.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        },
      });
      const tool = params.get('tool') as ToolId | null;
      if (tool && TOOLS.some((t) => t.id === tool)) void openTool(tool);
    },
    leave: (next) => sheet.leave(next),
    destroy() {
      timer?.cancel();
      panel?.destroy();
    },
  };
}
