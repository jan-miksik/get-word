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

const TWA_SESSION_KEY = 'get-word-twa';

/**
 * True inside the Play Store wrapper (a Trusted Web Activity).
 *
 * Android names the launching app in `document.referrer` as
 * `android-app://<package>`, but only on the document it launched — a reload
 * inside the wrapper looks exactly like an ordinary Chrome tab — so the answer
 * is remembered for the session. The wrapper is a browser engine without a
 * browser around it: there is no menu to install from, and the app is already
 * on the home screen, so every install invitation is noise there.
 */
export function isTrustedWebActivity() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const launchedByApp = document.referrer.startsWith('android-app://');
  try {
    const store = window.sessionStorage;
    if (launchedByApp) store.setItem(TWA_SESSION_KEY, '1');
    return launchedByApp || store.getItem(TWA_SESSION_KEY) === '1';
  } catch {
    // Hardened contexts throw on sessionStorage; the referrer alone still
    // identifies the launch document, which is where the invitations render.
    return launchedByApp;
  }
}

/**
 * Running outside a browser tab: an installed standalone PWA, or the Play
 * wrapper. Either way there is nothing left to add to a home screen.
 */
export function isRunningInstalled() {
  return isStandalone() || isTrustedWebActivity();
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
  const isIOSSafari = isIOS && isLikelySafari(ua, navigator);

  return { isIOS, isIOSSafari };
}

// Affirmative "is this Safari?" check — safer than blacklisting third-party
// browser tokens. We only treat the browser as Safari when:
//   1. It is *not* Brave (Brave's UA on iOS is identical to Safari, so the
//      only reliable signal is `navigator.brave.isBrave`).
//   2. The UA has both `Safari/` and `Version/` tokens (real mobile Safari
//      always sets both; most third-party iOS browsers strip `Version/`).
//   3. The UA does not include a known third-party or in-app browser token.
// Anything we can't positively identify as Safari falls through to the
// non-Safari warning banner — false negatives (Safari mis-flagged as
// non-Safari) are far less harmful than false positives, since the install
// flow simply won't work in third-party iOS browsers.
function isLikelySafari(ua: string, nav: Navigator): boolean {
  const braveNav = nav as Navigator & { brave?: { isBrave?: () => Promise<boolean> } };
  if (braveNav.brave?.isBrave) return false;
  if (!/Safari\//.test(ua)) return false;
  if (!/Version\//.test(ua)) return false;
  // Third-party iOS browsers + the most common in-app webviews (social /
  // messaging apps) — all of these can't trigger Safari's Add-to-Home-Screen
  // flow, so they should see the "open in Safari" banner.
  if (
    /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\/|YaBrowser|FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|Pinterest|TikTok|musical_ly/i.test(
      ua
    )
  ) {
    return false;
  }
  return true;
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

// Reads `?previewPWAInstallIntro=ios|ios-non-safari|android` from the current
// URL so any entry point into the install modal (preview card on app/page,
// menu button via PWAInstallBanner) can show the simulated platform variant
// instead of the UA-detected one. Returns null when no valid param is set.
export function readSimulatedPlatformFromUrl(): SimulatedPlatform {
  if (typeof window === 'undefined') return null;
  const raw = (new URLSearchParams(window.location.search).get('previewPWAInstallIntro') ?? '').toLowerCase();
  if (raw === 'ios') return 'ios';
  if (raw === 'ios-non-safari') return 'ios-non-safari';
  if (raw === 'android') return 'android';
  return null;
}
