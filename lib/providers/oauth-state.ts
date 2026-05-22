import crypto from "crypto";

export const OPENROUTER_OAUTH_COOKIE_NAME = "get_word_openrouter_oauth";
const OAUTH_TTL_SECONDS = 10 * 60;

export type OpenRouterOAuthState = {
  v: 1;
  userId: string;
  state: string;
  codeVerifier: string;
  returnTo: string;
  iat: number;
  exp: number;
};

function getSigningSecret(): string {
  const configured = process.env.APP_SESSION_SECRET;
  if (configured && configured.length > 0) return configured;
  if (process.env.NODE_ENV !== "production") return "dev-only-insecure-secret";
  throw new Error("APP_SESSION_SECRET is required in production");
}

function base64Url(input: Buffer): string {
  return input.toString("base64url");
}

function hmac(input: string): string {
  return base64Url(
    crypto
      .createHmac("sha256", getSigningSecret())
      .update(input)
      .digest(),
  );
}

export function randomBase64Url(bytes = 32): string {
  return base64Url(crypto.randomBytes(bytes));
}

export function createPkceChallenge(codeVerifier: string): string {
  return base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
}

export function createOAuthState(input: {
  userId: string;
  returnTo?: string;
}): OpenRouterOAuthState {
  const now = Math.floor(Date.now() / 1000);
  return {
    v: 1,
    userId: input.userId,
    state: randomBase64Url(24),
    codeVerifier: randomBase64Url(48),
    returnTo: input.returnTo && input.returnTo.startsWith("/") ? input.returnTo : "/lists",
    iat: now,
    exp: now + OAUTH_TTL_SECONDS,
  };
}

export function serializeOAuthState(state: OpenRouterOAuthState): string {
  const payload = base64Url(Buffer.from(JSON.stringify(state), "utf8"));
  const signature = hmac(payload);
  return `${payload}.${signature}`;
}

export function parseOAuthState(raw: string | undefined): OpenRouterOAuthState | null {
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  if (hmac(payload) !== signature) return null;

  let parsed: OpenRouterOAuthState;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OpenRouterOAuthState;
  } catch {
    return null;
  }

  if (
    parsed.v !== 1 ||
    !parsed.userId ||
    !parsed.state ||
    !parsed.codeVerifier ||
    !parsed.returnTo
  ) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (parsed.exp <= now) return null;

  return parsed;
}
