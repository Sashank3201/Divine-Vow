/** Tiny DOM helpers — no framework, just typed conveniences. */

import { store } from '../core/store';

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel as never) as T | null;

export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll<T>(sel as never)) as T[];

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape user-provided text before interpolating it into markup. */
export const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]!);

/** Parse a markup string into a single element. */
export function el<T extends HTMLElement = HTMLElement>(markup: string): T {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as T;
}

/** Delegated event listener; returns a disposer. */
export function on<K extends keyof HTMLElementEventMap>(
  root: HTMLElement | Document | Window,
  type: K,
  selector: string | null,
  handler: (e: HTMLElementEventMap[K], target: HTMLElement) => void,
  opts?: AddEventListenerOptions,
): () => void {
  const fn = (e: Event) => {
    if (!selector) {
      handler(e as HTMLElementEventMap[K], e.currentTarget as HTMLElement);
      return;
    }
    const t = (e.target as Element | null)?.closest?.(selector) as HTMLElement | null;
    if (t && (root as Node).contains?.(t) !== false) handler(e as HTMLElementEventMap[K], t);
  };
  root.addEventListener(type, fn as EventListener, opts);
  return () => root.removeEventListener(type, fn as EventListener, opts);
}

export function vibrate(pattern: number | number[]): void {
  if (!store.get().settings.haptics) return;
  // Browsers ignore (and warn about) vibration before the first user gesture.
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (activation && !activation.hasBeenActive) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

export const prefersReducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function relativeDay(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function timeOfDay(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
