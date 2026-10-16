/**
 * Toasts and modal sheets — both are liquid glass. While a modal is open the
 * screen behind it fades away, so nothing shows through the glass except
 * the galaxy.
 */

import { animate, spring } from 'animejs';
import { icons } from './icons';
import { el, esc } from './dom';

export interface ToastOptions {
  icon?: string;
  action?: { label: string; run: () => void };
  duration?: number;
}

export function toast(message: string, opts: ToastOptions = {}): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = el(`<div class="toast" data-glass="control" role="status">${opts.icon ?? ''}<span>${esc(message)}</span>${
    opts.action ? `<button class="toast__action" type="button">${esc(opts.action.label)}</button>` : ''
  }</div>`);
  t.querySelector('svg')?.setAttribute('width', '18');
  host.appendChild(t);
  const close = () => {
    animate(t, { opacity: 0, y: -12, scale: 0.94, duration: 320, ease: 'in(2)', onComplete: () => t.remove() });
  };
  t.querySelector('.toast__action')?.addEventListener('click', () => {
    opts.action?.run();
    close();
  });
  animate(t, {
    opacity: { from: 0, to: 1 },
    y: { from: -20, to: 0 },
    scale: { from: 0.86, to: 1 },
    ease: spring({ bounce: 0.3, duration: 520 }),
  });
  window.setTimeout(close, opts.duration ?? 3200);
}

export interface ModalHandle {
  root: HTMLElement;
  body: HTMLElement;
  close(): Promise<void>;
}

let openCount = 0;

function dimView(on: boolean): void {
  const view = document.getElementById('view');
  if (view) animate(view, { opacity: on ? 0 : 1, duration: on ? 260 : 380, ease: 'out(2)' });
}

export function openModal(markup: string, opts: { onClose?: () => void; label?: string; dismissable?: boolean } = {}): ModalHandle {
  const host = document.getElementById('modal-root') ?? document.body;
  const layer = el(`<div class="modal-layer" role="presentation">
    <div class="modal" data-glass="sheet" role="dialog" aria-modal="true" aria-label="${esc(opts.label ?? 'Dialog')}">
      <div class="modal__body">${markup}</div>
    </div>
  </div>`);
  const sheet = layer.querySelector<HTMLElement>('.modal')!;
  const body = layer.querySelector<HTMLElement>('.modal__body')!;
  host.appendChild(layer);
  if (openCount++ === 0) dimView(true);
  animate(sheet, {
    opacity: { from: 0, to: 1 },
    y: { from: 40, to: 0 },
    scale: { from: 0.92, to: 1 },
    ease: spring({ bounce: 0.2, duration: 560 }),
  });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    await animate(sheet, { opacity: 0, y: 24, scale: 0.95, duration: 260, ease: 'in(2)' }).then();
    layer.remove();
    if (--openCount === 0) dimView(false);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.dismissable !== false) void close();
  };
  document.addEventListener('keydown', onKey);
  layer.addEventListener('click', (e) => {
    if (e.target === layer && opts.dismissable !== false) void close();
  });
  body.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-close]')) void close();
  });
  window.setTimeout(() => body.querySelector<HTMLElement>('[autofocus]')?.focus(), 80);
  return { root: layer, body, close };
}

export function confirmDialog(opts: { title: string; text: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal(
      `<div class="stack" style="--gap:10px">
        <h3 class="t-title">${esc(opts.title)}</h3>
        <p class="t-sub">${esc(opts.text)}</p>
        <div class="stack" style="--gap:8px;margin-top:14px">
          <button class="btn ${opts.danger ? 'btn--fill btn--danger' : 'btn--accent'} btn--block" type="button" data-ok>${esc(opts.confirm)}</button>
          <button class="btn btn--fill btn--block" type="button" data-close>Cancel</button>
        </div>
      </div>`,
      {
        label: opts.title,
        onClose: () => {
          if (!answered) resolve(false);
        },
      },
    );
    m.body.querySelector('[data-ok]')!.addEventListener('click', () => {
      answered = true;
      resolve(true);
      void m.close();
    });
  });
}

export const closeIcon = icons.close;
