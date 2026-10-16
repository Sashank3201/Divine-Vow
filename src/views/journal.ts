/** Journal — reflections, urges outlasted and new beginnings, in one timeline. */

import { animate, createLayout, stagger } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store, uid, type Mood } from '../core/store';
import { humanDuration } from '../core/journey';
import { JOURNAL_PROMPTS, MOODS, dailyPick } from '../core/content';
import { icons } from '../ui/icons';
import { $, $$, el, esc, relativeDay, timeOfDay } from '../ui/dom';
import { confirmDialog, openModal, toast } from '../ui/overlay';
import { sound } from '../ui/sound';

type Filter = 'all' | 'notes' | 'urges' | 'restarts';

interface Item {
  id: string;
  at: number;
  kind: 'note' | 'urge' | 'restart';
  html: string;
}

const TAGS = ['Gratitude', 'Win', 'Lesson', 'Trigger', 'Struggle', 'Insight', 'Hope'];

export function journalView(ctx: AppContext): View {
  let filter: Filter = 'all';
  const root = el(`
    <div class="view view--app">
      <div class="container" style="max-width:820px">
        <header class="view-head" data-anim>
          <div class="row wrap" style="justify-content:space-between;align-items:flex-end">
            <div>
              <span class="eyebrow">Journal</span>
              <h1 class="h1">Your story, honestly.</h1>
            </div>
            <button class="btn btn--primary" type="button" data-new>${icons.feather}New entry</button>
          </div>
          <p class="lede" style="margin-top:14px">${esc(dailyPick(JOURNAL_PROMPTS))}</p>
        </header>
        <div class="segmented" data-anim data-filters role="tablist" aria-label="Filter">
          <button type="button" class="is-on" data-filter="all">All</button>
          <button type="button" data-filter="notes">Reflections</button>
          <button type="button" data-filter="urges">Urges</button>
          <button type="button" data-filter="restarts">New orbits</button>
        </div>
        <div data-list data-anim></div>
      </div>
    </div>
  `);
  const list = $('[data-list]', root)!;
  const layout = createLayout(list, { duration: 600, ease: 'out(3)' });

  const items = (): Item[] => {
    const s = store.get();
    const out: Item[] = [];
    if (filter === 'all' || filter === 'notes') {
      for (const j of s.journal) {
        const m = MOODS.find((x) => x.value === j.mood)!;
        out.push({
          id: j.id,
          at: j.at,
          kind: 'note',
          html: `<button class="glass entry" type="button" data-open="${j.id}">
            <span class="entry__orb" style="background:${m.color}"></span>
            <span class="entry__body">
              <span class="entry__title">${esc(j.title || 'Reflection')}</span>
              ${j.text ? `<span class="entry__text">${esc(j.text)}</span>` : ''}
              <span class="entry__meta">${timeOfDay(j.at)} · ${m.label}${j.tags.map((t) => ` <span class="pill" style="height:22px">${esc(t)}</span>`).join('')}</span>
            </span>
          </button>`,
        });
      }
    }
    if (filter === 'all' || filter === 'urges') {
      for (const u of s.urges) {
        const won = u.outcome === 'won';
        out.push({
          id: u.id,
          at: u.at,
          kind: 'urge',
          html: `<div class="glass entry">
            <span class="entry__orb" style="background:${won ? 'radial-gradient(circle at 35% 30%, #fff, #5eead4)' : 'radial-gradient(circle at 35% 30%, #fff, #ff6b81)'}"></span>
            <span class="entry__body">
              <span class="entry__title">${won ? 'Urge outlasted' : 'Urge — slipped'}</span>
              <span class="entry__meta">
                ${timeOfDay(u.at)} · intensity ${u.intensity}/10 · ${Math.max(1, Math.round(u.durationSec / 60))} min
                ${u.tools.length ? ` · ${esc(u.tools.join(', '))}` : ''}
                ${u.trigger ? ` <span class="pill pill--rose" style="height:22px">${esc(u.trigger)}</span>` : ''}
              </span>
            </span>
          </div>`,
        });
      }
    }
    if (filter === 'all' || filter === 'restarts') {
      for (const r of s.relapses) {
        out.push({
          id: r.id,
          at: r.at,
          kind: 'restart',
          html: `<div class="glass entry">
            <span class="entry__orb" style="background:radial-gradient(circle at 35% 30%, #fff, #bcaeff)"></span>
            <span class="entry__body">
              <span class="entry__title">A new orbit began</span>
              <span class="entry__text">${r.note ? esc(r.note) : `After ${esc(humanDuration(r.streakMs))} of keeping the vow.`}</span>
              <span class="entry__meta">${timeOfDay(r.at)}${r.trigger ? ` · ${esc(r.trigger)}` : ''}</span>
            </span>
          </div>`,
        });
      }
    }
    return out.sort((a, b) => b.at - a.at);
  };

  const render = (animated = false) => {
    const all = items();
    if (!all.length) {
      list.innerHTML = `<div class="empty">
        ${icons.feather}
        <p class="h3" style="color:#fff">Nothing written yet.</p>
        <p>Your reflections, the urges you outlast and every new beginning will appear here.</p>
        <button class="btn btn--ghost btn--sm" type="button" data-new>Write the first entry</button>
      </div>`;
      return;
    }
    let lastDay = '';
    let html = '';
    for (const it of all) {
      const day = relativeDay(it.at);
      if (day !== lastDay) {
        html += `<p class="journal-day">${day}</p>`;
        lastDay = day;
      }
      html += it.html;
    }
    const apply = () => {
      list.innerHTML = html;
    };
    if (animated && !ctx.reduced) {
      layout.update(apply, { enterFrom: { opacity: 0, y: 20 }, leaveTo: { opacity: 0, y: -10 } });
    } else apply();
  };

  const editor = (existingId?: string) => {
    const s = store.get();
    const j = existingId ? s.journal.find((x) => x.id === existingId) : undefined;
    let mood: Mood = j?.mood ?? 3;
    const tags = new Set(j?.tags ?? []);
    const m = openModal(
      `<div class="stack" style="--gap:18px">
        <span class="eyebrow">${j ? 'Edit entry' : 'New entry'}</span>
        <div class="mood-picker" role="radiogroup" aria-label="Mood">
          ${MOODS.map((x) => `<button class="mood ${x.value === mood ? 'is-on' : ''}" type="button" data-mood="${x.value}"><span class="mood__orb" style="background:${x.color}"></span>${x.label}</button>`).join('')}
        </div>
        <input class="input" data-title placeholder="A title (optional)" maxlength="80" value="${esc(j?.title ?? '')}" />
        <textarea class="textarea textarea--serif" data-text rows="7" placeholder="${esc(dailyPick(JOURNAL_PROMPTS, 2))}" autofocus>${esc(j?.text ?? '')}</textarea>
        <div class="chips">${TAGS.map((t) => `<button class="chip ${tags.has(t) ? 'is-on' : ''}" type="button" data-tag="${t}">${t}</button>`).join('')}</div>
        <div class="row" style="justify-content:space-between">
          ${j ? `<button class="btn btn--quiet btn--sm" type="button" data-delete style="color:var(--danger)">${icons.trash}Delete</button>` : '<span></span>'}
          <div class="row">
            <button class="btn btn--quiet" type="button" data-close>Cancel</button>
            <button class="btn btn--primary" type="button" data-save>Save</button>
          </div>
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
        animate(b, { scale: [1, 1.1, 1], duration: 300 });
      } else if (b.dataset.tag) {
        const t = b.dataset.tag;
        if (tags.has(t)) tags.delete(t);
        else tags.add(t);
        b.classList.toggle('is-on', tags.has(t));
      } else if (b.hasAttribute('data-save')) {
        const title = ($('[data-title]', m.body) as HTMLInputElement).value.trim();
        const text = ($('[data-text]', m.body) as HTMLTextAreaElement).value.trim();
        if (!title && !text) {
          animate($('[data-text]', m.body)!, { x: [0, -8, 8, -4, 4, 0], duration: 380 });
          return;
        }
        store.update((st) => {
          if (j) {
            const e2 = st.journal.find((x) => x.id === j.id);
            if (e2) Object.assign(e2, { title, text, mood, tags: [...tags] });
          } else {
            st.journal.push({ id: uid(), at: Date.now(), title, text, mood, tags: [...tags] });
          }
        });
        sound.chime(mood + 1);
        void m.close();
        render(true);
        toast(j ? 'Entry updated.' : 'Written in the stars.', { icon: icons.feather });
      } else if (b.hasAttribute('data-delete') && j) {
        void m.close();
        const ok = await confirmDialog({ title: 'Delete this entry?', text: 'This cannot be undone.', confirm: 'Delete', danger: true });
        if (ok) {
          store.update((st) => {
            st.journal = st.journal.filter((x) => x.id !== j.id);
          });
          render(true);
        }
      }
    });
  };

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.hasAttribute('data-new')) editor();
    else if (b.dataset.open) editor(b.dataset.open);
    else if (b.dataset.filter) {
      filter = b.dataset.filter as Filter;
      $$('[data-filter]', root).forEach((x) => x.classList.toggle('is-on', x === b));
      render(true);
    }
  });

  return {
    el: root,
    preset: 'calm',
    enter() {
      render();
      if (!ctx.reduced) {
        animate($$('.entry', list), { opacity: { from: 0, to: 1 }, y: { from: 16, to: 0 }, delay: stagger(50, { start: 300 }), duration: 700, ease: 'out(3)' });
      }
    },
    destroy() {
      layout.revert();
    },
  };
}
