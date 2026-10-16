/** Service worker registration, update prompts and the install flow. */

import { registerSW } from 'virtual:pwa-register';
import { toast } from '../ui/overlay';
import { icons } from '../ui/icons';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function initPWA(): void {
  if (import.meta.env.DEV) return;
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast('A new version of Divine Vow is ready.', {
        icon: icons.sparkle,
        duration: 15000,
        action: { label: 'Update', run: () => void update(true) },
      });
    },
    onOfflineReady() {
      toast('Ready to work offline.', { icon: icons.check });
    },
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
    toast('Installed. Divine Vow now lives on your home screen.', { icon: icons.check });
  });
}

export const canInstall = (): boolean => !!deferred;

export const isStandalone = (): boolean =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIOS = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  notify();
  return choice.outcome === 'accepted';
}
