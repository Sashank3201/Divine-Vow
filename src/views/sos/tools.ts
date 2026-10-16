/** SOS tools. Each returns a panel element and a destroy() hook. */

import { animate, createTimeline, createTimer, stagger, utils, type Timeline, type Timer } from 'animejs';
import { store } from '../../core/store';
import { DAY, streakMs } from '../../core/journey';
import { MOVES, SURF_PROMPTS } from '../../core/content';
import { icons } from '../../ui/icons';
import { $, $$, el, esc, vibrate } from '../../ui/dom';
import { burst } from '../../ui/celebrate';
import { sound } from '../../ui/sound';

export interface Panel {
  el: HTMLElement;
  destroy(): void;
}

// ── Breathe ───────────────────────────────────────────────────────────────

type Phase = ['in' | 'hold' | 'out', number];

const PATTERNS: Record<string, { name: string; phases: Phase[] }> = {
  box: { name: 'Box 4-4-4-4', phases: [['in', 4], ['hold', 4], ['out', 4], ['hold', 4]] },
  calm: { name: '4-7-8', phases: [['in', 4], ['hold', 7], ['out', 8]] },
  even: { name: '5-5', phases: [['in', 5], ['out', 5]] },
};

const LABELS = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out' } as const;

export function breathePanel(reduced: boolean): Panel {
  const root = el(`
    <div class="breath">
      <div class="segmented" role="radiogroup" aria-label="Pattern">
        ${Object.entries(PATTERNS).map(([k, p], i) => `<button type="button" data-pattern="${k}" class="${i === 0 ? 'is-on' : ''}">${p.name}</button>`).join('')}
      </div>
      <div class="breath__stage"><div class="breath__ring"></div><div class="breath__orb" data-orb></div></div>
      <p class="breath__label" data-label aria-live="polite">Get ready</p>
      <p class="t-foot t-num" data-count>&nbsp;</p>
    </div>
  `);
  const orb = $('[data-orb]', root)!;
  const label = $('[data-label]', root)!;
  const count = $('[data-count]', root)!;
  let tl: Timeline | null = null;
  let countdown: Timer | null = null;
  let cycles = 1;

  const startCountdown = (sec: number) => {
    countdown?.cancel();
    count.textContent = `${sec} · cycle ${cycles}`;
    countdown = createTimer({
      duration: sec * 1000,
      frameRate: 10,
      onUpdate: (t) => {
        const left = Math.max(1, Math.ceil(sec - t.currentTime / 1000));
        count.textContent = `${left} · cycle ${cycles}`;
      },
    });
  };

  const run = (key: string) => {
    tl?.revert();
    cycles = 1;
    tl = createTimeline({ loop: true, onLoop: () => cycles++ });
    let at = 0;
    for (const [kind, sec] of PATTERNS[key]!.phases) {
      const ms = sec * 1000;
      tl.call(() => {
        label.textContent = LABELS[kind];
        sound.breath(kind, sec);
        vibrate(kind === 'hold' ? 6 : 16);
        startCountdown(sec);
      }, at);
      if (kind === 'hold') tl.add({ duration: ms }, at);
      else tl.add(orb, { scale: kind === 'in' ? 1.7 : 1, duration: reduced ? 1 : ms, ease: 'inOutSine' }, at);
      at += ms;
    }
  };

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pattern]');
    if (!b) return;
    $$('[data-pattern]', root).forEach((x) => x.classList.toggle('is-on', x === b));
    animate(orb, { scale: 1, duration: 500, ease: 'out(3)' });
    window.setTimeout(() => run(b.dataset.pattern!), 550);
  });
  window.setTimeout(() => run('box'), 700);

  return {
    el: root,
    destroy() {
      tl?.revert();
      countdown?.cancel();
    },
  };
}

// ── Ride it out (urge surfing) ────────────────────────────────────────────

export function surfPanel(getIntensity: () => number, reduced: boolean): Panel {
  const DURATION = 10 * 60 * 1000;
  const root = el(`
    <div class="surf">
      <div class="inline" style="justify-content:space-between;align-items:flex-end">
        <span class="surf__time t-num" data-time>10:00</span>
        <span class="pill" data-phase>Rising</span>
      </div>
      <svg class="surf__chart" viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 150 C 120 148, 170 110, 240 56 S 330 10, 360 14 S 450 86, 520 132 S 580 150, 600 150" class="surf__guide"/>
        <path data-area class="surf__area" d=""/>
        <path data-line class="surf__line" d=""/>
        <circle data-dot r="5" class="surf__dot" cx="0" cy="150"/>
      </svg>
      <p class="surf__prompt" data-prompt aria-live="polite">${esc(SURF_PROMPTS[0]!)}</p>
      <p class="t-foot">Move the strength slider as it changes.</p>
    </div>
  `);
  const timeEl = $('[data-time]', root)!;
  const phaseEl = $('[data-phase]', root)!;
  const line = $('[data-line]', root)!;
  const area = $('[data-area]', root)!;
  const dot = $<SVGCircleElement>('[data-dot]', root)!;
  const prompt = $('[data-prompt]', root)!;
  const samples: Array<[number, number]> = [[0, getIntensity()]];
  let promptIndex = 0;
  let lastSample = 0;

  const draw = (elapsed: number) => {
    const pts = samples.map(([t, v]) => [(t / DURATION) * 600, 150 - (v / 10) * 135] as const);
    const now = [(elapsed / DURATION) * 600, 150 - (getIntensity() / 10) * 135] as const;
    pts.push(now);
    let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]!;
      const [x1, y1] = pts[i]!;
      const mx = (x0 + x1) / 2;
      d += ` C ${mx.toFixed(1)} ${y0.toFixed(1)}, ${mx.toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    line.setAttribute('d', d);
    area.setAttribute('d', `${d} L ${now[0].toFixed(1)} 160 L 0 160 Z`);
    dot.setAttribute('cx', now[0].toFixed(1));
    dot.setAttribute('cy', now[1].toFixed(1));
  };

  const swapPrompt = (text: string) => {
    if (reduced) {
      prompt.textContent = text;
      return;
    }
    void animate(prompt, { opacity: 0, duration: 200 })
      .then()
      .then(() => {
        prompt.textContent = text;
        animate(prompt, { opacity: 1, duration: 400 });
      });
  };

  const timer = createTimer({
    duration: DURATION,
    frameRate: 15,
    onUpdate: (t) => {
      const elapsed = t.currentTime;
      const left = Math.max(0, DURATION - elapsed);
      timeEl.textContent = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
      if (elapsed - lastSample > 10000) {
        samples.push([elapsed, getIntensity()]);
        lastSample = elapsed;
      }
      const f = elapsed / DURATION;
      const phase = f < 0.3 ? 'Rising' : f < 0.55 ? 'Peak' : f < 0.9 ? 'Fading' : 'Calm';
      if (phaseEl.textContent !== phase) phaseEl.textContent = phase;
      const idx = Math.min(SURF_PROMPTS.length - 1, Math.floor(f * SURF_PROMPTS.length));
      if (idx !== promptIndex) {
        promptIndex = idx;
        swapPrompt(SURF_PROMPTS[idx]!);
        vibrate(12);
      }
      draw(elapsed);
    },
    onComplete: () => {
      phaseEl.textContent = 'Done';
      timeEl.textContent = '0:00';
      sound.chime(5);
      const r = dot.getBoundingClientRect();
      burst(r.left, r.top, 30, 140);
    },
  });
  draw(0);
  return { el: root, destroy: () => timer.cancel() };
}

// ── Move ──────────────────────────────────────────────────────────────────

export function movePanel(): Panel {
  const deck = utils.shuffle([...MOVES]);
  let i = 0;
  let done = 0;
  const root = el(`
    <div class="stack" style="--gap:14px">
      <div class="move-card" data-card><p class="move-card__text" data-text>${esc(deck[0]!)}</p></div>
      <div class="inline">
        <button class="btn btn--fill" type="button" data-another>Another</button>
        <span class="spacer"></span>
        <button class="btn btn--accent" type="button" data-did>${icons.check}Done</button>
      </div>
      <p class="t-foot" data-done>Pick one and do it now.</p>
    </div>
  `);
  const card = $('[data-card]', root)!;
  const text = $('[data-text]', root)!;
  const doneEl = $('[data-done]', root)!;
  const next = async () => {
    i = (i + 1) % deck.length;
    await animate(card, { opacity: 0, x: -20, duration: 180, ease: 'in(2)' }).then();
    text.textContent = deck[i]!;
    animate(card, { opacity: 1, x: { from: 20, to: 0 }, duration: 320, ease: 'out(3)' });
  };
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.hasAttribute('data-another')) void next();
    if (b.hasAttribute('data-did')) {
      done++;
      doneEl.textContent = `${done} done.`;
      const r = b.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top, 20, 110);
      sound.chime(done);
      vibrate(20);
      void next();
    }
  });
  return { el: root, destroy() {} };
}

// ── Ground (5-4-3-2-1) ────────────────────────────────────────────────────

const GROUND = [
  { n: 5, text: 'things you can see' },
  { n: 4, text: 'things you can touch' },
  { n: 3, text: 'things you can hear' },
  { n: 2, text: 'things you can smell' },
  { n: 1, text: 'thing you can taste' },
];

export function groundPanel(reduced: boolean): Panel {
  let step = 0;
  let found = 0;
  const root = el(`<div class="ground"></div>`);
  const render = () => {
    if (step >= GROUND.length) {
      root.innerHTML = `<p class="t-title">You’re here. You’re okay.</p><button class="btn btn--fill" type="button" data-restart>Again</button>`;
      sound.chime(6);
      return;
    }
    const g = GROUND[step]!;
    root.innerHTML = `
      <span class="ground__num t-num">${g.n}</span>
      <p class="t-headline">Name ${g.n} ${g.text}.</p>
      <div class="ground__dots">${Array.from({ length: g.n }, (_, k) => `<span class="${k < found ? 'is-on' : ''}"></span>`).join('')}</div>
      <button class="btn btn--accent" type="button" data-found>Found one</button>`;
    if (!reduced) animate(root.children, { opacity: { from: 0, to: 1 }, y: { from: 12, to: 0 }, delay: stagger(50), duration: 400, ease: 'out(3)' });
  };
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.hasAttribute('data-restart')) {
      step = 0;
      found = 0;
      render();
      return;
    }
    found++;
    vibrate(12);
    sound.chime(found);
    const d = $$('.ground__dots span', root)[found - 1];
    if (d) {
      d.classList.add('is-on');
      animate(d, { scale: [1.8, 1], duration: 450, ease: 'outElastic(1, .5)' });
    }
    if (found >= GROUND[step]!.n) {
      step++;
      found = 0;
      window.setTimeout(render, 380);
    }
  });
  render();
  return { el: root, destroy() {} };
}

// ── Your reasons ──────────────────────────────────────────────────────────

export function whyPanel(): Panel {
  const s = store.get();
  const vow = s.vow;
  const days = Math.floor(streakMs(s) / DAY);
  const root = el(
    vow
      ? `<div class="stack" style="--gap:16px">
          ${days > 0 ? `<p class="t-sub">${days} ${days === 1 ? 'day' : 'days'} clean. Don’t trade that for a few minutes.</p>` : ''}
          <ul class="reasons reasons--big">${vow.reasons.map((r) => `<li data-why>${esc(r)}</li>`).join('')}</ul>
          <p class="t-headline faint" data-why>“${esc(vow.vowText)}”</p>
        </div>`
      : `<div class="stack" style="--gap:14px"><p class="t-sub">You haven’t written your reasons yet. Do it once this passes.</p><a class="btn btn--accent" href="#/vow">Take the vow</a></div>`,
  );
  animate($$('[data-why]', root), { opacity: { from: 0, to: 1 }, x: { from: -10, to: 0 }, delay: stagger(220, { start: 150 }), duration: 600, ease: 'out(3)' });
  return { el: root, destroy() {} };
}
