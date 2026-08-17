/**
 * Generations of the two quality checks.
 *
 * The pool caches results per pair, which is what keeps a scan cheap and an
 * LLM audit affordable. Without a version alongside the cache, changing the
 * prompt, the rules in `lib/translation-prompt.ts`, the model, or the set of
 * heuristics would leave every old score sitting there looking current.
 *
 * Bumping a constant is a full invalidation with no migration: the scan and
 * the audit both re-run anything whose stored version differs, and the admin
 * UI can pull already-judged rows back into the queue by comparing an
 * editor's `reviewed_*_version` snapshot against these.
 *
 * Bump HEURISTIC_VERSION when: a heuristic is added, removed, reweighted, or
 * its detection changes.
 * Bump LLM_AUDIT_VERSION when: the audit prompt, the shared quality rules, or
 * the model changes.
 */

export const HEURISTIC_VERSION = 1;

export const LLM_AUDIT_VERSION = 1;
