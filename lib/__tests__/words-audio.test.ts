import { describe, expect, it } from 'vitest';
import {
  stripLegacyLocalSpeechAudio,
  stripLegacyLocalSpeechAudioFromWord,
  wordListItemsToNormalizedWords,
} from '@/lib/words';

describe('stripLegacyLocalSpeechAudio', () => {
  it('drops legacy local /speech paths', () => {
    expect(stripLegacyLocalSpeechAudio('/speech/cz/odpoved.mp3')).toBeUndefined();
    expect(stripLegacyLocalSpeechAudio('speech/vi/laska.mp3')).toBeUndefined();
  });

  it('keeps remote and api-served audio', () => {
    expect(stripLegacyLocalSpeechAudio('/api/audio/abc123')).toBe('/api/audio/abc123');
    expect(stripLegacyLocalSpeechAudio('https://arweave.net/tx')).toBe('https://arweave.net/tx');
  });

  it('filters legacy entries out of arrays and collapses to undefined when empty', () => {
    expect(
      stripLegacyLocalSpeechAudio(['/speech/cz/a.mp3', 'https://arweave.net/tx']),
    ).toEqual(['https://arweave.net/tx']);
    expect(stripLegacyLocalSpeechAudio(['/speech/cz/a.mp3'])).toBeUndefined();
  });

  it('strips both audio fields on a word while leaving others intact', () => {
    const word = stripLegacyLocalSpeechAudioFromWord({
      czAudio: '/speech/cz/a.mp3',
      viAudio: 'https://arweave.net/tx',
    });
    expect(word.czAudio).toBeUndefined();
    expect(word.viAudio).toBe('https://arweave.net/tx');
  });
});

describe('wordListItemsToNormalizedWords audio', () => {
  const items = [
    {
      id: 'item-1',
      listId: 'list-1',
      categoryId: null,
      canonicalWordId: null,
      textKnown: 'odpověď',
      textTarget: 'trả lời',
      notes: null,
      position: 0,
    },
  ];

  it('drops legacy local media-fallback audio (arweave-only)', () => {
    const [word] = wordListItemsToNormalizedWords(items, {}, {
      mediaFallbackWords: [
        {
          cz: 'odpověď',
          vi: 'trả lời',
          czPron: 'odpoved',
          viPron: 'tra loi',
          czAudio: '/speech/cz/odpoved.mp3',
          viAudio: '/speech/vi/tra-loi.mp3',
        },
      ],
    });
    expect(word.czAudio).toBeUndefined();
    expect(word.viAudio).toBeUndefined();
    // Pronunciation from the same fallback is still kept.
    expect(word.czPron).toBe('odpoved');
  });

  it('keeps generated api audio before arweave fallbacks', () => {
    const [word] = wordListItemsToNormalizedWords(
      [
        {
          ...items[0],
          knownAudioUrl: '/api/audio/known-hash',
          knownAudioArweaveUrls: ['https://arweave.net/known-tx'],
          audioUrl: '/api/audio/target-hash',
          audioArweaveUrls: ['https://arweave.net/target-tx'],
        },
      ],
      {},
    );
    expect(word.czAudio).toEqual(['/api/audio/known-hash', 'https://arweave.net/known-tx']);
    expect(word.viAudio).toEqual(['/api/audio/target-hash', 'https://arweave.net/target-tx']);
  });
});
