import { afterEach, describe, expect, it, vi } from 'vitest';
import { fallbackPhotoHash, hashPhotoBlob } from '@/features/photo-lab/client/downscale';

afterEach(() => vi.unstubAllGlobals());

describe('photo hashing', () => {
  it('creates a stable local key without Web Crypto', async () => {
    vi.stubGlobal('crypto', {});
    const first = await hashPhotoBlob(new Blob(['android-lan-photo']));
    const second = await hashPhotoBlob(new Blob(['android-lan-photo']));

    expect(first).toHaveLength(64);
    expect(second).toBe(first);
  });

  it('changes the fallback key when the photo bytes change', () => {
    expect(fallbackPhotoHash(new Uint8Array([1, 2, 3])))
      .not.toBe(fallbackPhotoHash(new Uint8Array([1, 2, 4])));
  });
});
