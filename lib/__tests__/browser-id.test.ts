import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserId } from '@/lib/browser-id';

afterEach(() => vi.unstubAllGlobals());

describe('createBrowserId', () => {
  it('creates an id when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(7);
        return bytes;
      },
    });

    expect(createBrowserId('photo-lab-session')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('falls back to a prefixed id without Web Crypto', () => {
    vi.stubGlobal('crypto', {});

    expect(createBrowserId('photo-lab-session')).toMatch(/^photo-lab-session-/);
  });
});
