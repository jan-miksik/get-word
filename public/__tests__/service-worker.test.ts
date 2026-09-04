import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

/**
 * Runs the worker's top level the way a browser would, and reports which
 * events it subscribed to. The distinction the dev mode rests on is structural:
 * a push-only worker must add no fetch handler at all, because a registered
 * handler sits in front of every request whether or not it does anything.
 */
type WindowClientStub = { visibilityState: string; focused: boolean };

type Worker = {
  listeners: Map<string, (event: unknown) => void>;
  showNotification: ReturnType<typeof vi.fn>;
};

function evaluateWorker(scriptUrl: string, windows: WindowClientStub[] = []): Worker {
  const listeners = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn(async () => undefined);
  const self = {
    location: { href: scriptUrl, origin: 'https://example.test' },
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      listeners.set(type, handler);
    },
    clients: {
      claim: vi.fn(),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(),
    },
    registration: { showNotification },
    skipWaiting: vi.fn(),
  };
  const caches = { open: vi.fn(), keys: vi.fn(async () => []), delete: vi.fn(), match: vi.fn() };
  new Function('self', 'caches', source)(self, caches);
  return { listeners, showNotification };
}

/** Delivers one reminder push and waits for whatever the handler kept alive. */
async function deliverReminder(worker: Worker): Promise<void> {
  const handler = worker.listeners.get('push');
  if (!handler) throw new Error('the worker registered no push handler');
  let pending: Promise<unknown> = Promise.resolve();
  handler({
    data: { json: () => ({ title: 'Get Word', body: 'A short study session is ready.' }) },
    waitUntil: (promise: Promise<unknown>) => { pending = promise; },
  });
  await pending;
}

describe('service worker modes', () => {
  it('serves requests in the default mode', () => {
    const { listeners } = evaluateWorker('https://example.test/sw.js?build=42');
    expect([...listeners.keys()]).toContain('fetch');
    expect([...listeners.keys()]).toContain('push');
  });

  it('adds no fetch handler in push-only mode, so hot reload is untouched', () => {
    const { listeners } = evaluateWorker('https://example.test/sw.js?build=dev&mode=push-only');
    expect([...listeners.keys()]).not.toContain('fetch');
    // The whole point of registering it in development.
    expect([...listeners.keys()]).toContain('push');
    expect([...listeners.keys()]).toContain('notificationclick');
  });
});

describe('study reminder push', () => {
  const workerUrl = 'https://example.test/sw.js?build=42';

  it('stays quiet while the learner is looking at the app', async () => {
    const worker = evaluateWorker(workerUrl, [{ visibilityState: 'visible', focused: true }]);
    await deliverReminder(worker);
    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  it('notifies a tab that is open behind another tab', async () => {
    const worker = evaluateWorker(workerUrl, [{ visibilityState: 'hidden', focused: false }]);
    await deliverReminder(worker);
    expect(worker.showNotification).toHaveBeenCalledOnce();
  });

  it('notifies a frontmost tab whose window is behind another application', async () => {
    // `visibilityState` alone calls this one "visible". Nobody is looking at
    // it, and the day's reminder is spent whether or not it is shown.
    const worker = evaluateWorker(workerUrl, [{ visibilityState: 'visible', focused: false }]);
    await deliverReminder(worker);
    expect(worker.showNotification).toHaveBeenCalledOnce();
  });

  it('notifies when no window is open at all', async () => {
    const worker = evaluateWorker(workerUrl, []);
    await deliverReminder(worker);
    expect(worker.showNotification).toHaveBeenCalledOnce();
  });
});
