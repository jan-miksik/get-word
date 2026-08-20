import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const resolveAuthenticatedUser = vi.fn();
const upsertWebPushSubscription = vi.fn();
const deleteWebPushSubscription = vi.fn();

vi.mock('@/lib/auth', () => ({
  resolveAuthenticatedUser: (...args: unknown[]) => resolveAuthenticatedUser(...args),
}));

vi.mock('@/lib/db', () => ({
  upsertWebPushSubscription: (...args: unknown[]) => upsertWebPushSubscription(...args),
  deleteWebPushSubscription: (...args: unknown[]) => deleteWebPushSubscription(...args),
}));

import { DELETE, POST } from '../route';

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/example-capability',
  keys: { p256dh: 'p'.repeat(32), auth: 'a'.repeat(16) },
};

describe('push subscription route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAuthenticatedUser.mockResolvedValue({ id: 'user-1' });
    upsertWebPushSubscription.mockResolvedValue(undefined);
    deleteWebPushSubscription.mockResolvedValue(undefined);
  });

  it('stores a browser subscription only for the authenticated account', async () => {
    const response = await POST(new NextRequest('http://localhost/api/goals/push-subscription', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'Chrome Android' },
      body: JSON.stringify(subscription),
    }));

    expect(response.status).toBe(200);
    expect(upsertWebPushSubscription).toHaveBeenCalledWith('user-1', {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: 'Chrome Android',
    });
  });

  it('rejects non-HTTPS endpoint data before it reaches the database', async () => {
    const response = await POST(new NextRequest('http://localhost/api/goals/push-subscription', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...subscription, endpoint: 'http://example.test/push' }),
    }));

    expect(response.status).toBe(400);
    expect(upsertWebPushSubscription).not.toHaveBeenCalled();
  });

  it('removes only the requesting account’s endpoint', async () => {
    const response = await DELETE(new NextRequest('http://localhost/api/goals/push-subscription', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }));

    expect(response.status).toBe(204);
    expect(deleteWebPushSubscription).toHaveBeenCalledWith('user-1', subscription.endpoint);
  });
});
