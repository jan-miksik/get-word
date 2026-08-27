/**
 * Canonical SQL invariants for the consent-gated quality pool.
 *
 * Every query that derives a pool key or filters source rows must use these
 * expressions so key serialization and consent cannot drift between concerns.
 */

import { sql, type SQL } from 'drizzle-orm';

export type QualityVerdict = 'unreviewed' | 'ok' | 'suspect' | 'suggested';

/* ------------------------------------------------------------------ *
 * The pool key
 * ------------------------------------------------------------------ */

/**
 * Text normalization, mirroring `normalizeText` in lib/progress-key.ts with
 * `ignoreCase: false`: NFC → trim → collapse whitespace → strip trailing dots
 * → trim again.
 *
 * Deliberately NOT the progress content key: that one folds per-item
 * `ignore_case` into the hash and carries different semantics. Mixing them
 * would silently merge pairs that progress treats as distinct.
 */
export function poolNormalize(column: SQL): SQL {
  return sql`btrim(regexp_replace(regexp_replace(btrim(normalize(${column}, NFC)), '\\s+', ' ', 'g'), '\\.+$', ''))`;
}

/**
 * `p1:` + md5 over a LENGTH-PREFIXED serialization of the four values.
 *
 * The length prefixes are the point: with a bare separator, ("ab|c", "d") and
 * ("ab", "c|d") would hash the same input. `len:value|len:value|…` cannot be
 * parsed two ways, so distinct quadruples always produce distinct input. A NUL
 * separator is not an option — PostgreSQL `text` cannot hold one.
 *
 * `p1:` versions the key scheme itself. If the normalization or serialization
 * ever changes, bump it so old rows are visibly different instead of quietly
 * disagreeing with new ones.
 *
 * This is the ONLY definition. The listing query, the scan, the verdict write,
 * the purge, and the learner-facing suggestion lookup all call it, which is
 * what keeps them from drifting apart.
 */
function poolKeyExpression(
  languageFrom: SQL,
  languageTo: SQL,
  textKnown: SQL,
  textTarget: SQL,
): SQL {
  const lf = sql`lower(${languageFrom})`;
  const lt = sql`lower(${languageTo})`;
  const k = poolNormalize(textKnown);
  const t = poolNormalize(textTarget);
  return sql`'p1:' || md5(concat_ws('|',
    char_length(${lf}) || ':' || ${lf},
    char_length(${lt}) || ':' || ${lt},
    char_length(${k}) || ':' || ${k},
    char_length(${t}) || ':' || ${t}
  ))`;
}

/** The pool key for a `word_list_items i` joined to `word_lists l`. */
export function itemPoolKey(itemAlias = 'i', listAlias = 'l'): SQL {
  const i = sql.raw(itemAlias);
  const l = sql.raw(listAlias);
  return poolKeyExpression(
    sql`${l}.language_from`,
    sql`${l}.language_to`,
    sql`${i}.text_known`,
    sql`${i}.text_target`,
  );
}

/* ------------------------------------------------------------------ *
 * Consent
 * ------------------------------------------------------------------ */

/**
 * Rows eligible for the pool at all. Private owned lists only, with both
 * halves of the consent, and a pair that actually has both sides.
 *
 * Kept as one expression so no caller can accidentally build a pool query
 * that forgets one of the conditions.
 */
export function poolSourceCondition(
  itemAlias = 'i',
  listAlias = 'l',
  userAlias = 'u',
): SQL {
  const i = sql.raw(itemAlias);
  const l = sql.raw(listAlias);
  const u = sql.raw(userAlias);
  return sql`${l}.is_public = false
    AND ${l}.owner_id IS NOT NULL
    AND ${l}.review_opt_in = true
    AND ${u}.review_opt_in = true
    AND ${i}.text_target IS NOT NULL
    AND btrim(${i}.text_target) <> ''
    AND btrim(${i}.text_known) <> ''`;
}

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */
