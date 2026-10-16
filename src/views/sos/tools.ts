/** The SOS tools. Each returns a panel element and a destroy() hook. */

import { animate, createTimeline, createTimer, scrambleText, stagger, svg, utils, type Timeline, type Timer } from 'animejs';
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
  box: { name: 'Box · 4-4-4-4', phases: [['in', 4], ['hold', 4], ['out', 4], ['hold', 4]] },
  calm: { name: 'Calm · 4-7-8', phases: [['in', 4], ['hold', 7], ['out', 8]] },
  coherent: { name: 'Coherent · 5-5', phases: [['in', 5], ['out', 5]] },
};

const LABELS = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out' } as const;

export function breathePanel(reduced: boolean): Panel {
  const root = el(`
    <div class="breath">
      <div class="segmented" role="radiogroup" aria-label="Breathing pattern">
        ${Object.entries(PATTERNS)
          .map(([k, p], i) => `<button type="button" data-pattern="${k}" class="${i === 0 ? 'is-on' : ''}">${p.name}</button>`)
          .join('')}
      </div>
      <div class="breath__stage">
        <span class="breath__halo"></span>
        <div data-sparks style="position:absolute;inset:0">${Array.from({ length: 10 }, () => '<span class="breath__spark"></span>').join('')}</div>
        <div class="breath__orb" data-orb></div>
      </div>
      <p class="breath__label" data-label aria-live="polite">Get comfortable</p>
      <p class="breath__count num" data-count>Cycle 1</p>
    </div>
  `);
  const orb = $('[data-orb]', root)!;
  const sparksBox = $('[data-sparks]', root)!;
  const sparks = $$('.breath__spark', root);
  const label = $('[data-label]', root)!;
  const count = $('[data-count]', root)!;
  let tl: Timeline | null = null;
  let spin: ReturnType<typeof animate> | null = null;
  let countdown: Timer | null = null;
  let cycles = 0;

  // Sparks sit on a ring; the ring breathes with the orb.
  sparks.forEach((s, i) => {
    const a = (i / sparks.length) * Math.PI * 2;
    s.style.transform = `rotate(${(a * 180) / Math.PI}deg) translateX(min(118px, 29vw))`;
  });
  if (!reduced) spin = animate(sparksBox, { rotate: 360, duration: 28000, loop: true, ease: 'linear' });

  const run = (key: string) => {
    tl?.revert();
    countdown?.cancel();
    cycles = 0;
    const phases = PATTERNS[key]!.phases;
    tl = createTimeline({
      loop: true,
      onLoop: () => {
        cycles++;
        count.textContent = `Cycle ${cycles + 1}`;
      },
    });
    let at = 0;
    for (const [kind, sec] of phases) {
      const ms = sec * 1000;
      tl.call(() => {
        label.textContent = LABELS[kind];
        animate(label, { opacity: { from: 0.2, to: 1 }, y: { from: 8, to: 0 }, duration: 600, ease: 'out(3)' });
        sound.breath(kind, sec);
        vibrate(kind === 'hold' ? 8 : 20);
        startCountdown(sec);
      }, at);
      if (kind !== 'hold') {
        tl.add(orb, { scale: kind === 'in' ? 1.75 : 1, duration: reduced ? 1 : ms, ease: 'inOutSine' }, at);
        tl.add(sparksBox, { scale: kind === 'in' ? 1.25 : 0.82, opacity: kind === 'in' ? 1 : 0.55, duration: reduced ? 1 : ms, ease: 'inOutSine' }, at);
      } else {
        // Holds are silence: an empty timer keeps the loop the right length.
        tl.add({ duration: ms }, at);
      }
      at += ms;
    }
  };

  const startCountdown = (sec: number) => {
    countdown?.cancel();
    let n = sec;
    count.dataset.phase = String(n);
    const cycleLabel = `Cycle ${cycles + 1}`;
    count.textContent = `${n} · ${cycleLabel}`;
    countdown = createTimer({
      duration: sec * 1000,
      frameRate: 10,
      onUpdate: (t) => {
        const left = Math.max(1, Math.ceil(sec - t.currentTime / 1000));
        if (left !== n) {
          n = left;
          count.textContent = `${n} · Cycle ${cycles + 1}`;
        }
      },
    });
  };

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pattern]');
    if (!b) return;
    $$('[data-pattern]', root).forEach((x) => x.classList.toggle('is-on', x === b));
    animate(orb, { scale: 1, duration: 600, ease: 'out(3)' });
    window.setTimeout(() => run(b.dataset.pattern!), 650);
  });

  orb.style.transform = 'scale(1)';
  window.setTimeout(() => run('box'), 900);

  return {
    el: root,
    destroy() {
      tl?.revert();
      spin?.revert();
      countdown?.cancel();
    },
  };
}

// ── Ride the wave (urge surfing) ──────────────────────────────────────────

export function surfPanel(getIntensity: () => number, reduced: boolean): Panel {
  const DURATION = 10 * 60 * 1000;
  const root = el(`
    <div class="surf">
      <div class="row" style="justify-content:space-between;align-items:flex-end">
        <div>
          <p class="field__label">Ride it out</p>
          <p class="surf__time num" data-time>10:00</p>
        </div>
        <span class="pill pill--teal" data-phase>Rising</span>
      </div>
      <svg class="surf__chart" viewBox="0 0 600 170" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="surf-g" x1="0" x2="1"><stop offset="0" stop-color="#5eead4"/><stop offset="0.5" stop-color="#f4c97c"/><stop offset="1" stop-color="#8f7cff"/></linearGradient>
          <linearGradient id="surf-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#79d8ff" stop-opacity="0.25"/><stop offset="1" stop-color="#79d8ff" stop-opacity="0"/></linearGradient>
        </defs>
        <path d="M0 160 C 120 158, 170 120, 240 60 S 330 10, 360 14 S 450 90, 520 140 S 580 160, 600 160" stroke="rgba(255,255,255,0.18)" stroke-dasharray="5 7" fill="none"/>
        <path data-area fill="url(#surf-f)" d=""/>
        <path data-line stroke="url(#surf-g)" stroke-width="3" fill="none" d=""/>
        <circle data-dot r="6" fill="#fff" cx="0" cy="160" style="filter: drop-shadow(0 0 8px #79d8ff)"/>
      </svg>
      <p class="surf__prompt" data-prompt aria-live="polite">${esc(SURF_PROMPTS[0]!)}</p>
      <p class="muted" style="font-size:13.5px">Move the "How strong is the pull?" slider above as it changes. Watch what the wave does.</p>
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
    const pts = samples.map(([t, v]) => [(t / DURATION) * 600, 160 - (v / 10) * 145] as const);
    const now = [(elapsed / DURATION) * 600, 160 - (getIntensity() / 10) * 145] as const;
    pts.push(now);
    let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]!;
      const [x1, y1] = pts[i]!;
      const mx = (x0 + x1) / 2;
      d += ` C ${mx.toFixed(1)} ${y0.toFixed(1)}, ${mx.toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    line.setAttribute('d', d);
    area.setAttribute('d', `${d} L ${now[0].toFixed(1)} 170 L 0 170 Z`);
    dot.setAttribute('cx', now[0].toFixed(1));
    dot.setAttribute('cy', now[1].toFixed(1));
  };

  const timer = createTimer({
    duration: DURATION,
    frameRate: 15,
    onUpdate: (t) => {
      const elapsed = t.currentTime;
      const left = Math.max(0, DURATION - elapsed);
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      const txt = `${m}:${String(s).padStart(2, '0')}`;
      if (timeEl.textContent !== txt) timeEl.textContent = txt;
      if (elapsed - lastSample > 10000) {
        samples.push([elapsed, getIntensity()]);
        lastSample = elapsed;
      }
      const frac = elapsed / DURATION;
      const phase = frac < 0.3 ? 'Rising' : frac < 0.55 ? 'Cresting' : frac < 0.9 ? 'Falling' : 'Calm';
      if (phaseEl.textContent !== phase) {
        phaseEl.textContent = phase;
        animate(phaseEl, { scale: [1.15, 1], duration: 500 });
      }
      const idx = Math.min(SURF_PROMPTS.length - 1, Math.floor(frac * SURF_PROMPTS.length));
      if (idx !== promptIndex) {
        promptIndex = idx;
        if (reduced) prompt.textContent = SURF_PROMPTS[idx]!;
        else animate(prompt, { innerHTML: scrambleText({ text: esc(SURF_PROMPTS[idx]!), chars: 'lowercase', revealRate: 80, settleDuration: 300 }) });
        vibrate(15);
      }
      draw(elapsed);
    },
    onComplete: () => {
      phaseEl.textContent = 'You rode it';
      timeEl.textContent = '0:00';
      sound.chime(5);
      const r = dot.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2, 40, 160);
    },
  });
  draw(0);
  return { el: root, destroy: () => timer.cancel() };
}

// ── Move your body ────────────────────────────────────────────────────────

export function movePanel(reduced: boolean): Panel {
  const deck = utils.shuffle([...MOVES]);
  let i = 0;
  let done = 0;
  const root = el(`
    <div class="stack" style="--gap:18px">
      <div class="move-card" data-card>
        <span class="card-title">${icons.run}Do this now</span>
        <p class="move-card__text" data-text>${esc(deck[0]!)}</p>
      </div>
      <div class="row wrap" style="justify-content:space-between">
        <span class="muted" data-done>Nothing yet — start with one.</span>
        <div class="row">
          <button class="btn btn--ghost btn--sm" type="button" data-another>Another</button>
          <button class="btn btn--primary btn--sm" type="button" data-did>${icons.check}I did it</button>
        </div>
      </div>
    </div>
  `);
  const card = $('[data-card]', root)!;
  const text = $('[data-text]', root)!;
  const doneEl = $('[data-done]', root)!;
  const flip = async () => {
    i = (i + 1) % deck.length;
    if (reduced) {
      text.textContent = deck[i]!;
      return;
    }
    await animate(card, { rotateY: 90, duration: 260, ease: 'in(2)' }).then();
    text.textContent = deck[i]!;
    await animate(card, { rotateY: [-90, 0], duration: 420, ease: 'out(3)' }).then();
  };
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.hasAttribute('data-another')) void flip();
    if (b.hasAttribute('data-did')) {
      done++;
      doneEl.textContent = `${done} done. Your body is on your side.`;
      const r = b.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top, 28, 140);
      sound.chime(done);
      vibrate(25);
      void flip();
    }
  });
  return { el: root, destroy() {} };
}

// ── Ground yourself (5-4-3-2-1) ───────────────────────────────────────────

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
  const root = el(`<div class="ground-step" data-stage></div>`);
  const render = () => {
    if (step >= GROUND.length) {
      root.innerHTML = `
        <span class="eyebrow">Grounded</span>
        <p class="ground-step__text">You are here. You are safe. This moment is yours.</p>
        <button class="btn btn--ghost btn--sm" type="button" data-restart>Again</button>`;
      sound.chime(6);
      return;
    }
    const g = GROUND[step]!;
    root.innerHTML = `
      <span class="ground-step__num num">${g.n}</span>
      <p class="ground-step__text">Name ${g.n} ${g.text}.</p>
      <div class="ground-dots">${Array.from({ length: g.n }, (_, i) => `<span class="${i < found ? 'is-on' : ''}"></span>`).join('')}</div>
      <button class="btn btn--primary" type="button" data-found>${icons.check}Found one</button>`;
    if (!reduced) {
      animate(root.children, { opacity: { from: 0, to: 1 }, y: { from: 20, to: 0 }, delay: stagger(80), duration: 600, ease: 'out(3)' });
    }
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
    vibrate(15);
    sound.chime(found);
    const dots = $$('.ground-dots span', root);
    const d = dots[found - 1];
    if (d) {
      d.classList.add('is-on');
      animate(d, { scale: [1.8, 1], duration: 500, ease: 'outElastic(1, .5)' });
    }
    if (found >= GROUND[step]!.n) {
      step++;
      found = 0;
      window.setTimeout(render, 450);
    }
  });
  render();
  return { el: root, destroy() {} };
}

// ── Your why ──────────────────────────────────────────────────────────────

export function whyPanel(reduced: boolean): Panel {
  const s = store.get();
  const vow = s.vow;
  const days = Math.floor(streakMs(s) / DAY);
  const root = el(`
    <div class="stack" style="--gap:20px">
      ${
        vow
          ? `<p class="lede">You made a promise to yourself${days > 0 ? ` — and you have kept it for <strong style="color:#fff">${days} ${days === 1 ? 'day' : 'days'}</strong>` : ''}. Here is why:</p>
             <ul class="why-list">${vow.reasons.map((r) => `<li data-why>${icons.star4}<span>${esc(r)}</span></li>`).join('')}</ul>
             <div class="divider"></div>
             <p class="vow-quote" data-why>“${esc(vow.vowText)}”</p>
             <p class="vow-signature" data-why>${esc(vow.signature)}</p>`
          : `<p class="lede">You have not written your vow yet. When this wave passes, take two minutes to write down why you want to be free — it will be waiting for you here next time.</p>
             <a class="btn btn--primary" href="#/vow" style="align-self:flex-start">Write my vow</a>`
      }
    </div>
  `);
  if (!reduced) {
    const items = $$('[data-why]', root);
    animate(items, { opacity: { from: 0, to: 1 }, x: { from: -16, to: 0 }, delay: stagger(500, { start: 300 }), duration: 1200, ease: 'out(3)' });
    const lines = $$<SVGPathElement>('svg path', root);
    if (lines.length) animate(svg.createDrawable(lines), { draw: ['0 0', '0 1'], delay: stagger(500, { start: 300 }), duration: 1400 });
  }
  return { el: root, destroy() {} };
}
