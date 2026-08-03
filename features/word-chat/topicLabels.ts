/**
 * Labels that describe the container rather than what a conversation was about.
 *
 * Older sessions sometimes stored these as `coveredTopics`, which produced
 * follow-up chips such as "More on My words". Keep the check language-agnostic
 * enough for every bundled interface language and tolerant of the language
 * suffix used by personal list names.
 */
const PERSONAL_LABELS = [
  'My words',
  'Moje slovíčka',
  'Từ của tôi',
  'Мої слова',
] as const;

const GENERIC_LABELS = [
  ...PERSONAL_LABELS,
  'My vocabulary',
  'General vocabulary',
  'Obecná slovní zásoba',
  'Từ vựng chung',
  'Загальна лексика',
] as const;

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const NORMALIZED_PERSONAL_LABELS = PERSONAL_LABELS.map(normalizeLabel);
const NORMALIZED_GENERIC_LABELS = new Set(GENERIC_LABELS.map(normalizeLabel));

export function isGenericTopicLabel(value: string | null | undefined): boolean {
  const normalized = normalizeLabel(value ?? '');
  if (!normalized) return true;
  if (NORMALIZED_GENERIC_LABELS.has(normalized)) return true;
  return NORMALIZED_PERSONAL_LABELS.some((label) => normalized.startsWith(`${label} `));
}

/** Pick the first concrete, learner-facing topic from strongest to weakest. */
export function firstMeaningfulTopicLabel(
  ...values: Array<string | null | undefined>
): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && !isGenericTopicLabel(trimmed)) return trimmed;
  }
  return '';
}
