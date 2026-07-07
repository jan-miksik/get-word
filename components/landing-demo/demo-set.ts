import {
  getBaseLanguage,
  getLanguageFlag,
  normalizeLanguageCode,
} from '@/lib/i18n/languages';
import {
  LANDING_DEMO_WORDS,
  resolveLandingDemoCode,
} from '@/lib/landing-demo-words';
import type { DemoSet } from './types';

export function getLandingDemoFallbackTo(fromLang: string): string {
  return getBaseLanguage(fromLang) === 'en' ? 'cs' : 'en';
}

function formatPairLabel(fromLang: string, toLang: string): string {
  const fromFlag = getLanguageFlag(fromLang);
  const toFlag = getLanguageFlag(toLang);
  return [
    fromFlag,
    normalizeLanguageCode(fromLang).toUpperCase(),
    '→',
    toFlag,
    normalizeLanguageCode(toLang).toUpperCase(),
  ]
    .filter(Boolean)
    .join(' ');
}

function resolveFallbackPair(fromLang: string, toLang: string) {
  const requestedFrom = normalizeLanguageCode(fromLang);
  const requestedTo = normalizeLanguageCode(toLang || getLandingDemoFallbackTo(requestedFrom));
  const resolvedFrom = resolveLandingDemoCode(requestedFrom);
  const resolvedTo = resolveLandingDemoCode(requestedTo);

  if (resolvedFrom && resolvedTo && resolvedFrom !== resolvedTo) {
    return { fromCode: resolvedFrom, toCode: resolvedTo, requestedTo };
  }

  if (resolvedFrom) {
    const fallbackTo = resolveLandingDemoCode(getLandingDemoFallbackTo(resolvedFrom)) ?? 'en';
    return { fromCode: resolvedFrom, toCode: fallbackTo, requestedTo };
  }

  if (resolvedTo) {
    const fallbackFrom = resolveLandingDemoCode(getLandingDemoFallbackTo(resolvedTo)) ?? 'en';
    return { fromCode: fallbackFrom, toCode: resolvedTo, requestedTo };
  }

  return { fromCode: 'en', toCode: 'cs', requestedTo };
}

export function buildDemoSet(fromLang: string, toLang: string): DemoSet {
  const { fromCode, toCode, requestedTo } = resolveFallbackPair(fromLang, toLang);
  const fromWords = LANDING_DEMO_WORDS[fromCode];
  const toWords = LANDING_DEMO_WORDS[toCode];

  return {
    fromLang: fromCode,
    toLang: toCode,
    requestedToLang: requestedTo,
    pairLabel: formatPairLabel(fromCode, toCode),
    words: fromWords.map((front, index) => ({
      front,
      back: toWords[index] ?? toWords[0],
    })),
  };
}
