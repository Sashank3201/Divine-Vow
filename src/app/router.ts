/**
 * Hash router with Anime.js page transitions. Each navigation blurs the
 * old view away, mounts the new one, staggers its [data-anim] children in
 * and glides the cosmos to the view's camera preset.
 */

import { animate, stagger } from 'animejs';
import type { AppContext, View, ViewFactory } from './types';
import { store } from '../core/store';
import { simTimeForDays, streakMs, DAY } from '../core/journey';
import { $$ } from '../ui/dom';

export interface Route {
  path: string;
  title: string;
  view: ViewFactory;
  /** App screens show the tab bar and require a vow. */
  app: boolean;
  requiresVow?: boolean;
}

type Listener = (route: Route) => void;

export class Router {
  private routes = new Map<string, Route>();
  private view: View | null = null;
  private token = 0;
  private listeners = new Set<Listener>();
  current: Route | null = null;
  ctx!: AppContext;

  constructor(
    routes: Route[],
    private readonly outlet: HTMLElement,
  ) {
    routes.forEach((r) => this.routes.set(r.path, r));
  }

  start(ctx: AppContext): void {
    this.ctx = ctx;
    window.addEventListener('hashchange', () => this.resolve());
    this.resolve();
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  go(path: string, replace = false): void {
    const hash = `#${path}`;
    if (location.hash === hash) {
      this.resolve();
      return;
    }
    if (replace) {
      history.replaceState(null, '', hash);
      this.resolve();
    } else {
      location.hash = hash;
    }
  }

  private parse(): { path: string; params: URLSearchParams } {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [p, q] = raw.split('?');
    return { path: p || '/', params: new URLSearchParams(q ?? '') };
  }

  private async resolve(): Promise<void> {
    const { path, params } = this.parse();
    const hasVow = !!store.get().vow;
    if (path === '/' || path === '') {
      this.go(hasVow ? '/sanctuary' : '/welcome', true);
      return;
    }
    const route = this.routes.get(path);
    if (!route) {
      this.go('/', true);
      return;
    }
    if (route.requiresVow && !hasVow) {
      this.go('/vow', true);
      return;
    }
    await this.render(route, params);
  }

  private async render(route: Route, params: URLSearchParams): Promise<void> {
    const token = ++this.token;
    const ctx = this.ctx;
    const old = this.view;
    if (old) {
      if (!ctx.reduced) {
        await animate(old.el, {
          opacity: 0,
          y: -14,
          filter: 'blur(10px)',
          duration: 340,
          ease: 'in(2)',
        }).then();
      }
      old.destroy?.();
      old.el.remove();
    }
    if (token !== this.token) return;

    this.current = route;
    document.title = route.path === '/welcome' ? 'Divine Vow' : `${route.title} · Divine Vow`;
    document.documentElement.dataset.route = route.path.slice(1);
    document.documentElement.classList.toggle('is-app', route.app);
    this.listeners.forEach((l) => l(route));

    const view = route.view(ctx, params);
    this.view = view;
    this.outlet.appendChild(view.el);
    window.scrollTo(0, 0);

    const preset = view.preset ?? 'calm';
    if (preset !== 'hero' && preset !== 'none') {
      const days = streakMs() / DAY;
      const target = preset === 'vow' ? 0.4 : simTimeForDays(days);
      ctx.cosmos.journey(target, preset, { shiftY: preset === 'sanctuary' ? -0.18 : 0 });
      ctx.cosmos.setVeil(preset === 'sos' ? 0.35 : preset === 'sanctuary' || preset === 'vow' ? 0.12 : 0.32);
    }

    view.enter?.();

    if (!ctx.reduced) {
      const items = $$('[data-anim]', view.el);
      animate(view.el, { opacity: { from: 0, to: 1 }, duration: 500, ease: 'out(2)' });
      if (items.length) {
        animate(items, {
          opacity: { from: 0, to: 1 },
          y: { from: 28, to: 0 },
          filter: { from: 'blur(8px)', to: 'blur(0px)' },
          duration: 900,
          delay: stagger(70, { start: 80 }),
          ease: 'out(4)',
        });
      }
    }
  }
}
