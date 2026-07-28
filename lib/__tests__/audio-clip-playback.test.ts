import { beforeEach, describe, expect, it, vi } from 'vitest';

const cacheMocks = vi.hoisted(() => ({
  getClip: vi.fn(),
  putClip: vi.fn(),
}));

vi.mock('@/lib/audio-clip-cache', () => cacheMocks);

describe('shared audio clip playback cache', () => {
  beforeEach(() => {
    vi.resetModules();
    cacheMocks.getClip.mockReset();
    cacheMocks.putClip.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:warmed-clip');
  });

  it('downloads and persists a clip before first playback', async () => {
    cacheMocks.getClip.mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Blob(['audio'], { type: 'audio/mpeg' }), { status: 200 }),
    );
    const { getWarmedClipUrl, prefetchClips } = await import('../audio-clip-playback');

    await prefetchClips(['hash-1']);

    expect(fetch).toHaveBeenCalledWith('/api/audio/hash-1');
    expect(cacheMocks.putClip).toHaveBeenCalledWith('hash-1', expect.any(Blob));
    expect(getWarmedClipUrl('hash-1')).toBe('blob:warmed-clip');
  });

  it('re-reads an evicted clip from IndexedDB instead of pinning every blob', async () => {
    cacheMocks.getClip.mockResolvedValue(new Blob(['cached'], { type: 'audio/mpeg' }));
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const { getLocalClipUrl, getWarmedClipUrl, prefetchClips } = await import(
      '../audio-clip-playback'
    );

    await prefetchClips(Array.from({ length: 70 }, (_, index) => `hash-${index}`));

    // The oldest entries are released; their bytes still live in IndexedDB.
    expect(getWarmedClipUrl('hash-0')).toBeNull();
    expect(getWarmedClipUrl('hash-69')).toBe('blob:warmed-clip');
    await expect(getLocalClipUrl('hash-0')).resolves.toBe('blob:warmed-clip');
  });

  it('uses IndexedDB without another network request when already cached', async () => {
    cacheMocks.getClip.mockResolvedValue(new Blob(['cached'], { type: 'audio/mpeg' }));
    const { getWarmedClipUrl, prefetchClips } = await import('../audio-clip-playback');

    await prefetchClips(['hash-2', 'hash-2']);

    expect(fetch).not.toHaveBeenCalled();
    expect(getWarmedClipUrl('hash-2')).toBe('blob:warmed-clip');
  });
});
