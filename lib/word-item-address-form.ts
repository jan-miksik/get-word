/**
 * Per-item address form ("kamarádsky" / "zdvořile") shown on the learning card.
 *
 * Stored as JSONB on `word_list_items.address_form`. Deliberately NOT called
 * `register`: this is the form of address (tykání/vykání, du/Sie, tu/vous), not
 * the linguistic register of the text. Leaving `register` free keeps the door
 * open for a real register field later (colloquial, literary, vulgar, …).
 *
 * A previous `register` column was added in migration 0032 and dropped again in
 * 0033, because back then it held a batch-level guess written onto every row.
 * This field is a different thing: it is asserted per item, only where the two
 * forms genuinely differ, and it drives visible UI.
 *
 * `groupId` links the two members of a familiar/polite pair. It is the truth;
 * the sibling's text is NEVER stored here. A denormalized counterpart would
 * have to be kept in sync across review edits, list edits, sibling deletion,
 * fork, takeover and import — one missed spot and it goes stale. Hydration
 * derives it from the sibling instead (see `lib/words.ts`).
 *
 * The validator is hand-rolled in the deterministic style of
 * `lib/word-item-comment.ts` (the project has no Zod): unknown → dropped,
 * never repaired.
 */

import { getBaseLanguage } from "@/lib/i18n/languages";

/**
 * Target languages whose everyday address system is genuinely BINARY: exactly
 * one familiar form and exactly one polite form, both derivable without knowing
 * the addressee's age, gender, or number. Only these may have a phrase split
 * into a familiar/polite pair of study items.
 *
 * Deliberately an explicit whitelist rather than a derived property, because
 * "marks address somehow" and "has two canonical forms" are different questions
 * and the gap between them is where wrong pairs get generated:
 *
 * - `vi` addresses by relationship (bạn / anh / chị / em / cô / chú / ông / bà),
 *   so there is no single familiar and no single polite rendering.
 * - `ja`, `ko`, `th` have several politeness levels rather than two.
 * - `pl` looks binary until the polite side is written out: Jak się Pan ma? /
 *   Jak się Pani ma? / Jak się Państwo mają? depend on the addressee's gender
 *   and number, which a neutral source does not supply. Same class of problem
 *   as Vietnamese, only less obvious.
 *
 * Candidates that need a native-speaker check before joining: pl, es, pt
 * (tú/vos/usted, tu/você/o senhor), hu (te/maga/ön is closer to three), tr, fa.
 *
 * The looser `hasRegisterDistinction` in features/word-chat/registerLanguages.ts
 * answers a different question and must never be used for this one.
 */
const BINARY_ADDRESS_FORM_LANGUAGES = new Set([
  "cs", "sk", "ru", "uk", "de", "fr", "it", "nl", "el", "ro",
]);

export function hasBinaryAddressForms(languageCode: string): boolean {
  if (!languageCode) return false;
  return BINARY_ADDRESS_FORM_LANGUAGES.has(getBaseLanguage(languageCode));
}

export type AddressFormValue = "familiar" | "polite";

export type WordItemAddressForm = {
  /** Future-proofs JSONB migrations. Must be exactly 1; unknown → dropped. */
  version: 1;
  form: AddressFormValue;
  /**
   * Shared by exactly the two members of one pair. Absent when the item stands
   * alone — including when its twin was dropped by dedupe or the item limit, in
   * which case no persistent group ever existed.
   */
  groupId?: string;
};

const ADDRESS_FORM_VERSION = 1 as const;
const MAX_GROUP_ID_LENGTH = 64;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAddressFormValue(value: unknown): value is AddressFormValue {
  return value === "familiar" || value === "polite";
}

/** The other side of the binary. */
export function oppositeAddressForm(form: AddressFormValue): AddressFormValue {
  return form === "familiar" ? "polite" : "familiar";
}

/**
 * Validate + normalize a raw value into a clean `WordItemAddressForm`, or
 * `null` when it should be dropped. Runs on save, commit, and hydrate.
 */
export function normalizeWordItemAddressForm(value: unknown): WordItemAddressForm | null {
  if (!isPlainObject(value)) return null;
  if (value.version !== ADDRESS_FORM_VERSION) return null;
  if (!isAddressFormValue(value.form)) return null;

  const addressForm: WordItemAddressForm = {
    version: ADDRESS_FORM_VERSION,
    form: value.form,
  };

  if (typeof value.groupId === "string") {
    const groupId = value.groupId.trim();
    if (groupId && groupId.length <= MAX_GROUP_ID_LENGTH) {
      addressForm.groupId = groupId;
    }
  }

  return addressForm;
}

/** Build a stored address form. `groupId` is omitted unless a real pair survived. */
export function makeAddressForm(
  form: AddressFormValue,
  groupId?: string,
): WordItemAddressForm {
  const normalized = normalizeWordItemAddressForm({
    version: ADDRESS_FORM_VERSION,
    form,
    ...(groupId ? { groupId } : {}),
  });
  // `form` is already a closed union; normalization can only remove a malformed
  // optional group id. Keeping the fallback explicit avoids a lying cast while
  // making the builder total for its declared input type.
  return normalized ?? { version: ADDRESS_FORM_VERSION, form };
}
