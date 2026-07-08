import type { WordList } from "@/lib/db/schema";

/** A word_list row safe to return in any API response (no capability token). */
export type WordListDto = Omit<WordList, "shareToken">;

/**
 * Strip the `share_token` capability from a list row before returning it in an
 * API response. The token must only ever be exposed through the owner-only
 * `/api/lists/[id]/share` endpoints — every other list response (browser,
 * detail, sync hydration, sidebar) must pass through this so a subscriber can't
 * read the token and re-share the list. Generic so it also works on rows that
 * have been augmented with `isOwner`, `subscriberCount`, hydrated audio, etc.
 */
export function serializeWordList<T extends { shareToken?: unknown }>(
  list: T,
): Omit<T, "shareToken"> {
  const { shareToken: _shareToken, ...rest } = list;
  return rest;
}
