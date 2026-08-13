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
  getGoogleChirp3HdVoices: vi.fn(),
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
vi.mock('@/lib/language-catalog', () => ({
  getGoogleChirp3HdVoices: mocks.getGoogleChirp3HdVoices,
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
import { pickVoiceForText } from '@/lib/tts-voice-mix';

describe('pickVoiceForText', () => {
  it('is deterministic and returns "default" without voices', () => {
    const voices = ['cs-CZ-Chirp3-HD-Aoede', 'cs-CZ-Chirp3-HD-Puck', 'cs-CZ-Chirp3-HD-Kore'];
    expect(pickVoiceForText('pes', voices)).toBe(pickVoiceForText('pes', voices));
    expect(voices).toContain(pickVoiceForText('pes', voices));
    expect(pickVoiceForText('pes', [])).toBe('default');
  });

  it('spreads different words across the voice list', () => {
    const voices = ['a', 'b', 'c', 'd', 'e', 'f'];
    const words = ['pes', 'kočka', 'stůl', 'židle', 'okno', 'lampa', 'hrnek', 'kniha'];
    const chosen = new Set(words.map((word) => pickVoiceForText(word, voices)));
    expect(chosen.size).toBeGreaterThan(1);
  });
});

describe('generatePhotoLabAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.computeContentHash.mockImplementation((text: string, language: string) =>
      `${language}:${text}`,
    );
    mocks.getGoogleChirp3HdVoices.mockResolvedValue([]);
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

  it('generates with a named Chirp3-HD voice and records it on the media row', async () => {
    const voices = ['cs-CZ-Chirp3-HD-Aoede', 'cs-CZ-Chirp3-HD-Puck'];
    mocks.getGoogleChirp3HdVoices.mockResolvedValue(voices);

    await generatePhotoLabAudio({
      userId: 'user-5',
      language: 'cs',
      items: [{ id: 'a', text: 'pes' }],
    });

    const expectedVoice = pickVoiceForText('pes', voices);
    expect(mocks.googleTTS).toHaveBeenCalledWith('pes', 'cs', expectedVoice, {
      source: 'photo_lab_audio',
      userId: 'user-5',
    });
    expect(mocks.computeContentHash).toHaveBeenCalledWith(
      'pes',
      'cs',
      'google_tts',
      expect.objectContaining({ voiceId: expectedVoice }),
    );
    expect(mocks.uploadAudio).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ voiceId: expectedVoice }),
    );
    expect(mocks.createMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({ voiceId: expectedVoice }),
    );
  });

  it('falls back to the default voice when the catalog has no Chirp3-HD voices', async () => {
    await generatePhotoLabAudio({
      userId: 'user-6',
      language: 'cs',
      items: [{ id: 'a', text: 'pes' }],
    });

    expect(mocks.googleTTS).toHaveBeenCalledWith('pes', 'cs', undefined, {
      source: 'photo_lab_audio',
      userId: 'user-6',
    });
    expect(mocks.createMediaAsset).toHaveBeenCalledWith(
      expect.objectContaining({ voiceId: null }),
    );
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
