import { describe, expect, it } from 'vitest';
import { isAudioTextEquivalent, normalizeAudioText } from '../audio-text-match';

describe('isAudioTextEquivalent', () => {
  it('treats case-only differences as equivalent', () => {
    expect(isAudioTextEquivalent('Hello', 'hello')).toBe(true);
    expect(isAudioTextEquivalent('XIN CHÀO', 'xin chào')).toBe(true);
  });

  it('treats added/removed dots and whitespace as equivalent', () => {
    expect(isAudioTextEquivalent('hello', 'hello.')).toBe(true);
    expect(isAudioTextEquivalent('Mr. Smith', 'mr smith')).toBe(true);
    expect(isAudioTextEquivalent('hello  world', 'Hello world')).toBe(true);
    expect(isAudioTextEquivalent(' hello ', 'hello')).toBe(true);
  });

  it('treats a genuinely different word as not equivalent', () => {
    expect(isAudioTextEquivalent('hello', 'hallo')).toBe(false);
    expect(isAudioTextEquivalent('cat', 'cats')).toBe(false);
    expect(isAudioTextEquivalent('dog', 'dog house')).toBe(false);
  });

  it('treats clearing the text as not equivalent to a real word', () => {
    expect(isAudioTextEquivalent(null, 'hello')).toBe(false);
    expect(isAudioTextEquivalent('', 'hello')).toBe(false);
  });

  it('treats nullish/empty as equivalent to each other', () => {
    expect(isAudioTextEquivalent(null, '')).toBe(true);
    expect(isAudioTextEquivalent(undefined, '   ')).toBe(true);
  });

  it('normalizes consistently', () => {
    expect(normalizeAudioText('  Hello.  World. ')).toBe('hello world');
  });
});
