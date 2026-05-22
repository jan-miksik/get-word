export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWA_INSTALL_HELP_EVENT = 'get-word:pwa-install-help-open';

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav: any = navigator;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    nav.standalone === true
  );
}

export function getInstallPlatform() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isIOS: false, isIOSSafari: false };
  }

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
  const isIOSChrome = /CriOS/.test(ua);
  const isIOSFirefox = /FxiOS/.test(ua);
  const isIOSSafari = isIOS && !isIOSChrome && !isIOSFirefox;

  return { isIOS, isIOSSafari };
}

export function openPWAInstallHelp() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PWA_INSTALL_HELP_EVENT));
}
