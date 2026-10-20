/**
 * Hash router. Views are full-screen layers over the cosmos; each can bring
 * its own exit animation (sheets shrink back into the button that opened
 * them), otherwise the old view blurs away and the new one fades in.
 */

import { animate, stagger } from 'animejs';
import type { AppContext, View, ViewFactory } from './types';
import { store } from '../core/store';
import { mainDays, simTimeForDays } from '../core/journey';
import { $$ } from '../ui/dom';

export interface Route {
  path: string;
  title: string;
  view: ViewFactory;
  requiresVow?: boolean;
}

type Listener = (route: Route) => void;

export class Router {
  private routes = new Map<string, Route>();
  private view: View | null = null;
  private token = 0;
  private listeners = new Set<Listener>();
  private history: string[] = [];
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
    window.addEventListener('hashchange', () => void this.resolve());
    void this.resolve();
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  go(path: string, replace = false): void {
    const hash = `#${path}`;
    if (location.hash === hash) {
      void this.resolve();
      return;
    }
    if (replace) {
      history.replaceState(null, '', hash);
      void this.resolve();
    } else {
      location.hash = hash;
    }
  }

  /** Back to the previous in-app screen, or home. */
  back(fallback = '/home'): void {
    const prev = this.history[this.history.length - 2];
    if (prev) history.back();
    else this.go(fallback);
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
      this.go(hasVow ? '/home' : '/welcome', true);
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
    if (this.history[this.history.length - 2] === path) this.history.pop();
    else this.history.push(path);
    await this.render(route, params);
  }

  private async render(route: Route, params: URLSearchParams): Promise<void> {
    const token = ++this.token;
    const ctx = this.ctx;
    const old = this.view;
    if (old) {
      if (old.leave && !ctx.reduced) await old.leave(route.path);
      else if (!ctx.reduced) {
        await animate(old.el, { opacity: 0, filter: 'blur(8px)', duration: 300, ease: 'in(2)' }).then();
      }
      old.destroy?.();
      old.el.remove();
    }
    if (token !== this.token) return;

    this.current = route;
    document.title = route.path === '/welcome' ? 'Divine Vow' : `${route.title} · Divine Vow`;
    document.documentElement.dataset.route = route.path.slice(1);
    this.listeners.forEach((l) => l(route));

    const view = route.view(ctx, params);
    this.view = view;
    this.outlet.appendChild(view.el);

    const preset = view.preset ?? 'calm';
    if (preset !== 'hero' && preset !== 'none') {
      const target = preset === 'vow' ? 0.4 : simTimeForDays(mainDays());
      ctx.cosmos.journey(target, preset, { shiftY: view.shiftY ?? 0 });
    }

    view.enter?.();

    if (!ctx.reduced) {
      const items = $$('[data-anim]', view.el);
      if (items.length) {
        animate(items, {
          opacity: { from: 0, to: 1 },
          y: { from: 18, to: 0 },
          duration: 700,
          delay: stagger(50, { start: 60 }),
          ease: 'out(4)',
        });
      }
    }
  }
}
