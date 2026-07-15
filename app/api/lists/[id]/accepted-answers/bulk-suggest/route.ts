import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import {
  forbiddenResponse,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import { db } from "@/lib/db/client";
import { getListById } from "@/lib/db";
import { wordListItems } from "@/lib/db/schema";
import { graphemeLength } from "@/lib/answer-normalization";
import {
  normalizeOpenRouterModel,
  OPENROUTER_TRANSLATION_MODELS,
} from "@/lib/openrouter-models";
import {
  callOpenRouterChatParsed,
  OpenRouterChatError,
  parseJsonLoose,
} from "@/lib/openrouter-chat";
import { getUserApiKey } from "@/lib/translation";
import {
  BULK_ACCEPTED_ANSWERS_CHUNK_SIZE,
  MAX_ACCEPTED_ANSWER_LENGTH,
  MAX_ACCEPTED_ANSWERS,
  MAX_AI_ACCEPTED_ANSWER_SUGGESTIONS,
  normalizeAcceptedAnswersForAiSuggestions,
} from "@/lib/word-item-accepted-answers";

type RouteContext = { params: Promise<{ id: string }> };

type PromptItem = {
  index: number;
  known: string;
  target: string;
  comment: string | null;
};

const REASONING_DISABLED_MODELS = new Set([
  "openai/gpt-5.6-luna",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4-nano",
  "qwen/qwen3.7-max",
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v4-flash",
  "minimax/minimax-m3",
]);

const STRUCTURED_OUTPUT_MODELS = new Set(
  OPENROUTER_TRANSLATION_MODELS.map((model) => model.id as string),
);

function sparseSuggestionReasoning(model: string): Record<string, unknown> | undefined {
  if (model === "google/gemini-3.5-flash") return { effort: "minimal" };
  if (REASONING_DISABLED_MODELS.has(model)) return { enabled: false };
  // Claude's optional adaptive thinking is off when omitted. Omitting the
  // parameter also preserves arbitrary custom-model support: unknown models
  // may reject an explicit disable flag.
  return undefined;
}

function acceptedAnswersResponseFormat(itemCount: number) {
  const answerArray = {
    type: "array",
    items: {
      type: "string",
      description: `A non-empty accepted answer of at most ${MAX_ACCEPTED_ANSWER_LENGTH} characters.`,
    },
    description: `At most ${MAX_AI_ACCEPTED_ANSWER_SUGGESTIONS} high-confidence suggestions.`,
  };
  return {
    type: "json_schema",
    json_schema: {
      name: "accepted_answer_suggestions",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          items: {
            type: "array",
            description: `At most one result for each of the ${itemCount} input items.`,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                index: {
                  type: "integer",
                  description: `Input index from 0 to ${Math.max(0, itemCount - 1)}.`,
                },
                known: answerArray,
                target: answerArray,
              },
              required: ["index", "known", "target"],
            },
          },
        },
        required: ["items"],
      },
    },
  };
}

function buildPrompt(input: {
  languageFrom: string;
  languageTo: string;
  items: PromptItem[];
}) {
  const itemLines = input.items
    .map((item) =>
      JSON.stringify({
        index: item.index,
        known: item.known,
        knownCharacters: graphemeLength(item.known),
        target: item.target,
        targetCharacters: graphemeLength(item.target),
        note: item.comment ?? "",
      }),
    )
    .join("\n");
  return `
Suggest additional accepted answers for these language-learning cards.

"known" texts are in ${input.languageFrom}; "target" texts are in ${input.languageTo}.

Items:
${itemLines}

Rules:
- Precision is more important than coverage. Most items SHOULD have no suggestions. Never invent a variant just to produce an answer.
- Suggest an extra translation only when it is a standard, natural expression that is genuinely interchangeable with the primary translation in the exact card context.
- Do not suggest typos, missing/added diacritics, nonstandard spellings, merely related words, or grammatical forms that change meaning, gender, number, tense, register, or sentence agreement.
- Every suggestion MUST have exactly the same number of characters as that side's primary text (see knownCharacters / targetCharacters), with spaces and punctuation in the same positions. The app shows the answer's letter count, so different-length variants are rejected.
- Do not suggest case-only variants, punctuation-only variants, the primary text itself, or explanations.
- Return at most ${MAX_AI_ACCEPTED_ANSWER_SUGGESTIONS} high-confidence suggestions per side. For an included item return both arrays, using [] for a side without suggestions. Omit the whole item whenever neither side has a confident suggestion.
- Echo each item's "index" unchanged.
- Return only JSON with this shape: { "items": [ { "index": 0, "known": ["..."], "target": ["..."] } ] }
`.trim();
}

function toStringArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id: listId } = await context.params;
  const list = await getListById(listId);
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  if (list.ownerId !== user.id) return forbiddenResponse("Not list owner");

  const body = await request.json().catch(() => ({}));
  const rawItemIds = Array.isArray(body.item_ids) ? body.item_ids : null;
  if (!rawItemIds || rawItemIds.length === 0) {
    return NextResponse.json({ error: "item_ids array is required" }, { status: 400 });
  }
  // Dedupe while keeping order so a sloppy client can't inflate the batch.
  const itemIds: string[] = [];
  const seenItemIds = new Set<string>();
  for (const rawItemId of rawItemIds as unknown[]) {
    if (typeof rawItemId !== "string" || !rawItemId || seenItemIds.has(rawItemId)) continue;
    seenItemIds.add(rawItemId);
    itemIds.push(rawItemId);
  }
  if (itemIds.length === 0) {
    return NextResponse.json({ error: "item_ids array is required" }, { status: 400 });
  }
  if (itemIds.length > BULK_ACCEPTED_ANSWERS_CHUNK_SIZE) {
    return NextResponse.json(
      { error: `item_ids is limited to ${BULK_ACCEPTED_ANSWERS_CHUNK_SIZE} items per request` },
      { status: 400 },
    );
  }

  const apiKey = await getUserApiKey(user.id, "openrouter");
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenRouter requires a stored API key. Add your key in settings." },
      { status: 400 },
    );
  }

  const rows = await db
    .select()
    .from(wordListItems)
    .where(inArray(wordListItems.id, itemIds));
  const rowById = new Map(rows.map((row) => [row.id, row]));

  // Suggestions are mapped exclusively onto these server-loaded items; ids
  // outside the list or without both texts are reported, not silently dropped.
  const skippedItemIds: string[] = [];
  const promptItems: { itemId: string; item: PromptItem }[] = [];
  for (const itemId of itemIds) {
    const row = rowById.get(itemId);
    if (!row || row.listId !== listId || !row.textKnown.trim() || !row.textTarget?.trim()) {
      skippedItemIds.push(itemId);
      continue;
    }
    const comment =
      row.comment && typeof row.comment === "object" && "text" in row.comment
        ? String((row.comment as { text?: unknown }).text ?? "")
        : null;
    promptItems.push({
      itemId,
      item: {
        index: promptItems.length,
        known: row.textKnown,
        target: row.textTarget,
        comment,
      },
    });
  }

  if (promptItems.length === 0) {
    return NextResponse.json({ suggestions: [], skipped_item_ids: skippedItemIds });
  }

  const model = normalizeOpenRouterModel(body.translation_model);
  let parsedItems: Map<number, { known: unknown[]; target: unknown[] }>;
  try {
    parsedItems = await callOpenRouterChatParsed(
      {
        apiKey,
        model,
        maxTokens: 4_000,
        reasoning: sparseSuggestionReasoning(model),
        responseFormat: STRUCTURED_OUTPUT_MODELS.has(model)
          ? acceptedAnswersResponseFormat(promptItems.length)
          : undefined,
        timeoutMs: 300_000,
        messages: [
          {
            role: "system",
            content: "You are a precise language-learning editor. Return only valid JSON.",
          },
          {
            role: "user",
            content: buildPrompt({
              languageFrom: list.languageFrom,
              languageTo: list.languageTo,
              items: promptItems.map((entry) => entry.item),
            }),
          },
        ],
      },
      (content) => {
      const parsed = parseJsonLoose(content);
      if (
        !parsed
        || typeof parsed !== "object"
        || !Array.isArray((parsed as { items?: unknown }).items)
      ) {
        throw new OpenRouterChatError(
          "OpenRouter returned an invalid accepted-answer response.",
          true,
        );
      }
      const items = (parsed as { items: unknown[] }).items;
      // Strict index handling: integers within the batch only, first
      // occurrence wins, anything else is ignored.
      const byIndex = new Map<number, { known: unknown[]; target: unknown[] }>();
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const rawIndex = (item as { index?: unknown }).index;
        if (
          typeof rawIndex !== "number" ||
          !Number.isInteger(rawIndex) ||
          rawIndex < 0 ||
          rawIndex >= promptItems.length ||
          byIndex.has(rawIndex)
        ) {
          continue;
        }
        byIndex.set(rawIndex, {
          known: toStringArray((item as { known?: unknown }).known),
          target: toStringArray((item as { target?: unknown }).target),
        });
      }
      return byIndex;
      },
    );
  } catch (error) {
    console.error("Bulk accepted-answer suggestion failed", error);
    const message = error instanceof OpenRouterChatError
      ? error.message
      : "OpenRouter failed to generate accepted-answer suggestions.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const suggestions: { item_id: string; known: string[]; target: string[] }[] = [];
  for (const entry of promptItems) {
    const row = rowById.get(entry.itemId)!;
    const parsed = parsedItems.get(entry.item.index);
    if (!parsed) {
      // The prompt explicitly allows the model to omit an item when it has no
      // high-confidence alternative. That is a successful "no suggestion",
      // not a processing failure.
      continue;
    }
    const knownRoom = Math.max(0, MAX_ACCEPTED_ANSWERS - (row.acceptedKnown?.length ?? 0));
    const targetRoom = Math.max(0, MAX_ACCEPTED_ANSWERS - (row.acceptedTarget?.length ?? 0));
    const known = normalizeAcceptedAnswersForAiSuggestions(
      parsed.known,
      row.textKnown,
      row.acceptedKnown,
    ).slice(0, knownRoom);
    const target = normalizeAcceptedAnswersForAiSuggestions(
      parsed.target,
      row.textTarget,
      row.acceptedTarget,
    ).slice(0, targetRoom);
    if (known.length === 0 && target.length === 0) continue;
    suggestions.push({ item_id: entry.itemId, known, target });
  }

  return NextResponse.json({ suggestions, skipped_item_ids: skippedItemIds });
}
