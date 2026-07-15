import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  computeContentHash: vi.fn(),
  googleTTS: vi.fn(),
  isPlayableAudioAsset: vi.fn(),
  uploadAudio: vi.fn(),
  countGoogleApiTextUnits: vi.fn(),
  createMediaAsset: vi.fn(),
  upsertMediaAsset: vi.fn(),
  findMediaByHash: vi.fn(),
  findMediaByHashes: vi.fn(),
  reserveGoogleApiUsage: vi.fn(),
  runGoogleTtsWithRetry: vi.fn(),
  putAudioResult: vi.fn(),
  reservePhotoLabAudioRateLimit: vi.fn(),
}));

vi.mock('@/lib/audio', () => ({
  GoogleTTSQuotaExhaustedError: class GoogleTTSQuotaExhaustedError extends Error {},
  computeContentHash: mocks.computeContentHash,
  googleTTS: mocks.googleTTS,
}));
vi.mock('@/lib/audio-assets', () => ({
  isPlayableAudioAsset: mocks.isPlayableAudioAsset,
}));
vi.mock('@/lib/audio-storage', () => ({ uploadAudio: mocks.uploadAudio }));
vi.mock('@/lib/db', () => ({
  countGoogleApiTextUnits: mocks.countGoogleApiTextUnits,
  createMediaAsset: mocks.createMediaAsset,
  upsertMediaAsset: mocks.upsertMediaAsset,
  findMediaByHash: mocks.findMediaByHash,
  findMediaByHashes: mocks.findMediaByHashes,
  reserveGoogleApiUsage: mocks.reserveGoogleApiUsage,
}));
vi.mock('@/lib/google-tts-rate-limit', () => ({
  runGoogleTtsWithRetry: mocks.runGoogleTtsWithRetry,
}));
vi.mock('@/lib/object-storage', () => ({
  getActiveObjectStorageProvider: () => 'b2',
  objectKeyForHash: (hash: string) => `audio/${hash}.mp3`,
  putAudioResult: mocks.putAudioResult,
}));
vi.mock('../rate-limit', () => ({
  DailyLimitError: class DailyLimitError extends Error {},
  reservePhotoLabAudioRateLimit: mocks.reservePhotoLabAudioRateLimit,
}));

import { generatePhotoLabAudio } from '../audio';

describe('generatePhotoLabAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.computeContentHash.mockImplementation((text: string, language: string) =>
      `${language}:${text}`,
    );
    mocks.findMediaByHashes.mockResolvedValue(new Map());
    mocks.findMediaByHash.mockResolvedValue(null);
    mocks.isPlayableAudioAsset.mockImplementation(
      (asset: { storageType?: string } | null | undefined) =>
        Boolean(asset && asset.storageType !== 'r2'),
    );
    mocks.reservePhotoLabAudioRateLimit.mockResolvedValue(undefined);
    mocks.countGoogleApiTextUnits.mockImplementation((texts: string[]) => texts.join('').length);
    mocks.reserveGoogleApiUsage.mockResolvedValue({ allowed: true });
    mocks.runGoogleTtsWithRetry.mockImplementation((generate: () => unknown) => generate());
    mocks.googleTTS.mockResolvedValue({ audio: Buffer.from('mp3'), sizeBytes: 3 });
    mocks.uploadAudio.mockResolvedValue({ storageType: 'arweave', storageRef: 'ar-ref' });
    mocks.putAudioResult.mockResolvedValue({ ok: true });
    mocks.createMediaAsset.mockImplementation(async (asset) => ({ id: 'asset', ...asset }));
    mocks.upsertMediaAsset.mockImplementation(async (asset) => ({ id: 'asset', ...asset }));
  });

  it('deduplicates equal target words within one request', async () => {
    const result = await generatePhotoLabAudio({
      userId: 'user-1',
      language: 'vi',
      items: [
        { id: 'a', text: 'chó' },
        { id: 'b', text: 'chó' },
      ],
    });

    expect(mocks.googleTTS).toHaveBeenCalledTimes(1);
    expect(mocks.createMediaAsset).toHaveBeenCalledTimes(1);
    expect(result.results).toEqual([
      { id: 'a', hash: 'vi:chó' },
      { id: 'b', hash: 'vi:chó' },
    ]);
  });

  it('reserves quotas only for unique hashes missing from durable storage', async () => {
    mocks.findMediaByHashes.mockResolvedValue(
      new Map([['vi:cached', { storageType: 'arweave', storageRef: 'cached-ref' }]]),
    );

    const result = await generatePhotoLabAudio({
      userId: 'user-2',
      language: 'vi',
      items: [
        { id: 'cached', text: 'cached' },
        { id: 'new-a', text: 'new' },
        { id: 'new-b', text: 'new' },
      ],
    });

    expect(mocks.reservePhotoLabAudioRateLimit).toHaveBeenCalledWith('user-2', 1);
    expect(mocks.countGoogleApiTextUnits).toHaveBeenCalledWith(['new']);
    expect(mocks.reserveGoogleApiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2', units: 3, requestCount: 1 }),
    );
    expect(mocks.googleTTS).toHaveBeenCalledTimes(1);
    expect(result.results.map((item) => item.hash)).toEqual(['vi:cached', 'vi:new', 'vi:new']);
  });

  it('returns no hash and creates no media row when both durable stores fail', async () => {
    mocks.uploadAudio.mockRejectedValue(new Error('arweave unavailable'));
    mocks.putAudioResult.mockResolvedValue({ ok: false, category: 'unavailable' });

    const result = await generatePhotoLabAudio({
      userId: 'user-3',
      language: 'cs',
      items: [{ id: 'a', text: 'pes' }],
    });

    expect(result.results).toEqual([{ id: 'a', hash: null }]);
    expect(mocks.createMediaAsset).not.toHaveBeenCalled();
    expect(mocks.upsertMediaAsset).not.toHaveBeenCalled();
  });

  it('repairs an unplayable legacy row before returning its hash', async () => {
    mocks.createMediaAsset.mockResolvedValue({
      id: 'legacy',
      storageType: 'r2',
      storageRef: 'removed',
    });

    const result = await generatePhotoLabAudio({
      userId: 'user-4',
      language: 'cs',
      items: [{ id: 'a', text: 'pes' }],
    });

    expect(mocks.upsertMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({ contentHash: 'cs:pes', storageType: 'arweave' }),
    );
    expect(result.results).toEqual([{ id: 'a', hash: 'cs:pes' }]);
  });
});
