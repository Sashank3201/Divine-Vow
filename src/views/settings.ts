/** Settings — grouped rows in one sheet. */

import type { AppContext, View } from '../app/types';
import { store, hashPin, type MotionPref, type QualityPref } from '../core/store';
import { icons } from '../ui/icons';
import { $, $$, esc } from '../ui/dom';
import { confirmDialog, openModal, toast } from '../ui/overlay';
import { relapseFlow } from '../ui/relapse';
import { canInstall, isIOS, isStandalone, promptInstall } from '../app/pwa';
import { googleCalendarUrl, icsFile } from '../app/reminder';
import { checkinOpensLabel, mainHabit } from '../core/journey';
import { createSheet } from './sheet';
import { pinPad } from './lock';

const seg = <T extends string>(name: string, value: T, options: Array<[T, string]>) =>
  `<div class="segmented" data-seg="${name}">${options
    .map(([v, l]) => `<button type="button" data-value="${v}" class="${v === value ? 'is-on' : ''}">${l}</button>`)
    .join('')}</div>`;

const sw = (name: string, on: boolean, label: string) =>
  `<button class="switch" type="button" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-switch="${name}"></button>`;

const row = (title: string, sub: string, control: string) =>
  `<div class="row"><span class="row__body"><span class="row__title">${title}</span>${sub ? `<span class="row__sub">${sub}</span>` : ''}</span>${control}</div>`;

const navRow = (attr: string, title: string, sub = '', danger = false) =>
  `<button class="row row--button ${danger ? 'row--danger' : ''}" type="button" ${attr}><span class="row__body"><span class="row__title">${title}</span>${
    sub ? `<span class="row__sub">${sub}</span>` : ''
  }</span><span class="row__chev">${icons.chevron}</span></button>`;

export function settingsView(ctx: AppContext): View {
  const sheet = createSheet(ctx, {
    title: 'Settings',
    size: 'narrow',
    body: '<div class="settings" data-settings></div>',
  });
  const body = $('[data-settings]', sheet.body)!;

  const render = () => {
    const s = store.get();
    const st = s.settings;
    body.innerHTML = `
      <p class="settings__label">Vow</p>
      <div class="group group--flush">
        ${
          s.vow
            ? navRow('data-edit-vow', 'Edit vow', 'Name, reasons and words. Your streak is kept.') +
              `<a class="row row--button" href="#/dashboard"><span class="row__body"><span class="row__title">Habits</span><span class="row__sub">Add, rename or change your main habit in the dashboard.</span></span><span class="row__chev">${icons.chevron}</span></a>` +
              navRow('data-restart', 'Start again', 'Back to Day 0 after a slip. History is kept.')
            : `<a class="row row--button" href="#/vow"><span class="row__body"><span class="row__title">Take the vow</span><span class="row__sub">About 2 minutes.</span></span><span class="row__chev">${icons.chevron}</span></a>`
        }
        <label class="row"><span class="row__body"><span class="row__title">Name</span></span>
          <input class="input input--inline" data-name maxlength="30" value="${esc(st.name)}" placeholder="Optional" autocomplete="off" /></label>
      </div>

      <p class="settings__label">Reminder</p>
      <div class="group group--flush">
        <label class="row"><span class="row__body"><span class="row__title">Check-in time</span><span class="row__sub">Check-in opens at ${esc(checkinOpensLabel())}.</span></span>
          <input class="input input--inline input--time" type="time" data-reminder value="${esc(st.reminder)}" /></label>
        ${navRow('data-gcal', 'Add to Google Calendar', 'A daily event that opens the app. Tap Save.')}
        ${navRow('data-ics', 'Download calendar file', 'For other calendar apps.')}
      </div>
      <p class="settings__note">Your calendar does the reminding. The event never names your habit.</p>

      <p class="settings__label">Privacy</p>
      <div class="group group--flush">
        ${row('App lock', 'Ask for a 4-digit PIN when the app opens.', sw('lock', !!st.pinHash, 'App lock'))}
      </div>
      <p class="settings__note">Your data stays in this browser, on this device.</p>

      <p class="settings__label">Experience</p>
      <div class="group group--flush">
        ${row('Haptics', 'Phones only.', sw('haptics', st.haptics, 'Haptics'))}
        <div class="row row--stack"><span class="row__body"><span class="row__title">Motion</span></span>${seg<MotionPref>('motion', st.motion, [
          ['auto', 'Auto'],
          ['reduced', 'Reduced'],
          ['full', 'Full'],
        ])}</div>
        <div class="row row--stack"><span class="row__body"><span class="row__title">Galaxy quality</span><span class="row__sub">Now: ${esc(ctx.cosmos.scene?.quality ?? 'off')}. Lower saves battery.</span></span>${seg<QualityPref>('quality', st.quality, [
          ['auto', 'Auto'],
          ['high', 'High'],
          ['medium', 'Medium'],
          ['low', 'Low'],
        ])}</div>
        <a class="row row--button" href="#/welcome"><span class="row__body"><span class="row__title">Watch the collision</span></span><span class="row__chev">${icons.chevron}</span></a>
      </div>

      ${
        isStandalone()
          ? ''
          : `<p class="settings__label">Install</p>
      <div class="group group--flush">${navRow('data-install', 'Add to home screen', 'Full screen. Works offline.')}</div>`
      }

      <p class="settings__label">Data</p>
      <div class="group group--flush">
        ${navRow('data-export', 'Export backup', 'Download everything as a file.')}
        <label class="row row--button"><span class="row__body"><span class="row__title">Restore backup</span><span class="row__sub">Replaces what’s on this device.</span></span><span class="row__chev">${icons.chevron}</span><input type="file" accept="application/json,.json" data-import hidden /></label>
        ${navRow('data-wipe', 'Erase everything', '', true)}
      </div>

      <p class="settings__note settings__about">Divine Vow ${esc(__APP_VERSION__)}. Not a substitute for professional help. If you feel unsafe, contact someone you trust or a local helpline.</p>
    `;
  };

  const setPin = () => {
    let first = '';
    const m = openModal(
      `<div class="stack" style="--gap:22px;align-items:center;text-align:center">
        <h3 class="t-title" data-pin-title>Choose a PIN</h3>
        <div data-pad></div>
        <button class="btn btn--plain" type="button" data-close>Cancel</button>
      </div>`,
      { label: 'Set PIN', onClose: render },
    );
    const title = $('[data-pin-title]', m.body)!;
    const pad = pinPad(async (pin) => {
      if (!first) {
        first = pin;
        title.textContent = 'Enter it again';
        return false;
      }
      if (pin !== first) {
        first = '';
        title.textContent = 'Didn’t match. Choose a PIN';
        return false;
      }
      const hash = await hashPin(pin);
      store.update((s) => {
        s.settings.pinHash = hash;
      });
      void m.close();
      toast('App lock on.', { icon: icons.lock });
      return true;
    });
    $('[data-pad]', m.body)!.appendChild(pad);
  };

  const editVow = () => {
    const v = store.get().vow!;
    const m = openModal(
      `<div class="stack" style="--gap:14px">
        <h3 class="t-title">Edit vow</h3>
        <label class="field"><span class="t-label">Name for your main habit</span><input class="input" data-codename maxlength="40" value="${esc(mainHabit()?.name ?? '')}" /></label>
        <label class="field"><span class="t-label">Reasons, one per line</span><textarea class="textarea" data-reasons rows="4">${esc(v.reasons.join('\n'))}</textarea></label>
        <label class="field"><span class="t-label">Your vow</span><textarea class="textarea" data-vowtext rows="3">${esc(v.vowText)}</textarea></label>
        <label class="field"><span class="t-label">Signature</span><input class="input" data-signature maxlength="40" value="${esc(v.signature)}" /></label>
        <div class="inline" style="margin-top:6px"><span class="spacer"></span><button class="btn btn--fill" type="button" data-close>Cancel</button><button class="btn btn--accent" type="button" data-save>Save</button></div>
      </div>`,
      { label: 'Edit vow' },
    );
    m.body.querySelector('[data-save]')!.addEventListener('click', () => {
      const get = (sel: string) => $<HTMLInputElement | HTMLTextAreaElement>(sel, m.body)!.value.trim();
      const reasons = get('[data-reasons]')
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      store.update((s) => {
        if (!s.vow) return;
        const main = s.habits.find((h) => h.id === s.mainId);
        if (main) main.name = get('[data-codename]') || main.name;
        s.vow.reasons = reasons.length ? reasons : s.vow.reasons;
        s.vow.vowText = get('[data-vowtext]') || s.vow.vowText;
        s.vow.signature = get('[data-signature]');
      });
      void m.close();
      toast('Vow updated.');
    });
  };

  const exportData = () => {
    const blob = new Blob([store.export()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `divine-vow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Backup downloaded.', { icon: icons.download });
  };

  const downloadIcs = () => {
    const blob = new Blob([icsFile(store.get().settings.reminder)], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'divine-vow-check-in.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Open the file to add it to your calendar.', { icon: icons.calendar });
  };

  const install = async () => {
    if (canInstall()) {
      await promptInstall();
      return;
    }
    openModal(
      `<div class="stack" style="--gap:12px">
        <h3 class="t-title">Add to home screen</h3>
        <p class="t-sub">${
          isIOS() ? 'In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.' : 'Open the browser menu and choose <strong>Install app</strong>.'
        }</p>
        <button class="btn btn--accent btn--block" type="button" data-close style="margin-top:10px">Done</button>
      </div>`,
      { label: 'Install' },
    );
  };

  sheet.body.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.switch) {
      const key = b.dataset.switch;
      if (key === 'haptics') {
        store.update((s) => {
          s.settings.haptics = !s.settings.haptics;
        });
        b.setAttribute('aria-checked', String(store.get().settings.haptics));
      } else if (key === 'lock') {
        if (!store.get().settings.pinHash) {
          b.setAttribute('aria-checked', 'true');
          setPin();
        } else if (await confirmDialog({ title: 'Turn off app lock?', text: 'Anyone with this device can open the app.', confirm: 'Turn off' })) {
          store.update((s) => {
            s.settings.pinHash = null;
          });
          render();
        }
      }
      return;
    }
    const segEl = b.closest<HTMLElement>('[data-seg]');
    if (segEl && b.dataset.value) {
      const name = segEl.dataset.seg!;
      $$('button', segEl).forEach((x) => x.classList.toggle('is-on', x === b));
      store.update((s) => {
        if (name === 'motion') s.settings.motion = b.dataset.value as MotionPref;
        if (name === 'quality') s.settings.quality = b.dataset.value as QualityPref;
      });
      toast('Saved. Reload to apply.', { action: { label: 'Reload', run: () => location.reload() }, duration: 6000 });
      return;
    }
    if (b.hasAttribute('data-edit-vow')) editVow();
    else if (b.hasAttribute('data-restart')) relapseFlow(ctx, { onDone: render });
    else if (b.hasAttribute('data-gcal')) window.open(googleCalendarUrl(store.get().settings.reminder), '_blank', 'noopener');
    else if (b.hasAttribute('data-ics')) downloadIcs();
    else if (b.hasAttribute('data-export')) exportData();
    else if (b.hasAttribute('data-install')) void install();
    else if (b.hasAttribute('data-wipe')) {
      const ok = await confirmDialog({
        title: 'Erase everything?',
        text: 'Your vow, streak, journal and history will be deleted from this device. Export a backup first if you want one.',
        confirm: 'Erase',
        danger: true,
      });
      if (ok) {
        store.wipe();
        toast('Everything erased.');
        ctx.router.go('/welcome');
      }
    }
  });

  sheet.body.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    if (input.matches('[data-reminder]')) {
      if (!/^\d{2}:\d{2}$/.test(input.value)) return;
      store.update((s) => {
        s.settings.reminder = input.value;
      });
      render();
      toast('Saved. Add it to your calendar again to move the event.', { duration: 4200 });
      return;
    }
    if (!input.matches('[data-import]') || !input.files?.[0]) return;
    try {
      const text = await input.files[0].text();
      if (!(await confirmDialog({ title: 'Restore this backup?', text: 'It replaces everything on this device.', confirm: 'Restore' }))) return;
      store.import(text);
      toast('Backup restored.', { icon: icons.check });
      render();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That file couldn’t be read.');
    } finally {
      input.value = '';
    }
  });

  sheet.body.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.matches('[data-name]')) {
      store.update((s) => {
        s.settings.name = input.value.trim();
      });
    }
  });

  return {
    el: sheet.root,
    preset: 'calm',
    enter() {
      render();
      sheet.enter();
    },
    leave: (next) => sheet.leave(next),
  };
}
