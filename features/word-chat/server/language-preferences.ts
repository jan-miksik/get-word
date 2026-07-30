import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  userLanguagePreferences,
  userListSubscriptions,
  wordLists,
  type WordList,
} from "@/lib/db/schema";
import {
  COMMON_LANGUAGES,
  GOOGLE_TRANSLATE_LANGUAGES,
  normalizeLanguageCode,
} from "@/lib/i18n/languages";
import { LEARNING_LANGUAGE_VARIANTS } from "@/lib/language-variants";
import { normalizeListLanguageCode } from "@/lib/db/queries/word-list-items/lists";
import type { WordChatLanguageLevel } from "../types";
import { readLanguageLevel } from "../preferences";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LANGUAGE_CODE_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/i;
const SUPPORTED_LANGUAGE_CODES = new Set(
  [...COMMON_LANGUAGES, ...GOOGLE_TRANSLATE_LANGUAGES, ...LEARNING_LANGUAGE_VARIANTS].map(
    (language) => normalizeLanguageCode(language.code),
  ),
);

export type WordChatLanguageContext = {
  languageFrom: string;
  languageTo: string;
  listId: string | null;
};

export function canonicalizeLearningLanguageCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!LANGUAGE_CODE_RE.test(trimmed)) return null;
  const normalized = normalizeListLanguageCode(trimmed);
  return SUPPORTED_LANGUAGE_CODES.has(normalized) ? normalized : null;
}

function readListId(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value.trim()) ? value.trim() : null;
}

async function getAccessibleWordChatList(input: {
  userId: string;
  listId: string;
}): Promise<WordList | null> {
  const [list] = await db
    .select()
    .from(wordLists)
    .where(
      and(
        eq(wordLists.id, input.listId),
        or(
          eq(wordLists.ownerId, input.userId),
          and(eq(wordLists.isPublic, true), eq(wordLists.isPersonal, false)),
          inArray(
            wordLists.id,
            db
              .select({ id: userListSubscriptions.listId })
              .from(userListSubscriptions)
              .where(eq(userListSubscriptions.userId, input.userId)),
          ),
        ),
      ),
    )
    .limit(1);
  return list ?? null;
}

export async function resolveWordChatLanguageContext(input: {
  userId: string;
  listId?: unknown;
  languageFrom?: unknown;
  languageTo?: unknown;
}): Promise<WordChatLanguageContext | null> {
  const listId = readListId(input.listId);
  if (listId) {
    const list = await getAccessibleWordChatList({ userId: input.userId, listId });
    if (!list) return null;
    return {
      languageFrom: normalizeListLanguageCode(list.languageFrom),
      languageTo: normalizeListLanguageCode(list.languageTo),
      listId: list.id,
    };
  }

  const languageFrom = canonicalizeLearningLanguageCode(input.languageFrom);
  const languageTo = canonicalizeLearningLanguageCode(input.languageTo);
  if (!languageFrom || !languageTo || languageFrom === languageTo) return null;
  return { languageFrom, languageTo, listId: null };
}

export async function getUserLanguageLevel(input: {
  userId: string;
  languageTo: string;
}): Promise<WordChatLanguageLevel | null> {
  const [row] = await db
    .select({ languageLevel: userLanguagePreferences.languageLevel })
    .from(userLanguagePreferences)
    .where(
      and(
        eq(userLanguagePreferences.userId, input.userId),
        eq(userLanguagePreferences.languageTo, input.languageTo),
      ),
    )
    .limit(1);
  return readLanguageLevel(row?.languageLevel);
}

export async function upsertUserLanguageLevel(input: {
  userId: string;
  languageTo: string;
  languageLevel: WordChatLanguageLevel;
}): Promise<WordChatLanguageLevel> {
  await db
    .insert(userLanguagePreferences)
    .values({
      userId: input.userId,
      languageTo: input.languageTo,
      languageLevel: input.languageLevel,
    })
    .onConflictDoUpdate({
      target: [userLanguagePreferences.userId, userLanguagePreferences.languageTo],
      set: {
        languageLevel: input.languageLevel,
        updatedAt: sql`now()`,
      },
    });
  return input.languageLevel;
}
