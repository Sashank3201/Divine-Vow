import '@fontsource-variable/inter';
import './styles/base.css';
import './styles/ui.css';
import './styles/screens.css';

import { animate, engine } from 'animejs';
import { Cosmos } from './app/cosmos';
import { Router, type Route } from './app/router';
import { initPWA } from './app/pwa';
import type { AppContext } from './app/types';
import { store } from './core/store';
import { syncMilestones } from './core/journey';
import { welcomeView } from './views/welcome';
import { vowView } from './views/vow';
import { homeView } from './views/home';
import { dashboardView } from './views/dashboard';
import { sosView } from './views/sos';
import { journalView } from './views/journal';
import { settingsView } from './views/settings';
import { requireUnlock } from './views/lock';
import { celebrate } from './ui/celebrate';
import { rememberOrigin } from './ui/morph';
import type { Quality } from './galaxy/scene';

const routes: Route[] = [
  { path: '/welcome', title: 'Welcome', view: welcomeView },
  { path: '/vow', title: 'Take the vow', view: vowView },
  { path: '/home', title: 'Home', view: homeView, requiresVow: true },
  { path: '/dashboard', title: 'Dashboard', view: dashboardView, requiresVow: true },
  { path: '/sos', title: 'Urge', view: sosView },
  { path: '/journal', title: 'Journal', view: journalView, requiresVow: true },
  { path: '/settings', title: 'Settings', view: settingsView },
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

  const bootEl = document.getElementById('boot');
  if (bootEl) animate(bootEl, { opacity: 0, duration: reduced ? 1 : 800, ease: 'out(2)', onComplete: () => bootEl.remove() });

  // Sheets grow out of the control that opened them.
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-morph]');
    if (t) rememberOrigin(t);
  }, true);

  await requireUnlock(ctx);
  router.start(ctx);
  initPWA();

  // Celebrate milestones as they are crossed, even while the app is open.
  const checkMilestones = () => {
    const fresh = syncMilestones();
    if (fresh.length) celebrate(fresh[fresh.length - 1]!, ctx);
  };
  window.setTimeout(checkMilestones, 1500);
  window.setInterval(checkMilestones, 20_000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cosmos.pause();
    else {
      cosmos.resume();
      checkMilestones();
    }
  });

  engine.pauseOnDocumentHidden = true;
}

void boot();
