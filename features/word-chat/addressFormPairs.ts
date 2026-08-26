import {
  isAddressFormValue,
  oppositeAddressForm,
  type AddressFormValue,
} from '@/lib/word-item-address-form';

/**
 * Rules for familiar/polite item pairs, shared by the client (which uses them to
 * estimate what a batch will produce) and the server (which is the authority).
 *
 * A pair is a GROUP: two rows that must live or die together. Everything here
 * exists to stop a group from half-surviving — because half of a pair is worse
 * than none of it. A lone polite row whose familiar twin was dropped is a word
 * the learner never asked for, and a primary row still advertising a group that
 * no longer exists is a dangling reference.
 */

export type PairableRow = {
  textKnown: string;
  textTarget: string;
  addressForm?: { form: AddressFormValue };
  variantGroupKey?: string;
};

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Trim to `limit`, reserving room for every primary row first.
 *
 * A naive truncation would let early pairs eat the budget and push out later
 * source words entirely: 10 typed words with a limit of 10 would keep 5 pairs
 * and silently lose the last 5 words the learner actually typed. Primaries are
 * what they asked for; alternatives are a bonus, so alternatives yield.
 *
 * A group whose alternative does not fit degrades to a lone primary. It keeps
 * its `form` — that is still true of the row — but callers must not mint a
 * `groupId` for it, since no pair survived.
 */
export function limitKeepingPrimaries<T extends { variantGroupKey?: string }>(
  rows: T[],
  limit: number,
): T[] {
  if (limit <= 0) return [];
  if (rows.length <= limit) return rows;

  const seenGroups = new Set<string>();
  const primaries: number[] = [];
  const alternatives: number[] = [];
  rows.forEach((row, index) => {
    const key = row.variantGroupKey;
    if (!key) {
      primaries.push(index);
      return;
    }
    if (seenGroups.has(key)) alternatives.push(index);
    else {
      seenGroups.add(key);
      primaries.push(index);
    }
  });

  const kept = new Set(primaries.slice(0, limit));
  for (const index of alternatives) {
    if (kept.size >= limit) break;
    kept.add(index);
  }

  return rows.filter((_, index) => kept.has(index));
}

/**
 * Decide which client-declared groups are real, over the FINAL set of rows.
 *
 * The client's `variantGroupKey` is a hint, never a fact: it can be forged, and
 * it can be left behind by dedupe or the item limit removing one member. So the
 * invariants are re-checked here on what actually survived:
 *
 *   - exactly two rows carry the key
 *   - their `textKnown` matches after normalization
 *   - their `textTarget` differs after normalization
 *   - one is familiar and the other is polite
 *
 * Anything else degrades to independent rows. Returns the set of keys that
 * earned a persistent `groupId`.
 */
export function validAddressFormGroups(rows: PairableRow[]): Set<string> {
  const groups = new Map<string, PairableRow[]>();
  for (const row of rows) {
    if (!row.variantGroupKey) continue;
    const existing = groups.get(row.variantGroupKey);
    if (existing) existing.push(row);
    else groups.set(row.variantGroupKey, [row]);
  }

  const valid = new Set<string>();
  for (const [key, members] of groups) {
    if (members.length !== 2) continue;
    const [first, second] = members;
    if (!first.addressForm || !second.addressForm) continue;
    // This helper sits on a trust boundary despite its TypeScript signature:
    // commit requests are JSON, so forged values must not reach
    // `oppositeAddressForm` and be mistaken for one side of a valid pair.
    if (!isAddressFormValue(first.addressForm.form)) continue;
    if (!isAddressFormValue(second.addressForm.form)) continue;
    if (second.addressForm.form !== oppositeAddressForm(first.addressForm.form)) continue;
    if (normalize(first.textKnown) !== normalize(second.textKnown)) continue;
    if (normalize(first.textTarget) === normalize(second.textTarget)) continue;
    valid.add(key);
  }

  return valid;
}
