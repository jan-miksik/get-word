import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { Executor } from "@/lib/db/queries/executor";
import { wordLists, type WordList } from "@/lib/db/schema";
import type { LearnerBrief } from "@/lib/learner-brief";

/**
 * The learner's single personal word-chat list for one direction, or null.
 *
 * `word_lists_personal_pair_unique` guarantees at most one row, which is what
 * lets the visibility choice be asked once (it belongs to the list) and makes
 * find-or-create safe with two tabs open.
 */
export async function getPersonalList(
  input: { userId: string; languageFrom: string; languageTo: string },
  executor: Executor = db,
): Promise<WordList | null> {
  const [row] = await executor
    .select()
    .from(wordLists)
    .where(
      and(
        eq(wordLists.ownerId, input.userId),
        eq(wordLists.isPersonal, true),
        eq(wordLists.languageFrom, input.languageFrom),
        eq(wordLists.languageTo, input.languageTo),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Structured memory from previous sessions, fed into the next chat's context. */
export async function loadLearnerBrief(input: {
  userId: string;
  languageFrom: string;
  languageTo: string;
}): Promise<LearnerBrief | null> {
  const list = await getPersonalList(input);
  return list?.learnerBrief ?? null;
}

/**
 * True when the visibility question still needs asking. It is asked once, on the
 * first session, and never again — a learner adding their fifth category should
 * not be re-prompted about something that already has an answer.
 */
export async function needsVisibilityChoice(input: {
  userId: string;
  languageFrom: string;
  languageTo: string;
}): Promise<boolean> {
  return (await getPersonalList(input)) === null;
}
