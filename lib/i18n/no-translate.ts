/**
 * Opt-out helpers for generated study text.
 *
 * The document-level `translate="no"` was removed from `app/layout.tsx` so
 * Chrome/Edge can offer their native page translation for interface languages
 * the app does not ship. That guard used to cover list content for free, so
 * every element that renders a word, phrase or answer has to opt out for
 * itself now — otherwise the browser rewrites the very text the learner is
 * being quizzed on, while grading still compares against untranslated state.
 *
 * Both forms are emitted on purpose: `translate="no"` is the HTML standard and
 * `notranslate` is the class Google Translate has always honoured.
 */
const NO_TRANSLATE_CLASS = "notranslate";

/**
 * Props for an element whose text content comes from a word list.
 *
 * Pass the element's existing class names and spread the result:
 * `<div {...noTranslateProps('game-prompt')}>{prompt}</div>`.
 */
export function noTranslateProps(className?: string): {
  translate: "no";
  className: string;
} {
  return {
    translate: "no",
    className: className ? `${className} ${NO_TRANSLATE_CLASS}` : NO_TRANSLATE_CLASS,
  };
}
