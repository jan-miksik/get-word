import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateAudio: vi.fn(),
  storeClipBytes: vi.fn(),
}));

vi.mock('../api', () => ({ generateAudio: mocks.generateAudio }));
vi.mock('../clip-playback', () => ({ storeClipBytes: mocks.storeClipBytes }));

import { generateAudioWithRetries } from '../audio-generation';

const item = (key: string) => ({ key, text: `text-${key}`, language: 'de' });

describe('generateAudioWithRetries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retries only explicit failures and rows omitted from a partial response', async () => {
    mocks.generateAudio
      .mockResolvedValueOnce({
        results: [
          {
            key: 'a',
            status: 'ok',
            asset_id: 'asset-a',
            content_hash: 'hash-a',
            audio_base64: null,
            error: null,
          },
          {
            key: 'b',
            status: 'error',
            asset_id: null,
            content_hash: null,
            audio_base64: null,
            error: 'temporary',
          },
        ],
        quota_exhausted: null,
      })
      .mockResolvedValueOnce({
        results: [
          {
            key: 'b',
            status: 'ok',
            asset_id: 'asset-b',
            content_hash: 'hash-b',
            audio_base64: null,
            error: null,
          },
          {
            key: 'c',
            status: 'ok',
            asset_id: 'asset-c',
            content_hash: null,
            audio_base64: null,
            error: null,
          },
        ],
        quota_exhausted: null,
      });

    const result = await generateAudioWithRetries([item('a'), item('b'), item('c')]);

    expect(mocks.generateAudio).toHaveBeenNthCalledWith(2, {
      items: [item('b'), item('c')],
    });
    expect([...result.keys()]).toEqual(['a', 'b', 'c']);
  });

  it('caches fresh bytes and does not retry quota-skipped rows', async () => {
    mocks.generateAudio.mockResolvedValue({
      results: [
        {
          key: 'a',
          status: 'ok',
          asset_id: 'asset-a',
          content_hash: 'hash-a',
          audio_base64: 'base64-audio',
          error: null,
        },
        {
          key: 'b',
          status: 'skipped',
          asset_id: null,
          content_hash: null,
          audio_base64: null,
          error: 'quota',
        },
      ],
      quota_exhausted: 'daily',
    });

    const result = await generateAudioWithRetries([item('a'), item('b')]);

    expect(mocks.generateAudio).toHaveBeenCalledTimes(1);
    expect(mocks.storeClipBytes).toHaveBeenCalledWith('hash-a', 'base64-audio');
    expect(result.get('a')).toEqual({ assetId: 'asset-a', contentHash: 'hash-a' });
    expect(result.has('b')).toBe(false);
  });
});
