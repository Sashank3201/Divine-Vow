/**
 * Star catcher — a 60-second distraction game. Tap falling stars, chain
 * catches for a multiplier, avoid the red rings. Drawn on a 2D canvas; the
 * loop is an Anime.js Timer.
 */

import { animate, createTimer, spring, utils, type Timer } from 'animejs';
import { $, el, vibrate } from '../../ui/dom';
import { sound } from '../../ui/sound';

type Kind = 'star' | 'blue' | 'comet' | 'void';

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  kind: Kind;
  phase: number;
  trail: Array<[number, number]>;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

interface Pop {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

const COLORS: Record<Kind, string> = {
  star: '#ffffff',
  blue: '#8fd3ff',
  comet: '#dff3ff',
  void: '#ff6b6b',
};

const POINTS: Record<Kind, number> = { star: 1, blue: 3, comet: 5, void: -3 };
const BEST_KEY = 'divine-vow:star-best';
const ROUND = 60;

export function starCatcher(onCatch?: () => void): { el: HTMLElement; destroy(): void } {
  const root = el(`
    <div class="game">
      <canvas class="game__canvas" aria-label="Star catcher game"></canvas>
      <div class="game__hud">
        <span class="game__score t-num" data-score>0</span>
        <span class="game__time t-num" data-time>${ROUND}s</span>
      </div>
      <div class="game__overlay" data-overlay>
        <div class="game__card">
          <p class="t-title">Catch the stars</p>
          <p class="t-sub">White 1 · Blue 3 · Comet 5. Avoid the red rings.</p>
          <button class="btn btn--accent" type="button" data-play>Play · ${ROUND}s</button>
        </div>
      </div>
    </div>
  `);
  const canvas = root.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  const scoreEl = $('[data-score]', root)!;
  const timeEl = $('[data-time]', root)!;
  const overlay = $('[data-overlay]', root)!;
  const font = getComputedStyle(document.body).fontFamily;

  let W = 1;
  let H = 1;
  let dpr = 1;
  let bodies: Body[] = [];
  let sparks: Spark[] = [];
  let pops: Pop[] = [];
  let bg: Array<[number, number, number]> = [];
  let score = 0;
  let combo = 0;
  let left = ROUND;
  let spawnAcc = 0;
  let playing = false;
  let shake = 0;
  let t = 0;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    bg = Array.from({ length: Math.round((W * H) / 2600) }, () => [utils.random(0, W), utils.random(0, H), utils.random(0.4, 1.4, 2)]);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const spawn = () => {
    const elapsed = ROUND - left;
    const roll = Math.random();
    const voidChance = Math.min(0.22, 0.05 + elapsed * 0.003);
    const kind: Kind = roll < voidChance ? 'void' : roll < voidChance + 0.06 ? 'comet' : roll < voidChance + 0.26 ? 'blue' : 'star';
    const speed = (kind === 'comet' ? 260 : 70) + elapsed * 2.2 + Math.random() * 40;
    const fromSide = kind === 'comet';
    bodies.push({
      x: fromSide ? -20 : utils.random(30, W - 30),
      y: fromSide ? utils.random(20, H * 0.45) : -20,
      vx: fromSide ? speed : utils.random(-20, 20),
      vy: fromSide ? speed * 0.35 : speed,
      r: kind === 'void' ? 15 : kind === 'blue' ? 12 : kind === 'comet' ? 10 : 9,
      kind,
      phase: Math.random() * 10,
      trail: [],
    });
  };

  const explode = (x: number, y: number, color: string, n = 22) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = utils.random(40, 240);
      const life = utils.random(0.35, 0.8, 2);
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color });
    }
  };

  const hit = (px: number, py: number) => {
    if (!playing) return;
    let best = -1;
    let bestD = Infinity;
    bodies.forEach((b, i) => {
      const d = Math.hypot(b.x - px, b.y - py);
      if (d < b.r * 2.4 + 12 && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best < 0) return;
    const b = bodies[best]!;
    bodies.splice(best, 1);
    if (b.kind === 'void') {
      combo = 0;
      score = Math.max(0, score + POINTS.void);
      shake = 1;
      vibrate([40, 30, 40]);
      explode(b.x, b.y, COLORS.void, 26);
      pops.push({ x: b.x, y: b.y, text: `${POINTS.void}`, life: 1, color: COLORS.void });
    } else {
      combo++;
      const mult = 1 + Math.floor(combo / 5);
      const pts = POINTS[b.kind] * mult;
      score += pts;
      vibrate(12);
      sound.chime(Math.min(7, combo % 8));
      explode(b.x, b.y, COLORS[b.kind], b.kind === 'comet' ? 36 : 20);
      pops.push({ x: b.x, y: b.y, text: mult > 1 ? `+${pts} ×${mult}` : `+${pts}`, life: 1, color: '#fff' });
      onCatch?.();
    }
    scoreEl.textContent = String(score);
    animate(scoreEl, { scale: [1.25, 1], duration: 360, ease: 'out(3)' });
  };

  const pointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    hit(e.clientX - r.left, e.clientY - r.top);
  };
  canvas.addEventListener('pointerdown', pointer);

  const halo = (x: number, y: number, r: number, color: string, alpha: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = alpha;
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r * 2.4, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  };

  const starShape = (x: number, y: number, r: number, rot: number, color: string) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 === 0 ? r : r * 0.3;
      const a = (i / 8) * Math.PI * 2;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.restore();
  };

  const frame = (dtMs: number) => {
    const dt = Math.min(Math.max(dtMs, 0), 100) / 1000;
    t += dt;
    if (playing) {
      left -= dt;
      spawnAcc += dt * (1.1 + (ROUND - left) * 0.035);
      while (spawnAcc > 1) {
        spawnAcc -= 1;
        spawn();
      }
      const shown = `${Math.max(0, Math.ceil(left))}s`;
      if (timeEl.textContent !== shown) timeEl.textContent = shown;
      if (left <= 0) end();
    }

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const sx = shake > 0 ? (Math.random() - 0.5) * 12 * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * 12 * shake : 0;
    shake = Math.max(0, shake - dt * 3);
    g.translate(sx, sy);

    g.fillStyle = '#fff';
    for (const [x, y, s] of bg) {
      g.globalAlpha = 0.18 + 0.18 * Math.sin(t * 1.5 + x);
      g.fillRect(x, y, s, s);
    }
    g.globalAlpha = 1;

    bodies = bodies.filter((b) => {
      b.x += b.vx * dt + Math.sin(t * 2 + b.phase) * 12 * dt;
      b.y += b.vy * dt;
      b.trail.push([b.x, b.y]);
      if (b.trail.length > (b.kind === 'comet' ? 18 : 7)) b.trail.shift();
      const out = b.y > H + 30 || b.x > W + 40;
      if (out && b.kind !== 'void' && playing) combo = 0;
      return !out;
    });

    for (const b of bodies) {
      const color = COLORS[b.kind];
      if (b.kind === 'void') {
        g.fillStyle = 'rgba(0,0,0,0.75)';
        g.beginPath();
        g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = color;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(b.x, b.y, b.r * (1 + 0.06 * Math.sin(t * 6 + b.phase)), 0, Math.PI * 2);
        g.stroke();
        continue;
      }
      g.globalCompositeOperation = 'lighter';
      b.trail.forEach(([x, y], i) => {
        const f = i / b.trail.length;
        g.globalAlpha = f * (b.kind === 'comet' ? 0.45 : 0.2);
        g.fillStyle = color;
        g.beginPath();
        g.arc(x, y, b.r * (0.25 + f * 0.45), 0, Math.PI * 2);
        g.fill();
      });
      const tw = 0.88 + 0.12 * Math.sin(t * 8 + b.phase);
      halo(b.x, b.y, b.r * tw, color, 0.35);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      starShape(b.x, b.y, b.r * 1.4 * tw, t * 0.8 + b.phase, color);
    }

    g.globalCompositeOperation = 'lighter';
    sparks = sparks.filter((s) => {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.96;
      s.vy = s.vy * 0.96 + 40 * dt;
      const a = Math.max(0, s.life / s.max);
      g.globalAlpha = a;
      g.fillStyle = s.color;
      g.beginPath();
      g.arc(s.x, s.y, 1 + a * 2, 0, Math.PI * 2);
      g.fill();
      return s.life > 0;
    });

    g.globalCompositeOperation = 'source-over';
    g.font = `600 16px ${font}`;
    g.textAlign = 'center';
    pops = pops.filter((p) => {
      p.life -= dt * 1.3;
      p.y -= 40 * dt;
      g.globalAlpha = Math.max(0, p.life);
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, p.y - 18);
      return p.life > 0;
    });
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
  };

  const timer: Timer = createTimer({ onUpdate: (self) => frame(self.deltaTime) });

  const showOverlay = (html: string) => {
    overlay.innerHTML = html;
    overlay.hidden = false;
    animate(overlay, { opacity: { from: 0, to: 1 }, duration: 300 });
    animate(overlay.firstElementChild!, { scale: { from: 0.9, to: 1 }, ease: spring({ bounce: 0.3, duration: 600 }) });
  };

  const start = () => {
    bodies = [];
    sparks = [];
    pops = [];
    score = 0;
    combo = 0;
    left = ROUND;
    spawnAcc = 0.6;
    scoreEl.textContent = '0';
    timeEl.textContent = `${ROUND}s`;
    playing = true;
    animate(overlay, { opacity: 0, duration: 260, onComplete: () => (overlay.hidden = true) });
  };

  const end = () => {
    playing = false;
    let best = 0;
    try {
      best = Number(localStorage.getItem(BEST_KEY) ?? 0);
      if (score > best) localStorage.setItem(BEST_KEY, String(score));
    } catch {
      /* storage unavailable */
    }
    const record = score > best && score > 0;
    showOverlay(`
      <div class="game__card">
        <p class="t-label">${record ? 'New best' : 'Score'}</p>
        <p class="game__final t-num">${score}</p>
        <p class="t-sub">${record ? 'Your best round yet.' : `Best: ${Math.max(best, score)}`}</p>
        <button class="btn btn--accent" type="button" data-play>Play again</button>
      </div>`);
    if (record) sound.chime(7);
  };

  root.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-play]')) start();
  });

  return {
    el: root,
    destroy() {
      timer.cancel();
      ro.disconnect();
      canvas.removeEventListener('pointerdown', pointer);
    },
  };
}
