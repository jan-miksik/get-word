import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../client';
import { wordListItems, wordLists } from '../../schema';

export async function updateItemTranslations(
  updates: {
    id: string;
    textKnown?: string;
    textTarget?: string | null;
    translationStatus?: 'manual' | 'translated' | 'failed';
  }[],
): Promise<void> {
  for (const { id, textKnown, textTarget, translationStatus } of updates) {
    const set: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (translationStatus !== undefined) set.translationStatus = translationStatus;
    if (textTarget !== undefined) set.textTarget = textTarget;
    if (textKnown !== undefined) set.textKnown = textKnown;
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
