/**
 * Content-keyed progress identity.
 *
 * Progress belongs to the *word pair being learned*, not a specific list item.
 * The content key is a versioned SHA-256 hash over the normalized
 * `[langFrom, langTo, known, target]` tuple, so the same pair studied in any
 * list shares progress, and editing the text changes the key (resetting
 * progress) unless the edit is purely cosmetic.
 *
 * The helper is isomorphic (server + client) and uses Web Crypto so Node 18+
 * and browsers produce identical digests. See docs/content-keyed-progress.md.
 */

export const CONTENT_KEY_VERSION = "v1";

const CONTENT_KEY_REGEX = /^v1:[a-f0-9]{64}$/;

export interface ContentKeyParts {
  languageFrom: string;
  languageTo: string;
  textKnown: string | null | undefined;
  textTarget: string | null | undefined;
  /** Per-item override decided by the list owner/editor. Default false (case-sensitive). */
  ignoreCase?: boolean;
}

/** Languages are always case-folded so `EN→CS` and `en→cs` key the same. */
export function normalizeLang(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * NFC → trim → collapse internal whitespace → strip trailing ASCII dots →
 * re-trim (so `"hello ."` → `"hello"`, not `"hello "`) → optional case-fold.
 */
export function normalizeText(
  value: string,
  options: { ignoreCase: boolean },
): string {
  const normalized = value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();
  return options.ignoreCase ? normalized.toLowerCase() : normalized;
}

/**
 * Canonical pre-hash input, shared by server + client so keys always agree.
 * Returns `null` when the pair cannot form a key (empty known or target →
 * the item carries no content progress).
 */
export function buildContentKeyInput(parts: ContentKeyParts): string | null {
  const ignoreCase = parts.ignoreCase ?? false;
  const known = normalizeText(parts.textKnown ?? "", { ignoreCase });
  const target = normalizeText(parts.textTarget ?? "", { ignoreCase });
  if (known === "" || target === "") return null;
  return JSON.stringify([
    normalizeLang(parts.languageFrom),
    normalizeLang(parts.languageTo),
    known,
    target,
  ]);
}

export function isValidContentKey(value: unknown): value is string {
  return typeof value === "string" && CONTENT_KEY_REGEX.test(value);
}

function bytesToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/** SHA-256 hex over the UTF-8 bytes of `input`, via isomorphic Web Crypto. */
async function sha256HexUtf8(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return bytesToHex(digest);
}

/**
 * Returns `"v1:<sha256hex>"`, or `null` when the pair can't form a key
 * (empty known/target). Callers MUST skip the content-key upsert on `null`.
 */
export async function computeContentKey(
  parts: ContentKeyParts,
): Promise<string | null> {
  const input = buildContentKeyInput(parts);
  if (input === null) return null;
  return `${CONTENT_KEY_VERSION}:${await sha256HexUtf8(input)}`;
}
