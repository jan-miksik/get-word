/**
 * The heuristic scan.
 *
 * Every check here already exists somewhere in the codebase and ran on some
 * live path — it just was never stored, so nothing could be filtered or sorted
 * by it. The scan's job is to run them over the whole pool and persist the
 * result, not to invent new judgements.
 *
 * Free to run: no network, no model, no provider. Costs one pass over the
 * corpus.
 */

import {
  getQualityPool,
  upsertQualityHeuristics,
  type PoolAudioSide,
  type PoolRow,
} from '@/lib/db/queries/quality-pool';
import {
  getCategoryNameLeaks,
  getDivergentSourceGroups,
  type DivergenceGroup,
} from '@/lib/db/queries/quality-corpus';
import { validateTranslation } from '@/lib/translation-validate';
import { polishPair, isAuthoredSentence } from '@/lib/formatting-polish';
import { isSuspiciousSizeForText } from '@/lib/audio-quality';
import {
  weightForFlag,
  type QualityFlagCode,
  type QualityHeuristicFlag,
} from '@/lib/quality-flags';
import { HEURISTIC_VERSION } from './quality-versions';

/**
 * A minority variant is suspicious only when it is genuinely marginal against
 * a dominant reading. A 50/50 split between two valid synonyms is not.
 */
const MINORITY_SHARE_THRESHOLD = 0.05;
const MINORITY_MIN_GROUP_TOTAL = 10;

const PAGE_SIZE = 200;

export interface ScanOptions {
  /** Max pairs to visit in this run. */
  limit?: number;
  /** Re-scan pairs already at the current version (default: skip them). */
  force?: boolean;
  /** Resume point, as returned in `nextOffset`. */
  offset?: number;
}

export interface ScanResult {
  scanned: number;
  flagged: number;
  unchanged: number;
  /** Null when the pool was exhausted. */
  nextOffset: number | null;
}

function flag(
  code: QualityFlagCode,
  extra: Omit<QualityHeuristicFlag, 'code' | 'weight'> = {},
): QualityHeuristicFlag {
  return { code, weight: weightForFlag(code), ...extra };
}

/**
 * Keys for matching a pool row against the corpus-wide aggregates.
 *
 * Length-prefixed for the same reason the pool key is: plain concatenation
 * lets ("ab", "c") and ("a", "bc") collide, and a bare separator can be
 * smuggled in inside the text. Kept ASCII-visible on purpose — an earlier
 * version used invisible control characters, which made a mismatch between
 * these keys and a test fixture impossible to see in a diff.
 */
function part(value: string): string {
  return `${value.length}:${value}`;
}

function groupKey(languageFrom: string, languageTo: string, known: string): string {
  return [part(languageFrom.toLowerCase()), part(languageTo.toLowerCase()), part(known)].join('|');
}

function pairKey(
  languageFrom: string,
  languageTo: string,
  known: string,
  target: string,
): string {
  return `${groupKey(languageFrom, languageTo, known)}|${part(target)}`;
}

/** Exposed so corpus-map builders and tests agree on the key by construction. */
export const corpusKeys = { groupKey, pairKey };

/** Audio flags for one side; only assets that exist are judged. */
function audioFlags(side: PoolAudioSide, text: string, which: 'known' | 'target') {
  return side.assets
    .filter((asset) => isSuspiciousSizeForText(asset.size, text))
    .map((asset) =>
      flag('audio_suspicious_size', {
        side: which,
        message:
          asset.size === null
            ? 'Stored clip has no recorded size.'
            : `Stored clip is ${asset.size} bytes, short for this text.`,
        meta: asset.size === null ? {} : { sizeBytes: asset.size },
      }),
    );
}

/**
 * All heuristics for one pair.
 *
 * Exported so the tests can exercise the decision logic directly, without a
 * database. The corpus maps are passed in rather than fetched, because they
 * are one query for the entire run.
 */
export function evaluateRow(
  row: PoolRow,
  corpus: {
    divergence: Map<string, DivergenceGroup>;
    categoryLeaks: Set<string>;
  },
): QualityHeuristicFlag[] {
  const flags: QualityHeuristicFlag[] = [];
  const source = row.textKnown;
  const target = row.textTarget;

  /**
   * Sentencehood decides whether the capitalization and register rules apply
   * at all, so getting it wrong manufactures false positives.
   *
   * `isLikelySentence` (the default inside `validateTranslation`) treats any
   * four words as a sentence, which flags ordinary collocations — a first scan
   * over real data reported "sort out minor problems" as a sentence missing
   * its capital. Live callers avoid this by passing the item's known kind;
   * the pool has no kind, so it borrows the stricter judgement
   * `formatting-polish` already makes: terminal punctuation, a leading
   * interrogative, or a pronoun inside a longer clause.
   */
  const isSentence =
    isAuthoredSentence(source.trim(), row.languageFrom) ||
    isAuthoredSentence(target.trim(), row.languageTo);

  // 1. The existing per-pair validators, finally persisted.
  for (const warning of validateTranslation({
    source,
    target,
    fromLang: row.languageFrom,
    toLang: row.languageTo,
    isSentence,
  })) {
    flags.push(flag(warning.code as QualityFlagCode, { message: warning.message }));
  }

  // 2. Deterministic formatting. A fix being available is a notice, not a
  //    defect — polishPair never changes meaning.
  const polish = polishPair(
    { text: source, lang: row.languageFrom },
    { text: target, lang: row.languageTo },
    { isSentence },
  );
  const hasFix = polish.source.fixes.length > 0 || polish.target.fixes.length > 0;
  if (hasFix) {
    const codes = [...polish.source.fixes, ...polish.target.fixes]
      .map((entry) => entry.code)
      .join(', ');
    flags.push(flag('formatting_fix_available', { message: codes }));
  }
  for (const warning of [...polish.source.warnings, ...polish.target.warnings]) {
    if (warning.code === 'maybe_question') flags.push(flag('maybe_question'));
    if (warning.code === 'maybe_exclamation') flags.push(flag('maybe_exclamation'));
  }

  // 3. Corpus-wide. Divergence is a prompt to look; a dominated minority is
  //    the one that actually accuses.
  const group = corpus.divergence.get(
    groupKey(row.languageFrom, row.languageTo, row.normKnown),
  );
  if (group) {
    flags.push(
      flag('divergent_targets', {
        message: `${group.variantCount} different translations in the corpus.`,
        meta: { variants: group.variantCount, groupTotal: group.groupTotal },
      }),
    );

    const own = group.variants.find((variant) => variant.target === row.normTarget);
    const share = own && group.groupTotal > 0 ? own.count / group.groupTotal : 1;
    if (
      own &&
      group.groupTotal >= MINORITY_MIN_GROUP_TOTAL &&
      share <= MINORITY_SHARE_THRESHOLD &&
      row.normTarget !== group.dominantTarget
    ) {
      flags.push(
        flag('dominated_minority', {
          message: `Used ${own.count}× against "${group.dominantTarget}" at ${group.dominantCount}×.`,
          meta: {
            share: Number(share.toFixed(4)),
            groupTotal: group.groupTotal,
            dominantTarget: group.dominantTarget,
          },
        }),
      );
    }
  }

  if (
    corpus.categoryLeaks.has(
      pairKey(row.languageFrom, row.languageTo, row.normKnown, row.normTarget),
    )
  ) {
    flags.push(
      flag('category_name_leak', {
        side: 'known',
        message: 'The known side equals the name of its category.',
      }),
    );
  }

  // 4. Audio, judged per side against that side's own text.
  flags.push(...audioFlags(row.known, source, 'known'));
  flags.push(...audioFlags(row.target, target, 'target'));

  return flags;
}

function sameFlags(a: QualityHeuristicFlag[], b: QualityHeuristicFlag[]): boolean {
  if (a.length !== b.length) return false;
  const key = (flag: QualityHeuristicFlag) => `${flag.code}|${flag.side ?? ''}|${flag.message ?? ''}`;
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.every((value, index) => value === right[index]);
}

/**
 * Walk the pool and store heuristic verdicts.
 *
 * Does NOT purge. Purging is a separate command precisely because this one
 * runs with a limit — see `purgeStaleQualityReviews`.
 */
export async function scanQualityPool(options: ScanOptions = {}): Promise<ScanResult> {
  const limit = Math.max(options.limit ?? 500, 1);
  const [divergenceGroups, categoryLeaks] = await Promise.all([
    getDivergentSourceGroups(),
    getCategoryNameLeaks(),
  ]);

  const corpus = {
    divergence: new Map(
      divergenceGroups.map((group) => [
        groupKey(group.languageFrom, group.languageTo, group.known),
        group,
      ]),
    ),
    categoryLeaks: new Set(
      categoryLeaks.map((leak) =>
        pairKey(leak.languageFrom, leak.languageTo, leak.known, leak.target),
      ),
    ),
  };

  let offset = Math.max(options.offset ?? 0, 0);
  let scanned = 0;
  let flagged = 0;
  let unchanged = 0;
  let exhausted = false;

  while (scanned < limit) {
    const pageSize = Math.min(PAGE_SIZE, limit - scanned);
    const page = await getQualityPool({
      sort: 'alphabetical',
      limit: pageSize,
      offset,
    });

    if (page.rows.length === 0) {
      exhausted = true;
      break;
    }

    const pending = [];
    for (const row of page.rows) {
      scanned += 1;

      const current = row.review;
      if (!options.force && current?.heuristicVersion === HEURISTIC_VERSION) {
        // Already judged by this generation of the checks.
        unchanged += 1;
        continue;
      }

      const flags = evaluateRow(row, corpus);
      if (flags.length > 0) flagged += 1;
      if (current && current.heuristicVersion === HEURISTIC_VERSION && sameFlags(current.heuristicFlags, flags)) {
        unchanged += 1;
        continue;
      }

      pending.push({
        poolKey: row.poolKey,
        languageFrom: row.languageFrom,
        languageTo: row.languageTo,
        textKnown: row.textKnown,
        textTarget: row.textTarget,
        flags,
        version: HEURISTIC_VERSION,
      });
    }

    await upsertQualityHeuristics(pending);

    offset += page.rows.length;
    if (offset >= page.total) {
      exhausted = true;
      break;
    }
  }

  return {
    scanned,
    flagged,
    unchanged,
    nextOffset: exhausted ? null : offset,
  };
}
