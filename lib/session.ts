export type GetWordUserRole = "user" | "editor";

export type GetWordSession = {
  userId: string;
  userRole: GetWordUserRole;
  iat: number; // seconds since epoch
  exp: number; // seconds since epoch
};

export const GET_WORD_SESSION_COOKIE_NAME = "get_word_session";
export const GET_WORD_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSessionSecret(): string | null {
  const configured = process.env.APP_SESSION_SECRET;
  if (configured && configured.length > 0) return configured;
  // Local dev convenience; production should always set APP_SESSION_SECRET.
  if (process.env.NODE_ENV !== "production") return "dev-only-insecure-secret";
  return null;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  // Prefer Buffer in Node runtimes; fall back to btoa for edge runtimes.
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes)
      .toString("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  }

  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line no-undef
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecodeToBytes(s: string): Uint8Array {
  const padded = s.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((s.length + 3) % 4);

  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(padded, "base64"));
  }

  // eslint-disable-next-line no-undef
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(sig);
}

/**
 * Signs a session into a compact, cookie-safe token:
 *   base64url(payloadJson).base64url(hmac_sha256(secret, payloadB64))
 */
export async function signSession(input: {
  userId: string;
  userRole: GetWordUserRole;
  now?: number; // seconds since epoch
  ttlSeconds?: number;
}): Promise<string> {
  const secret = getSessionSecret();
  if (!secret) throw new Error("APP_SESSION_SECRET is not configured");

  const now = input.now ?? Math.floor(Date.now() / 1000);
  const ttlSeconds = input.ttlSeconds ?? GET_WORD_SESSION_TTL_SECONDS;

  const session: GetWordSession = {
    userId: input.userId,
    userRole: input.userRole,
    iat: now,
    exp: now + ttlSeconds,
  };

  const payloadJson = JSON.stringify(session);
  const payloadB64 = base64UrlEncodeBytes(new TextEncoder().encode(payloadJson));
  const sigBytes = await hmacSha256(secret, payloadB64);
  const sigB64 = base64UrlEncodeBytes(sigBytes);
  return `${payloadB64}.${sigB64}`;
}

export async function verifySession(token: string | null | undefined): Promise<GetWordSession | null> {
  const secret = getSessionSecret();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("APP_SESSION_SECRET is not configured; all sessions will be rejected");
    }
    return null;
  }
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  let expectedSig: Uint8Array;
  try {
    expectedSig = await hmacSha256(secret, payloadB64);
  } catch {
    return null;
  }

  let providedSig: Uint8Array;
  try {
    providedSig = base64UrlDecodeToBytes(sigB64);
  } catch {
    return null;
  }

  if (!constantTimeEqual(expectedSig, providedSig)) return null;

  let session: GetWordSession;
  try {
    const payloadJson = new TextDecoder().decode(base64UrlDecodeToBytes(payloadB64));
    session = JSON.parse(payloadJson) as GetWordSession;
  } catch {
    return null;
  }

  if (!session?.userId || !session?.userRole || !session?.iat || !session?.exp) return null;
  if (session.userRole !== "user" && session.userRole !== "editor") return null;

  const now = Math.floor(Date.now() / 1000);
  if (session.exp <= now) return null;

  return session;
}
