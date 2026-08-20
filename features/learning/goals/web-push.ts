'use client';

import { apiFetch } from '@/features/shared/http/api-runtime';

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

function isWebPushAvailable(): boolean {
  return typeof window !== 'undefined'
    && window.isSecureContext
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
    && vapidPublicKey() !== null;
}

export type WebPushSubscriptionResult = 'subscribed' | 'unsupported' | 'denied';

/** Must be called from a direct settings interaction because browsers reject
 * notification permission prompts not initiated by a user gesture. */
export async function subscribeToStudyWebPush(): Promise<WebPushSubscriptionResult> {
  if (!isWebPushAvailable()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToApplicationServerKey(vapidPublicKey()!),
  });
  const response = await apiFetch('/api/goals/push-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error(`Saving push subscription failed: ${response.status}`);
  return 'subscribed';
}

/** Reconnect a previously granted browser permission when this device returns
 * to the app. Unlike `subscribeToStudyWebPush` it will never open a prompt. */
export async function syncGrantedStudyWebPush(): Promise<WebPushSubscriptionResult> {
  if (!isWebPushAvailable()) return 'unsupported';
  if (Notification.permission !== 'granted') return 'denied';
  return subscribeToStudyWebPush();
}

export async function unsubscribeFromStudyWebPush(): Promise<void> {
  if (!isWebPushAvailable()) return;
  const registration = await navigator.serviceWorker.ready;
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
