import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../client';
import { wordListItems, wordLists } from '../../schema';
import { isAudioTextEquivalent } from '../../../audio-text-match';

export async function updateItemTranslations(
  updates: {
    id: string;
    textKnown?: string;
    textTarget?: string | null;
    translationStatus?: 'manual' | 'translated' | 'failed';
    ignoreCase?: boolean;
  }[],
): Promise<void> {
  // Load the current text + audio link for every item up front so we can tell
  // when an edit genuinely changes a word (vs. a case/dot-only tweak) and, in
  // that case, disconnect the now-mismatched audio asset.
  const ids = updates.map((u) => u.id);
  const existing = ids.length
    ? await db
        .select({
          id: wordListItems.id,
          textKnown: wordListItems.textKnown,
          textTarget: wordListItems.textTarget,
          audioAssetId: wordListItems.audioAssetId,
          audioStatus: wordListItems.audioStatus,
          knownAudioAssetId: wordListItems.knownAudioAssetId,
          knownAudioStatus: wordListItems.knownAudioStatus,
        })
        .from(wordListItems)
        .where(inArray(wordListItems.id, ids))
    : [];
  const existingById = new Map(existing.map((item) => [item.id, item]));

  for (const { id, textKnown, textTarget, translationStatus, ignoreCase } of updates) {
    const set: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (translationStatus !== undefined) set.translationStatus = translationStatus;
    if (textTarget !== undefined) set.textTarget = textTarget;
    if (textKnown !== undefined) set.textKnown = textKnown;
    // Owner/editor toggle: changes the item's content-key normalization. An
    // identity-changing edit (see lib/progress-key.ts).
    if (ignoreCase !== undefined) set.ignoreCase = ignoreCase;

    const prev = existingById.get(id);
    if (prev) {
      // Target-side word changed beyond case/dots → its audio no longer matches.
      if (
        textTarget !== undefined &&
        !isAudioTextEquivalent(textTarget, prev.textTarget) &&
        (prev.audioAssetId || prev.audioStatus !== 'none')
      ) {
        set.audioAssetId = null;
        set.audioStatus = 'none';
      }
      // Known-side word changed beyond case/dots → its audio no longer matches.
      if (
        textKnown !== undefined &&
        !isAudioTextEquivalent(textKnown, prev.textKnown) &&
        (prev.knownAudioAssetId || prev.knownAudioStatus !== 'none')
      ) {
        set.knownAudioAssetId = null;
        set.knownAudioStatus = 'none';
      }
    }

    await db
      .update(wordListItems)
      .set(set)
      .where(eq(wordListItems.id, id));
  }
}

export async function findExistingTranslations(
  texts: string[],
  field: 'textKnown' | 'textTarget',
  languageFrom: string,
  languageTo: string,
): Promise<{ text: string; translatedText: string }[]> {
  if (texts.length === 0) return [];

  const col = field === 'textKnown' ? wordListItems.textKnown : wordListItems.textTarget;
  const otherCol = field === 'textKnown' ? wordListItems.textTarget : wordListItems.textKnown;

  const results = await db
    .select({
      text: col,
      translatedText: otherCol,
    })
    .from(wordListItems)
    .innerJoin(wordLists, eq(wordListItems.listId, wordLists.id))
    .where(
      and(
        inArray(col, texts),
        sql`${otherCol} IS NOT NULL`,
        eq(wordLists.languageFrom, languageFrom),
        eq(wordLists.languageTo, languageTo),
      ),
    );

  const seen = new Set<string>();
  const deduped: { text: string; translatedText: string }[] = [];
  for (const result of results) {
    if (result.text && result.translatedText && !seen.has(result.text)) {
      seen.add(result.text);
      deduped.push({ text: result.text, translatedText: result.translatedText });
    }
  }
  return deduped;
}
