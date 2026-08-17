/**
 * Corpus-wide signals — the ones no single-pair validator can see.
 *
 * `lib/translation-validate.ts` judges a pair on its own. Looking across the
 * whole pool adds two things it cannot know: that a source word has several
 * translations in circulation, and how lopsided that split is.
 */

import { sql } from 'drizzle-orm';
import { db } from '../client';
import { poolSourceCondition } from './quality-pool';

export type DivergenceGroup = {
  languageFrom: string;
  languageTo: string;
  /** Normalized known side; the group key. */
  known: string;
  /** Distinct normalized targets seen for it. */
  variantCount: number;
  /** Total items across all variants. */
  groupTotal: number;
  /** The most common target in the group. */
  dominantTarget: string;
  dominantCount: number;
  variants: { target: string; count: number }[];
};

/**
 * Groups of one source mapping to several targets.
 *
 * Divergence by itself is NOT evidence of a mistake — `bank` → "banka" and
 * `bank` → "břeh" are both right, and synonyms are ordinary. What is worth
 * suspicion is a lopsided split: 97 items saying one thing and 1 saying
 * another. Both facts are returned; the caller decides which flag to raise.
 */
export async function getDivergentSourceGroups(): Promise<DivergenceGroup[]> {
  const rows = (await db.execute(sql`
    WITH normalized AS (
      SELECT
        lower(l.language_from) AS lf,
        lower(l.language_to)   AS lt,
        btrim(regexp_replace(regexp_replace(btrim(normalize(i.text_known, NFC)), '\\s+', ' ', 'g'), '\\.+$', ''))  AS known,
        btrim(regexp_replace(regexp_replace(btrim(normalize(i.text_target, NFC)), '\\s+', ' ', 'g'), '\\.+$', '')) AS target
      FROM word_list_items i
      JOIN word_lists l ON l.id = i.list_id
      JOIN users u      ON u.id = l.owner_id
      WHERE ${poolSourceCondition()}
    ),
    variants AS (
      SELECT lf, lt, known, target, count(*)::int AS n
      FROM normalized
      GROUP BY lf, lt, known, target
    )
    SELECT lf, lt, known,
           count(*)::int AS variant_count,
           sum(n)::int   AS group_total,
           jsonb_agg(jsonb_build_object('target', target, 'count', n) ORDER BY n DESC, target ASC) AS variants
    FROM variants
    GROUP BY lf, lt, known
    HAVING count(*) > 1`)) as unknown as Record<string, unknown>[];

  return rows.map((row) => {
    const variants = (Array.isArray(row.variants) ? row.variants : []).map((entry) => {
      const record = entry as Record<string, unknown>;
      return { target: String(record.target ?? ''), count: Number(record.count ?? 0) };
    });
    const dominant = variants[0] ?? { target: '', count: 0 };
    return {
      languageFrom: String(row.lf ?? ''),
      languageTo: String(row.lt ?? ''),
      known: String(row.known ?? ''),
      variantCount: Number(row.variant_count ?? 0),
      groupTotal: Number(row.group_total ?? 0),
      dominantTarget: dominant.target,
      dominantCount: dominant.count,
      variants,
    };
  });
}

/**
 * Pairs whose known side is just the name of the category they sit in — the
 * category label leaked into the word during generation. This is the corpus
 * half of the pair of heuristics in
 * `features/learning/onboarding/server/autogenerate-common-list/openrouter.ts`.
 *
 * Compared against the learner's own category name, which is the one that
 * actually leaks; `review_label` is generated separately and never used here.
 */
export async function getCategoryNameLeaks(): Promise<
  { languageFrom: string; languageTo: string; known: string; target: string }[]
> {
  const rows = (await db.execute(sql`
    SELECT DISTINCT
      lower(l.language_from) AS lf,
      lower(l.language_to)   AS lt,
      btrim(regexp_replace(regexp_replace(btrim(normalize(i.text_known, NFC)), '\\s+', ' ', 'g'), '\\.+$', ''))  AS known,
      btrim(regexp_replace(regexp_replace(btrim(normalize(i.text_target, NFC)), '\\s+', ' ', 'g'), '\\.+$', '')) AS target
    FROM word_list_items i
    JOIN word_lists l      ON l.id = i.list_id
    JOIN users u           ON u.id = l.owner_id
    JOIN word_categories c ON c.id = i.category_id
    WHERE ${poolSourceCondition()}
      AND lower(btrim(i.text_known)) = lower(btrim(c.name))`)) as unknown as Record<
    string,
    unknown
  >[];

  return rows.map((row) => ({
    languageFrom: String(row.lf ?? ''),
    languageTo: String(row.lt ?? ''),
    known: String(row.known ?? ''),
    target: String(row.target ?? ''),
  }));
}
