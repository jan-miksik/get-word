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

export type SimulatedPlatform = 'ios' | 'ios-non-safari' | 'android' | null;

export function getInstallPlatform(simulated?: SimulatedPlatform) {
  if (simulated === 'ios') {
    return { isIOS: true, isIOSSafari: true };
  }
  if (simulated === 'ios-non-safari') {
    return { isIOS: true, isIOSSafari: false };
  }
  if (simulated === 'android') {
    return { isIOS: false, isIOSSafari: false };
  }

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

export function isSmallScreen() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 900;
}

export function isMobileDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream) {
    return true;
  }
  if (/Android/i.test(ua)) return true;
  // Some tablets / hybrid devices
  if (/Mobile|Tablet/i.test(ua)) return true;
  return false;
}

export function openPWAInstallHelp() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PWA_INSTALL_HELP_EVENT));
}
