/**
 * The vow ceremony: name it (without naming it), find your why, write your
 * vow, and seal it by holding a button while the universe leans in.
 */

import { animate, createTimeline, stagger, svg, utils, type JSAnimation } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store } from '../core/store';
import { icons } from '../ui/icons';
import { $, $$, el, esc, vibrate } from '../ui/dom';
import { toast } from '../ui/overlay';
import { burst, cosmicFlash } from '../ui/celebrate';
import { sound } from '../ui/sound';

const CODENAMES = ['The Shadow', 'The Pull', 'The Old Me', 'The Storm', 'The Chain', 'It'];
const REASONS = [
  'To feel proud of myself again',
  'To get my time back',
  'For the people I love',
  'To trust my own word',
  'To have more energy',
  'To be fully present',
  'For my peace of mind',
  'To become who I was meant to be',
];

interface Draft {
  codename: string;
  reasons: string[];
  vowText: string;
  signature: string;
  startMode: 'now' | 'past';
  startAt: string;
}

const defaultVow = (codename: string) =>
  `I vow to break free from ${codename || 'it'}. Not because I am weak, but because I know who I am becoming. When the pull comes, I will breathe, I will move, and I will return to this promise.`;

export function vowView(ctx: AppContext): View {
  const existing = store.get().vow;
  const draft: Draft = {
    codename: existing?.codename ?? '',
    reasons: existing?.reasons.length ? [...existing.reasons] : [''],
    vowText: existing?.vowText ?? '',
    signature: existing?.signature ?? store.get().settings.name ?? '',
    startMode: 'now',
    startAt: '',
  };
  let step = 0;
  const TOTAL = 5;

  const root = el(`
    <div class="view">
      <div class="ceremony">
        <div class="glass ceremony__card" data-anim>
          <div class="ceremony__steps" aria-hidden="true">
            <svg viewBox="0 0 220 28">
              <path d="M10 14 L60 8 L110 18 L160 6 L210 14" stroke="rgba(255,255,255,0.14)" stroke-width="1" fill="none"/>
              <path d="M10 14 L60 8 L110 18 L160 6 L210 14" stroke="#f4c97c" stroke-width="1.4" fill="none" data-progress/>
              ${[
                [10, 14],
                [60, 8],
                [110, 18],
                [160, 6],
                [210, 14],
              ]
                .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4" data-dot="${i}" fill="#0b0c1d" stroke="rgba(255,255,255,0.35)" stroke-width="1.2"/>`)
                .join('')}
            </svg>
          </div>
          <div data-stage></div>
        </div>
      </div>
    </div>
  `);

  const stage = $('[data-stage]', root)!;
  const progressPath = svg.createDrawable($('[data-progress]', root)!);
  let holdAnim: JSAnimation | null = null;
  let zoomAnim: JSAnimation | null = null;

  const steps: Array<() => string> = [
    () => `
      <div class="ceremony__step">
        <span class="eyebrow">The ceremony</span>
        <h1 class="h1">This is between you and the stars.</h1>
        <p class="lede">You never have to say what it is. Not to anyone — not even to this app. Give it a name only you understand, and we will only ever call it by that name.</p>
        <p class="muted">The next few steps take about two minutes. Everything you write stays on this device.</p>
      </div>`,
    () => `
      <div class="ceremony__step">
        <span class="eyebrow">Step one</span>
        <h2 class="h1">What will you call it?</h2>
        <label class="field">
          <span class="field__label">A name only you understand</span>
          <input class="input input--serif" data-codename maxlength="40" placeholder="The Shadow" value="${esc(draft.codename)}" autocomplete="off" autofocus />
        </label>
        <div class="chips">${CODENAMES.map((c) => `<button class="chip ${draft.codename === c ? 'is-on' : ''}" type="button" data-pick-code="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      </div>`,
    () => `
      <div class="ceremony__step">
        <span class="eyebrow">Step two</span>
        <h2 class="h1">Why do you want to be free?</h2>
        <p class="muted">These will come back to you when the pull is strongest. Write as many as you need.</p>
        <div class="stack" style="--gap:10px" data-reasons>
          ${draft.reasons
            .map(
              (r, i) => `<div class="reason-row">
                <input class="input" data-reason="${i}" maxlength="120" placeholder="Because…" value="${esc(r)}" />
                ${draft.reasons.length > 1 ? `<button class="icon-btn" type="button" data-remove-reason="${i}" aria-label="Remove">${icons.close}</button>` : ''}
              </div>`,
            )
            .join('')}
        </div>
        <button class="btn btn--ghost btn--sm" type="button" data-add-reason style="align-self:flex-start">${icons.plus}Add another</button>
        <div class="chips">${REASONS.map((r) => `<button class="chip" type="button" data-pick-reason="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      </div>`,
    () => `
      <div class="ceremony__step">
        <span class="eyebrow">Step three</span>
        <h2 class="h1">Write your vow.</h2>
        <label class="field">
          <span class="field__label">In your own words</span>
          <textarea class="textarea textarea--serif" data-vowtext rows="6">${esc(draft.vowText || defaultVow(draft.codename))}</textarea>
        </label>
        <div class="field">
          <span class="field__label">When does your journey begin?</span>
          <div class="segmented" role="radiogroup">
            <button type="button" class="${draft.startMode === 'now' ? 'is-on' : ''}" data-start="now">Right now</button>
            <button type="button" class="${draft.startMode === 'past' ? 'is-on' : ''}" data-start="past">I'm already free since…</button>
          </div>
          <input class="input" type="datetime-local" data-startat value="${esc(draft.startAt)}" ${draft.startMode === 'past' ? '' : 'hidden'} max="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" />
        </div>
      </div>`,
    () => `
      <div class="ceremony__step">
        <span class="eyebrow">Step four</span>
        <h2 class="h1">Seal it in the stars.</h2>
        <p class="vow-quote">“${esc(draft.vowText || defaultVow(draft.codename))}”</p>
        <label class="field">
          <span class="field__label">Sign with your name or initials</span>
          <input class="input input--serif" data-signature maxlength="40" placeholder="Your name" value="${esc(draft.signature)}" autocomplete="off" />
        </label>
        <div class="seal">
          <button class="seal__btn" type="button" data-seal aria-label="Press and hold to seal your vow">
            <svg viewBox="0 0 168 168"><circle cx="84" cy="84" r="78" stroke="rgba(255,255,255,0.12)" stroke-width="3" fill="none"/><circle cx="84" cy="84" r="78" stroke="#ffe7b3" stroke-width="4" fill="none" stroke-linecap="round" data-ring/></svg>
            <span class="seal__core">Hold<br/>to seal</span>
          </button>
          <span class="seal__hint" data-seal-hint>Press and hold until the ring is complete</span>
        </div>
      </div>`,
  ];

  const navMarkup = () => `
    <div class="ceremony__nav">
      ${step > 0 ? `<button class="btn btn--quiet" type="button" data-back>${icons.arrowLeft}Back</button>` : `<a class="btn btn--quiet" href="#/welcome">${icons.arrowLeft}Back</a>`}
      ${step < TOTAL - 1 ? `<button class="btn btn--primary" type="button" data-next>${step === 0 ? 'Begin' : 'Continue'}${icons.arrowRight}</button>` : ''}
    </div>`;

  const readInputs = () => {
    const code = $<HTMLInputElement>('[data-codename]', stage);
    if (code) draft.codename = code.value.trim();
    const reasons = $$<HTMLInputElement>('[data-reason]', stage);
    if (reasons.length) draft.reasons = reasons.map((r) => r.value);
    const vt = $<HTMLTextAreaElement>('[data-vowtext]', stage);
    if (vt) draft.vowText = vt.value.trim();
    const sa = $<HTMLInputElement>('[data-startat]', stage);
    if (sa) draft.startAt = sa.value;
    const sig = $<HTMLInputElement>('[data-signature]', stage);
    if (sig) draft.signature = sig.value.trim();
  };

  const updateProgress = (animated: boolean) => {
    const p = step / (TOTAL - 1);
    animate(progressPath, { draw: `0 ${p.toFixed(3)}`, duration: animated ? 900 : 0, ease: 'inOut(3)' });
    $$<SVGCircleElement>('[data-dot]', root).forEach((d, i) => {
      const on = i <= step;
      animate(d, {
        fill: on ? '#f4c97c' : '#0b0c1d',
        stroke: on ? '#ffe7b3' : 'rgba(255,255,255,0.35)',
        r: i === step ? 5.5 : 4,
        duration: animated ? 600 : 0,
        ease: 'out(3)',
      });
    });
  };

  const render = (dir = 1, animated = true) => {
    stage.innerHTML = steps[step]!() + navMarkup();
    updateProgress(animated);
    if (step === TOTAL - 1) bindSeal();
    if (!animated || ctx.reduced) return;
    const parts = $$('.ceremony__step > *, .ceremony__nav', stage);
    animate(parts, {
      opacity: { from: 0, to: 1 },
      x: { from: 30 * dir, to: 0 },
      filter: { from: 'blur(6px)', to: 'blur(0px)' },
      delay: stagger(60),
      duration: 700,
      ease: 'out(4)',
    });
    window.setTimeout(() => $<HTMLElement>('[autofocus]', stage)?.focus(), 350);
  };

  const go = async (delta: number) => {
    readInputs();
    if (delta > 0 && !validate()) return;
    if (!ctx.reduced) {
      await animate($$('.ceremony__step > *, .ceremony__nav', stage), {
        opacity: 0,
        x: -24 * delta,
        filter: 'blur(6px)',
        delay: stagger(25),
        duration: 300,
        ease: 'in(2)',
      }).then();
    }
    step = Math.max(0, Math.min(TOTAL - 1, step + delta));
    render(delta);
    // The galaxies drift a little closer with every step.
    const d = ctx.cosmos.director;
    if (d && !ctx.reduced) animate(d, { distance: 15 - step * 1.1, elevation: 1.25 - step * 0.05, duration: 1800, ease: 'inOut(3)', composition: 'blend' });
  };

  const shake = (node: Element) => {
    animate(node, { x: [0, -10, 10, -6, 6, 0], duration: 420, ease: 'inOut(2)' });
    vibrate(60);
  };

  const validate = (): boolean => {
    if (step === 1 && !draft.codename) {
      const input = $('[data-codename]', stage)!;
      shake(input);
      toast('Give it any name you like — even just "it".');
      return false;
    }
    if (step === 2 && !draft.reasons.some((r) => r.trim())) {
      shake($('[data-reasons]', stage)!);
      toast('Write at least one reason. It matters.');
      return false;
    }
    if (step === 3 && draft.startMode === 'past') {
      const t = Date.parse(draft.startAt);
      if (!draft.startAt || Number.isNaN(t) || t > Date.now()) {
        shake($('[data-startat]', stage)!);
        toast('Pick a moment in the past.');
        return false;
      }
    }
    return true;
  };

  const seal = () => {
    readInputs();
    const now = Date.now();
    const startAt = draft.startMode === 'past' && draft.startAt ? Math.min(Date.parse(draft.startAt), now) : now;
    const reasons = draft.reasons.map((r) => r.trim()).filter(Boolean);
    const vowText = draft.vowText || defaultVow(draft.codename);
    store.update((s) => {
      s.vow = {
        createdAt: s.vow?.createdAt ?? now,
        startAt: existing ? s.vow!.startAt : startAt,
        codename: draft.codename,
        reasons,
        vowText,
        signature: draft.signature,
      };
      if (!existing) s.milestones = {};
      if (draft.signature && !s.settings.name) s.settings.name = draft.signature.split(' ')[0] ?? '';
    });
    const btn = $('[data-seal]', stage)!;
    const r = btn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 80, 300);
    cosmicFlash(ctx, 1.1);
    sound.chime(2);
    window.setTimeout(() => sound.chime(5), 200);
    window.setTimeout(() => sound.chime(7), 420);
    vibrate([40, 40, 40, 40, 200]);
    const tl = createTimeline();
    tl.add($('.seal__core', stage)!, { scale: [{ to: 1.15, duration: 200 }, { to: 0, duration: 600, ease: 'in(3)' }] })
      .add($('[data-seal-hint]', stage)!, { opacity: 0, duration: 300 }, 0);
    $('[data-seal-hint]', stage)!.textContent = 'Sealed in the stars.';
    window.setTimeout(() => {
      toast(existing ? 'Your vow has been renewed.' : 'Your vow is sealed. Welcome to your sanctuary.', { icon: icons.star4 });
      ctx.router.go('/sanctuary');
    }, 1500);
  };

  const bindSeal = () => {
    const btn = $('[data-seal]', stage)!;
    const ring = svg.createDrawable($('[data-ring]', stage)!);
    utils.set(ring, { draw: '0 0' });
    let sealed = false;
    let lastQuarter = 0;
    holdAnim = animate(ring, {
      draw: ['0 0', '0 1'],
      duration: 2200,
      ease: 'inOut(2)',
      autoplay: false,
      onUpdate: (a) => {
        const q = Math.floor(a.progress * 4);
        if (q > lastQuarter && !a.reversed) {
          vibrate(18);
          sound.chime(q);
        }
        lastQuarter = q;
      },
      onComplete: (a) => {
        if (sealed || a.reversed) return;
        sealed = true;
        seal();
      },
    });
    const d = ctx.cosmos.director;
    const press = (e: PointerEvent) => {
      e.preventDefault();
      if (sealed) return;
      readInputs();
      if (!draft.signature) {
        shake($('[data-signature]', stage)!);
        toast('Sign your vow first.');
        return;
      }
      btn.setPointerCapture?.(e.pointerId);
      if (holdAnim!.reversed) holdAnim!.reverse();
      holdAnim!.play();
      animate($('.seal__core', stage)!, { scale: 0.92, duration: 400, ease: 'out(3)' });
      if (d && !ctx.reduced) {
        zoomAnim?.pause();
        zoomAnim = animate(d, { distance: 6.5, bloom: 1.6, duration: 2200, ease: 'in(2)', composition: 'blend' });
      }
    };
    const release = () => {
      if (sealed) return;
      if (holdAnim && holdAnim.progress > 0 && holdAnim.progress < 1) {
        holdAnim.reverse();
        animate($('.seal__core', stage)!, { scale: 1, duration: 500, ease: 'outElastic(1, .5)' });
        if (d && !ctx.reduced) {
          zoomAnim?.pause();
          zoomAnim = animate(d, { distance: 10.6, bloom: 1, duration: 1200, ease: 'out(3)', composition: 'blend' });
        }
      }
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press(new PointerEvent('pointerdown'));
    });
    btn.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') release();
    });
  };

  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const btn = t.closest<HTMLElement>('button');
    if (!btn) return;
    if (btn.hasAttribute('data-next')) void go(1);
    else if (btn.hasAttribute('data-back')) void go(-1);
    else if (btn.dataset.pickCode) {
      draft.codename = btn.dataset.pickCode;
      const input = $<HTMLInputElement>('[data-codename]', stage)!;
      input.value = draft.codename;
      $$('[data-pick-code]', stage).forEach((c) => c.classList.toggle('is-on', c === btn));
      animate(btn, { scale: [1, 1.08, 1], duration: 350 });
    } else if (btn.dataset.pickReason) {
      readInputs();
      const empty = draft.reasons.findIndex((r) => !r.trim());
      if (draft.reasons.includes(btn.dataset.pickReason)) return;
      if (empty >= 0) draft.reasons[empty] = btn.dataset.pickReason;
      else draft.reasons.push(btn.dataset.pickReason);
      render(1, false);
      animate($$('[data-reason]', stage).at(-1)!, { backgroundColor: ['rgba(244,201,124,0.2)', 'rgba(3,4,12,0.55)'], duration: 900 });
    } else if (btn.hasAttribute('data-add-reason')) {
      readInputs();
      draft.reasons.push('');
      render(1, false);
      $$<HTMLInputElement>('[data-reason]', stage).at(-1)?.focus();
    } else if (btn.dataset.removeReason) {
      readInputs();
      draft.reasons.splice(Number(btn.dataset.removeReason), 1);
      render(1, false);
    } else if (btn.dataset.start) {
      readInputs();
      draft.startMode = btn.dataset.start as Draft['startMode'];
      render(1, false);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && step < TOTAL - 1) {
      e.preventDefault();
      void go(1);
    }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);

  return {
    el: root,
    preset: 'vow',
    enter() {
      render(1, false);
    },
    destroy() {
      holdAnim?.pause();
      zoomAnim?.pause();
    },
  };
}
