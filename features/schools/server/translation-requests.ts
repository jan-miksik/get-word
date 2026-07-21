import { createHash } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { OpenRouterChatError, callOpenRouterChatParsedWithMeta } from '@/lib/openrouter-chat';
import {
  buildOpenRouterTranslationPrompt,
  TRANSLATION_SYSTEM_PROMPT,
} from '@/lib/translation-prompt';
import { validateTranslation } from '@/lib/translation-validate';
import type { TranslationResult } from '@/lib/translation';
import type { SchoolEntitlement } from '@/features/schools/types';
import {
  SCHOOL_TRANSLATION_PROMPT_VERSION,
  SCHOOL_TRANSLATION_REQUEST_ID_MAX_LENGTH,
  getSchoolOpenRouterModel,
} from './config';
import { getCurrentSchoolFeaturePeriod } from './entitlements';
import { refundSchoolFeatureUsage, reserveSchoolFeatureUsage } from './feature-usage';

type SchoolTranslateItem = {
  id: string;
  text: string;
  from_lang: string;
  to_lang: string;
};

type CachedResponse = {
  results: Array<{
    id: string;
    translated_text: string | null;
    status: 'ok' | 'error';
    error?: string;
    warning?: string;
    validation_warnings?: TranslationResult['validationWarnings'];
    source: 'api';
  }>;
};

type RequestRow = {
  id: string;
  request_hash: string;
  status: 'reserved' | 'completed' | 'released' | 'unknown' | 'failed_charged';
  result_json: CachedResponse | null;
  error_json: Record<string, unknown> | null;
  item_count: number;
  period_start: Date;
};

export class SchoolTranslationError extends Error {
  constructor(
    readonly body: Record<string, unknown>,
    readonly status: number,
  ) {
    super(typeof body.error === 'string' ? body.error : 'School translation failed');
    this.name = 'SchoolTranslationError';
  }
}

function countChars(items: SchoolTranslateItem[]) {
  return items.reduce((total, item) => total + Array.from(item.text).length, 0);
}

function validateRequestId(requestId: unknown): string {
  if (typeof requestId !== 'string') {
    throw new SchoolTranslationError(
      { error: 'request_id is required for school translations' },
      400,
    );
  }
  const trimmed = requestId.trim();
  if (
    !trimmed ||
    trimmed.length > SCHOOL_TRANSLATION_REQUEST_ID_MAX_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(trimmed)
  ) {
    throw new SchoolTranslationError(
      { error: 'request_id must be 1-64 URL-safe characters' },
      400,
    );
  }
  return trimmed;
}

function assertItemLengths(items: SchoolTranslateItem[], maxChars: number) {
  const tooLong = items.find((item) => Array.from(item.text).length > maxChars);
  if (tooLong) {
    throw new SchoolTranslationError(
      {
        error: `School AI translation items must be ${maxChars} characters or shorter.`,
        code: 'TRANSLATION_ITEM_TOO_LONG',
        item_id: tooLong.id,
        max_chars: maxChars,
      },
      400,
    );
  }
}

function buildRequestHash(input: {
  provider: 'school_openrouter';
  fromLang: string;
  toLang: string;
  items: SchoolTranslateItem[];
}) {
  return createHash('sha256')
    .update(JSON.stringify({
      promptVersion: SCHOOL_TRANSLATION_PROMPT_VERSION,
      provider: input.provider,
      fromLang: input.fromLang,
      toLang: input.toLang,
      items: input.items.map((item) => ({
        id: item.id,
        text: item.text,
        from_lang: item.from_lang,
        to_lang: item.to_lang,
      })),
    }))
    .digest('hex');
}

function cachedResult(row: RequestRow): CachedResponse {
  if (row.result_json?.results && Array.isArray(row.result_json.results)) {
    return row.result_json;
  }
  return { results: [] };
}

async function reserveRequest(input: {
  entitlement: SchoolEntitlement;
  userId: string;
  requestId: string;
  requestHash: string;
  itemCount: number;
  characterCount: number;
  model: string;
}) {
  const { start: periodStart } = getCurrentSchoolFeaturePeriod();
  return db.transaction(async (tx) => {
    const existingRows = await tx.execute(sql`
      SELECT id, request_hash, status, result_json, error_json, item_count, period_start
      FROM school_translation_requests
      WHERE user_id = ${input.userId}
        AND request_id = ${input.requestId}
      FOR UPDATE
    `);
    const existing = existingRows[0] as RequestRow | undefined;
    if (existing) {
      if (existing.request_hash !== input.requestHash) {
        throw new SchoolTranslationError(
          { error: 'This request_id has already been used with different content.', code: 'IDEMPOTENCY_KEY_REUSED' },
          409,
        );
      }
      if (existing.status === 'completed') return { action: 'cached' as const, row: existing };
      if (existing.status === 'reserved') {
        throw new SchoolTranslationError(
          { error: 'This translation request is still in progress.', code: 'TRANSLATION_REQUEST_IN_PROGRESS' },
          409,
        );
      }
      if (existing.status === 'unknown') {
        throw new SchoolTranslationError(
          { error: 'This translation request has an unknown provider status.', code: 'TRANSLATION_REQUEST_STATUS_UNKNOWN' },
          409,
        );
      }
      if (existing.status === 'failed_charged') return { action: 'failed_charged' as const, row: existing };
      await tx.execute(sql`
        UPDATE school_translation_requests
        SET status = 'reserved',
            school_id = ${input.entitlement.schoolId},
            period_start = ${periodStart.toISOString()}::timestamp,
            item_count = ${input.itemCount},
            character_count = ${input.characterCount},
            model = ${input.model},
            result_json = NULL,
            error_json = NULL,
            provider_generation_id = NULL,
            provider_usage = NULL,
            completed_at = NULL,
            updated_at = now()
        WHERE id = ${existing.id}
      `);
    } else {
      await tx.execute(sql`
        INSERT INTO school_translation_requests (
          user_id,
          school_id,
          period_start,
          request_id,
          request_hash,
          status,
          item_count,
          character_count,
          model,
          created_at,
          updated_at
        )
        VALUES (
          ${input.userId},
          ${input.entitlement.schoolId},
          ${periodStart.toISOString()}::timestamp,
          ${input.requestId},
          ${input.requestHash},
          'reserved',
          ${input.itemCount},
          ${input.characterCount},
          ${input.model},
          now(),
          now()
        )
      `);
    }

    const reservation = await reserveSchoolFeatureUsage(tx, {
      userId: input.userId,
      schoolId: input.entitlement.schoolId,
      feature: 'ai_translation',
      periodStart,
      count: input.itemCount,
      limit: input.entitlement.limits.translationItemsMonthlyLimit,
    });
    if (!reservation.reserved) {
      throw new SchoolTranslationError(
        {
          error: 'Monthly school AI translation limit reached.',
          code: 'SCHOOL_AI_TRANSLATION_LIMIT_REACHED',
          limit: input.entitlement.limits.translationItemsMonthlyLimit,
        },
        429,
      );
    }
    return { action: 'reserved' as const };
  });
}

async function releaseRequest(input: {
  userId: string;
  requestId: string;
  error: Record<string, unknown>;
}) {
  await db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, status, item_count, period_start
      FROM school_translation_requests
      WHERE user_id = ${input.userId}
        AND request_id = ${input.requestId}
      FOR UPDATE
    `);
    const row = rows[0] as RequestRow | undefined;
    if (!row || row.status !== 'reserved') return;
    await tx.execute(sql`
      UPDATE school_translation_requests
      SET status = 'released',
          error_json = ${JSON.stringify(input.error)}::jsonb,
          updated_at = now()
      WHERE id = ${row.id}
    `);
    await refundSchoolFeatureUsage(tx, {
      userId: input.userId,
      feature: 'ai_translation',
      periodStart: row.period_start,
      count: Number(row.item_count),
    });
  });
}

async function markUnknown(input: {
  userId: string;
  requestId: string;
  error: Record<string, unknown>;
}) {
  await db.execute(sql`
    UPDATE school_translation_requests
    SET status = 'unknown',
        error_json = ${JSON.stringify(input.error)}::jsonb,
        updated_at = now()
    WHERE user_id = ${input.userId}
      AND request_id = ${input.requestId}
      AND status = 'reserved'
  `);
}

async function completeRequest(input: {
  userId: string;
  requestId: string;
  result: CachedResponse;
  generationId?: string;
  usage?: Record<string, unknown>;
}) {
  await db.execute(sql`
    UPDATE school_translation_requests
    SET status = 'completed',
        result_json = ${JSON.stringify(input.result)}::jsonb,
        provider_generation_id = ${input.generationId ?? null},
        provider_usage = ${input.usage ? JSON.stringify(input.usage) : null}::jsonb,
        completed_at = now(),
        updated_at = now()
    WHERE user_id = ${input.userId}
      AND request_id = ${input.requestId}
      AND status = 'reserved'
  `);
}

function responseSchema(itemCount: number) {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'translations',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            minItems: itemCount,
            maxItems: itemCount,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['index', 'translated'],
              properties: {
                index: { type: 'integer', minimum: 1, maximum: itemCount },
                translated: { type: 'string', minLength: 1 },
              },
            },
          },
        },
      },
    },
  };
}

function parseStrictTranslations(content: string, items: SchoolTranslateItem[]) {
  let parsed: { items?: Array<{ index?: unknown; translated?: unknown }> };
  try {
    parsed = JSON.parse(content) as { items?: Array<{ index?: unknown; translated?: unknown }> };
  } catch {
    throw new OpenRouterChatError('Translation response was not valid JSON.', true);
  }
  if (!Array.isArray(parsed.items) || parsed.items.length !== items.length) {
    throw new OpenRouterChatError('Translation response item count did not match request.', true);
  }
  const seen = new Set<number>();
  const translations = new Map<number, string>();
  for (const row of parsed.items) {
    if (!row || typeof row !== 'object') {
      throw new OpenRouterChatError('Translation response row was invalid.', true);
    }
    if (typeof row.index !== 'number' || !Number.isInteger(row.index)) {
      throw new OpenRouterChatError('Translation response index was invalid.', true);
    }
    if (row.index < 1 || row.index > items.length || seen.has(row.index)) {
      throw new OpenRouterChatError('Translation response index was duplicated or out of range.', true);
    }
    if (typeof row.translated !== 'string' || !row.translated.trim()) {
      throw new OpenRouterChatError('Translation response had an empty translation.', true);
    }
    seen.add(row.index);
    translations.set(row.index, row.translated.trim());
  }
  if (seen.size !== items.length) {
    throw new OpenRouterChatError('Translation response omitted an item.', true);
  }
  return translations;
}

async function callSchoolOpenRouter(input: {
  apiKey: string;
  model: string;
  items: SchoolTranslateItem[];
  fromLang: string;
  toLang: string;
}) {
  const prompt = buildOpenRouterTranslationPrompt({
    texts: input.items.map((item) => item.text),
    fromLang: input.fromLang,
    toLang: input.toLang,
  });
  const { value, meta } = await callOpenRouterChatParsedWithMeta(
    {
      apiKey: input.apiKey,
      model: input.model,
      temperature: 0.1,
      responseFormat: responseSchema(input.items.length),
      provider: { require_parameters: true },
      maxAttempts: 2,
      messages: [
        { role: 'system', content: TRANSLATION_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    },
    (content) => parseStrictTranslations(content, input.items),
  );

  const results = input.items.map((item, index) => {
    const translated = value.get(index + 1);
    if (!translated) {
      throw new OpenRouterChatError('Translation response was missing an item.', true);
    }
    const validationWarnings = validateTranslation({
      source: item.text,
      target: translated,
      fromLang: input.fromLang,
      toLang: input.toLang,
    });
    return {
      id: item.id,
      translated_text: translated,
      status: 'ok' as const,
      ...(validationWarnings.length > 0
        ? {
            warning: validationWarnings[0].message,
            validation_warnings: validationWarnings,
          }
        : {}),
      source: 'api' as const,
    };
  });

  return { response: { results }, meta };
}

export async function translateWithSchoolOpenRouter(input: {
  userId: string;
  entitlement: SchoolEntitlement;
  requestId: unknown;
  items: SchoolTranslateItem[];
  fromLang: string;
  toLang: string;
}): Promise<CachedResponse> {
  if (input.items.length === 0) return { results: [] };
  const apiKey = process.env.OPENROUTER_SCHOOL_API_KEY;
  if (!apiKey) {
    throw new SchoolTranslationError(
      { error: 'School AI translation is not configured.', code: 'SCHOOL_AI_MODEL_UNAVAILABLE' },
      500,
    );
  }

  const requestId = validateRequestId(input.requestId);
  assertItemLengths(input.items, input.entitlement.limits.translationItemMaxChars);
  if (input.items.length > input.entitlement.limits.translationItemsMonthlyLimit) {
    throw new SchoolTranslationError(
      { error: 'Monthly school AI translation limit reached.', code: 'SCHOOL_AI_TRANSLATION_LIMIT_REACHED' },
      429,
    );
  }

  const model = getSchoolOpenRouterModel();
  const requestHash = buildRequestHash({
    provider: 'school_openrouter',
    fromLang: input.fromLang,
    toLang: input.toLang,
    items: input.items,
  });
  const reserved = await reserveRequest({
    entitlement: input.entitlement,
    userId: input.userId,
    requestId,
    requestHash,
    itemCount: input.items.length,
    characterCount: countChars(input.items),
    model,
  });
  if (reserved.action === 'cached') return cachedResult(reserved.row);
  if (reserved.action === 'failed_charged') {
    throw new SchoolTranslationError(
      reserved.row.error_json ?? {
        error: 'This school translation request failed after provider processing.',
      },
      502,
    );
  }

  try {
    const result = await callSchoolOpenRouter({
      apiKey,
      model,
      items: input.items,
      fromLang: input.fromLang,
      toLang: input.toLang,
    });
    await completeRequest({
      userId: input.userId,
      requestId,
      result: result.response,
      generationId: result.meta.id,
      usage: result.meta.usage,
    });
    return result.response;
  } catch (err) {
    const body = {
      error: err instanceof Error ? err.message : 'School AI translation failed.',
      code: err instanceof OpenRouterChatError ? 'SCHOOL_AI_PROVIDER_FAILED' : 'SCHOOL_AI_TRANSLATION_FAILED',
    };
    // Charge the reservation only when we cannot tell whether the provider ran.
    // Any observed response — an HTTP error, a truncated body, an unparseable
    // payload — means this batch produced nothing the student can use, so the
    // quota goes back. Only a transport failure is genuinely ambiguous, and
    // that one parks the request for `resolve-translation-request`.
    if (err instanceof OpenRouterChatError && err.kind === 'transport') {
      await markUnknown({ userId: input.userId, requestId, error: body });
      throw new SchoolTranslationError(
        { error: 'School AI translation provider status is unknown.', code: 'TRANSLATION_REQUEST_STATUS_UNKNOWN' },
        409,
      );
    }
    await releaseRequest({ userId: input.userId, requestId, error: body });
    throw new SchoolTranslationError(body, err instanceof OpenRouterChatError && err.isOutOfCredits ? 402 : 502);
  }
}
