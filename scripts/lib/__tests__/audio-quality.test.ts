import { describe, expect, it } from 'vitest';
import { formatAudioQuality } from '@/scripts/lib/audio-quality';

describe('demo audio quality formatting', () => {
  it('keeps operator output stable for measured and missing volume values', () => {
    expect(
      formatAudioQuality({
        ok: true,
        durationSeconds: 1.2345,
        sizeBytes: 2048,
        meanVolumeDb: -21.25,
        maxVolumeDb: -2,
        reason: null,
      }),
    ).toBe('1.234s, max -2.0 dB, mean -21.3 dB, 2048 bytes');

    expect(
      formatAudioQuality({
        ok: false,
        durationSeconds: 0,
        sizeBytes: 0,
        meanVolumeDb: null,
        maxVolumeDb: null,
        reason: 'too small (0 bytes)',
      }),
    ).toBe('0.000s, max n/a, mean n/a, 0 bytes');
  });
});
