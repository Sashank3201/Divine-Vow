/**
 * Take the vow: name it privately, list your reasons, write the vow, then
 * press and hold to seal it.
 */

import { animate, stagger, svg, utils, type JSAnimation } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store } from '../core/store';
import { icons } from '../ui/icons';
import { $, $$, esc, vibrate } from '../ui/dom';
import { toast } from '../ui/overlay';
import { burst } from '../ui/celebrate';
import { sound } from '../ui/sound';
import { createSheet } from './sheet';

const CODENAMES = ['The Shadow', 'The Pull', 'The Old Me', 'The Habit', 'It'];
const REASONS = ['Feel proud of myself', 'Get my time back', 'For my family', 'Trust myself again', 'More energy', 'Be present', 'Peace of mind'];

interface Draft {
  codename: string;
  reasons: string[];
  vowText: string;
  signature: string;
  startMode: 'now' | 'past';
  startAt: string;
}

const defaultVow = (c: string) => `I’m done with ${c || 'it'}. When the urge comes, I open this app instead.`;

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
  const TOTAL = 5;
  let step = 0;
  let hold: JSAnimation | null = null;

  const sheet = createSheet(ctx, {
    title: 'Take the vow',
    sub: 'Step 1 of 5',
    size: 'center',
    closeTo: existing ? '/home' : '/welcome',
    body: '<div class="vow"><div class="bar vow__progress"><span class="bar__fill" data-progress></span></div><div data-stage></div></div>',
    className: 'vow-screen',
  });
  const stage = $('[data-stage]', sheet.body)!;
  const sub = $('[data-sub]', sheet.root)!;
  const progress = $('[data-progress]', sheet.body)!;

  const steps: Array<() => string> = [
    () => `
      <div class="vow__step">
        <h2 class="t-title">This stays between you and this app.</h2>
        <p class="t-sub">You won’t be asked what the habit is. Give it a name only you understand.</p>
        <p class="t-foot">Takes about 2 minutes. Nothing leaves this device.</p>
      </div>`,
    () => `
      <div class="vow__step">
        <h2 class="t-title">What do you call it?</h2>
        <input class="input" data-codename maxlength="40" placeholder="e.g. The Shadow" value="${esc(draft.codename)}" autocomplete="off" autofocus />
        <div class="chips">${CODENAMES.map((c) => `<button class="chip ${draft.codename === c ? 'is-on' : ''}" type="button" data-pick-code="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      </div>`,
    () => `
      <div class="vow__step">
        <h2 class="t-title">Why do you want to quit?</h2>
        <p class="t-sub">You’ll see these when an urge hits.</p>
        <div class="stack" style="--gap:8px" data-reasons>
          ${draft.reasons
            .map(
              (r, i) => `<div class="inline" style="--gap:8px">
                <input class="input" data-reason="${i}" maxlength="120" placeholder="Reason" value="${esc(r)}" />
                ${draft.reasons.length > 1 ? `<button class="icon-btn icon-btn--fill" type="button" data-remove-reason="${i}" aria-label="Remove">${icons.close}</button>` : ''}
              </div>`,
            )
            .join('')}
        </div>
        <button class="btn btn--plain" type="button" data-add-reason style="align-self:flex-start">${icons.plus}Add another</button>
        <div class="chips">${REASONS.map((r) => `<button class="chip ${draft.reasons.includes(r) ? 'is-on' : ''}" type="button" data-pick-reason="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      </div>`,
    () => `
      <div class="vow__step">
        <h2 class="t-title">Your vow</h2>
        <textarea class="textarea" data-vowtext rows="4">${esc(draft.vowText || defaultVow(draft.codename))}</textarea>
        <span class="t-label">Start</span>
        <div class="segmented">
          <button type="button" class="${draft.startMode === 'now' ? 'is-on' : ''}" data-start="now">Now</button>
          <button type="button" class="${draft.startMode === 'past' ? 'is-on' : ''}" data-start="past">Earlier</button>
        </div>
        <input class="input" type="datetime-local" data-startat value="${esc(draft.startAt)}" ${draft.startMode === 'past' ? '' : 'hidden'} max="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}" />
      </div>`,
    () => `
      <div class="vow__step">
        <h2 class="t-title">Sign it</h2>
        <input class="input" data-signature maxlength="40" placeholder="Your name or initials" value="${esc(draft.signature)}" autocomplete="off" />
        <div class="seal">
          <button class="seal__btn" type="button" data-seal aria-label="Press and hold to seal your vow">
            <svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="64" class="seal__track"/><circle cx="70" cy="70" r="64" class="seal__ring" data-ring/></svg>
            <span class="seal__core">Hold to seal</span>
          </button>
          <span class="t-foot" data-seal-hint>Press and hold</span>
        </div>
      </div>`,
  ];

  const nav = () => `
    <div class="vow__nav">
      ${step > 0 ? `<button class="btn btn--fill" type="button" data-back>Back</button>` : '<span></span>'}
      ${step < TOTAL - 1 ? `<button class="btn btn--accent" type="button" data-next>${step === 0 ? 'Start' : 'Next'}</button>` : ''}
    </div>`;

  const read = () => {
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

  const render = (dir = 1, animated = true) => {
    stage.innerHTML = steps[step]!() + nav();
    sub.textContent = `Step ${step + 1} of ${TOTAL}`;
    animate(progress, { width: `${(((step + 1) / TOTAL) * 100).toFixed(1)}%`, duration: animated ? 500 : 0, ease: 'out(3)' });
    if (step === TOTAL - 1) bindSeal();
    if (!animated || ctx.reduced) return;
    animate($$('.vow__step > *, .vow__nav', stage), {
      opacity: { from: 0, to: 1 },
      x: { from: 20 * dir, to: 0 },
      delay: stagger(40),
      duration: 450,
      ease: 'out(4)',
    });
    window.setTimeout(() => $<HTMLElement>('[autofocus]', stage)?.focus(), 250);
  };

  const shake = (node: Element) => {
    animate(node, { x: [0, -8, 8, -5, 5, 0], duration: 380, ease: 'inOut(2)' });
    vibrate(50);
  };

  const validate = (): boolean => {
    if (step === 1 && !draft.codename) {
      shake($('[data-codename]', stage)!);
      toast('Pick any name. Even “it”.');
      return false;
    }
    if (step === 2 && !draft.reasons.some((r) => r.trim())) {
      shake($('[data-reasons]', stage)!);
      toast('Add at least one reason.');
      return false;
    }
    if (step === 3 && draft.startMode === 'past') {
      const t = Date.parse(draft.startAt);
      if (!draft.startAt || Number.isNaN(t) || t > Date.now()) {
        shake($('[data-startat]', stage)!);
        toast('Pick a time in the past.');
        return false;
      }
    }
    return true;
  };

  const go = async (delta: number) => {
    read();
    if (delta > 0 && !validate()) return;
    if (!ctx.reduced) {
      await animate($$('.vow__step > *, .vow__nav', stage), { opacity: 0, x: -16 * delta, duration: 200, ease: 'in(2)' }).then();
    }
    step = Math.max(0, Math.min(TOTAL - 1, step + delta));
    render(delta);
    const d = ctx.cosmos.director;
    if (d && !ctx.reduced) animate(d, { distance: 15 - step * 1.1, duration: 1600, ease: 'inOut(3)', composition: 'blend' });
  };

  const seal = () => {
    read();
    const now = Date.now();
    const startAt = draft.startMode === 'past' && draft.startAt ? Math.min(Date.parse(draft.startAt), now) : now;
    store.update((s) => {
      s.vow = {
        createdAt: s.vow?.createdAt ?? now,
        startAt: existing ? s.vow!.startAt : startAt,
        codename: draft.codename,
        reasons: draft.reasons.map((r) => r.trim()).filter(Boolean),
        vowText: draft.vowText || defaultVow(draft.codename),
        signature: draft.signature,
      };
      if (!existing) s.milestones = {};
      if (draft.signature && !s.settings.name) s.settings.name = draft.signature.split(' ')[0] ?? '';
    });
    const r = $('[data-seal]', stage)!.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 48, 220);
    ctx.cosmos.flash(0.7);
    sound.chime(2);
    window.setTimeout(() => sound.chime(5), 200);
    vibrate([40, 40, 120]);
    $('[data-seal-hint]', stage)!.textContent = 'Sealed.';
    animate($('.seal__core', stage)!, { scale: [{ to: 1.12, duration: 160 }, { to: 1, duration: 500, ease: 'outElastic(1, .5)' }] });
    window.setTimeout(() => {
      toast(existing ? 'Vow updated.' : 'Vow sealed. Day 0 starts now.');
      ctx.router.go('/home');
    }, 1200);
  };

  const bindSeal = () => {
    const btn = $('[data-seal]', stage)!;
    const ring = svg.createDrawable($('[data-ring]', stage)!);
    utils.set(ring, { draw: '0 0' });
    let sealed = false;
    let lastQuarter = 0;
    hold = animate(ring, {
      draw: ['0 0', '0 1'],
      duration: 1800,
      ease: 'inOut(2)',
      autoplay: false,
      onUpdate: (a) => {
        const q = Math.floor(a.progress * 4);
        if (q > lastQuarter && !a.reversed) {
          vibrate(15);
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
    const press = (e: Event) => {
      e.preventDefault();
      if (sealed) return;
      read();
      if (!draft.signature) {
        shake($('[data-signature]', stage)!);
        toast('Sign it first.');
        return;
      }
      if (hold!.reversed) hold!.reverse();
      hold!.play();
      animate($('.seal__core', stage)!, { scale: 0.93, duration: 300, ease: 'out(3)' });
    };
    const release = () => {
      if (sealed || !hold || hold.progress <= 0 || hold.progress >= 1) return;
      hold.reverse();
      animate($('.seal__core', stage)!, { scale: 1, duration: 400, ease: 'outElastic(1, .5)' });
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press(e);
    });
    btn.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') release();
    });
  };

  sheet.body.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!btn) return;
    if (btn.hasAttribute('data-next')) void go(1);
    else if (btn.hasAttribute('data-back')) void go(-1);
    else if (btn.dataset.pickCode) {
      draft.codename = btn.dataset.pickCode;
      $<HTMLInputElement>('[data-codename]', stage)!.value = draft.codename;
      $$('[data-pick-code]', stage).forEach((c) => c.classList.toggle('is-on', c === btn));
    } else if (btn.dataset.pickReason) {
      read();
      const r = btn.dataset.pickReason;
      if (draft.reasons.includes(r)) draft.reasons = draft.reasons.filter((x) => x !== r);
      else {
        const empty = draft.reasons.findIndex((x) => !x.trim());
        if (empty >= 0) draft.reasons[empty] = r;
        else draft.reasons.push(r);
      }
      if (!draft.reasons.length) draft.reasons = [''];
      render(1, false);
    } else if (btn.hasAttribute('data-add-reason')) {
      read();
      draft.reasons.push('');
      render(1, false);
      $$<HTMLInputElement>('[data-reason]', stage).at(-1)?.focus();
    } else if (btn.dataset.removeReason) {
      read();
      draft.reasons.splice(Number(btn.dataset.removeReason), 1);
      render(1, false);
    } else if (btn.dataset.start) {
      read();
      draft.startMode = btn.dataset.start as Draft['startMode'];
      render(1, false);
    }
  });
  sheet.body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && step < TOTAL - 1) {
      e.preventDefault();
      void go(1);
    }
  });

  return {
    el: sheet.root,
    preset: 'vow',
    enter() {
      render(1, false);
      sheet.enter();
    },
    leave: (next) => sheet.leave(next),
    destroy() {
      hold?.pause();
    },
  };
}
