import { NormalizedWord, STAGES } from '@/lib/words';
import type { I18nKey } from '@/lib/i18n/messages';
import type { LearningRole } from '@/features/learning/state/learningRole';

type Translate = (key: I18nKey, values?: Record<string, string | number>) => string;

export function formatInterval(ms: number, t: Translate): string {
  if (ms <= 0) return '';
  const stage = STAGES.find((entry) => entry.intervalMs === ms);
  if (stage) return t(`stage.${stage.id}` as I18nKey);
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

export function formatNextReviewHint(intervalMs: number, t: Translate): string {
  const label = formatInterval(intervalMs, t);
  return label ? t('card.repeatIn', { interval: label }) : t('card.repeatNow');
}

export function getWordTextSize(maxLen: number): string {
  if (maxLen <= 18) return '!text-[2.25rem] sm:!text-[2.75rem]';
  if (maxLen <= 30) return '!text-[1.65rem] sm:!text-[2rem]';
  if (maxLen <= 48) return '!text-[1.25rem] sm:!text-[1.5rem]';
  return '!text-[1rem] sm:!text-[1.2rem]';
}

// Normalize audio paths for Next.js public dir: "speech/cz/x.mp3" -> "/speech/cz/x.mp3".
function normalizeAudioPath(path: string): string {
  if (/^(?:https?:|blob:|data:)/i.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
}

// Audio for the side the user is LEARNING (not the side they already know).
// 'languageToLearn' -> learning the from-side -> cz audio.
// 'knownLanguage' -> learning the to-side -> vi audio.
export function getLearningAudioSrc(role: LearningRole, word: NormalizedWord): string[] | null {
  let storedAudio: string | string[] | undefined;
  if (role === 'languageToLearn' && word.czAudio) {
    storedAudio = word.czAudio;
  } else if (role === 'knownLanguage' && word.viAudio) {
    storedAudio = word.viAudio;
  }
  if (!storedAudio) return null;
  const candidates = (Array.isArray(storedAudio) ? storedAudio : [storedAudio])
    .map(normalizeAudioPath)
    .filter((candidate, index, all) => all.indexOf(candidate) === index);
  return candidates.length > 0 ? candidates : null;
}
