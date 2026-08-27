import { describe, expect, it } from 'vitest';
import type { TranslateResponse } from '../../client/api';
import type { ReviewItem } from '../../types';
import {
  audioMatchKey,
  buildTranslatedReview,
  patchReviewItems,
  removeReviewItem,
  reviewPairKey,
} from '../review-items';

function translated(
  overrides: Partial<TranslateResponse['items'][number]> = {},
): TranslateResponse['items'][number] {
  return {
    kind: 'sentence',
    text_known: 'How are you?',
    text_target: 'Wie geht es dir?',
    corpus_item_id: null,
    audio_asset_id: null,
    audio_hash: null,
    known_audio_asset_id: null,
    warnings: [],
    reused: false,
    takeover: null,
    address_form: null,
    address_alternative: null,
    ...overrides,
  };
}

describe('buildTranslatedReview', () => {
  it('expands an address alternative without copying exact-pair provenance', () => {
    const result = buildTranslatedReview({
      translatedItems: [
        translated({
          corpus_item_id: 'corpus-1',
          audio_asset_id: 'asset-1',
          audio_hash: 'hash-1',
          address_form: 'familiar',
          address_alternative: {
            text_target: 'Wie geht es Ihnen?',
            address_form: 'polite',
          },
        }),
      ],
      mutedKnownTexts: new Set(),
      limit: 30,
    });

    const [primary, alternative] = result.items;
    expect(primary).toMatchObject({
      corpusItemId: 'corpus-1',
      audioAssetId: 'asset-1',
      addressForm: { form: 'familiar' },
    });
    expect(alternative).toMatchObject({
      textTarget: 'Wie geht es Ihnen?',
      audioAssetId: null,
      addressForm: { form: 'polite' },
    });
    expect(alternative.corpusItemId).toBeUndefined();
    expect(alternative.variantGroupKey).toBe(primary.variantGroupKey);
  });

  it('keeps a classified standalone row standalone', () => {
    const result = buildTranslatedReview({
      translatedItems: [translated({ address_form: 'polite' })],
      mutedKnownTexts: new Set(),
      limit: 30,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].addressForm).toEqual({ form: 'polite' });
    expect(result.items[0].variantGroupKey).toBeUndefined();
  });

  it('matches muted source text across safe server polishing', () => {
    const result = buildTranslatedReview({
      translatedItems: [translated({ text_known: '  HOW   ARE YOU! ' })],
      mutedKnownTexts: new Set([audioMatchKey('How are you?')]),
      limit: 30,
    });

    expect(result.items[0]).toMatchObject({ audioDisabled: true, audioStatus: 'idle' });
  });

  it('limits alternatives before later primaries and keeps warnings pair-specific', () => {
    const result = buildTranslatedReview({
      translatedItems: [
        translated({
          warnings: ['check primary'],
          address_form: 'familiar',
          address_alternative: {
            text_target: 'Wie geht es Ihnen?',
            address_form: 'polite',
          },
        }),
        translated({ text_known: 'Bread', text_target: 'Brot' }),
      ],
      mutedKnownTexts: new Set(),
      limit: 2,
    });

    expect(result.items.map((item) => item.textTarget)).toEqual(['Wie geht es dir?', 'Brot']);
    expect(result.warningsByPair).toEqual({
      'How are you?\u0000Wie geht es dir?': ['check primary'],
    });
  });
});

describe('review item transitions', () => {
  const pair: ReviewItem[] = [
    {
      kind: 'sentence',
      textKnown: 'How are you?',
      textTarget: 'Wie geht es dir?',
      audioHash: 'old-hash',
      audioAssetId: 'old-asset',
      addressForm: { form: 'familiar' },
      variantGroupKey: 'g',
    },
    {
      kind: 'sentence',
      textKnown: 'How are you?',
      textTarget: 'Wie geht es Ihnen?',
      addressForm: { form: 'polite' },
      variantGroupKey: 'g',
    },
  ];

  it('dissolves a certified pair and invalidates audio when one target is edited', () => {
    const result = patchReviewItems(pair, 0, { textTarget: 'Hallo!' });

    expect(result.forgottenAudioHash).toBe('old-hash');
    expect(result.items[0]).toMatchObject({
      textTarget: 'Hallo!',
      audioAssetId: null,
      audioHash: null,
      audioStatus: 'idle',
    });
    expect(result.items[0].addressForm).toBeUndefined();
    expect(result.items.every((item) => item.variantGroupKey === undefined)).toBe(true);
    expect(result.items[1].addressForm).toEqual({ form: 'polite' });
  });

  it('removing one member leaves the sibling as a standalone form', () => {
    const result = removeReviewItem(pair, 0);

    expect(result.removed).toBe(pair[0]);
    expect(result.items).toEqual([
      expect.objectContaining({ addressForm: { form: 'polite' } }),
    ]);
    expect(result.items[0].variantGroupKey).toBeUndefined();
  });

  it('normalizes pair identity without conflating source-only matches', () => {
    expect(reviewPairKey(pair[0])).toBe(reviewPairKey({
      textKnown: ' how ARE you? ',
      textTarget: ' WIE GEHT ES DIR? ',
    }));
    expect(reviewPairKey(pair[0])).not.toBe(reviewPairKey(pair[1]));
  });
});
