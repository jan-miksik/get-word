import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  forbiddenResponse,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import { db } from "@/lib/db/client";
import { getListById } from "@/lib/db";
import { wordListItems } from "@/lib/db/schema";
import { graphemeLength } from "@/lib/answer-normalization";
import { normalizeOpenRouterModel } from "@/lib/openrouter-models";
import { callOpenRouterChatParsed, parseJsonLoose } from "@/lib/openrouter-chat";
import { getUserApiKey } from "@/lib/translation";
import {
  MAX_AI_ACCEPTED_ANSWER_SUGGESTIONS,
  normalizeAcceptedAnswersForAiSuggestions,
} from "@/lib/word-item-accepted-answers";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

function buildPrompt(input: {
  sourceText: string;
  primaryAnswer: string;
  sourceLanguage: string;
  answerLanguage: string;
  otherSideText: string;
  comment: string | null;
}) {
  return `
Suggest additional accepted answers for a language-learning card.

Source language: ${input.sourceLanguage}
Answer language: ${input.answerLanguage}
Source text: ${input.sourceText}
Primary answer: ${input.primaryAnswer}
Other side text: ${input.otherSideText}
Study note/context: ${input.comment ?? ""}

Rules:
- Precision is more important than coverage. Return no suggestions when there is no clearly interchangeable translation.
- Suggest only standard, natural translations that preserve the exact meaning and grammatical context of this card.
- Do not suggest typos, missing/added diacritics, nonstandard spellings, merely related words, or forms that change meaning, gender, number, tense, register, or sentence agreement.
- Every suggestion MUST have exactly the same number of characters as the primary answer "${input.primaryAnswer}" (${graphemeLength(input.primaryAnswer)} characters), with spaces and punctuation in the same positions. The app shows the answer's letter count, so different-length variants are rejected.
- Do not suggest case-only variants, punctuation-only variants, the primary answer, or explanations.
- Return at most ${MAX_AI_ACCEPTED_ANSWER_SUGGESTIONS} high-confidence suggestions.
- Return only JSON with this shape: { "suggestions": ["..."] }
`.trim();
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id: listId, itemId } = await context.params;
  const list = await getListById(listId);
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
  if (list.ownerId !== user.id) return forbiddenResponse("Not list owner");

  const body = await request.json().catch(() => ({}));
  const side = body.side === "known" ? "known" : body.side === "target" ? "target" : null;
  if (!side) {
    return NextResponse.json({ error: "side must be 'known' or 'target'" }, { status: 400 });
  }

  const [item] = await db
    .select()
    .from(wordListItems)
    .where(eq(wordListItems.id, itemId))
    .limit(1);
  if (!item || item.listId !== listId) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const apiKey = await getUserApiKey(user.id, "openrouter");
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenRouter requires a stored API key. Add your key in settings." },
      { status: 400 },
    );
  }

  const primaryAnswer = side === "known" ? item.textKnown : item.textTarget ?? "";
  if (!primaryAnswer.trim()) {
    return NextResponse.json({ suggestions: [] });
  }

  const sourceText = side === "known" ? item.textTarget ?? "" : item.textKnown;
  const existing = side === "known" ? item.acceptedKnown : item.acceptedTarget;
  const comment = item.comment && typeof item.comment === "object" && "text" in item.comment
    ? String((item.comment as { text?: unknown }).text ?? "")
    : null;
  const model = normalizeOpenRouterModel(body.translation_model);
  const suggestions = await callOpenRouterChatParsed(
    {
      apiKey,
      model,
      temperature: 0.1,
      maxTokens: 300,
      messages: [
        {
          role: "system",
          content:
            "You are a precise language-learning editor. Return only valid JSON.",
        },
        {
          role: "user",
          content: buildPrompt({
            sourceText,
            primaryAnswer,
            sourceLanguage: side === "known" ? list.languageTo : list.languageFrom,
            answerLanguage: side === "known" ? list.languageFrom : list.languageTo,
            otherSideText: sourceText,
            comment,
          }),
        },
      ],
    },
    (content) => {
      const parsed = parseJsonLoose(content);
      const rawSuggestions =
        parsed && typeof parsed === "object" && Array.isArray((parsed as { suggestions?: unknown }).suggestions)
          ? (parsed as { suggestions: unknown[] }).suggestions
          : [];
      return normalizeAcceptedAnswersForAiSuggestions(rawSuggestions, primaryAnswer, existing);
    },
  );

  return NextResponse.json({ suggestions });
}
