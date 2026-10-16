/**
 * Star Catcher — a 60-second distraction game. Tap falling stars to catch
 * them, chain catches for combos, avoid the dark-matter orbs. Rendered on a
 * 2D canvas with additive glow; the loop is an Anime.js Timer.
 */

import { animate, createTimer, utils, type Timer } from 'animejs';
import { $, el, vibrate } from '../../ui/dom';
import { sound } from '../../ui/sound';

type Kind = 'star' | 'gold' | 'comet' | 'void';

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
  star: '#bfe6ff',
  gold: '#ffd98a',
  comet: '#ff9fd2',
  void: '#7a5cff',
};

const POINTS: Record<Kind, number> = { star: 1, gold: 3, comet: 5, void: -3 };
const BEST_KEY = 'divine-vow:star-best';
const ROUND = 60;

export function starCatcher(onCatch?: () => void): { el: HTMLElement; destroy(): void } {
  const root = el(`
    <div class="game">
      <canvas aria-label="Star catcher game"></canvas>
      <div class="game__hud"><span class="game__score num" data-score>0</span><span class="game__time num" data-time>${ROUND}s</span></div>
      <div class="game__overlay" data-overlay>
        <div class="stack" style="--gap:14px;align-items:center">
          <span class="eyebrow">Star catcher</span>
          <h3 class="h2" style="font-size:30px">Catch the light.</h3>
          <p class="muted" style="max-width:340px">Tap falling stars before they fade. Gold is worth more, comets most of all. Avoid the dark ones.</p>
          <button class="btn btn--primary" type="button" data-play>Play · 60 seconds</button>
        </div>
      </div>
    </div>
  `);
  const canvas = root.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  const scoreEl = $('[data-score]', root)!;
  const timeEl = $('[data-time]', root)!;
  const overlay = $('[data-overlay]', root)!;

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
    bg = Array.from({ length: Math.round((W * H) / 2400) }, () => [utils.random(0, W), utils.random(0, H), utils.random(0.2, 1.2, 2)]);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const spawn = () => {
    const elapsed = ROUND - left;
    const roll = Math.random();
    const voidChance = Math.min(0.22, 0.05 + elapsed * 0.003);
    const kind: Kind = roll < voidChance ? 'void' : roll < voidChance + 0.06 ? 'comet' : roll < voidChance + 0.26 ? 'gold' : 'star';
    const speed = (kind === 'comet' ? 260 : 70) + elapsed * 2.2 + Math.random() * 40;
    const fromSide = kind === 'comet';
    bodies.push({
      x: fromSide ? -20 : utils.random(30, W - 30),
      y: fromSide ? utils.random(20, H * 0.45) : -20,
      vx: fromSide ? speed : utils.random(-20, 20),
      vy: fromSide ? speed * 0.35 : speed,
      r: kind === 'void' ? 15 : kind === 'gold' ? 13 : kind === 'comet' ? 11 : 10,
      kind,
      phase: Math.random() * 10,
      trail: [],
    });
  };

  const explode = (x: number, y: number, color: string, n = 22) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = utils.random(40, 260);
      const life = utils.random(0.4, 0.9, 2);
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color });
    }
  };

  const bump = () => {
    animate(scoreEl, { scale: [1.35, 1], duration: 380, ease: 'out(3)' });
  };

  const hit = (px: number, py: number) => {
    if (!playing) return;
    let best = -1;
    let bestD = Infinity;
    bodies.forEach((b, i) => {
      const d = Math.hypot(b.x - px, b.y - py);
      const reach = b.r * 2.4 + 12;
      if (d < reach && d < bestD) {
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
      explode(b.x, b.y, COLORS.void, 30);
      pops.push({ x: b.x, y: b.y, text: `${POINTS.void}`, life: 1, color: '#b9a6ff' });
    } else {
      combo++;
      const mult = 1 + Math.floor(combo / 5);
      const pts = POINTS[b.kind] * mult;
      score += pts;
      vibrate(12);
      sound.chime(Math.min(7, combo % 8));
      explode(b.x, b.y, COLORS[b.kind], b.kind === 'comet' ? 40 : 24);
      pops.push({ x: b.x, y: b.y, text: mult > 1 ? `+${pts} ×${mult}` : `+${pts}`, life: 1, color: COLORS[b.kind] });
      onCatch?.();
    }
    scoreEl.textContent = String(score);
    bump();
  };

  const pointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    hit(e.clientX - r.left, e.clientY - r.top);
  };
  canvas.addEventListener('pointerdown', pointer);

  const drawGlow = (x: number, y: number, r: number, color: string, alpha = 1) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r * 3.2);
    grad.addColorStop(0, `rgba(255,255,255,${0.95 * alpha})`);
    grad.addColorStop(0.18, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = alpha;
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r * 3.2, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  };

  const drawStarShape = (x: number, y: number, r: number, rot: number, color: string) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 === 0 ? r : r * 0.32;
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
      const shown = Math.max(0, Math.ceil(left));
      if (timeEl.textContent !== `${shown}s`) timeEl.textContent = `${shown}s`;
      if (left <= 0) end();
    }

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const sx = shake > 0 ? (Math.random() - 0.5) * 14 * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * 14 * shake : 0;
    shake = Math.max(0, shake - dt * 3);
    g.translate(sx, sy);

    for (const [x, y, s] of bg) {
      g.globalAlpha = 0.25 + 0.25 * Math.sin(t * 1.5 + x);
      g.fillStyle = '#fff';
      g.fillRect(x, y, s, s);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'lighter';

    bodies = bodies.filter((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.x += Math.sin(t * 2 + b.phase) * 12 * dt;
      b.trail.push([b.x, b.y]);
      if (b.trail.length > (b.kind === 'comet' ? 18 : 8)) b.trail.shift();
      const out = b.y > H + 30 || b.x > W + 40;
      if (out && b.kind !== 'void' && playing) combo = 0;
      return !out;
    });

    for (const b of bodies) {
      const color = COLORS[b.kind];
      b.trail.forEach(([x, y], i) => {
        const a = (i / b.trail.length) * (b.kind === 'comet' ? 0.5 : 0.25);
        g.globalAlpha = a;
        g.fillStyle = color;
        g.beginPath();
        g.arc(x, y, b.r * (0.3 + (i / b.trail.length) * 0.5), 0, Math.PI * 2);
        g.fill();
      });
      g.globalAlpha = 1;
      if (b.kind === 'void') {
        g.globalCompositeOperation = 'source-over';
        const grad = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 1.6);
        grad.addColorStop(0, '#05020f');
        grad.addColorStop(0.6, '#1a0f3a');
        grad.addColorStop(1, 'rgba(122,92,255,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(b.x, b.y, b.r * 1.6, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(160,130,255,0.7)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(b.x, b.y, b.r * (1.05 + 0.08 * Math.sin(t * 6 + b.phase)), 0, Math.PI * 2);
        g.stroke();
        g.globalCompositeOperation = 'lighter';
      } else {
        const tw = 0.85 + 0.15 * Math.sin(t * 8 + b.phase);
        drawGlow(b.x, b.y, b.r * tw, color, 0.9);
        drawStarShape(b.x, b.y, b.r * 1.5 * tw, t * 0.8 + b.phase, '#fff');
      }
    }

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
      g.arc(s.x, s.y, 1.2 + a * 2.4, 0, Math.PI * 2);
      g.fill();
      return s.life > 0;
    });

    g.globalCompositeOperation = 'source-over';
    pops = pops.filter((p) => {
      p.life -= dt * 1.2;
      p.y -= 40 * dt;
      g.globalAlpha = Math.max(0, p.life);
      g.fillStyle = p.color;
      g.font = '600 18px "Cinzel Variable", serif';
      g.textAlign = 'center';
      g.fillText(p.text, p.x, p.y - 18);
      return p.life > 0;
    });
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
  };

  const timer: Timer = createTimer({ onUpdate: (self) => frame(self.deltaTime) });

  const start = () => {
    bodies = [];
    sparks = [];
    pops = [];
    score = 0;
    combo = 0;
    left = ROUND;
    spawnAcc = 0.6;
    scoreEl.textContent = '0';
    playing = true;
    animate(overlay, { opacity: 0, duration: 400, onComplete: () => (overlay.style.display = 'none') });
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
    const record = score > best;
    overlay.innerHTML = `
      <div class="stack" style="--gap:12px;align-items:center">
        <span class="eyebrow">${record ? 'New personal best' : 'Time'}</span>
        <h3 class="h1 num">${score}</h3>
        <p class="muted">${record ? 'The brightest round yet.' : `Best: ${Math.max(best, score)}`} · Sixty seconds that belonged to you.</p>
        <button class="btn btn--primary" type="button" data-play>Play again</button>
      </div>`;
    overlay.style.display = '';
    animate(overlay, { opacity: { from: 0, to: 1 }, duration: 500 });
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
