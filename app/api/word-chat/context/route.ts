import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  canPublishPublicList,
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import {
  getPersonalList,
  loadLearnerBrief,
} from "@/features/word-chat/server/personal-list";
import { getMonthlyItemUsage } from "@/features/word-chat/server/rate-limit";
import {
  SELECTABLE_MODELS,
  canSeeWordChatDiagnostics,
  WORD_CHAT_CHAT_MODEL,
  WORD_CHAT_PROPOSAL_MODEL,
  WORD_CHAT_TRANSLATION_MODEL,
} from "@/features/word-chat/server/config";
import { isLearnerBriefEmpty } from "@/lib/learner-brief";
import {
  readAddressRegister,
  readLanguageLevel,
  readSalutationGender,
} from "@/features/word-chat/preferences";
import {
  getUserLanguageLevel,
  resolveWordChatLanguageContext,
  upsertUserLanguageLevel,
} from "@/features/word-chat/server/language-preferences";
import { wordChatErrorResponse } from "../errors";

export const runtime = "nodejs";

/**
 * GET /api/word-chat/context — what the chat should already know before the
 * learner types anything.
 *
 * Opening "Add words" from inside the app is not onboarding: someone on their
 * fourth session should not be greeted with the same "tell me about a real
 * situation" as a first-time visitor. This returns the structured brief (topic
 * labels only, never a transcript) so the opener can pick up where the last
 * session left off, plus the monthly allowance so the screen can say up front
 * when there is nothing left to spend.
 *
 * No model call — deterministic and cheap enough to run on every open.
 */
export async function GET(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const isEditor = user.userRole === "editor";
  const canDebug = canSeeWordChatDiagnostics(isEditor ? "editor" : "user");

  try {
    const context = await resolveWordChatLanguageContext({
      userId: user.id,
      listId:
        request.nextUrl.searchParams.get("active_list_id") ??
        request.nextUrl.searchParams.get("base_list_id"),
      languageFrom: request.nextUrl.searchParams.get("from"),
      languageTo: request.nextUrl.searchParams.get("to"),
    });
    if (!context) {
      return NextResponse.json(
        { error: "valid language context is required" },
        { status: 400 },
      );
    }

    const [brief, personalList, usage, languageLevel] = await Promise.all([
      loadLearnerBrief({
        userId: user.id,
        languageFrom: context.languageFrom,
        languageTo: context.languageTo,
      }),
      getPersonalList({
        userId: user.id,
        languageFrom: context.languageFrom,
        languageTo: context.languageTo,
      }),
      getMonthlyItemUsage({ userId: user.id, role: isEditor ? "editor" : "user" }),
      getUserLanguageLevel({ userId: user.id, languageTo: context.languageTo }),
    ]);

    const hasHistory = !isLearnerBriefEmpty(brief);
    const addressRegister = readAddressRegister(user.wordChatAddressRegister);
    const salutationGender = readSalutationGender(user.wordChatSalutationGender);

    return NextResponse.json({
      has_history: hasHistory,
      goals: brief?.goals ?? [],
      situations: brief?.situations ?? [],
      covered_topics: brief?.coveredTopics ?? [],
      missing_topics: brief?.missingTopics ?? [],
      personal_list_name: personalList?.name ?? null,
      personal_list_id: personalList?.id ?? null,
      personal_list_is_public: personalList?.isPublic ?? null,
      address_register: addressRegister,
      salutation_gender: salutationGender,
      language_level: languageLevel,
      preferences_complete: {
        global: Boolean(addressRegister && salutationGender),
        language: languageLevel !== null,
      },
      monthly_used: usage.used,
      monthly_limit: usage.limit,
      // Whether the visibility question is worth asking at all. Separate from
      // `is_editor` below, which is loosened in development for the debug panel
      // and must never decide what can be published.
      can_publish_public_lists: canPublishPublicList(user),
      // Everything below drives the debug panel.
      is_editor: canDebug,
      models: canDebug
        ? {
            defaults: {
              chat: WORD_CHAT_CHAT_MODEL,
              proposal: WORD_CHAT_PROPOSAL_MODEL,
              translation: WORD_CHAT_TRANSLATION_MODEL,
            },
            selectable: SELECTABLE_MODELS.map((model) => ({
              id: model.id,
              input_price_per_million: model.inputPricePerMillion,
              output_price_per_million: model.outputPricePerMillion,
            })),
          }
        : null,
    });
  } catch (err) {
    return wordChatErrorResponse(err, { includeDetail: canDebug });
  }
}

/** Persist the chat's form of address as soon as it changes. */
export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = (await request.json().catch(() => null)) as {
    address_register?: unknown;
    salutation_gender?: unknown;
    language_level?: unknown;
    active_list_id?: unknown;
    base_list_id?: unknown;
    language_from?: unknown;
    language_to?: unknown;
  } | null;
  const hasAddressRegister = body && "address_register" in body;
  const hasSalutationGender = body && "salutation_gender" in body;
  const hasLanguageLevel = body && "language_level" in body;
  const hasLanguageContext =
    Boolean(body?.active_list_id) ||
    Boolean(body?.base_list_id) ||
    Boolean(body?.language_from) ||
    Boolean(body?.language_to);
  const addressRegister = readAddressRegister(body?.address_register);
  const salutationGender = readSalutationGender(body?.salutation_gender);
  const languageLevel = readLanguageLevel(body?.language_level);

  if (hasAddressRegister && !addressRegister) {
    return NextResponse.json(
      { error: "address_register must be casual or formal" },
      { status: 400 },
    );
  }
  if (hasSalutationGender && !salutationGender) {
    return NextResponse.json(
      { error: "salutation_gender must be female, male, or neutral" },
      { status: 400 },
    );
  }
  if (hasLanguageLevel && !languageLevel) {
    return NextResponse.json(
      { error: "language_level must be A0, A1, A2, B1, or B2" },
      { status: 400 },
    );
  }
  if (!hasAddressRegister && !hasSalutationGender && !hasLanguageLevel) {
    return NextResponse.json(
      { error: "at least one preference is required" },
      { status: 400 },
    );
  }

  try {
    const context = hasLanguageLevel || hasLanguageContext
      ? await resolveWordChatLanguageContext({
          userId: user.id,
          listId: body?.active_list_id ?? body?.base_list_id,
          languageFrom: body?.language_from,
          languageTo: body?.language_to,
        })
      : null;
    if (hasLanguageLevel && !context) {
      return NextResponse.json(
        { error: "valid language context is required for language_level" },
        { status: 400 },
      );
    }

    const patch: {
      wordChatAddressRegister?: typeof addressRegister;
      wordChatSalutationGender?: typeof salutationGender;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (hasAddressRegister) patch.wordChatAddressRegister = addressRegister;
    if (hasSalutationGender) patch.wordChatSalutationGender = salutationGender;

    if (hasAddressRegister || hasSalutationGender) {
      await db
        .update(users)
        .set(patch)
        .where(eq(users.id, user.id));
    }

    const savedLanguageLevel =
      hasLanguageLevel && context && languageLevel
        ? await upsertUserLanguageLevel({
            userId: user.id,
            languageTo: context.languageTo,
            languageLevel,
          })
        : context
          ? await getUserLanguageLevel({ userId: user.id, languageTo: context.languageTo })
          : null;
    const nextAddressRegister = hasAddressRegister
      ? addressRegister
      : readAddressRegister(user.wordChatAddressRegister);
    const nextSalutationGender = hasSalutationGender
      ? salutationGender
      : readSalutationGender(user.wordChatSalutationGender);
    return NextResponse.json({
      address_register: nextAddressRegister,
      salutation_gender: nextSalutationGender,
      language_level: savedLanguageLevel,
      preferences_complete: {
        global: Boolean(nextAddressRegister && nextSalutationGender),
        language: savedLanguageLevel !== null,
      },
    });
  } catch (err) {
    return wordChatErrorResponse(err, {
      includeDetail: user.userRole === "editor",
    });
  }
}
