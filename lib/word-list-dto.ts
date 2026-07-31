/**
 * Strip server-only fields from a list row before returning it in an API
 * response. The share token must only ever be exposed through the owner-only
 * `/api/lists/[id]/share` endpoints — every other list response (browser,
 * detail, sync hydration, sidebar) must pass through this so a subscriber can't
 * read the token and re-share the list. Internal moderator notes are never
 * client-visible; public decision fields are preserved. Generic so this also
 * works on rows augmented with `isOwner`, `subscriberCount`, hydrated audio,
 * etc.
 */
export function serializeWordList<T extends { shareToken?: unknown; moderationNote?: unknown }>(
  list: T,
): Omit<T, "shareToken" | "moderationNote"> {
  const { shareToken, moderationNote, ...rest } = list;
  void shareToken;
  void moderationNote;
  return rest;
}
