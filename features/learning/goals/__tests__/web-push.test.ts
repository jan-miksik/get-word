import { afterEach, describe, expect, it, vi } from 'vitest';

import { PUBLIC_LANGUAGE_STORAGE_KEY } from '@/lib/i18n/public-language';
import {
  detectReminderCapability,
  requestStudyReminderPermission,
} from '../web-push';

const apiFetch = vi.hoisted(() => vi.fn());
const requestReminderPermission = vi.hoisted(() => vi.fn(async () => false));

vi.mock('@/features/shared/http/api-runtime', () => ({ apiFetch }));
vi.mock('@/lib/notifications/runtime', () => ({ requestReminderPermission }));

/** Mirrors the production base64url decoding so a key can be compared by bytes. */
function applicationServerKeyBytes(value: string): ArrayBuffer {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const decoded = window.atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0)).buffer;
}

type NotificationStub = {
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
};

/**
 * A browser is described by what it exposes, so every case here is built the
 * same way the detection reads it: the API, the secure context, the permission,
 * and whether a push subscription can actually be created.
 */
function stubBrowser({
  notifications = true,
  secureContext = true,
  permission = 'default' as NotificationPermission,
  requestedPermission = 'granted' as NotificationPermission,
  serviceWorker = true,
  pushManager = true,
  subscribeFails = false,
  subscribeFailsOnce = false,
  existingKey = null as string | null,
  vapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
}: {
  notifications?: boolean;
  secureContext?: boolean;
  permission?: NotificationPermission;
  requestedPermission?: NotificationPermission;
  serviceWorker?: boolean;
  pushManager?: boolean;
  subscribeFails?: boolean;
  subscribeFailsOnce?: boolean;
  /** Key a previously stored subscription was created with, if there is one. */
  existingKey?: string | null;
  /** Empty stands for a deployment that never configured web push. */
  vapidKey?: string;
} = {}) {
  const subscription = {
    endpoint: 'https://push.example/abc',
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }),
  };
  const existingSubscription = existingKey
    ? {
        endpoint: 'https://push.example/stale',
        options: { applicationServerKey: applicationServerKeyBytes(existingKey) },
        unsubscribe: vi.fn(async () => true),
        toJSON: () => ({ endpoint: 'https://push.example/stale', keys: { p256dh: 'p', auth: 'a' } }),
      }
    : null;
  let subscribeAttempt = 0;
  const registration = {
    update: vi.fn(async () => undefined),
    existingSubscription,
    pushManager: {
      getSubscription: vi.fn(async () => existingSubscription),
      subscribe: vi.fn(async () => {
        subscribeAttempt += 1;
        if (subscribeFails || (subscribeFailsOnce && subscribeAttempt === 1)) {
          throw new Error('Registration failed - push service not available');
        }
        return subscription;
      }),
    },
  };

  if (notifications) {
    const stub: NotificationStub = {
      permission,
      requestPermission: vi.fn(async () => requestedPermission),
    };
    vi.stubGlobal('Notification', stub);
  } else {
    Reflect.deleteProperty(window, 'Notification');
  }
  vi.stubGlobal('isSecureContext', secureContext);
  vi.stubGlobal('PushManager', pushManager ? function PushManager() {} : undefined);
  if (pushManager === false) Reflect.deleteProperty(window, 'PushManager');
  const navigatorStub: Record<string, unknown> = {};
  if (serviceWorker) {
    navigatorStub.serviceWorker = {
      ready: Promise.resolve(registration),
      register: vi.fn(async () => registration),
    };
  }
  vi.stubGlobal('navigator', navigatorStub);
  vi.stubEnv('NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY', vapidKey);
  apiFetch.mockResolvedValue({ ok: true, status: 200 });
  return registration;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  requestReminderPermission.mockResolvedValue(false);
});

describe('detectReminderCapability', () => {
  it('reads a full web-push browser as web-push', () => {
    stubBrowser();
    expect(detectReminderCapability()).toBe('web-push');
  });

  it('separates a browser without push from one without notifications', () => {
    stubBrowser({ pushManager: false });
    expect(detectReminderCapability()).toBe('local-only');

    // A build with no VAPID key is an application configuration problem, not a
    // browser limitation.
    stubBrowser({ vapidKey: '' });
    expect(detectReminderCapability()).toBe('unconfigured');

    stubBrowser({ notifications: false });
    expect(detectReminderCapability()).toBe('unsupported');
  });

  it('names an insecure page rather than calling the device incapable', () => {
    stubBrowser({ secureContext: false });
    expect(detectReminderCapability()).toBe('insecure-context');
  });

  it('trusts an installed native port over anything the browser exposes', () => {
    stubBrowser({ notifications: false });
    expect(detectReminderCapability(true)).toBe('native');
  });
});

describe('requestStudyReminderPermission', () => {
  it('grants through the native port without touching the browser APIs', async () => {
    stubBrowser({ notifications: false });
    requestReminderPermission.mockResolvedValue(true);
    await expect(requestStudyReminderPermission()).resolves.toBe('granted');
  });

  it('tells a refusal apart from a closed prompt', async () => {
    stubBrowser({ permission: 'denied' });
    await expect(requestStudyReminderPermission()).resolves.toBe('denied');

    stubBrowser({ permission: 'default', requestedPermission: 'default' });
    await expect(requestStudyReminderPermission()).resolves.toBe('dismissed');
  });

  it('keeps the grant when the browser refuses a push subscription', async () => {
    // Brave with its push service switched off: permission works, the
    // subscription call is what fails.
    stubBrowser({ permission: 'granted', subscribeFails: true });
    await expect(requestStudyReminderPermission()).resolves.toBe('granted-local');
  });

  it('keeps the grant when the deployment has no VAPID key', async () => {
    stubBrowser({ permission: 'granted', vapidKey: '' });
    await expect(requestStudyReminderPermission()).resolves.toBe('unconfigured');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('refreshes a stale Brave registration and retries once', async () => {
    const registration = stubBrowser({ permission: 'granted', subscribeFailsOnce: true });
    await expect(requestStudyReminderPermission()).resolves.toBe('granted');
    expect(registration.update).toHaveBeenCalledOnce();
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(2);
  });

  it('registers the subscription when push does work', async () => {
    stubBrowser({ permission: 'granted' });
    await expect(requestStudyReminderPermission()).resolves.toBe('granted');
    expect(apiFetch).toHaveBeenCalledWith('/api/goals/push-subscription', expect.objectContaining({ method: 'POST' }));
  });

  it('sends the interface language with the device', async () => {
    // The reminder text is written on the server, which cannot see the locale
    // this interface renders in; without this the learner reads English.
    stubBrowser({ permission: 'granted' });
    window.localStorage.setItem(PUBLIC_LANGUAGE_STORAGE_KEY, 'cs');
    try {
      await expect(requestStudyReminderPermission()).resolves.toBe('granted');
    } finally {
      window.localStorage.removeItem(PUBLIC_LANGUAGE_STORAGE_KEY);
    }
    const post = apiFetch.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({
      endpoint: 'https://push.example/abc',
      language: 'cs',
    });
  });

  it('replaces a subscription left over from a different VAPID key', async () => {
    // Reusing it would make every subscribe throw InvalidStateError, which
    // reads exactly like a browser that refuses push and sent the learner into
    // browser settings that were already correct.
    const registration = stubBrowser({ permission: 'granted', existingKey: 'BJ1PLIiCr87dBHFPDtLmRnCJdaoCXlRvMV0-vLJYNBIkYPjrfPHIWQZnRnRnbEqcVvXVQnJ9dyKZFrfPmZmSSSc' });
    await expect(requestStudyReminderPermission()).resolves.toBe('granted');
    expect(registration.existingSubscription?.unsubscribe).toHaveBeenCalledOnce();
    expect(registration.pushManager.subscribe).toHaveBeenCalledOnce();
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/goals/push-subscription',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('keeps a subscription that already uses the current key', async () => {
    const registration = stubBrowser({
      permission: 'granted',
      existingKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
    });
    await expect(requestStudyReminderPermission()).resolves.toBe('granted');
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('names a failed save as a save, not as a browser without push', async () => {
    stubBrowser({ permission: 'granted' });
    apiFetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(requestStudyReminderPermission()).resolves.toBe('granted-save-failed');
  });
});
