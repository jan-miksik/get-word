'use client';

import { apiFetch } from '@/features/shared/http/api-runtime';
import { requestReminderPermission } from '@/lib/notifications/runtime';

function vapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  return key || null;
}

function base64UrlToApplicationServerKey(value: string): ArrayBuffer {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const decoded = window.atob(padded);
  // A fresh Uint8Array always owns an ArrayBuffer here. TypeScript's DOM
  // declarations conservatively permit SharedArrayBuffer too, which PushManager
  // does not accept, hence the narrow cast.
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0)).buffer as ArrayBuffer;
}

/**
 * What this browser can actually do with reminders — asked of the platform, one
 * capability at a time, and never of the user agent string.
 *
 * The distinction that matters is between notifications and *push*: a browser
 * can implement the Notification API perfectly and still refuse to hand out a
 * push subscription (Brave ships with Google's push service switched off, and a
 * deployment with no VAPID key configured is in the same position). That is not
 * "this device does not support notifications", and telling the learner so was
 * wrong — permission still works, and reminders still fire while the app is
 * open, so the screen must offer them.
 */
export type ReminderCapability =
  /** A native notification port is installed (the iOS/Android shells). */
  | 'native'
  /** Notifications and a usable push subscription path both look present. */
  | 'web-push'
  /** This build has no public VAPID key, so the app cannot request Push. */
  | 'unconfigured'
  /** Notifications work; nothing here can deliver them in the background. */
  | 'local-only'
  /** Notifications need https; this page is not in a secure context. */
  | 'insecure-context'
  /** No Notification API at all. */
  | 'unsupported';

function hasNotificationApi(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function pushSubscriptionLooksAvailable(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

/**
 * Read-only probe. Never prompts, so it is safe to call during render — the
 * verdict it returns is "what could work", not "what the learner has allowed".
 */
export function detectReminderCapability(hasNativePort = false): ReminderCapability {
  if (hasNativePort) return 'native';
  if (typeof window === 'undefined') return 'unsupported';
  if (!hasNotificationApi()) return 'unsupported';
  // Checked after the API test on purpose: a browser without notifications at
  // all is unsupported whatever the origin, and http://localhost counts as a
  // secure context, so this only fires on a genuinely insecure page.
  if (!window.isSecureContext) return 'insecure-context';
  if (!vapidPublicKey()) return 'unconfigured';
  return pushSubscriptionLooksAvailable() ? 'web-push' : 'local-only';
}

export type WebPushSubscriptionResult =
  | 'subscribed'
  /** Notifications are allowed, but no push subscription could be created. */
  | 'push-unavailable'
  | 'unsupported'
  | 'denied';

export type StudyReminderPermissionResult =
  /** Allowed, and this device can be reached while the app is closed. */
  | 'granted'
  /** Permission exists, but this app has no delivery transport on this device. */
  | 'granted-local'
  /** The deployed app is missing its browser-push public key. */
  | 'unconfigured'
  /** The learner said no, or the site is blocked in browser settings. */
  | 'denied'
  /** The prompt was closed without an answer; asking again is allowed. */
  | 'dismissed'
  | 'insecure-context'
  | 'unsupported';

/** Whether a result has a real delivery path and may be persisted as enabled. */
export function reminderPermissionEnablesReminders(
  result: StudyReminderPermissionResult,
): boolean {
  return result === 'granted';
}

/**
 * `navigator.serviceWorker.ready` never rejects: on a page whose worker failed
 * to register it simply waits forever, which would leave the enable button
 * spinning with no way out. Time it out and treat that as "no push here".
 */
async function readyServiceWorker(timeoutMs = 5000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  let timer: number | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        timer = window.setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

/**
 * `PWARegister` normally owns installation. A previously failed registration,
 * however, left Brave's retry button waiting on `ready` forever. On a direct
 * user retry we may safely repair the same root-scoped registration and then
 * ask for its active worker again.
 */
async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  const ready = await readyServiceWorker(2000);
  if (ready) return ready;
  if (!('serviceWorker' in navigator)) return null;

  try {
    const version = process.env.NEXT_PUBLIC_APP_VERSION ?? 'push-recovery';
    await navigator.serviceWorker.register(
      `/sw.js?build=${encodeURIComponent(version)}`,
      { scope: '/', updateViaCache: 'none' },
    );
    return readyServiceWorker(5000);
  } catch (error) {
    console.warn('[reminders] service worker recovery failed:', error);
    return null;
  }
}

/** Must be called from a direct settings interaction because browsers reject
 * notification permission prompts not initiated by a user gesture. */
async function subscribeToStudyWebPush(): Promise<WebPushSubscriptionResult> {
  const capability = detectReminderCapability();
  if (
    capability === 'unsupported'
    || capability === 'insecure-context'
    || capability === 'unconfigured'
  ) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
  }
  if (capability === 'local-only') return 'push-unavailable';
  const registration = await ensureServiceWorker();
  if (!registration) return 'push-unavailable';
  const existing = await registration.pushManager.getSubscription();
  // Brave (and any browser whose push service is switched off) rejects here
  // rather than missing the API, so the failure is only discoverable by trying.
  let subscription = existing;
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToApplicationServerKey(vapidPublicKey()!),
      });
    } catch (error) {
      // Brave can keep a registration created while its Google push service was
      // disabled. Refresh the worker and retry once now that the learner has
      // enabled the service; this avoids requiring an app reinstall.
      console.warn('[reminders] first push subscription attempt failed:', error);
      try {
        await registration.update();
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToApplicationServerKey(vapidPublicKey()!),
        });
      } catch (retryError) {
        console.warn('[reminders] this browser refused a push subscription:', retryError);
        return 'push-unavailable';
      }
    }
  }
  const response = await apiFetch('/api/goals/push-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error(`Saving push subscription failed: ${response.status}`);
  return 'subscribed';
}

/**
 * One user-gesture entrypoint for native notification ports and browser Push.
 *
 * Returns why it could not be granted rather than a blanket "unsupported": the
 * four outcomes ask for four different things from the learner, and only one of
 * them is about the device being incapable.
 */
export async function requestStudyReminderPermission(): Promise<StudyReminderPermissionResult> {
  if (await requestReminderPermission()) return 'granted';

  const capability = detectReminderCapability();
  if (capability === 'unsupported') return 'unsupported';
  if (capability === 'insecure-context') return 'insecure-context';
  if (capability === 'unconfigured') {
    console.warn(
      '[reminders] NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY is not set, so this build cannot create push subscriptions.',
    );
    return 'unconfigured';
  }

  // Asked before subscribing so a closed prompt ("default" afterwards) can be
  // told apart from an explicit no.
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission === 'denied') return 'denied';
    if (permission !== 'granted') return 'dismissed';
  }

  const webResult = await subscribeToStudyWebPush();
  if (webResult === 'subscribed') return 'granted';
  if (webResult === 'denied') return 'denied';
  // Permission alone cannot deliver anything. The UI explains the missing
  // transport and persists reminders as disabled instead of promising a local
  // notification scheduler the web runtime does not have.
  return 'granted-local';
}

/** Reconnect a previously granted browser permission when this device returns
 * to the app. Unlike `subscribeToStudyWebPush` it will never open a prompt. */
export async function syncGrantedStudyWebPush(): Promise<WebPushSubscriptionResult> {
  if (detectReminderCapability() !== 'web-push') return 'unsupported';
  if (Notification.permission !== 'granted') return 'denied';
  return subscribeToStudyWebPush();
}

export async function unsubscribeFromStudyWebPush(): Promise<void> {
  if (detectReminderCapability() !== 'web-push') return;
  const registration = await readyServiceWorker();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const response = await apiFetch('/api/goals/push-subscription', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Removing push subscription failed: ${response.status}`);
  }
  await subscription.unsubscribe();
}
