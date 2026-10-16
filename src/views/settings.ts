/** Settings — your vow, privacy, experience and your data. */

import { animate } from 'animejs';
import type { AppContext, View } from '../app/types';
import { store, hashPin, type MotionPref, type QualityPref } from '../core/store';
import { icons } from '../ui/icons';
import { $, $$, el, esc } from '../ui/dom';
import { confirmDialog, openModal, toast } from '../ui/overlay';
import { relapseFlow } from '../ui/relapse';
import { sound } from '../ui/sound';
import { canInstall, isIOS, isStandalone, promptInstall } from '../app/pwa';
import { pinPad } from './lock';

export function settingsView(ctx: AppContext): View {
  const root = el(`<div class="view view--app"><div class="container settings" data-body></div></div>`);
  const body = $('[data-body]', root)!;

  const seg = <T extends string>(name: string, value: T, options: Array<[T, string]>) =>
    `<div class="segmented" data-seg="${name}">${options
      .map(([v, l]) => `<button type="button" data-value="${v}" class="${v === value ? 'is-on' : ''}">${l}</button>`)
      .join('')}</div>`;

  const sw = (name: string, on: boolean, label: string) =>
    `<button class="switch" type="button" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-switch="${name}"></button>`;

  const render = () => {
    const s = store.get();
    const st = s.settings;
    body.innerHTML = `
      <header class="view-head" data-anim>
        <span class="eyebrow">Settings</span>
        <h1 class="h1">Your sanctuary, your rules.</h1>
      </header>

      <section class="glass glass--pad" data-anim>
        <div class="card-title">${icons.feather}Your vow</div>
        ${
          s.vow
            ? `<div class="setting"><div class="setting__body"><p class="setting__title">Edit your vow</p><p class="setting__sub">Its name, your reasons and your words. Your streak is kept.</p></div><button class="btn btn--ghost btn--sm" type="button" data-edit-vow>Edit</button></div>
               <div class="setting"><div class="setting__body"><p class="setting__title">Begin a new orbit</p><p class="setting__sub">Reset your streak with compassion — history is kept.</p></div><button class="btn btn--ghost btn--sm" type="button" data-restart>Reset</button></div>`
            : `<div class="setting"><div class="setting__body"><p class="setting__title">No vow yet</p><p class="setting__sub">Take two minutes and make it.</p></div><a class="btn btn--primary btn--sm" href="#/vow">Take the vow</a></div>`
        }
        <label class="setting setting--stack">
          <span class="setting__body"><span class="setting__title">What should we call you?</span><span class="setting__sub">Only used for greetings.</span></span>
          <input class="input" style="max-width:240px" data-name maxlength="30" value="${esc(st.name)}" placeholder="Your name" />
        </label>
      </section>

      <section class="glass glass--pad" data-anim>
        <div class="card-title">${icons.lock}Privacy</div>
        <div class="setting"><div class="setting__body"><p class="setting__title">App lock</p><p class="setting__sub">${st.pinHash ? 'A 4-digit PIN protects this app.' : 'Ask for a 4-digit PIN every time the app opens.'}</p></div>
          ${st.pinHash ? `<button class="btn btn--ghost btn--sm" type="button" data-pin-remove>Remove PIN</button>` : `<button class="btn btn--ghost btn--sm" type="button" data-pin-set>Set PIN</button>`}
        </div>
        <p class="muted" style="font-size:13px;margin-top:8px">The PIN keeps casual eyes out. Your data lives only in this browser on this device — no one else can reach it.</p>
      </section>

      <section class="glass glass--pad" data-anim>
        <div class="card-title">${icons.sparkle}Experience</div>
        <div class="setting"><div class="setting__body"><p class="setting__title">Cosmic sound</p><p class="setting__sub">A gentle drone, collision booms and soft bells.</p></div>${sw('sound', st.sound, 'Cosmic sound')}</div>
        <div class="setting"><div class="setting__body"><p class="setting__title">Haptics</p><p class="setting__sub">Gentle vibrations on supported phones.</p></div>${sw('haptics', st.haptics, 'Haptics')}</div>
        <div class="setting setting--stack"><div class="setting__body"><p class="setting__title">Motion</p><p class="setting__sub">Reduce animation if it is too much.</p></div>${seg<MotionPref>('motion', st.motion, [['auto', 'Auto'], ['reduced', 'Reduced'], ['full', 'Full']])}</div>
        <div class="setting setting--stack"><div class="setting__body"><p class="setting__title">Galaxy quality</p><p class="setting__sub">Fewer stars save battery. Currently: ${esc(ctx.cosmos.scene?.quality ?? 'off')}.</p></div>${seg<QualityPref>('quality', st.quality, [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']])}</div>
        <div class="setting"><div class="setting__body"><p class="setting__title">Watch the collision</p><p class="setting__sub">Replay the birth of Milkomeda.</p></div><a class="btn btn--ghost btn--sm" href="#/welcome">${icons.film}Watch</a></div>
      </section>

      <section class="glass glass--pad" data-anim>
        <div class="card-title">${icons.install}Install</div>
        <div class="setting"><div class="setting__body"><p class="setting__title">${isStandalone() ? 'Installed' : 'Add to your home screen'}</p><p class="setting__sub">${
          isStandalone() ? 'You are using the installed app. It works offline.' : 'Opens full-screen, works offline and keeps a neutral icon.'
        }</p></div>${isStandalone() ? '' : `<button class="btn btn--ghost btn--sm" type="button" data-install>Install</button>`}</div>
      </section>

      <section class="glass glass--pad" data-anim>
        <div class="card-title">${icons.download}Your data</div>
        <div class="setting"><div class="setting__body"><p class="setting__title">Export a backup</p><p class="setting__sub">Download everything as a private file.</p></div><button class="btn btn--ghost btn--sm" type="button" data-export>${icons.download}Export</button></div>
        <div class="setting"><div class="setting__body"><p class="setting__title">Restore a backup</p><p class="setting__sub">Replaces what is on this device.</p></div><label class="btn btn--ghost btn--sm">${icons.upload}Import<input type="file" accept="application/json,.json" data-import hidden /></label></div>
        <div class="setting"><div class="setting__body"><p class="setting__title" style="color:var(--danger)">Erase everything</p><p class="setting__sub">Your vow, journal and history — gone for good.</p></div><button class="btn btn--danger btn--sm" type="button" data-wipe>${icons.trash}Erase</button></div>
      </section>

      <section class="glass glass--pad" data-anim>
        <div class="card-title">${icons.info}About</div>
        <p class="muted" style="margin-top:12px">Divine Vow ${esc(__APP_VERSION__)} · Built with Anime.js and TypeScript. The galaxies are a real gravitational simulation of the coming Milky Way – Andromeda merger.</p>
        <p class="muted" style="margin-top:10px;font-size:13.5px">Divine Vow is a self-help companion, not a substitute for professional care. If you are struggling or feel unsafe, please reach out to someone you trust or a local helpline.</p>
      </section>
    `;
  };

  const setPin = () => {
    let first = '';
    const m = openModal(
      `<div class="stack" style="--gap:18px;align-items:center;text-align:center">
        <span class="eyebrow">App lock</span>
        <h3 class="h2" style="font-size:26px" data-pin-title>Choose a 4-digit PIN</h3>
        <div data-pad style="width:min(300px,100%)"></div>
        <button class="btn btn--quiet btn--sm" type="button" data-close>Cancel</button>
      </div>`,
      { label: 'Set PIN' },
    );
    const title = $('[data-pin-title]', m.body)!;
    const pad = pinPad(async (pin) => {
      if (!first) {
        first = pin;
        title.textContent = 'Enter it once more';
        animate(title, { opacity: { from: 0, to: 1 }, duration: 400 });
        return false;
      }
      if (pin !== first) {
        first = '';
        title.textContent = 'They did not match — choose again';
        return false;
      }
      const hash = await hashPin(pin);
      store.update((s) => {
        s.settings.pinHash = hash;
      });
      void m.close();
      toast('App lock is on.', { icon: icons.lock });
      render();
      return true;
    });
    $('[data-pad]', m.body)!.appendChild(pad);
  };

  const editVow = () => {
    const v = store.get().vow!;
    const m = openModal(
      `<div class="stack" style="--gap:16px">
        <span class="eyebrow">Edit your vow</span>
        <label class="field"><span class="field__label">What you call it</span><input class="input input--serif" data-codename maxlength="40" value="${esc(v.codename)}" /></label>
        <label class="field"><span class="field__label">Your reasons (one per line)</span><textarea class="textarea" data-reasons rows="4">${esc(v.reasons.join('\n'))}</textarea></label>
        <label class="field"><span class="field__label">Your vow</span><textarea class="textarea textarea--serif" data-vowtext rows="5">${esc(v.vowText)}</textarea></label>
        <label class="field"><span class="field__label">Signature</span><input class="input input--serif" data-signature maxlength="40" value="${esc(v.signature)}" /></label>
        <div class="row" style="justify-content:flex-end"><button class="btn btn--quiet" type="button" data-close>Cancel</button><button class="btn btn--primary" type="button" data-save>Save</button></div>
      </div>`,
      { label: 'Edit vow' },
    );
    m.body.querySelector('[data-save]')!.addEventListener('click', () => {
      const get = (sel: string) => ($(sel, m.body) as HTMLInputElement | HTMLTextAreaElement).value.trim();
      const codename = get('[data-codename]') || v.codename;
      const reasons = get('[data-reasons]')
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      store.update((s) => {
        if (!s.vow) return;
        s.vow.codename = codename;
        s.vow.reasons = reasons.length ? reasons : s.vow.reasons;
        s.vow.vowText = get('[data-vowtext]') || s.vow.vowText;
        s.vow.signature = get('[data-signature]');
      });
      void m.close();
      toast('Your vow has been updated.', { icon: icons.feather });
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
    toast('Backup downloaded. Keep it somewhere private.', { icon: icons.download });
  };

  const install = async () => {
    if (canInstall()) {
      await promptInstall();
      return;
    }
    openModal(
      `<div class="stack" style="--gap:14px">
        <span class="eyebrow">Install</span>
        <h3 class="h2" style="font-size:26px">Add Divine Vow to your home screen</h3>
        ${
          isIOS()
            ? '<p class="muted">In Safari, tap the <strong style="color:#fff">Share</strong> button, then <strong style="color:#fff">Add to Home Screen</strong>.</p>'
            : '<p class="muted">Open your browser menu and choose <strong style="color:#fff">Install app</strong> or <strong style="color:#fff">Add to Home screen</strong>.</p>'
        }
        <div class="row" style="justify-content:flex-end"><button class="btn btn--primary btn--sm" type="button" data-close>Got it</button></div>
      </div>`,
      { label: 'Install' },
    );
  };

  root.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.switch) {
      const key = b.dataset.switch as 'sound' | 'haptics';
      if (key === 'sound') {
        const on = sound.toggle();
        b.setAttribute('aria-checked', String(on));
      } else {
        store.update((s) => {
          s.settings.haptics = !s.settings.haptics;
        });
        b.setAttribute('aria-checked', String(store.get().settings.haptics));
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
    else if (b.hasAttribute('data-restart')) relapseFlow(ctx, render);
    else if (b.hasAttribute('data-pin-set')) setPin();
    else if (b.hasAttribute('data-pin-remove')) {
      if (await confirmDialog({ title: 'Remove the PIN?', text: 'Anyone with this device will be able to open the app.', confirm: 'Remove' })) {
        store.update((s) => {
          s.settings.pinHash = null;
        });
        render();
      }
    } else if (b.hasAttribute('data-export')) exportData();
    else if (b.hasAttribute('data-install')) void install();
    else if (b.hasAttribute('data-wipe')) {
      const ok = await confirmDialog({
        title: 'Erase everything?',
        text: 'Your vow, streak, journal and history will be permanently deleted from this device. Consider exporting a backup first.',
        confirm: 'Erase forever',
        danger: true,
      });
      if (ok) {
        store.wipe();
        toast('Everything has been erased.', { icon: icons.trash });
        ctx.router.go('/welcome');
      }
    }
  });

  root.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    if (input.matches('[data-import]') && input.files?.[0]) {
      try {
        const text = await input.files[0].text();
        const ok = await confirmDialog({ title: 'Restore this backup?', text: 'It will replace everything currently on this device.', confirm: 'Restore' });
        if (!ok) return;
        store.import(text);
        toast('Backup restored.', { icon: icons.check });
        render();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'That file could not be read.', { icon: icons.info });
      } finally {
        input.value = '';
      }
    }
  });

  root.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.matches('[data-name]')) {
      store.update((s) => {
        s.settings.name = input.value.trim();
      });
    }
  });

  return {
    el: root,
    preset: 'calm',
    enter: render,
  };
}
