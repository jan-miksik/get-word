/**
 * Study items are read off a card, spoken by TTS and typed back by the learner,
 * so editorial shorthand that belongs in a dictionary entry does not belong
 * here: "letenka (jednosměrná)" teaches a parenthesis, and "letenka / jízdenka"
 * teaches an item nobody can answer correctly. The prompts already ask for plain
 * text on both the item and the translation side; this is the check that makes
 * it true.
 *
 * A note the model wanted to give is not lost — it belongs in the item's study
 * comment, which is generated separately.
 */

/** "(informal)", "[pl.]", "（口语）" — a note about the word, not the word. */
const BRACKETED_NOTE = /[(\[（【][^()[\]（）【】]*[)\]）】]/gu;

/**
 * "letenka / jízdenka", "vstup/výstup" — alternatives, keep the first. Both
 * sides must be letters, so "24/7", "1/2" and dates survive untouched.
 */
const SLASH_ALTERNATIVE = /([\p{L}\p{M}]+)\s*\/\s*[\p{L}\p{M}]+/gu;

const SPACE_BEFORE_PUNCTUATION = /\s+([,.;:!?…])/gu;

/** How many times the slash pass may run, for "a/b/c/d" chains. */
const MAX_SLASH_PASSES = 4;

export function toPlainItemText(input: string): string {
  const original = input.trim().replace(/\s+/g, " ");
  if (!original) return "";

  let text = original.replace(BRACKETED_NOTE, " ");
  for (let pass = 0; pass < MAX_SLASH_PASSES; pass += 1) {
    // `replace` resumes scanning after each match in the ORIGINAL string, so
    // "a/b/c" needs a second pass to lose its second alternative.
    const next = text.replace(SLASH_ALTERNATIVE, "$1");
    if (next === text) break;
    text = next;
  }

  text = text
    .replace(SPACE_BEFORE_PUNCTUATION, "$1")
    .replace(/\s+/g, " ")
    .trim();

  // Cleaning must never delete the item. Text that was nothing but a note keeps
  // its original wording, which the learner can still edit or drop.
  return text || original;
}
