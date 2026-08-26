import { describe, expect, it } from 'vitest';
import {
  limitKeepingPrimaries,
  validAddressFormGroups,
  type PairableRow,
} from '../addressFormPairs';

function row(
  textKnown: string,
  textTarget: string,
  form?: 'familiar' | 'polite',
  variantGroupKey?: string,
): PairableRow {
  return {
    textKnown,
    textTarget,
    ...(form ? { addressForm: { form } } : {}),
    ...(variantGroupKey ? { variantGroupKey } : {}),
  };
}

describe('limitKeepingPrimaries', () => {
  it('never lets alternatives push out a word the learner actually typed', () => {
    // 5 pairs + 5 plain words = 15 rows, limit 10. A naive truncation keeps the
    // first 5 pairs and loses every plain word; primaries must win instead.
    const rows: PairableRow[] = [];
    for (let i = 0; i < 5; i += 1) {
      rows.push(row(`q${i}`, `familiar${i}`, 'familiar', `${i}:address`));
      rows.push(row(`q${i}`, `polite${i}`, 'polite', `${i}:address`));
    }
    for (let i = 0; i < 5; i += 1) rows.push(row(`plain${i}`, `t${i}`));

    const kept = limitKeepingPrimaries(rows, 10);

    expect(kept).toHaveLength(10);
    for (let i = 0; i < 5; i += 1) {
      expect(kept.some((r) => r.textTarget === `familiar${i}`)).toBe(true);
      expect(kept.some((r) => r.textTarget === `t${i}`)).toBe(true);
    }
    // Exactly the primaries fit; no alternative made it.
    expect(kept.some((r) => r.textTarget.startsWith('polite'))).toBe(false);
  });

  it('spends leftover capacity on alternatives', () => {
    const rows = [
      row('q', 'familiar', 'familiar', '0:address'),
      row('q', 'polite', 'polite', '0:address'),
      row('plain', 't'),
    ];
    expect(limitKeepingPrimaries(rows, 3)).toHaveLength(3);
  });

  it('passes everything through when the batch already fits', () => {
    const rows = [row('a', 'x'), row('b', 'y')];
    expect(limitKeepingPrimaries(rows, 10)).toBe(rows);
  });

  it('keeps nothing when there is no room', () => {
    expect(limitKeepingPrimaries([row('a', 'x')], 0)).toEqual([]);
  });
});

describe('validAddressFormGroups', () => {
  it('accepts a well-formed pair', () => {
    const rows = [
      row('How are you?', 'Wie geht es dir?', 'familiar', '0:address'),
      row('How are you?', 'Wie geht es Ihnen?', 'polite', '0:address'),
    ];
    expect(validAddressFormGroups(rows)).toEqual(new Set(['0:address']));
  });

  it('rejects a group that is not exactly two rows', () => {
    const rows = [
      row('q', 'a', 'familiar', 'g'),
      row('q', 'b', 'polite', 'g'),
      row('q', 'c', 'polite', 'g'),
    ];
    expect(validAddressFormGroups(rows).size).toBe(0);
    expect(validAddressFormGroups([row('q', 'a', 'familiar', 'g')]).size).toBe(0);
  });

  it('rejects a pair whose members ask different questions', () => {
    const rows = [
      row('How are you?', 'Wie geht es dir?', 'familiar', 'g'),
      row('Where are you?', 'Wo sind Sie?', 'polite', 'g'),
    ];
    expect(validAddressFormGroups(rows).size).toBe(0);
  });

  it('rejects a pair whose members give the same answer', () => {
    const rows = [
      row('q', 'Wie geht es dir?', 'familiar', 'g'),
      row('q', '  wie geht es DIR? ', 'polite', 'g'),
    ];
    expect(validAddressFormGroups(rows).size).toBe(0);
  });

  it('rejects two rows of the same form', () => {
    const rows = [
      row('q', 'a', 'familiar', 'g'),
      row('q', 'b', 'familiar', 'g'),
    ];
    expect(validAddressFormGroups(rows).size).toBe(0);
  });

  it('rejects a group whose members carry no form at all', () => {
    expect(validAddressFormGroups([row('q', 'a', undefined, 'g'), row('q', 'b', undefined, 'g')]).size)
      .toBe(0);
  });

  it('rejects forged runtime form values', () => {
    const rows = [
      row('q', 'a', 'familiar', 'g'),
      {
        textKnown: 'q',
        textTarget: 'b',
        addressForm: { form: 'attacker-value' },
        variantGroupKey: 'g',
      },
    ] as unknown as PairableRow[];

    expect(validAddressFormGroups(rows).size).toBe(0);
  });
});
