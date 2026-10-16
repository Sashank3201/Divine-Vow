/** Top bar, tab bar and global chrome. */

import { animate, spring } from 'animejs';
import type { AppContext } from './types';
import type { Router } from './router';
import { brandMark, icons } from '../ui/icons';
import { $, $$, el } from '../ui/dom';
import { canInstall, onInstallChange, promptInstall } from './pwa';

const TABS = [
  { path: '/sanctuary', label: 'Sanctuary', icon: icons.temple },
  { path: '/journal', label: 'Journal', icon: icons.book },
  { path: '/sos', label: 'SOS', icon: icons.lifebuoy, sos: true },
  { path: '/sky', label: 'Sky', icon: icons.constellation },
  { path: '/insights', label: 'Insights', icon: icons.chart },
];

export function mountShell(router: Router, _ctx: AppContext): void {
  const app = document.getElementById('app')!;

  const topbar = el(`
    <header class="topbar">
      <a class="brand" href="#/" aria-label="Divine Vow home">${brandMark}<span>Divine Vow</span></a>
      <nav class="topbar__links" aria-label="Primary">
        ${TABS.filter((t) => !t.sos)
          .map((t) => `<a class="topbar__link" href="#${t.path}" data-path="${t.path}">${t.label}</a>`)
          .join('')}
      </nav>
      <span class="spacer"></span>
      <button class="btn btn--ghost btn--sm" type="button" data-install hidden>${icons.install}<span>Install</span></button>
      <a class="btn btn--primary btn--sm topbar__sos" href="#/sos" data-app-only>${icons.lifebuoy}<span>I feel the pull</span></a>
      <a class="icon-btn" href="#/settings" aria-label="Settings" title="Settings" data-app-only data-path="/settings">${icons.gear}</a>
    </header>
  `);

  const tabbar = el(`
    <nav class="tabbar" aria-label="App">
      ${TABS.map((t) =>
        t.sos
          ? `<a class="tab tab--sos" href="#${t.path}" data-path="${t.path}" aria-label="I feel the pull"><span class="tab__orb">${t.icon}</span></a>`
          : `<a class="tab" href="#${t.path}" data-path="${t.path}"><span class="tab__glow"></span>${t.icon}<span>${t.label}</span></a>`,
      ).join('')}
    </nav>
  `);

  app.prepend(topbar);
  app.appendChild(tabbar);

  // Install button follows the browser's install prompt availability.
  const installBtn = $('[data-install]', topbar)!;
  const syncInstall = () => {
    installBtn.hidden = !canInstall();
  };
  onInstallChange(syncInstall);
  syncInstall();
  installBtn.addEventListener('click', () => void promptInstall());

  const links = topbar.querySelector('.topbar__links')!;
  const appOnly = $$('[data-app-only]', topbar);
  const sosTop = $('.topbar__sos', topbar)!;

  router.onChange((route) => {
    const isApp = route.app;
    tabbar.style.display = isApp ? '' : 'none';
    links.classList.toggle('is-app', isApp);
    appOnly.forEach((n) => (n.style.display = isApp ? '' : 'none'));
    sosTop.style.display = isApp && route.path !== '/sos' && innerWidth >= 980 ? '' : 'none';
    topbar.classList.toggle('is-solid', isApp && window.scrollY > 10);
    $$('[data-path]', document).forEach((a) => {
      const on = a.dataset.path === route.path;
      a.classList.toggle('is-active', on);
      if (on && a.classList.contains('tab') && !a.classList.contains('tab--sos')) {
        animate(a.querySelector('svg')!, {
          scale: [{ to: 1.25, duration: 160, ease: 'out(2)' }, { to: 1, ease: spring({ stiffness: 300, damping: 12 }) }],
        });
      }
    });
  });

  window.addEventListener(
    'scroll',
    () => {
      const isApp = document.documentElement.classList.contains('is-app');
      topbar.classList.toggle('is-solid', window.scrollY > (isApp ? 10 : innerHeight * 0.7));
    },
    { passive: true },
  );

  // The SOS orb breathes gently so it is always easy to find.
  const orb = $('.tab__orb', tabbar);
  if (orb && !_ctx.reduced) {
    animate(orb, {
      boxShadow: [
        '0 0 0 6px rgba(10,11,27,0.9), 0 0 22px rgba(244,201,124,0.45)',
        '0 0 0 6px rgba(10,11,27,0.9), 0 0 42px rgba(244,201,124,0.85)',
      ],
      duration: 2600,
      loop: true,
      alternate: true,
      ease: 'inOutSine',
    });
  }
}
