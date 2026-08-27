import { limitKeepingPrimaries } from '../addressFormPairs';
import type { TranslateResponse } from '../client/api';
import type { ReviewItem } from '../types';

/** Case-insensitive identity for a completed source/target pair. */
export function reviewPairKey(item: { textKnown: string; textTarget: string }): string {
  return `${item.textKnown.trim().toLocaleLowerCase()}\u0000${item.textTarget
    .trim()
    .toLocaleLowerCase()}`;
}

/** Match server-polished source text back to the submitted row. */
export function audioMatchKey(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '');
}

export function buildTranslatedReview(input: {
  translatedItems: TranslateResponse['items'];
  mutedKnownTexts: ReadonlySet<string>;
  limit: number;
}): { items: ReviewItem[]; warningsByPair: Record<string, string[]> } {
  const expanded: ReviewItem[] = [];

  input.translatedItems.forEach((row, sourceIndex) => {
    const audioDisabled = input.mutedKnownTexts.has(audioMatchKey(row.text_known));
    const primary: ReviewItem = {
      kind: row.kind,
      textKnown: row.text_known,
      textTarget: row.text_target,
      ...(row.corpus_item_id ? { corpusItemId: row.corpus_item_id } : {}),
      ...(row.takeover ? { takeover: row.takeover } : {}),
      audioStatus: row.audio_asset_id ? 'ready' : audioDisabled ? 'idle' : 'pending',
      audioAssetId: row.audio_asset_id,
      audioHash: row.audio_hash,
      knownAudioAssetId: row.known_audio_asset_id,
      audioDisabled,
      ...(row.address_form ? { addressForm: { form: row.address_form } } : {}),
    };

    if (!row.address_alternative) {
      expanded.push(primary);
      return;
    }

    const variantGroupKey = `${sourceIndex}:address`;
    expanded.push({ ...primary, variantGroupKey });
    // The alternative is a different exact pair, so it cannot inherit target
    // audio, corpus provenance, or a takeover claim from the primary.
    expanded.push({
      kind: row.kind,
      textKnown: row.text_known,
      textTarget: row.address_alternative.text_target,
      audioStatus: audioDisabled ? 'idle' : 'pending',
      audioAssetId: null,
      audioHash: null,
      knownAudioAssetId: row.known_audio_asset_id,
      audioDisabled,
      addressForm: { form: row.address_alternative.address_form },
      variantGroupKey,
    });
  });

  return {
    items: limitKeepingPrimaries(expanded, input.limit),
    warningsByPair: Object.fromEntries(
      input.translatedItems
        .filter((row) => row.warnings.length > 0)
        .map((row) => [`${row.text_known}\u0000${row.text_target}`, row.warnings]),
    ),
  };
}

export type ReviewTextPatch = Partial<Pick<ReviewItem, 'textKnown' | 'textTarget'>>;

/**
 * Apply a Review edit and dissolve any model-certified address-form pair.
 * Returns the old audio hash separately so the caller can evict its bytes.
 */
export function patchReviewItems(
  current: ReviewItem[],
  index: number,
  patch: ReviewTextPatch,
): { items: ReviewItem[]; forgottenAudioHash: string | null } {
  const original = current[index];
  if (!original) return { items: current, forgottenAudioHash: null };

  const targetChanged =
    patch.textTarget !== undefined && patch.textTarget !== original.textTarget;
  const knownChanged =
    patch.textKnown !== undefined && patch.textKnown !== original.textKnown;
  const editedPairKey = targetChanged || knownChanged ? original.variantGroupKey : undefined;

  const items = current.map((row, rowIndex) => {
    if (rowIndex !== index) {
      if (!editedPairKey || row.variantGroupKey !== editedPairKey) return row;
      const unpaired = { ...row };
      delete unpaired.variantGroupKey;
      return unpaired;
    }

    const next = {
      ...row,
      ...patch,
      ...(targetChanged
        ? { audioStatus: 'idle' as const, audioAssetId: null, audioHash: null }
        : {}),
    };
    if (targetChanged || knownChanged) {
      delete next.corpusItemId;
      delete next.takeover;
      delete next.addressForm;
      delete next.variantGroupKey;
    }
    return next;
  });

  return {
    items,
    forgottenAudioHash: targetChanged ? original.audioHash ?? null : null,
  };
}

/** Remove one row and leave a former twin as a truthful standalone form. */
export function removeReviewItem(
  current: ReviewItem[],
  index: number,
): { items: ReviewItem[]; removed: ReviewItem | undefined } {
  const removed = current[index];
  const items = current
    .filter((_, rowIndex) => rowIndex !== index)
    .map((row) => {
      if (!removed?.variantGroupKey || row.variantGroupKey !== removed.variantGroupKey) {
        return row;
      }
      const unpaired = { ...row };
      delete unpaired.variantGroupKey;
      return unpaired;
    });
  return { items, removed };
}
