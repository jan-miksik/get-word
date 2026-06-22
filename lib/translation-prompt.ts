/**
 * Shared translation-quality prompt language.
 *
 * Imported by both the donated autogenerate prompts
 * (features/learning/onboarding/server/autogenerate-common-list/openrouter.ts)
 * and the BYOK list-translation prompt (lib/translation.ts) so a quality rule
 * improved in one place takes effect in both.
 */

/** System message for any translation/list-generation call. */
export const TRANSLATION_SYSTEM_PROMPT = `
You are a professional translator for a beginner language-learning app.
You translate meaning, not words, and your output must read naturally to a native speaker.
Return only valid JSON matching the requested schema, with no markdown or commentary.
`.trim();

/**
 * The shared quality rules. Embed inside a prompt's "Rules:" section.
 * Phrased to apply to both single-column translation and full list generation.
 */
export const TRANSLATION_QUALITY_RULES = `
- Translate meaning, not word-for-word. Every translation must read naturally to a native speaker.
- Prefer common, everyday beginner-friendly wording. Avoid obscure, literary, or archaic choices.
- Keep politeness/register CONSISTENT across the whole batch. For languages with grammatical politeness levels (Korean, Japanese), pick ONE beginner-appropriate polite level and use it throughout; for languages with formal/informal "you" (German, Spanish, French), choose one register and apply it consistently.
- For an ambiguous single word, choose the most common beginner meaning and use the surrounding items as context.
- Do not add romanization, pronunciation, parenthetical glosses, or slash-separated alternatives unless they are part of the original text.
- Never output text in the wrong language and never leave an item untranslated.
`.trim();
