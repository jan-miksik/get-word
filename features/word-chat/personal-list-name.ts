import { getLocalizedLanguageName } from "@/lib/i18n/languages";
import { bundledMessages, enMessages, interpolateMessage } from "@/lib/i18n/messages";

/**
 * The name of the learner's personal list for one language pair.
 *
 * Shared by the server that creates the row and the UI that names the list in
 * the visibility question and above the review rows — a learner deciding who
 * may see "this list" should be able to read which list that is, and the two
 * must not drift apart.
 *
 * Written in the language the learner already knows, not the UI language: the
 * list name ends up in their own word lists, where an English "My words" would
 * be the odd one out.
 */
export function personalListName(languageFrom: string, languageTo: string): string {
  // Generated bundles are built from a snapshot of the English dictionary, so a
  // key added after the last generation run is simply absent there.
  const template =
    bundledMessages[languageFrom]?.["wordChat.personalListName"] ??
    enMessages["wordChat.personalListName"];
  const language =
    getLocalizedLanguageName(languageTo, languageFrom) ?? languageTo.toUpperCase();
  return interpolateMessage(template, { language });
}
