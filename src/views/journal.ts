/** Journal — notes, urges and restarts in one timeline, in one sheet. */

import { animate, stagger } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store, uid, type Mood } from '../core/store';
import { humanDuration } from '../core/journey';
import { JOURNAL_PROMPTS, MOODS, dailyPick } from '../core/content';
import { icons } from '../ui/icons';
import { $, $$, esc, relativeDay, timeOfDay } from '../ui/dom';
import { confirmDialog, openModal, toast } from '../ui/overlay';
import { sound } from '../ui/sound';
import { createSheet } from './sheet';

type Filter = 'all' | 'notes' | 'urges' | 'restarts';

interface Item {
  at: number;
  html: string;
}

const TAGS = ['Win', 'Trigger', 'Lesson', 'Gratitude', 'Hard day'];

const entry = (o: { icon: string; tone?: 'accent' | 'muted'; title: string; text?: string; meta: string; open?: string }) => {
  const tag = o.open ? 'button' : 'div';
  return `<${tag} class="entry ${o.open ? 'entry--button' : ''}" ${o.open ? `type="button" data-open="${o.open}"` : ''}>
    <span class="entry__icon ${o.tone ? `entry__icon--${o.tone}` : ''}">${o.icon}</span>
    <span class="entry__body">
      <span class="entry__title">${o.title}</span>
      ${o.text ? `<span class="entry__text">${o.text}</span>` : ''}
      <span class="entry__meta">${o.meta}</span>
    </span>
    ${o.open ? `<span class="entry__chev">${icons.chevron}</span>` : ''}
  </${tag}>`;
};

export function journalView(ctx: AppContext): View {
  let filter: Filter = 'all';
  const sheet = createSheet(ctx, {
    title: 'Journal',
    sub: dailyPick(JOURNAL_PROMPTS),
    size: 'narrow',
    actions: `<button class="btn btn--accent btn--sm" type="button" data-new>${icons.plus}New</button>`,
    body: `
      <div class="segmented journal__filter" role="tablist" aria-label="Filter">
        <button type="button" class="is-on" data-filter="all">All</button>
        <button type="button" data-filter="notes">Notes</button>
        <button type="button" data-filter="urges">Urges</button>
        <button type="button" data-filter="restarts">Restarts</button>
      </div>
      <div class="journal__list" data-list></div>`,
  });
  const list = $('[data-list]', sheet.body)!;

  const items = (): Item[] => {
    const s = store.get();
    const out: Item[] = [];
    if (filter === 'all' || filter === 'notes') {
      for (const j of s.journal) {
        const mood = MOODS.find((x) => x.value === j.mood)?.label ?? '';
        out.push({
          at: j.at,
          html: entry({
            icon: icons.feather,
            title: esc(j.title || 'Note'),
            text: j.text ? esc(j.text) : undefined,
            meta: [timeOfDay(j.at), mood, ...j.tags].map(esc).join(' · '),
            open: j.id,
          }),
        });
      }
    }
    if (filter === 'all' || filter === 'urges') {
      for (const u of s.urges) {
        const won = u.outcome === 'won';
        out.push({
          at: u.at,
          html: entry({
            icon: won ? icons.check : icons.wave,
            tone: won ? 'accent' : 'muted',
            title: won ? 'Urge beaten' : 'Urge · slipped',
            meta: [timeOfDay(u.at), `Strength ${u.intensity}/10`, `${Math.max(1, Math.round(u.durationSec / 60))} min`, u.trigger].filter(Boolean).map(esc).join(' · '),
          }),
        });
      }
    }
    if (filter === 'all' || filter === 'restarts') {
      for (const r of s.relapses) {
        out.push({
          at: r.at,
          html: entry({
            icon: icons.replay,
            tone: 'muted',
            title: 'New streak',
            text: r.note ? esc(r.note) : undefined,
            meta: [timeOfDay(r.at), `After ${humanDuration(r.streakMs)}`, r.trigger].filter(Boolean).map(esc).join(' · '),
          }),
        });
      }
    }
    return out.sort((a, b) => b.at - a.at);
  };

  const render = (animated = false) => {
    const all = items();
    if (!all.length) {
      list.innerHTML = `<div class="empty">
        <p class="t-headline">${filter === 'all' || filter === 'notes' ? 'No entries yet.' : 'Nothing here yet.'}</p>
        <p class="t-sub">Notes, urges and restarts show up here.</p>
        ${filter === 'all' || filter === 'notes' ? '<button class="btn btn--fill btn--sm" type="button" data-new style="margin-top:16px">Write one</button>' : ''}
      </div>`;
    } else {
      const days = new Map<string, string[]>();
      for (const it of all) {
        const d = relativeDay(it.at);
        if (!days.has(d)) days.set(d, []);
        days.get(d)!.push(it.html);
      }
      list.innerHTML = [...days.entries()]
        .map(([d, rows]) => `<section class="journal__day"><p class="journal__date">${esc(d)}</p><div class="group group--flush">${rows.join('')}</div></section>`)
        .join('');
    }
    if (animated && !ctx.reduced) {
      animate(list.children, { opacity: { from: 0, to: 1 }, y: { from: 10, to: 0 }, delay: stagger(40), duration: 420, ease: 'out(3)' });
    }
  };

  const editor = (existingId?: string) => {
    const j = existingId ? store.get().journal.find((x) => x.id === existingId) : undefined;
    let mood: Mood = j?.mood ?? 3;
    const tags = new Set(j?.tags ?? []);
    const m = openModal(
      `<div class="stack" style="--gap:14px">
        <h3 class="t-title">${j ? 'Edit entry' : 'New entry'}</h3>
        <div class="segmented" role="radiogroup" aria-label="Mood">
          ${MOODS.map((x) => `<button type="button" data-mood="${x.value}" class="${x.value === mood ? 'is-on' : ''}">${x.label}</button>`).join('')}
        </div>
        <input class="input" data-title placeholder="Title (optional)" maxlength="80" value="${esc(j?.title ?? '')}" />
        <textarea class="textarea" data-text rows="6" placeholder="${esc(dailyPick(JOURNAL_PROMPTS, 2))}" autofocus>${esc(j?.text ?? '')}</textarea>
        <div class="chips">${TAGS.map((t) => `<button class="chip ${tags.has(t) ? 'is-on' : ''}" type="button" data-tag="${t}">${t}</button>`).join('')}</div>
        <div class="inline" style="margin-top:6px">
          ${j ? `<button class="btn btn--plain btn--danger" type="button" data-delete>Delete</button>` : ''}
          <span class="spacer"></span>
          <button class="btn btn--fill" type="button" data-close>Cancel</button>
          <button class="btn btn--accent" type="button" data-save>Save</button>
        </div>
      </div>`,
      { label: 'Journal entry' },
    );
    m.body.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      if (b.dataset.mood) {
        mood = Number(b.dataset.mood) as Mood;
        $$('[data-mood]', m.body).forEach((x) => x.classList.toggle('is-on', x === b));
      } else if (b.dataset.tag) {
        const t = b.dataset.tag;
        if (tags.has(t)) tags.delete(t);
        else tags.add(t);
        b.classList.toggle('is-on', tags.has(t));
      } else if (b.hasAttribute('data-save')) {
        const title = $<HTMLInputElement>('[data-title]', m.body)!.value.trim();
        const text = $<HTMLTextAreaElement>('[data-text]', m.body)!.value.trim();
        if (!title && !text) {
          animate($('[data-text]', m.body)!, { x: [0, -8, 8, -4, 4, 0], duration: 380 });
          return;
        }
        store.update((st) => {
          const e2 = j && st.journal.find((x) => x.id === j.id);
          if (e2) Object.assign(e2, { title, text, mood, tags: [...tags] });
          else st.journal.push({ id: uid(), at: Date.now(), title, text, mood, tags: [...tags] });
        });
        sound.chime(mood + 1);
        void m.close();
        render(true);
        toast(j ? 'Entry updated.' : 'Saved.');
      } else if (b.hasAttribute('data-delete') && j) {
        await m.close();
        if (await confirmDialog({ title: 'Delete this entry?', text: 'This can’t be undone.', confirm: 'Delete', danger: true })) {
          store.update((st) => {
            st.journal = st.journal.filter((x) => x.id !== j.id);
          });
          render(true);
        }
      }
    });
  };

  sheet.root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.hasAttribute('data-new')) editor();
    else if (b.dataset.open) editor(b.dataset.open);
    else if (b.dataset.filter) {
      filter = b.dataset.filter as Filter;
      $$('[data-filter]', sheet.body).forEach((x) => x.classList.toggle('is-on', x === b));
      render(true);
    }
  });

  return {
    el: sheet.root,
    preset: 'calm',
    enter() {
      render();
      sheet.enter();
      if (!ctx.reduced) animate(list.children, { opacity: { from: 0, to: 1 }, y: { from: 14, to: 0 }, delay: stagger(50, { start: 380 }), duration: 600, ease: 'out(3)' });
    },
    leave: (next) => sheet.leave(next),
  };
}
