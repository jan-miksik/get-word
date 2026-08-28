export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWA_INSTALL_HELP_EVENT = 'get-word:pwa-install-help-open';

// `beforeinstallprompt` fires once, usually before any modal mounts. We capture
// it at app startup into a module-level slot so the install modal can read it
// whenever the user actually opens it. Without this, the Android install
// button only ever shows up if the event happens to fire *after* the modal is
// already open (rare in practice).
let capturedBeforeInstallPrompt: BeforeInstallPromptEvent | null = null;
let globalCaptureInstalled = false;
const beforeInstallPromptListeners = new Set<() => void>();

function notifyBeforeInstallPromptListeners() {
  for (const listener of beforeInstallPromptListeners) {
    try {
      listener();
    } catch {
      // One subscriber must not prevent the remaining subscribers from updating.
    }
  }
}

export function installGlobalPWACapture() {
  if (typeof window === 'undefined') return;
  if (globalCaptureInstalled) return;
  globalCaptureInstalled = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    capturedBeforeInstallPrompt = e as BeforeInstallPromptEvent;
    notifyBeforeInstallPromptListeners();
  });
  window.addEventListener('appinstalled', () => {
    capturedBeforeInstallPrompt = null;
    notifyBeforeInstallPromptListeners();
  });
}

export function getCapturedBeforeInstallPrompt(): BeforeInstallPromptEvent | null {
  return capturedBeforeInstallPrompt;
}

export function clearCapturedBeforeInstallPrompt() {
  capturedBeforeInstallPrompt = null;
  notifyBeforeInstallPromptListeners();
}

export function onBeforeInstallPromptCaptured(fn: () => void): () => void {
  beforeInstallPromptListeners.add(fn);
  return () => {
    beforeInstallPromptListeners.delete(fn);
  };
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav: any = navigator;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    nav.standalone === true
  );
}

/**
 * Dev-preview override for the install card, from `?previewPWAInstallIntro=`.
 * There used to be an `ios-non-safari` variant as well: iOS's home-screen flow
 * only worked in Safari, so third-party browsers got their own warning screen.
 * On iOS we now send people to the App Store, which every browser can open, so
 * the distinction stopped meaning anything.
 */
/**
 * iPadOS runs Safari in desktop mode by default, and a desktop-mode iPad sends
 * the same `Macintosh` user agent a MacBook does — no `iPad` token anywhere in
 * it. The one thing that still separates the two is touch: every iPad reports
 * several touch points, every Mac reports none.
 * See https://bugs.webkit.org/show_bug.cgi?id=212937.
 */
function isIPadOSInDesktopMode(ua: string): boolean {
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

function isAppleMobileUA(ua: string): boolean {
  return /iPad|iPhone|iPod/.test(ua) || isIPadOSInDesktopMode(ua);
}

export type SimulatedPlatform = 'ios' | 'android' | null;

export function getInstallPlatform(simulated?: SimulatedPlatform) {
  if (simulated === 'ios') return { isIOS: true };
  if (simulated === 'android') return { isIOS: false };

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isIOS: false };
  }

  const ua = navigator.userAgent;
  const isIOS = isAppleMobileUA(ua) && !(window as Window & { MSStream?: unknown }).MSStream;

  return { isIOS };
}

export function isSmallScreen() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 900;
}

export function isMobileDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (isAppleMobileUA(ua) && !(window as Window & { MSStream?: unknown }).MSStream) {
    return true;
  }
  if (/Android/i.test(ua)) return true;
  // Some tablets / hybrid devices
  if (/Mobile|Tablet/i.test(ua)) return true;
  return false;
}

export function isAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

// Affirmative Firefox check. Desktop/Android Firefox carries a `Firefox/` token;
// the iOS build (which is a WebKit wrapper, not Gecko) carries `FxiOS/`. SeaMonkey
// shares the `Firefox/` token but is a distinct browser, so exclude it. No other
// mainstream browser sets these tokens, so this stays false for Chromium-based
// browsers (Chrome, Edge, Opera, Brave, Samsung Internet) and Safari.
export function isFirefox() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Firefox\/|FxiOS\//i.test(ua) && !/Seamonkey/i.test(ua);
}

export function openPWAInstallHelp() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PWA_INSTALL_HELP_EVENT));
}

// Reads `?previewPWAInstallIntro=ios|android` from the current URL so any entry
// point into the install modal (preview card on app/page, menu button via
// PWAInstallBanner) can show the simulated platform variant instead of the
// UA-detected one. Returns null when no valid param is set.
export function readSimulatedPlatformFromUrl(): SimulatedPlatform {
  if (typeof window === 'undefined') return null;
  const raw = (new URLSearchParams(window.location.search).get('previewPWAInstallIntro') ?? '').toLowerCase();
  if (raw === 'ios') return 'ios';
  if (raw === 'android') return 'android';
  return null;
}
