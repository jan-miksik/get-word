import { describe, expect, it } from 'vitest';
import { wordListItemsToNormalizedWords } from '@/lib/words';

function item(id: string, textTarget: string, addressForm?: unknown, textKnown = 'How are you?') {
  return {
    id,
    listId: 'list-1',
    categoryId: null,
    canonicalWordId: null,
    textKnown,
    textTarget,
    notes: null,
    position: 0,
    ...(addressForm === undefined ? {} : { addressForm }),
  };
}

const familiar = { version: 1, form: 'familiar', groupId: 'g1' };
const polite = { version: 1, form: 'polite', groupId: 'g1' };

describe('address form hydration', () => {
  it("derives the counterpart from the sibling's TARGET side, never its source", () => {
    // Both rows share "How are you?" as their source, so a source-side lookup
    // would print the card's own prompt back at it.
    const [first, second] = wordListItemsToNormalizedWords(
      [item('a', 'Wie geht es dir?', familiar), item('b', 'Wie geht es Ihnen?', polite)],
      {},
    );

    expect(first.addressForm).toEqual({ form: 'familiar', counterpart: 'Wie geht es Ihnen?' });
    expect(second.addressForm).toEqual({ form: 'polite', counterpart: 'Wie geht es dir?' });
  });

  it('keeps the form and drops the counterpart when the twin is gone', () => {
    const [only] = wordListItemsToNormalizedWords([item('a', 'Wie geht es dir?', familiar)], {});
    expect(only.addressForm).toEqual({ form: 'familiar' });
  });

  it('never pairs rows from different groups', () => {
    const [first, second] = wordListItemsToNormalizedWords(
      [
        item('a', 'Wie geht es dir?', { version: 1, form: 'familiar', groupId: 'g1' }),
        item('b', 'Wie geht es Ihnen?', { version: 1, form: 'polite', groupId: 'g2' }),
      ],
      {},
    );

    expect(first.addressForm).toEqual({ form: 'familiar' });
    expect(second.addressForm).toEqual({ form: 'polite' });
  });

  it('does not pair rows whose source wording no longer matches', () => {
    const [first, second] = wordListItemsToNormalizedWords(
      [
        item('a', 'Wie geht es dir?', familiar),
        item('b', 'Wo sind Sie?', polite, 'Where are you?'),
      ],
      {},
    );

    expect(first.addressForm).toEqual({ form: 'familiar' });
    expect(second.addressForm).toEqual({ form: 'polite' });
  });

  it('does not choose an arbitrary counterpart from an oversized group', () => {
    const [first, second, third] = wordListItemsToNormalizedWords(
      [
        item('a', 'Wie geht es dir?', familiar),
        item('b', 'Wie geht es Ihnen?', polite),
        item('c', 'Wie geht es euch?', polite),
      ],
      {},
    );

    expect(first.addressForm).toEqual({ form: 'familiar' });
    expect(second.addressForm).toEqual({ form: 'polite' });
    expect(third.addressForm).toEqual({ form: 'polite' });
  });

  it('does not pair two rows carrying the same form', () => {
    const [first, second] = wordListItemsToNormalizedWords(
      [
        item('a', 'Wie geht es dir?', familiar),
        item('b', 'Wie geht es Ihnen?', { version: 1, form: 'familiar', groupId: 'g1' }),
      ],
      {},
    );

    expect(first.addressForm).toEqual({ form: 'familiar' });
    expect(second.addressForm).toEqual({ form: 'familiar' });
  });

  it('carries a groupless form through on its own', () => {
    const [only] = wordListItemsToNormalizedWords(
      [item('a', 'Wie geht es Ihnen?', { version: 1, form: 'polite' })],
      {},
    );
    expect(only.addressForm).toEqual({ form: 'polite' });
  });

  it('drops a malformed stored value instead of repairing it', () => {
    const [only] = wordListItemsToNormalizedWords(
      [item('a', 'Wie geht es dir?', { version: 1, form: 'casual' })],
      {},
    );
    expect(only.addressForm).toBeNull();
  });

  it('leaves rows without the field alone', () => {
    const [only] = wordListItemsToNormalizedWords([item('a', 'Wie geht es dir?')], {});
    expect(only.addressForm).toBeNull();
  });
});
