import '@fontsource-variable/inter';
import '@fontsource-variable/cinzel';
import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import './styles/base.css';
import './styles/components.css';
import './styles/hero.css';
import './styles/views.css';

import { animate, engine } from 'animejs';
import { Cosmos } from './app/cosmos';
import { Router, type Route } from './app/router';
import { mountShell } from './app/shell';
import { initPWA } from './app/pwa';
import type { AppContext } from './app/types';
import { store } from './core/store';
import { syncMilestones } from './core/journey';
import { landingView } from './views/landing';
import { vowView } from './views/vow';
import { sanctuaryView } from './views/sanctuary';
import { sosView } from './views/sos';
import { journalView } from './views/journal';
import { skyView } from './views/sky';
import { insightsView } from './views/insights';
import { settingsView } from './views/settings';
import { requireUnlock } from './views/lock';
import { celebrate } from './ui/celebrate';
import { sound } from './ui/sound';
import type { Quality } from './galaxy/scene';

const routes: Route[] = [
  { path: '/welcome', title: 'Welcome', view: landingView, app: false },
  { path: '/vow', title: 'Your vow', view: vowView, app: false },
  { path: '/sanctuary', title: 'Sanctuary', view: sanctuaryView, app: true, requiresVow: true },
  { path: '/sos', title: 'I feel the pull', view: sosView, app: true },
  { path: '/journal', title: 'Journal', view: journalView, app: true, requiresVow: true },
  { path: '/sky', title: 'Your sky', view: skyView, app: true, requiresVow: true },
  { path: '/insights', title: 'Insights', view: insightsView, app: true, requiresVow: true },
  { path: '/settings', title: 'Settings', view: settingsView, app: true },
];

function motionReduced(): boolean {
  const pref = store.get().settings.motion;
  if (pref === 'reduced') return true;
  if (pref === 'full') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

async function boot(): Promise<void> {
  const reduced = motionReduced();
  document.documentElement.classList.toggle('no-motion', reduced);
  const qPref = store.get().settings.quality;
  const quality: Quality | undefined = qPref === 'auto' ? undefined : qPref;

  const canvas = document.getElementById('cosmos') as HTMLCanvasElement;
  const cosmos = new Cosmos(canvas, quality, reduced);
  const router = new Router(routes, document.getElementById('view')!);
  const ctx: AppContext = { cosmos, router, reduced };
  if (import.meta.env.DEV) Object.assign(window, { __ctx: ctx });

  // Reveal the cosmos from behind the boot screen.
  const bootEl = document.getElementById('boot');
  if (bootEl) {
    bootEl.classList.add('is-done');
    window.setTimeout(() => bootEl.remove(), 1000);
  }

  await requireUnlock(ctx);

  mountShell(router, ctx);
  router.start(ctx);
  initPWA();

  // Celebrate milestones as they are crossed, even while the app is open.
  const checkMilestones = () => {
    const fresh = syncMilestones();
    if (fresh.length) celebrate(fresh[fresh.length - 1]!, ctx);
  };
  window.setTimeout(checkMilestones, 1500);
  window.setInterval(checkMilestones, 20_000);

  // Audio may only start after a gesture.
  window.addEventListener('pointerdown', () => sound.resume(), { once: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cosmos.pause();
    else {
      cosmos.resume();
      checkMilestones();
    }
  });

  // Anime.js engine: keep running in the background tab only as long as it is visible.
  engine.pauseOnDocumentHidden = true;
  animate('#app', { opacity: { from: 0, to: 1 }, duration: 900, ease: 'out(2)' });
}

void boot();
