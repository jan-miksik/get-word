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

export function getWordTextByLang(word: NormalizedWord, lang: SourceLang): string {
  return lang === 'cz' ? word.cz : word.vi;
}

export function normalizeAudioPath(path: string | string[]): string {
  const pathStr = Array.isArray(path) ? path[0] : path;
  return pathStr.startsWith('/') ? pathStr : `/${pathStr}`;
}

export function getWordAudioSrcByLang(
  word: NormalizedWord,
  sourceLang: SourceLang,
): string | null {
  const raw = sourceLang === 'cz' ? word.czAudio : word.viAudio;
  if (!raw) return null;
  return normalizeAudioPath(raw);
}
