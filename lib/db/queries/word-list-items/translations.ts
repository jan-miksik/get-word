import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../../client';
import { wordListItems, wordLists } from '../../schema';
import { isAudioTextEquivalent } from '../../../audio-text-match';
import { areAnswersEquivalent } from '@/lib/answer-normalization';
import {
  normalizeAcceptedAnswersForSave,
} from '@/lib/word-item-accepted-answers';
import {
  normalizeWordItemAddressForm,
  makeAddressForm,
  oppositeAddressForm,
  type AddressFormValue,
} from '@/lib/word-item-address-form';

export async function updateItemTranslations(
  updates: {
    id: string;
    textKnown?: string;
    textTarget?: string | null;
    translationStatus?: 'manual' | 'translated' | 'failed';
    ignoreCase?: boolean;
    acceptedKnown?: string[];
    acceptedTarget?: string[];
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
          acceptedKnown: wordListItems.acceptedKnown,
          acceptedTarget: wordListItems.acceptedTarget,
          audioAssetId: wordListItems.audioAssetId,
          audioStatus: wordListItems.audioStatus,
          knownAudioAssetId: wordListItems.knownAudioAssetId,
          knownAudioStatus: wordListItems.knownAudioStatus,
          addressForm: wordListItems.addressForm,
        })
        .from(wordListItems)
        .where(inArray(wordListItems.id, ids))
    : [];
  const existingById = new Map(existing.map((item) => [item.id, item]));

  for (const {
    id,
    textKnown,
    textTarget,
    translationStatus,
    ignoreCase,
    acceptedKnown,
    acceptedTarget,
  } of updates) {
    const updatedAt = new Date();
    const set: Record<string, unknown> = {
      updatedAt,
    };
    if (translationStatus !== undefined) set.translationStatus = translationStatus;
    if (textTarget !== undefined) set.textTarget = textTarget;
    if (textKnown !== undefined) set.textKnown = textKnown;
    // Owner/editor toggle: changes the item's content-key normalization. An
    // identity-changing edit (see lib/progress-key.ts).
    if (ignoreCase !== undefined) set.ignoreCase = ignoreCase;
    const prev = existingById.get(id);
    const nextTextKnown = textKnown ?? prev?.textKnown ?? '';
    const nextTextTarget = textTarget === undefined ? prev?.textTarget ?? null : textTarget;
    const knownIdentityChanged =
      textKnown !== undefined && prev && !areAnswersEquivalent(prev.textKnown, textKnown);
    const targetIdentityChanged =
      textTarget !== undefined && prev && !areAnswersEquivalent(prev.textTarget, textTarget);
    const storedAddressForm = normalizeWordItemAddressForm(prev?.addressForm);
    if (acceptedKnown !== undefined) {
      set.acceptedKnown = normalizeAcceptedAnswersForSave(acceptedKnown, nextTextKnown);
    } else if (knownIdentityChanged) {
      set.acceptedKnown = [];
    }
    if (acceptedTarget !== undefined) {
      set.acceptedTarget = normalizeAcceptedAnswersForSave(acceptedTarget, nextTextTarget);
    } else if (targetIdentityChanged) {
      set.acceptedTarget = [];
    }

    // A pair certifies two exact wordings. An identity-changing edit dissolves
    // it on both sides: the edited target also loses its form label because
    // arbitrary replacement text was never classified by the translator;
    // a source-only edit may keep the row's own form, but not the twin link.
    if (storedAddressForm && (knownIdentityChanged || targetIdentityChanged)) {
      set.addressForm = targetIdentityChanged
        ? null
        : makeAddressForm(storedAddressForm.form);
    }

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

    if (storedAddressForm?.groupId && (knownIdentityChanged || targetIdentityChanged)) {
      await db
        .update(wordListItems)
        .set({
          addressForm: sql`${wordListItems.addressForm} - 'groupId'`,
          updatedAt,
        })
        .where(
          and(
            ne(wordListItems.id, id),
            sql`${wordListItems.addressForm} ->> 'groupId' = ${storedAddressForm.groupId}`,
          ),
        );
    }
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

/**
 * One reusable existing translation for a source text, plus its twin when — and
 * ONLY when — the database holds a complete, self-consistent familiar/polite
 * pair for that exact source.
 *
 * The plain `findExistingTranslations` above deduplicates to one arbitrary row
 * per source text, which is fine while every source has one translation. Once
 * address-form pairs exist it stops being fine: "How are you?" may have several
 * rows, and picking one of them at random loses the form of address and makes
 * reuse non-deterministic.
 */
export type ExistingTranslationMatch = {
  text: string;
  translatedText: string;
  addressForm: AddressFormValue | null;
  /** Present only for a complete pair sharing one groupId. */
  alternative?: { translatedText: string; addressForm: AddressFormValue };
};

/**
 * Group-aware lookup used by the word-chat translator.
 *
 * The rule that matters: **a pair is never assembled across different
 * `groupId`s.** Over time the same source can accumulate unrelated wordings
 * ("Wie geht's?" from one pair, "Wie geht es Ihnen?" from another), and gluing
 * two of those together would hand the learner a "pair" that was never one.
 * So a pair is returned only when a single groupId holds exactly two rows with
 * opposite forms and different target text; otherwise one best row comes back
 * with no alternative.
 */
export async function findExistingTranslationMatches(
  texts: string[],
  languageFrom: string,
  languageTo: string,
): Promise<ExistingTranslationMatch[]> {
  if (texts.length === 0) return [];

  const results = await db
    .select({
      text: wordListItems.textKnown,
      translatedText: wordListItems.textTarget,
      addressForm: wordListItems.addressForm,
      createdAt: wordListItems.createdAt,
      id: wordListItems.id,
    })
    .from(wordListItems)
    .innerJoin(wordLists, eq(wordListItems.listId, wordLists.id))
    .where(
      and(
        inArray(wordListItems.textKnown, texts),
        sql`${wordListItems.textTarget} IS NOT NULL`,
        eq(wordLists.languageFrom, languageFrom),
        eq(wordLists.languageTo, languageTo),
      ),
    );

  // Oldest first, id as the tiebreak: without a total order, which row wins
  // reuse would vary between identical requests.
  results.sort((a, b) => {
    const byDate = a.createdAt.getTime() - b.createdAt.getTime();
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
  });

  const bySource = new Map<string, typeof results>();
  for (const row of results) {
    if (!row.text || !row.translatedText) continue;
    const rows = bySource.get(row.text);
    if (rows) rows.push(row);
    else bySource.set(row.text, [row]);
  }

  const matches: ExistingTranslationMatch[] = [];
  for (const [text, rows] of bySource) {
    const byGroup = new Map<string, typeof rows>();
    for (const row of rows) {
      const form = normalizeWordItemAddressForm(row.addressForm);
      if (!form?.groupId) continue;
      const group = byGroup.get(form.groupId);
      if (group) group.push(row);
      else byGroup.set(form.groupId, [row]);
    }

    let pair: ExistingTranslationMatch | null = null;
    for (const group of byGroup.values()) {
      if (group.length !== 2) continue;
      const first = normalizeWordItemAddressForm(group[0].addressForm);
      const second = normalizeWordItemAddressForm(group[1].addressForm);
      if (!first || !second) continue;
      if (second.form !== oppositeAddressForm(first.form)) continue;
      if (group[0].translatedText === group[1].translatedText) continue;

      // Familiar is the primary, matching the order a fresh translation produces.
      const [primary, alternative] =
        first.form === 'familiar' ? [group[0], group[1]] : [group[1], group[0]];
      pair = {
        text,
        translatedText: primary.translatedText as string,
        addressForm: first.form === 'familiar' ? first.form : second.form,
        alternative: {
          translatedText: alternative.translatedText as string,
          addressForm: first.form === 'familiar' ? second.form : first.form,
        },
      };
      break;
    }

    if (pair) {
      matches.push(pair);
      continue;
    }

    const best = rows[0];
    matches.push({
      text,
      translatedText: best.translatedText as string,
      addressForm: normalizeWordItemAddressForm(best.addressForm)?.form ?? null,
    });
  }

  return matches;
}
