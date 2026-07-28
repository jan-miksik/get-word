/**
 * Size limits shared by the browser and the server.
 *
 * These live outside `server/config.ts` on purpose: the input hints in Review
 * and the server-side clamps have to be the same number, and a client component
 * must not pull the server's env-reading config module into its bundle.
 */

/** Longest vocabulary field accepted, in characters. */
export const MAX_WORD_CHAT_ITEM_CHARS = 200;

/** Client-generated ids are opaque, but never need to be unbounded database keys. */
export const MAX_WORD_CHAT_ID_CHARS = 128;
