/**
 * Landing: the cinematic hero followed by the story of the app.
 * Showcases Anime.js throughout — text splitting & scrambling, timelines,
 * scroll observers, drawable SVG, animatables and springs.
 */

import {
  animate,
  createAnimatable,
  createTimeline,
  onScroll,
  scrambleText,
  splitText,
  stagger,
  svg,
  utils,
  type TextSplitter,
} from 'animejs';
import type { AppContext, View } from '../app/types';
import { CHAPTERS, CINEMATIC_DURATION } from '../hero/cinematic';
import { JOURNEY_BEATS, gyrForSim } from '../core/journey';
import { store } from '../core/store';
import { icons } from '../ui/icons';
import { $, $$, el } from '../ui/dom';
import { sound } from '../ui/sound';

const FEATURES = [
  { icon: icons.orbit, title: 'Your orbit', text: 'A live counter of every second you have kept your word, with celestial ranks from Spark to Universe.' },
  { icon: icons.lifebuoy, title: 'I feel the pull', text: 'One tap opens an emergency toolkit: guided breathing, urge surfing, a star-catching game and quick actions that break the loop.' },
  { icon: icons.heart, title: 'Your why', text: 'Write down the reasons that matter. They come back to you at the exact moment you need them most.' },
  { icon: icons.book, title: 'Journal', text: 'Log urges and reflections. Patterns become visible, and triggers lose their power once you can see them.' },
  { icon: icons.chart, title: 'Insights', text: 'See when the pull is strongest — by hour and by weekday — so you can plan around it.' },
  { icon: icons.shield, title: 'Private by design', text: 'No account, no server, no tracking. Everything stays on this device, behind an optional PIN.' },
];

export function landingView(ctx: AppContext): View {
  const hasVow = !!store.get().vow;
  const root = el(`
    <div class="view view--landing">
      <section class="hero" aria-label="Divine Vow">
        <div class="hero__inner container">
          <div class="hero__content">
            <p class="eyebrow" data-hero="eyebrow"><span data-scramble>A promise written in the stars</span></p>
            <h1 class="hero__title" aria-label="Divine Vow">
              <span class="hero__line"><span class="hero__word" data-title>Divine</span></span>
              <span class="hero__line"><span class="hero__word hero__word--vow" data-title>Vow</span></span>
            </h1>
            <p class="hero__lede" data-lede>Two galaxies are falling toward each other, and from their collision a new one is born. <em>Your old self and the person you are becoming are colliding too.</em> Make your vow, and let the stronger one win.</p>
            <div class="hero__ctas" data-ctas>
              <a class="btn btn--primary btn--lg magnetic" href="${hasVow ? '#/sanctuary' : '#/vow'}" data-primary>
                <span>${hasVow ? 'Enter your sanctuary' : 'Take the vow'}</span>${icons.arrowRight}
              </a>
              <button class="btn btn--ghost btn--lg magnetic" type="button" data-action="cinema">${icons.play}<span>Watch the collision</span></button>
            </div>
            <ul class="hero__trust" data-trust>
              <li>${icons.lock}Private</li>
              <li>${icons.download}Works offline</li>
              <li>${icons.sparkle}No account</li>
            </ul>
          </div>
        </div>
        <div class="hero-hud" data-hud>
          <div class="hero-clock">
            <span class="hero-clock__label">Cosmic time</span>
            <span class="hero-clock__value num" data-clock>+3.75</span>
            <span class="hero-clock__unit">billion years from now</span>
            <span class="hero-clock__sep num" data-sep>Separation 300,000 light-years</span>
          </div>
          <div class="hero-center">
            <p class="hero-caption" aria-live="polite"><span class="hero-caption__text" data-caption></span></p>
            <ol class="hero-chapters" data-chapters>
              <span class="hero-chapters__track"><span class="hero-chapters__fill" data-fill></span></span>
              ${CHAPTERS.map((c) => `<li>${c.label}</li>`).join('')}
            </ol>
          </div>
          <div class="hero-controls">
            <button class="icon-btn" type="button" data-action="replay" aria-label="Replay the collision" title="Replay">${icons.replay}</button>
            <button class="icon-btn" type="button" data-action="sound" aria-label="Toggle cosmic sound" title="Sound">${icons.mute}</button>
            <button class="icon-btn hero-exit" type="button" data-action="exit" aria-label="Exit cinema mode" title="Exit">${icons.close}</button>
          </div>
        </div>
      </section>

      <section class="landing-section" id="story">
        <div class="container">
          <div class="landing-section__head" data-reveal>
            <span class="eyebrow">Why it works</span>
            <h2 class="h2">Every urge is a wave.</h2>
            <p class="lede">Cravings feel endless, but they are not. They build, crest and fade — often within fifteen to thirty minutes. You do not have to fight the wave. You only have to stay on your board until it passes. Divine Vow gives you something to hold on to while it does.</p>
          </div>
          <div class="glass wave-card" data-reveal>
            <svg class="wave-svg" viewBox="0 0 1000 260" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="wave-g" x1="0" x2="1">
                  <stop offset="0" stop-color="#5eead4"/><stop offset="0.48" stop-color="#f4c97c"/><stop offset="1" stop-color="#8f7cff"/>
                </linearGradient>
                <linearGradient id="wave-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#f4c97c" stop-opacity="0.18"/><stop offset="1" stop-color="#f4c97c" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <path d="M0 230 C 150 228, 230 210, 330 150 S 450 20, 500 22 S 600 80, 680 160 S 860 228, 1000 230 L1000 260 L0 260 Z" fill="url(#wave-fill)" data-wave-fill opacity="0"/>
              <path d="M0 230 C 150 228, 230 210, 330 150 S 450 20, 500 22 S 600 80, 680 160 S 860 228, 1000 230" stroke="url(#wave-g)" stroke-width="3" fill="none" data-wave/>
              <line x1="500" y1="22" x2="500" y2="250" stroke="rgba(255,255,255,0.18)" stroke-dasharray="4 6"/>
              <circle cx="500" cy="22" r="7" fill="#fff" data-crest opacity="0"/>
            </svg>
            <div class="wave-legend">
              <div><strong>Trigger</strong><span>The pull begins. Notice it — name it.</span></div>
              <div><strong>Crest</strong><span>The peak. It feels permanent. It is not.</span></div>
              <div><strong>Release</strong><span>It fades. You are still standing. You won.</span></div>
            </div>
          </div>
        </div>
      </section>

      <section class="landing-section">
        <div class="container">
          <div class="landing-section__head is-center" data-reveal>
            <span class="eyebrow">A sanctuary in your pocket</span>
            <h2 class="h2">Everything you need when the pull is strong.</h2>
          </div>
          <div class="features">
            ${FEATURES.map(
              (f) => `<article class="glass feature" data-feature>
                <span class="feature__shine"></span>
                <span class="feature__icon">${f.icon}</span>
                <h3 class="h3">${f.title}</h3>
                <p>${f.text}</p>
              </article>`,
            ).join('')}
          </div>
        </div>
      </section>

      <section class="landing-section" data-journey-section>
        <div class="container">
          <div class="landing-section__head" data-reveal>
            <span class="eyebrow">Ninety days · one new galaxy</span>
            <h2 class="h2">Your streak moves the universe.</h2>
            <p class="lede">The galaxies behind the app follow your journey. Every day you keep your vow, they move closer. On day 17 they touch. On day 75 they merge. On day 90, a new galaxy is born — and so are you.</p>
          </div>
          <div class="journey">
            <span class="journey__line"><span class="journey__fill" data-journey-fill></span></span>
            ${JOURNEY_BEATS.map(
              (b) => `<div class="journey__beat" data-beat>
                <span class="journey__day num">Day ${b.day}</span>
                <span class="journey__label">${b.label}</span>
                <span class="journey__text">${b.text}</span>
              </div>`,
            ).join('')}
          </div>
        </div>
      </section>

      <section class="landing-section">
        <div class="container">
          <p class="manifesto" data-manifesto>The pull feels strongest when you are changing orbit.</p>
        </div>
      </section>

      <section class="landing-section">
        <div class="container privacy">
          <div class="stack" style="--gap: 18px" data-reveal>
            <span class="eyebrow">Private by design</span>
            <h2 class="h2">What you are fighting is nobody's business but yours.</h2>
            <p class="lede">Divine Vow never asks what the habit is. You give it a name only you understand. There is no account and no cloud — your vow, your journal and your progress live on this device and nowhere else.</p>
          </div>
          <ul class="glass glass--pad privacy__list" data-reveal>
            <li>${icons.check}<span>No sign-up, no email, no analytics, no ads.</span></li>
            <li>${icons.check}<span>Works fully offline once installed.</span></li>
            <li>${icons.check}<span>Optional PIN lock keeps curious eyes out.</span></li>
            <li>${icons.check}<span>Export or erase everything, any time, in one tap.</span></li>
            <li>${icons.check}<span>A neutral name and icon on your home screen.</span></li>
          </ul>
        </div>
      </section>

      <section class="landing-section">
        <div class="container">
          <div class="glass glass--gold final-cta" data-reveal>
            <span class="eyebrow">Tonight is enough</span>
            <h2 class="h1">Make your vow.</h2>
            <p class="lede" style="max-width: 560px">You do not need to be ready. You only need to begin — and to come back here whenever the pull returns.</p>
            <a class="btn btn--primary btn--lg" href="${hasVow ? '#/sanctuary' : '#/vow'}">${hasVow ? 'Enter your sanctuary' : 'Take the vow'}${icons.arrowRight}</a>
            <p class="care-note">Divine Vow is a self-help companion, not a substitute for professional care. If you are struggling or feel unsafe, please reach out to someone you trust or a local helpline.</p>
          </div>
        </div>
      </section>

      <footer class="site-footer">
        <div class="container">
          <span>Divine Vow · made of stardust</span>
          <span>Your data never leaves this device.</span>
        </div>
      </footer>
    </div>
  `);

  const cleanups: Array<() => void> = [];
  const anims: Array<{ revert(): unknown } | { pause(): unknown }> = [];
  let splitters: TextSplitter[] = [];
  let cinema = false;
  let captionTimer = 0;

  const hero = $('.hero', root)!;
  const captionEl = $('[data-caption]', root)!;
  const clockEl = $('[data-clock]', root)!;
  const sepEl = $('[data-sep]', root)!;
  const fillEl = $('[data-fill]', root)!;
  const chapterEls = $$('.hero-chapters li', root);
  const content = $('.hero__content', root)!;

  // ── Caption swaps: words drift in, blur away ───────────────────────────
  let captionSplit: TextSplitter | null = null;
  let captionToken = 0;
  const showCaption = (text: string | null) => {
    const token = ++captionToken;
    const old = captionSplit?.words ?? [];
    const swapIn = () => {
      if (token !== captionToken) return;
      captionSplit?.revert();
      captionSplit = null;
      captionEl.textContent = text ?? '';
      if (!text) return;
      captionSplit = splitText(captionEl, { words: { class: 'word' } });
      animate(captionSplit.words, {
        opacity: { from: 0, to: 1 },
        y: { from: 14, to: 0 },
        filter: { from: 'blur(10px)', to: 'blur(0px)' },
        delay: stagger(55),
        duration: 1100,
        ease: 'out(3)',
      });
    };
    if (old.length) {
      animate(old, {
        opacity: 0,
        y: -10,
        filter: 'blur(8px)',
        delay: stagger(25),
        duration: 500,
        ease: 'in(2)',
        onComplete: swapIn,
      });
    } else swapIn();
  };

  const setChapter = (i: number) => {
    chapterEls.forEach((li, k) => {
      li.classList.toggle('is-past', k <= i);
      li.classList.toggle('is-current', k === i);
    });
  };

  // ── HUD: cosmic clock and separation, every frame ──────────────────────
  const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  cleanups.push(
    ctx.cosmos.onFrame((f) => {
      clockEl.textContent = `+${gyrForSim(f.simTime).toFixed(2)}`;
      const ly = Math.round((f.separation * 50000) / 1000) * 1000;
      sepEl.textContent = f.separation < 0.05 ? 'Merged · one nucleus' : `Separation ${nf.format(ly)} light-years`;
    }),
  );

  // ── Cinematic ──────────────────────────────────────────────────────────
  const startFilm = () => {
    setChapter(0);
    window.clearTimeout(captionTimer);
    showCaption(null);
    const cinematic = ctx.cosmos.playCinematic({
      caption: (text) => showCaption(text),
      chapter: (i) => setChapter(i),
      impact: (s) => sound.impact(s),
      progress: (p) => {
        fillEl.style.transform = `scaleX(${p.toFixed(4)})`;
      },
      complete: () => {
        setChapter(CHAPTERS.length - 1);
        // The remnant lives on; let the last line linger, then fall quiet.
        captionTimer = window.setTimeout(() => showCaption(null), 8000);
      },
    });
    if (!cinematic) {
      // No WebGL: still tell the story through captions alone.
      const tl = createTimeline({ autoplay: true });
      tl.add({ duration: CINEMATIC_DURATION });
      anims.push(tl);
    }
  };

  const setCinema = (on: boolean) => {
    cinema = on;
    document.documentElement.classList.toggle('is-cinema', on);
    frameScene(on, 1400);
    animate(content, {
      opacity: on ? 0 : 1,
      x: on ? -40 : 0,
      filter: on ? 'blur(12px)' : 'blur(0px)',
      duration: 900,
      ease: 'inOut(3)',
    });
  };

  // With the copy on screen, frame the galaxies in the space to its right.
  const wide = () => innerWidth > 860;
  const frameScene = (full: boolean, duration: number) => {
    const scene = ctx.cosmos.scene;
    ctx.cosmos.labelFloor = full || wide() ? Infinity : innerHeight * 0.4;
    ctx.cosmos.labelSafeLeft = !full && wide() ? content.getBoundingClientRect().right + 12 : 0;
    ctx.cosmos.labelCeiling = full || wide() ? 0 : 170;
    ctx.cosmos.setShift(full || !wide() ? 0 : 0.42, 0, duration);
    if (scene) animate(scene.user, { zoom: full || !wide() ? 1 : 1.32, duration, ease: 'inOut(3)' });
  };

  // ── Intro choreography (DOM) ───────────────────────────────────────────
  const intro = () => {
    if (ctx.reduced) {
      $$('[data-reveal]', root).forEach((n) => (n.style.opacity = '1'));
      return;
    }
    const titleWords = $$('[data-title]', root);
    splitters = titleWords.map((w) => splitText(w, { chars: { wrap: 'clip', class: 'char' } }));
    const syncSheen = () => {
      titleWords.forEach((w, i) => {
        const W = w.getBoundingClientRect().width;
        w.style.setProperty('--bw', `${(W * 2.5).toFixed(1)}px`);
        splitters[i]!.chars.forEach((c: HTMLElement) => c.style.setProperty('--ox', `${c.offsetLeft}px`));
      });
    };
    titleWords.forEach((w) => w.classList.add('is-split'));
    syncSheen();
    const ro = new ResizeObserver(syncSheen);
    titleWords.forEach((w) => ro.observe(w));
    cleanups.push(() => ro.disconnect());

    const chars = splitters.flatMap((s) => s.chars as HTMLElement[]);
    const lede = splitText($('[data-lede]', root)!, { words: { class: 'word' } });
    splitters.push(lede);

    // Start states, set synchronously so nothing flashes before its cue.
    utils.set(chars, { opacity: 0, y: '115%' });
    utils.set(lede.words as HTMLElement[], { opacity: 0 });
    utils.set($$('[data-hero="eyebrow"], [data-ctas] > *, [data-trust] li, [data-hud]', root), { opacity: 0 });

    const tl = createTimeline({ defaults: { ease: 'out(4)' } });
    tl.add('[data-hero="eyebrow"]', { opacity: { from: 0, to: 1 }, duration: 800 }, 900)
      .add('[data-scramble]', { innerHTML: scrambleText({ chars: 'uppercase', revealRate: 30, settleDuration: 450, cursor: '✦' }) }, 900)
      .add(
        chars,
        {
          y: { from: '115%', to: '0%' },
          rotate: { from: 12, to: 0 },
          opacity: { from: 0, to: 1 },
          duration: 1500,
          delay: stagger(70, { from: 'first' }),
          ease: 'out(5)',
        },
        1300,
      )
      .add(
        lede.words as HTMLElement[],
        { opacity: { from: 0, to: 1 }, y: { from: 18, to: 0 }, filter: { from: 'blur(8px)', to: 'blur(0px)' }, duration: 1000, delay: stagger(18) },
        2200,
      )
      .add('[data-ctas] > *', { opacity: { from: 0, to: 1 }, y: { from: 26, to: 0 }, scale: { from: 0.94, to: 1 }, duration: 1200, delay: stagger(110), ease: 'outElastic(1, .7)' }, 2900)
      .add('[data-trust] li', { opacity: { from: 0, to: 1 }, x: { from: -10, to: 0 }, duration: 700, delay: stagger(90) }, 3400)
      // Opacity only: a transform here would trap the mobile caption's absolute positioning.
      .add('[data-hud]', { opacity: { from: 0, to: 1 }, duration: 1200 }, 3600);
    anims.push(tl);

    // Endless slow sheen across the title.
    titleWords.forEach((w, i) => {
      const W = w.getBoundingClientRect().width || 400;
      anims.push(
        animate(w, {
          '--sheen-x': { from: '0px', to: `${(-W * 1.5).toFixed(0)}px` },
          duration: 5200,
          delay: 3200 + i * 260,
          loop: true,
          loopDelay: 2600,
          alternate: true,
          ease: 'inOutSine',
        }),
      );
    });
  };

  // ── Magnetic buttons (animatables follow the pointer) ──────────────────
  const magnetics = () => {
    if (ctx.reduced || matchMedia('(pointer: coarse)').matches) return;
    $$('.magnetic', root).forEach((btn) => {
      const a = createAnimatable(btn, { x: 500, y: 500, ease: 'out(3)' });
      const mv = (e: PointerEvent) => {
        const r = btn.getBoundingClientRect();
        a.x!(((e.clientX - r.left) / r.width - 0.5) * 16);
        a.y!(((e.clientY - r.top) / r.height - 0.5) * 12);
      };
      const lv = () => {
        a.x!(0, 900, 'outElastic(1, .4)');
        a.y!(0, 900, 'outElastic(1, .4)');
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

  // ── Scroll choreography (Anime.js ScrollObserver) ──────────────────────
  const scrolly = () => {
    if (ctx.reduced) return;
    // Hero parallax: the copy lifts away and the cosmos dims as you leave.
    anims.push(
      animate($('.hero__inner', root)!, {
        y: { from: 0, to: -120 },
        opacity: { from: 1, to: 0 },
        ease: 'linear',
        // Thresholds read "<container> <target>": from hero top at viewport top
        // until the hero's bottom reaches the viewport top.
        autoplay: onScroll({ target: hero, enter: 'top top', leave: 'top bottom', sync: 0.25 }),
      }),
    );
    anims.push(
      animate('#dim', {
        opacity: { from: 0, to: 0.74 },
        ease: 'linear',
        autoplay: onScroll({ target: hero, enter: 'top top', leave: 'top bottom', sync: 0.3 }),
      }),
    );
    // Reveal blocks once.
    $$('[data-reveal]', root).forEach((n) => {
      anims.push(
        animate(n, {
          opacity: { from: 0, to: 1 },
          y: { from: 50, to: 0 },
          filter: { from: 'blur(10px)', to: 'blur(0px)' },
          duration: 1300,
          ease: 'out(4)',
          autoplay: onScroll({ target: n, enter: 'bottom-=60 top', repeat: false }),
        }),
      );
    });
    // Feature cards: staggered rise + 3D tilt toward the pointer.
    const cards = $$('[data-feature]', root);
    anims.push(
      animate(cards, {
        opacity: { from: 0, to: 1 },
        y: { from: 60, to: 0 },
        rotateX: { from: 18, to: 0 },
        duration: 1300,
        delay: stagger(110, { grid: [3, 2], from: 'first' }),
        ease: 'out(4)',
        autoplay: onScroll({ target: cards[0], enter: 'bottom-=80 top', repeat: false }),
      }),
    );
    cards.forEach((card) => {
      const tilt = createAnimatable(card, { rotateX: 600, rotateY: 600, ease: 'out(3)' });
      const mv = (e: PointerEvent) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
        card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
        tilt.rotateY!((px - 0.5) * 10);
        tilt.rotateX!((0.5 - py) * 8);
      };
      const lv = () => {
        tilt.rotateX!(0, 1000);
        tilt.rotateY!(0, 1000);
      };
      card.addEventListener('pointermove', mv);
      card.addEventListener('pointerleave', lv);
      cleanups.push(() => {
        card.removeEventListener('pointermove', mv);
        card.removeEventListener('pointerleave', lv);
      });
    });
    // The urge wave draws itself as you scroll past it.
    const wave = svg.createDrawable($('[data-wave]', root)!);
    anims.push(
      animate(wave, {
        draw: ['0 0', '0 1'],
        ease: 'linear',
        autoplay: onScroll({ target: $('.wave-card', root)!, enter: 'bottom top+=10%', leave: 'center top+=35%', sync: 0.4 }),
      }),
    );
    anims.push(
      animate(['[data-wave-fill]', '[data-crest]'], {
        opacity: { from: 0, to: 1 },
        ease: 'linear',
        autoplay: onScroll({ target: $('.wave-card', root)!, enter: 'bottom center', leave: 'center center', sync: 0.4 }),
      }),
    );
    // Journey line fills; each beat lights up in turn.
    const vertical = innerWidth <= 860;
    const section = $('[data-journey-section]', root)!;
    anims.push(
      animate('[data-journey-fill]', {
        [vertical ? 'scaleY' : 'scaleX']: { from: 0, to: 1 },
        ease: 'linear',
        autoplay: onScroll({ target: section, enter: 'bottom center', leave: 'center bottom', sync: 0.5 }),
      }),
    );
    anims.push(
      animate('[data-beat]', {
        opacity: { from: 0.25, to: 1 },
        y: { from: 20, to: 0 },
        delay: stagger(140),
        duration: 900,
        ease: 'out(3)',
        autoplay: onScroll({ target: section, enter: 'bottom center', repeat: false }),
      }),
    );
    // Manifesto: words brighten one by one, scrubbed by scroll.
    const manifesto = splitText($('[data-manifesto]', root)!, { words: { class: 'word' } });
    splitters.push(manifesto);
    anims.push(
      animate(manifesto.words as HTMLElement[], {
        opacity: { from: 0.12, to: 1 },
        filter: { from: 'blur(6px)', to: 'blur(0px)' },
        delay: stagger(120),
        duration: 600,
        ease: 'linear',
        autoplay: onScroll({ target: $('[data-manifesto]', root)!, enter: 'bottom-=10% top', leave: 'center center', sync: 0.6 }),
      }),
    );
  };

  // ── Actions ────────────────────────────────────────────────────────────
  const onClick = (e: MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'cinema') {
      setCinema(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      startFilm();
    } else if (action === 'replay') {
      startFilm();
    } else if (action === 'exit') {
      setCinema(false);
    } else if (action === 'sound') {
      const on = sound.toggle();
      t.innerHTML = on ? icons.volume : icons.mute;
      t.classList.toggle('is-on', on);
    }
  };
  root.addEventListener('click', onClick);
  cleanups.push(() => root.removeEventListener('click', onClick));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && cinema) setCinema(false);
  };
  window.addEventListener('keydown', onKey);
  cleanups.push(() => window.removeEventListener('keydown', onKey));

  return {
    el: root,
    preset: 'hero',
    enter() {
      const sBtn = $('[data-action="sound"]', root);
      if (sBtn && sound.enabled) {
        sBtn.innerHTML = icons.volume;
        sBtn.classList.add('is-on');
      }
      // Reset the dim layer first: the scroll-linked dim below must be the
      // last animation on it, or Anime.js' replace composition would cancel it.
      ctx.cosmos.setVeil(0, 0);
      intro();
      magnetics();
      scrolly();
      cleanups.push(ctx.cosmos.enableDrag(hero));
      if (ctx.reduced) ctx.cosmos.still(0.6);
      else startFilm();
      frameScene(false, 10);
      const onResize = () => frameScene(cinema, 600);
      window.addEventListener('resize', onResize);
      cleanups.push(() => window.removeEventListener('resize', onResize));
    },
    destroy() {
      document.documentElement.classList.remove('is-cinema');
      const scene = ctx.cosmos.scene;
      ctx.cosmos.labelFloor = Infinity;
      ctx.cosmos.labelCeiling = 0;
      ctx.cosmos.labelSafeLeft = 0;
      if (scene) animate(scene.user, { zoom: 1, duration: 1200, ease: 'inOut(3)' });
      cleanups.forEach((c) => c());
      anims.forEach((a) => ('revert' in a ? a.revert() : a.pause()));
      splitters.forEach((s) => s.revert());
      captionSplit?.revert();
      window.clearTimeout(captionTimer);
    },
  };
}
