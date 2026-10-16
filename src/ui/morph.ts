/**
 * Liquid morphs: a sheet grows out of the button that opened it and
 * shrinks back into it on close. Geometry (not transforms) is animated, so
 * the GPU glass — which reads each element's live rectangle and radius —
 * stretches like liquid, corner radius and all.
 */

import { animate, createTimeline, spring } from 'animejs';

interface Origin {
  rect: DOMRect;
  radius: number;
  /** Route the control lives on, so the sheet only melts back there. */
  path: string;
}

let origin: Origin | null = null;

const radiusOf = (el: Element, r: DOMRect) =>
  Math.min(Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, r.height / 2, r.width / 2);

/** Call on the control that opens a sheet. */
export function rememberOrigin(el: Element): void {
  const rect = el.getBoundingClientRect();
  origin = { rect, radius: radiusOf(el, rect), path: (location.hash.replace(/^#/, '') || '/').split('?')[0]! };
}

export function takeOrigin(): Origin | null {
  const o = origin;
  origin = null;
  return o;
}

const GEOMETRY = ['position', 'left', 'top', 'right', 'bottom', 'width', 'height', 'margin', 'borderRadius'] as const;

function freeze(sheet: HTMLElement, r: DOMRect, radius: number): void {
  Object.assign(sheet.style, {
    position: 'fixed',
    left: `${r.left}px`,
    top: `${r.top}px`,
    right: 'auto',
    bottom: 'auto',
    width: `${r.width}px`,
    height: `${r.height}px`,
    margin: '0',
    borderRadius: `${radius}px`,
  });
}

function release(sheet: HTMLElement): void {
  GEOMETRY.forEach((k) => (sheet.style[k] = ''));
}

export async function morphOpen(sheet: HTMLElement, inner: HTMLElement, from: Origin | null, reduced: boolean): Promise<void> {
  if (reduced) return;
  if (!from) {
    inner.style.opacity = '0';
    animate(sheet, { opacity: { from: 0, to: 1 }, scale: { from: 0.96, to: 1 }, duration: 500, ease: 'out(3)' });
    await animate(inner, { opacity: 1, duration: 420, delay: 120, ease: 'out(2)' }).then();
    sheet.style.transform = '';
    return;
  }
  const to = sheet.getBoundingClientRect();
  const finalRadius = radiusOf(sheet, to);
  freeze(sheet, from.rect, from.radius);
  inner.style.opacity = '0';
  const tl = createTimeline();
  tl.add(
    sheet,
    {
      left: to.left,
      top: to.top,
      width: to.width,
      height: to.height,
      borderRadius: finalRadius,
      ease: spring({ bounce: 0.16, duration: 640 }),
    },
    0,
  ).add(inner, { opacity: 1, y: { from: 14, to: 0 }, duration: 420, ease: 'out(3)' }, 340);
  await tl.then();
  release(sheet);
}

export async function morphClose(sheet: HTMLElement, inner: HTMLElement, to: Origin | null, reduced: boolean): Promise<void> {
  if (reduced) return;
  if (!to) {
    await animate(sheet, { opacity: 0, scale: 0.96, duration: 320, ease: 'in(2)' }).then();
    return;
  }
  const from = sheet.getBoundingClientRect();
  freeze(sheet, from, radiusOf(sheet, from));
  const tl = createTimeline();
  tl.add(inner, { opacity: 0, duration: 160, ease: 'in(2)' }, 0)
    .add(
      sheet,
      {
        left: to.rect.left,
        top: to.rect.top,
        width: to.rect.width,
        height: to.rect.height,
        borderRadius: to.radius,
        duration: 460,
        ease: 'inOut(3)',
      },
      60,
    )
    .add(sheet, { opacity: 0, duration: 160, ease: 'in(2)' }, 400);
  await tl.then();
}
