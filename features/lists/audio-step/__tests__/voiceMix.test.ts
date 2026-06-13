import { describe, expect, it } from 'vitest';
import {
  formatVoiceLabel,
  genderMarker,
  parseVoiceSelection,
  resolveVoiceForText,
  serializeVoiceSelection,
  type VoiceSelection,
} from '../voiceMix';

const VOICES = ['cs-CZ-Wavenet-A', 'cs-CZ-Wavenet-B', 'cs-CZ-Wavenet-C', 'cs-CZ-Standard-A'];

describe('resolveVoiceForText', () => {
  it('returns undefined for the default single voice', () => {
    expect(resolveVoiceForText('pes', { mode: 'single', voiceId: 'default' }, VOICES)).toBeUndefined();
  });

  it('returns the chosen voice for an explicit single voice', () => {
    expect(
      resolveVoiceForText('pes', { mode: 'single', voiceId: 'cs-CZ-Wavenet-B' }, VOICES),
    ).toBe('cs-CZ-Wavenet-B');
  });

  it('assigns the same word the same voice every time (dedup-stable)', () => {
    const mix: VoiceSelection = { mode: 'mix', voiceIds: [] };
    const first = resolveVoiceForText('kočka', mix, VOICES);
    const second = resolveVoiceForText('kočka', mix, VOICES);
    expect(first).toBe(second);
    expect(VOICES).toContain(first);
  });

  it('is independent of subset toggle order', () => {
    const a = resolveVoiceForText('strom', { mode: 'mix', voiceIds: ['cs-CZ-Wavenet-A', 'cs-CZ-Wavenet-B'] }, VOICES);
    const b = resolveVoiceForText('strom', { mode: 'mix', voiceIds: ['cs-CZ-Wavenet-B', 'cs-CZ-Wavenet-A'] }, VOICES);
    expect(a).toBe(b);
  });

  it('spreads different words across multiple voices', () => {
    const mix: VoiceSelection = { mode: 'mix', voiceIds: [] };
    const used = new Set(
      ['pes', 'kočka', 'strom', 'voda', 'oheň', 'dům', 'kniha', 'auto'].map((w) =>
        resolveVoiceForText(w, mix, VOICES),
      ),
    );
    expect(used.size).toBeGreaterThan(1);
  });

  it('only uses voices from the selected subset', () => {
    const subset = ['cs-CZ-Wavenet-A', 'cs-CZ-Standard-A'];
    for (const word of ['pes', 'kočka', 'strom', 'voda', 'oheň']) {
      const voice = resolveVoiceForText(word, { mode: 'mix', voiceIds: subset }, VOICES);
      expect(subset).toContain(voice);
    }
  });

  it('falls back to the default voice when no voices are available', () => {
    expect(resolveVoiceForText('pes', { mode: 'mix', voiceIds: [] }, [])).toBeUndefined();
  });
});

describe('voice selection serialization', () => {
  it('round-trips single and mix selections', () => {
    const single: VoiceSelection = { mode: 'single', voiceId: 'cs-CZ-Wavenet-A' };
    const mix: VoiceSelection = { mode: 'mix', voiceIds: ['cs-CZ-Wavenet-B', 'cs-CZ-Wavenet-A'] };
    expect(parseVoiceSelection(serializeVoiceSelection(single))).toEqual(single);
    expect(parseVoiceSelection(serializeVoiceSelection(mix))).toEqual({
      mode: 'mix',
      voiceIds: ['cs-CZ-Wavenet-A', 'cs-CZ-Wavenet-B'],
    });
  });

  it('returns null for unknown input', () => {
    expect(parseVoiceSelection(null)).toBeNull();
    expect(parseVoiceSelection('garbage')).toBeNull();
  });
});

describe('voice labels', () => {
  it('maps SSML gender to a marker', () => {
    expect(genderMarker('FEMALE')).toBe('♀');
    expect(genderMarker('male')).toBe('♂');
    expect(genderMarker('NEUTRAL')).toBe('⚲');
    expect(genderMarker(undefined)).toBe('');
  });

  it('appends the marker to the voice name when known', () => {
    const genders = { 'cs-CZ-Wavenet-A': 'FEMALE', 'cs-CZ-Wavenet-B': 'MALE' };
    expect(formatVoiceLabel('cs-CZ-Wavenet-A', genders)).toBe('cs-CZ-Wavenet-A ♀');
    expect(formatVoiceLabel('cs-CZ-Wavenet-B', genders)).toBe('cs-CZ-Wavenet-B ♂');
    expect(formatVoiceLabel('cs-CZ-Wavenet-C', genders)).toBe('cs-CZ-Wavenet-C');
    expect(formatVoiceLabel('cs-CZ-Wavenet-A')).toBe('cs-CZ-Wavenet-A');
  });
});
