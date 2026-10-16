/** Toasts and modal sheets, animated with Anime.js springs. */

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
  const t = el(`<div class="toast" role="status">${opts.icon ?? icons.sparkle}<span>${esc(message)}</span>${
    opts.action ? `<button class="toast__action" type="button">${esc(opts.action.label)}</button>` : ''
  }</div>`);
  host.appendChild(t);
  const close = () => {
    animate(t, { opacity: 0, y: -16, scale: 0.96, duration: 380, ease: 'in(2)', onComplete: () => t.remove() });
  };
  t.querySelector('.toast__action')?.addEventListener('click', () => {
    opts.action?.run();
    close();
  });
  animate(t, {
    opacity: { from: 0, to: 1 },
    y: { from: -24, to: 0 },
    scale: { from: 0.92, to: 1 },
    ease: spring({ stiffness: 220, damping: 18 }),
  });
  window.setTimeout(close, opts.duration ?? 3800);
}

export interface ModalHandle {
  root: HTMLElement;
  body: HTMLElement;
  close(): Promise<void>;
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function openModal(markup: string, opts: { onClose?: () => void; label?: string } = {}): ModalHandle {
  const host = document.getElementById('modal-root') ?? document.body;
  const backdrop = el(`<div class="modal-backdrop" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(opts.label ?? 'Dialog')}">
      <div class="modal__grip"></div>
      <div class="modal__body">${markup}</div>
    </div>
  </div>`);
  const sheet = backdrop.querySelector<HTMLElement>('.modal')!;
  const body = backdrop.querySelector<HTMLElement>('.modal__body')!;
  host.appendChild(backdrop);
  const wide = innerWidth >= 720;
  animate(backdrop, { opacity: { from: 0, to: 1 }, duration: 300, ease: 'out(2)' });
  animate(sheet, {
    y: { from: wide ? 30 : '100%', to: 0 },
    scale: wide ? { from: 0.96, to: 1 } : 1,
    opacity: { from: wide ? 0 : 1, to: 1 },
    ease: spring({ stiffness: 170, damping: 22 }),
  });

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    animate(sheet, { y: wide ? 20 : '100%', opacity: wide ? 0 : 1, duration: 320, ease: 'in(3)' });
    await animate(backdrop, { opacity: 0, duration: 340, ease: 'in(2)' }).then();
    backdrop.remove();
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') void close();
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) void close();
  });
  body.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-close]')) void close();
  });
  window.setTimeout(() => body.querySelector<HTMLElement>('[autofocus]')?.focus(), 60);
  return { root: backdrop, body, close };
}

export function confirmDialog(opts: {
  title: string;
  text: string;
  confirm: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal(
      `<div class="stack" style="--gap:18px">
        <h3 class="h2" style="font-size:26px">${esc(opts.title)}</h3>
        <p class="muted">${esc(opts.text)}</p>
        <div class="row" style="justify-content:flex-end;margin-top:8px">
          <button class="btn btn--quiet" type="button" data-close>Cancel</button>
          <button class="btn ${opts.danger ? 'btn--danger' : 'btn--primary'}" type="button" data-ok>${esc(opts.confirm)}</button>
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
