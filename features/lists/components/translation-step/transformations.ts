import { normalizeAnswerExactKey } from '@/lib/answer-normalization';
import {
  MAX_ACCEPTED_ANSWER_LENGTH,
  MAX_ACCEPTED_ANSWERS,
} from '@/lib/word-item-accepted-answers';
import { polishPair } from '@/lib/formatting-polish';
import type {
  DuplicateGroup,
  PendingTranslationItem,
  PolishField,
  PolishScan,
  TranslationRow,
} from './types';

export function createTranslationRows(items: PendingTranslationItem[]): TranslationRow[] {
  return items.map((item) => ({
    id: item.id,
    textKnown: item.text_known ?? '',
    textTarget: item.text_target ?? '',
    acceptedKnown: item.accepted_known ?? [],
    acceptedTarget: item.accepted_target ?? [],
    status: (item.text_known && item.text_target ? 'ok' : 'pending') as TranslationRow['status'],
    comment: item.comment ?? '',
  }));
}

export function createCategoryByRow(
  items: PendingTranslationItem[],
): Record<string, string | null> {
  return Object.fromEntries(items.map((item) => [item.id, item.category_id ?? null]));
}

export function mergeAcceptedAnswers(
  current: string[],
  incoming: string[],
  primary: string,
): string[] {
  const seen = new Set(current.map((answer) => normalizeAnswerExactKey(answer)));
  const primaryKey = normalizeAnswerExactKey(primary);
  const next = [...current];
  for (const raw of incoming) {
    const answer = raw.normalize('NFC').trim();
    if (!answer || answer.length > MAX_ACCEPTED_ANSWER_LENGTH) continue;
    const key = normalizeAnswerExactKey(answer);
    if (!key || key === primaryKey || seen.has(key)) continue;
    seen.add(key);
    next.push(answer);
    if (next.length >= MAX_ACCEPTED_ANSWERS) break;
  }
  return next;
}

export function findDuplicateGroups(
  rows: TranslationRow[],
  sourceField: 'textKnown' | 'textTarget',
  translationField: 'textKnown' | 'textTarget',
): DuplicateGroup[] {
  const byKey = new Map<string, DuplicateGroup>();
  for (const row of rows) {
    const word = (row[sourceField] ?? '').trim();
    const translation = (row[translationField] ?? '').trim();
    if (!word) continue;
    const key = `${word.toLowerCase()}\u0000${translation.toLowerCase()}`;
    const group = byKey.get(key);
    if (group) group.rows.push(row);
    else byKey.set(key, { key, word, rows: [row] });
  }
  return [...byKey.values()].filter((group) => group.rows.length > 1);
}

export function scanTranslationPolish(
  rows: TranslationRow[],
  languageFrom: string,
  languageTo: string,
): PolishScan {
  const changes: PolishScan['changes'] = [];
  const warnings: PolishScan['warnings'] = [];
  for (const row of rows) {
    const result = polishPair(
      { text: row.textKnown, lang: languageFrom },
      { text: row.textTarget, lang: languageTo },
    );
    const sides: Array<{ field: PolishField; text: string; out: typeof result.source }> = [
      { field: 'known', text: row.textKnown, out: result.source },
      { field: 'target', text: row.textTarget, out: result.target },
    ];
    for (const { field, text, out } of sides) {
      if (out.changed) {
        changes.push({
          key: `${row.id}:${field}`,
          rowId: row.id,
          field,
          before: text,
          after: out.fixed,
          fixCodes: out.fixes.map((fix) => fix.code),
        });
      }
      for (const warning of out.warnings) {
        warnings.push({
          key: `${row.id}:${field}:${warning.code}`,
          rowId: row.id,
          field,
          text: out.fixed,
          code: warning.code,
        });
      }
    }
  }
  return { changes, warnings };
}
