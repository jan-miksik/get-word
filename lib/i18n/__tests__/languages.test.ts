import { describe, expect, it } from 'vitest';
import {
  COMMON_LANGUAGES,
  GOOGLE_TRANSLATE_LANGUAGES,
  findBestSupportedLanguage,
  getDetectedSettingsLanguage,
  getLanguageFlag,
  languageMatchesSearch,
  normalizeLanguageCode,
  orderSettingsLanguages,
} from '../languages';

describe('settings language helpers', () => {
  it('normalizes language codes', () => {
    expect(normalizeLanguageCode('EN')).toBe('en');
    expect(normalizeLanguageCode('cz')).toBe('cs');
    expect(normalizeLanguageCode('zh-cn')).toBe('zh-CN');
    expect(normalizeLanguageCode('pt-BR')).toBe('pt-BR');
    expect(normalizeLanguageCode('ms-arab')).toBe('ms-Arab');
    expect(normalizeLanguageCode('not a language')).toBe('en');
  });

  it('keeps a cached Google Translate language fallback with flags where possible', () => {
    expect(GOOGLE_TRANSLATE_LANGUAGES.length).toBeGreaterThan(100);
    expect(GOOGLE_TRANSLATE_LANGUAGES.some((language) => language.code === 'mni-Mtei')).toBe(true);
    expect(getLanguageFlag('cs')).toBe('🇨🇿');
    expect(getLanguageFlag('pt-BR')).toBe('🇧🇷');
  });

  it('matches browser language preferences to supported languages', () => {
    expect(findBestSupportedLanguage(['cs-CZ', 'en-US'], COMMON_LANGUAGES)).toBe('cs');
    expect(findBestSupportedLanguage(['zh-Hans-CN', 'en-US'], COMMON_LANGUAGES)).toBe('zh-CN');
    expect(findBestSupportedLanguage(['xx-YY'], COMMON_LANGUAGES)).toBe('en');
  });

  it('matches languages by English, native, code, and folded native names', () => {
    const czech = { code: 'cs', name: 'Czech', flag: '🇨🇿' };
    expect(languageMatchesSearch(czech, 'Czech')).toBe(true);
    expect(languageMatchesSearch(czech, 'cs')).toBe(true);
    expect(languageMatchesSearch(czech, 'č')).toBe(true);
    expect(languageMatchesSearch(czech, 'čeština')).toBe(true);
    expect(languageMatchesSearch(czech, 'cestina')).toBe(true);
  });

  it('orders featured settings languages without duplicating them', () => {
    const ordered = orderSettingsLanguages(COMMON_LANGUAGES);
    const codes = ordered.map((language) => normalizeLanguageCode(language.code));
    expect(codes.length).toBe(new Set(codes).size);
    expect(codes.slice(0, 3)).toEqual(['en', 'es', 'zh-CN']);
  });

  it('detects a default settings language from the browser', () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        languages: ['de-DE', 'en-US'],
        language: 'de-DE',
      },
    });

    expect(getDetectedSettingsLanguage(COMMON_LANGUAGES)).toBe('de');

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });
});
