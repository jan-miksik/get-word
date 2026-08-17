/**
 * Batched LLM audit of pool pairs.
 *
 * This is the only part of the pool that sends anything outside the system, so
 * it carries its own, stricter consent: `users.ai_review_opt_in`, defaulting to
 * off, checked in SQL across EVERY owner of a pair. A pair is either sendable
 * in full or not sent at all — there is no partial pair.
 *
 * Cost control is the tabled cache keyed on `(pool_key, LLM_AUDIT_VERSION)`
 * plus a hard per-run ceiling. The audit judges against the same rules the
 * translator was told to follow (`TRANSLATION_QUALITY_RULES`), so it grades
 * the work against its own brief rather than a second, invented standard.
 */

import { callOpenRouterChatParsed, parseJsonLoose, OpenRouterChatError } from '@/lib/openrouter-chat';
import { TRANSLATION_QUALITY_RULES } from '@/lib/translation-prompt';
import { getQualityPool, upsertQualityAudit, type PoolRow } from '@/lib/db/queries/quality-pool';
import { LLM_AUDIT_VERSION } from './quality-versions';
import { MAX_AUDIT_ITEMS } from './quality-audit-constants';

export { MAX_AUDIT_ITEMS };

/** Same endpoint convention as the rest of the app's OpenRouter usage. */
const API_URL = process.env.OPENROUTER_API_BASE_URL?.replace(/\/+$/, '')
  ? `${process.env.OPENROUTER_API_BASE_URL.replace(/\/+$/, '')}/chat/completions`
  : 'https://openrouter.ai/api/v1/chat/completions';

export const QUALITY_AUDIT_MODEL =
  process.env.OPENROUTER_QUALITY_AUDIT_MODEL ?? 'google/gemini-2.5-pro';

const BATCH_SIZE = 25;

const SYSTEM_MESSAGE =
  'You review existing translations of vocabulary items and rate their quality. ' +
  'You never invent new items and you always answer with JSON.';

export interface AuditOptions {
  /** Audit exactly these pairs. Otherwise the worst candidates are chosen. */
  poolKeys?: string[];
  maxItems?: number;
  /** Re-audit pairs already scored by the current version. */
  force?: boolean;
}

export interface AuditResult {
  audited: number;
  /** Already scored at this audit version, so not paid for again. */
  cached: number;
  /** Left out because an owner has not allowed third-party AI review. */
  skippedNoConsent: number;
  model: string;
}

type Judgement = { index: number; score: number; reason: string; suggestion: string | null };

function buildPrompt(rows: PoolRow[]): string {
  const items = rows.map((row, index) => ({
    index,
    from: row.languageFrom,
    to: row.languageTo,
    known: row.textKnown,
    target: row.textTarget,
  }));

  return `Rate each translation below from 0 to 100, where 100 is a faultless translation and 0 is plainly wrong.

Judge against these rules:
${TRANSLATION_QUALITY_RULES}

Notes:
- "known" is written in the "from" language, "target" in the "to" language.
- Identical spelling on both sides is often CORRECT (hotel, taxi, pizza). Do not penalise it by itself.
- Several valid translations usually exist. Only lower the score for a genuine error, not for a choice you would have made differently.
- Short vocabulary entries are not sentences; do not demand sentence punctuation or capitalisation from them.

Return JSON: {"results":[{"index":0,"score":95,"reason":"short explanation","suggestion":null}]}
- "reason" must be at most 160 characters and written in English.
- "suggestion" is a corrected target ONLY when the score is below 60; otherwise null.
- Return exactly one result per input index, and echo the index unchanged.

Items:
${JSON.stringify(items, null, 1)}`;
}

function parseJudgements(parsed: unknown, batchLength: number): Judgement[] {
  const results = (parsed as { results?: unknown })?.results;
  if (!Array.isArray(results)) {
    throw new OpenRouterChatError('Quality audit returned no results array.', true);
  }

  const judgements: Judgement[] = [];
  for (const entry of results) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const index = Number(record.index);
    const score = Number(record.score);
    if (!Number.isInteger(index) || index < 0 || index >= batchLength) continue;
    if (!Number.isFinite(score)) continue;

    const suggestion =
      typeof record.suggestion === 'string' && record.suggestion.trim() !== ''
        ? record.suggestion.trim()
        : null;

    judgements.push({
      index,
      score: Math.min(Math.max(Math.round(score), 0), 100),
      reason: typeof record.reason === 'string' ? record.reason.slice(0, 160) : '',
      suggestion,
    });
  }
  return judgements;
}

async function auditBatch(rows: PoolRow[]): Promise<Judgement[]> {
  const apiKey = process.env.OPENROUTER_SERVER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterChatError('OpenRouter server key is not configured.', false);
  }

  return callOpenRouterChatParsed(
    {
      apiKey,
      model: QUALITY_AUDIT_MODEL,
      apiUrl: API_URL,
      maxAttempts: 3,
      retryBaseDelayMs: 600,
      responseFormat: { type: 'json_object' as const },
      maxTokens: Math.min(16_000, 220 * rows.length + 1_000),
      temperature: 0.1,
      messages: [
        { role: 'system' as const, content: SYSTEM_MESSAGE },
        { role: 'user' as const, content: buildPrompt(rows) },
      ],
    },
    (content) => {
      const parsed = parseJsonLoose(content);
      if (parsed == null) {
        throw new OpenRouterChatError('Quality audit returned invalid JSON.', true);
      }
      return parseJudgements(parsed, rows.length);
    },
  );
}

/**
 * Choose what to spend money on: pairs the heuristics already flagged first,
 * then the most-used pairs nobody has looked at. Frequency is the tie-breaker
 * because a bad pair studied by fifty people costs fifty people.
 */
function auditPriority(row: PoolRow): number {
  const flags = row.review?.heuristicFlags ?? [];
  const weight = flags.reduce(
    (total, flag) => total + (flag.weight === 'high' ? 5 : flag.weight === 'medium' ? 2 : 0),
    0,
  );
  return weight * 1000 + Math.min(row.occurrences, 999);
}

export async function auditQualityPool(options: AuditOptions = {}): Promise<AuditResult> {
  const maxItems = Math.min(Math.max(options.maxItems ?? 50, 1), MAX_AUDIT_ITEMS);

  // One page wide enough to choose from; the pool is aggregated, so this is
  // distinct pairs rather than items.
  const page = await getQualityPool({ sort: 'suspicion', limit: 200, offset: 0 });

  let candidates = page.rows;
  if (options.poolKeys && options.poolKeys.length > 0) {
    const wanted = new Set(options.poolKeys);
    candidates = candidates.filter((row) => wanted.has(row.poolKey));
  }

  // The consent gate. Counted before anything else so the caller can report
  // honestly why a pair was left alone.
  const withoutConsent = candidates.filter((row) => !row.aiConsent);
  candidates = candidates.filter((row) => row.aiConsent);

  const cached = options.force
    ? []
    : candidates.filter((row) => row.review?.llmAuditVersion === LLM_AUDIT_VERSION);
  if (!options.force) {
    candidates = candidates.filter(
      (row) => row.review?.llmAuditVersion !== LLM_AUDIT_VERSION,
    );
  }

  candidates = candidates
    .sort((a, b) => auditPriority(b) - auditPriority(a))
    .slice(0, maxItems);

  let audited = 0;
  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    const batch = candidates.slice(start, start + BATCH_SIZE);
    const judgements = await auditBatch(batch);

    await upsertQualityAudit(
      judgements.flatMap((judgement) => {
        const row = batch[judgement.index];
        if (!row) return [];
        return [
          {
            poolKey: row.poolKey,
            languageFrom: row.languageFrom,
            languageTo: row.languageTo,
            textKnown: row.textKnown,
            textTarget: row.textTarget,
            score: judgement.score,
            reason: judgement.reason || null,
            suggestedTarget: judgement.suggestion,
            model: QUALITY_AUDIT_MODEL,
            version: LLM_AUDIT_VERSION,
          },
        ];
      }),
    );
    audited += judgements.length;
  }

  return {
    audited,
    cached: cached.length,
    skippedNoConsent: withoutConsent.length,
    model: QUALITY_AUDIT_MODEL,
  };
}
