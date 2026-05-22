'use client';

import type { NormalizedWord } from '@/lib/words';

export type SourceLang = 'cz' | 'vi';
export type PromptMode = 'text' | 'audio';

export function resolveSourceLangFromRole(role: 'cz' | 'vi'): SourceLang {
  return role === 'cz' ? 'cz' : 'vi';
}

export function getTargetLang(sourceLang: SourceLang): SourceLang {
  return sourceLang === 'cz' ? 'vi' : 'cz';
}

export function getLearningLangFromRole(role: 'cz' | 'vi'): SourceLang {
  return role === 'cz' ? 'vi' : 'cz';
}

export function getLanguageLabel(lang: SourceLang): string {
  return lang === 'cz' ? 'Czech' : 'Vietnamese';
}

export function getWordTextByLang(word: NormalizedWord, lang: SourceLang): string {
  return lang === 'cz' ? word.cz : word.vi;
}

export function normalizeAudioPath(path: string): string {
  const pathStr = path.trim();
  if (/^(https?:)?\/\//i.test(pathStr) || /^(data|blob):/i.test(pathStr)) {
    return pathStr;
  }
  return pathStr.startsWith('/') ? pathStr : `/${pathStr}`;
}

export function getWordAudioSrcByLang(
  word: NormalizedWord,
  sourceLang: SourceLang,
): string | null {
  return getWordAudioSrcsByLang(word, sourceLang)[0] ?? null;
}

export function getWordAudioSrcsByLang(
  word: NormalizedWord,
  sourceLang: SourceLang,
): string[] {
  const raw = sourceLang === 'cz' ? word.czAudio : word.viAudio;
  if (!raw) return [];
  const candidates = Array.isArray(raw) ? raw : [raw];
  return candidates
    .filter(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0,
    )
    .map(normalizeAudioPath)
    .filter((candidate, index, arr) => arr.indexOf(candidate) === index);
}
