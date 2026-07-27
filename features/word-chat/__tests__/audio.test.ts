import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getGoogleChirp3HdVoices: vi.fn(),
  findMediaByHashes: vi.fn(),
  reserveGoogleApiUsage: vi.fn(),
  countGoogleApiTextUnits: vi.fn(),
  computeContentHash: vi.fn(),
  isPlayableAudioAsset: vi.fn(),
  generateAudioForItem: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  findMediaByHashes: mocks.findMediaByHashes,
  reserveGoogleApiUsage: mocks.reserveGoogleApiUsage,
  countGoogleApiTextUnits: mocks.countGoogleApiTextUnits,
}));
vi.mock('@/lib/audio', () => ({
  DEFAULT_GOOGLE_TTS_VOICE_ID: 'default',
  computeContentHash: mocks.computeContentHash,
}));
// The catalog reaches Google (and, through the i18n server helper, the db).
vi.mock('@/lib/language-catalog', () => ({
  getGoogleChirp3HdVoices: mocks.getGoogleChirp3HdVoices,
}));
vi.mock('@/lib/audio-assets', () => ({
  isPlayableAudioAsset: mocks.isPlayableAudioAsset,
}));
vi.mock('@/lib/rate-limit/daily-bucket', () => ({
  parsePositiveIntEnv: (value: string | undefined, fallback: number) =>
    value ? Number(value) : fallback,
}));
vi.mock('@/features/audio/server/batch/generate-item', () => ({
  generateAudioForItem: mocks.generateAudioForItem,
}));

import { generateWordChatAudio } from '../server/audio';

describe('generateWordChatAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGoogleChirp3HdVoices.mockResolvedValue([
      'vi-VN-Chirp3-HD-Aoede',
      'vi-VN-Chirp3-HD-Puck',
    ]);
    mocks.computeContentHash.mockReturnValue('hash-1');
    mocks.findMediaByHashes
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([['hash-1', { id: 'asset-1' }]]));
    mocks.reserveGoogleApiUsage.mockResolvedValue({ allowed: true });
    mocks.countGoogleApiTextUnits.mockReturnValue(1);
    mocks.generateAudioForItem.mockResolvedValue({ result: { status: 'ok' } });
  });

  it('stores draft audio without linking a temporary key as a database item id', async () => {
    const result = await generateWordChatAudio({
      userId: 'user-1',
      items: [{ key: '0', text: 'xin chào', language: 'vi' }],
    });

    expect(mocks.generateAudioForItem).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ id: '0', text: 'xin chào', language: 'vi' }),
        // A Chirp3-HD voice from the mix, not Google's default narrator.
        voiceId: expect.stringContaining('Chirp3-HD'),
      }),
      expect.objectContaining({ linkToItem: false }),
    );
    // The hash must carry both the chosen voice and the audio format, or clips
    // stop deduping against the ones the list editor made.
    expect(mocks.computeContentHash).toHaveBeenCalledWith(
      'xin chào',
      'vi',
      'google_tts',
      expect.objectContaining({
        voiceId: expect.stringContaining('Chirp3-HD'),
        audioFormat: 'mp3',
      }),
    );
    // The hash rides along because Review plays clips by hash, not by asset id.
    expect(result.results).toEqual([
      { key: '0', status: 'ok', assetId: 'asset-1', contentHash: 'hash-1' },
    ]);
  });
});
