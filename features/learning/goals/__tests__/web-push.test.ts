import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  detectReminderCapability,
  requestStudyReminderPermission,
} from '../web-push';

const apiFetch = vi.hoisted(() => vi.fn());
const requestReminderPermission = vi.hoisted(() => vi.fn(async () => false));

vi.mock('@/features/shared/http/api-runtime', () => ({ apiFetch }));
vi.mock('@/lib/notifications/runtime', () => ({ requestReminderPermission }));

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
  vapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
}: {
  notifications?: boolean;
  secureContext?: boolean;
  permission?: NotificationPermission;
  requestedPermission?: NotificationPermission;
  serviceWorker?: boolean;
  pushManager?: boolean;
  subscribeFails?: boolean;
  /** Empty stands for a deployment that never configured web push. */
  vapidKey?: string;
} = {}) {
  const subscription = {
    endpoint: 'https://push.example/abc',
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }),
  };
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => null),
      subscribe: vi.fn(async () => {
        if (subscribeFails) throw new Error('Registration failed - push service not available');
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
  if (serviceWorker) navigatorStub.serviceWorker = { ready: Promise.resolve(registration) };
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

    // Same verdict for a build with no VAPID key: the browser is fine, this
    // deployment simply cannot create subscriptions.
    stubBrowser({ vapidKey: '' });
    expect(detectReminderCapability()).toBe('local-only');

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
    await expect(requestStudyReminderPermission()).resolves.toBe('granted-local');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('registers the subscription when push does work', async () => {
    stubBrowser({ permission: 'granted' });
    await expect(requestStudyReminderPermission()).resolves.toBe('granted');
    expect(apiFetch).toHaveBeenCalledWith('/api/goals/push-subscription', expect.objectContaining({ method: 'POST' }));
  });
});
