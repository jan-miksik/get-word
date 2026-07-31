import crypto from 'crypto'

/**
 * Sign in with Apple token exchange and revocation.
 *
 * Apple requires an app that offers Sign in with Apple to revoke the user's
 * tokens when they delete their account (App Store Review Guideline 5.1.1(v)).
 * Deleting the Supabase Auth user does not do this: the native client signs in
 * with `signInWithIdToken`, so Supabase never performs the authorization-code
 * exchange and never holds an Apple refresh token.
 *
 * So the app does the exchange itself. At sign-in the native client sends the
 * one-time `authorizationCode` from the Apple credential; this module trades it
 * for a refresh token, which is stored encrypted against the user and posted to
 * Apple's revoke endpoint when the account is deleted.
 *
 * Every function degrades to a no-op when the Apple signing key is not
 * configured, so a deployment without it keeps working — it just cannot revoke.
 */
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token'
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke'
const APPLE_AUDIENCE = 'https://appleid.apple.com'

/** Apple's ceiling for a client secret is six months; stay well inside it. */
const CLIENT_SECRET_TTL_SECONDS = 60 * 60 * 24 * 30

const REQUEST_TIMEOUT_MS = 10_000

type AppleSignInConfig = {
  teamId: string
  keyId: string
  privateKey: string
  clientId: string
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/**
 * `.p8` files are PEM, but environment variables tend to arrive with the line
 * breaks escaped. Accept both rather than making deployment a guessing game.
 */
function normalizePrivateKey(raw: string): string {
  return raw.includes('\\n') ? raw.replaceAll('\\n', '\n') : raw
}

export function getAppleSignInConfig(): AppleSignInConfig | null {
  const teamId = process.env.APPLE_TEAM_ID
  const keyId = process.env.APPLE_SIGN_IN_KEY_ID
  const privateKey = process.env.APPLE_SIGN_IN_PRIVATE_KEY
  // The native app is its own Apple client, identified by the bundle id.
  const clientId = process.env.APPLE_CLIENT_ID || 'app.getword'

  if (!teamId || !keyId || !privateKey) return null
  return { teamId, keyId, privateKey: normalizePrivateKey(privateKey), clientId }
}

/**
 * Apple's "client secret" is an ES256 JWT signed with the private key from the
 * developer portal. Node can produce the JOSE-flavoured signature directly with
 * `dsaEncoding: 'ieee-p1363'`, so this needs no JWT dependency.
 */
export function createAppleClientSecret(config: AppleSignInConfig, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000)
  const header = { alg: 'ES256', kid: config.keyId, typ: 'JWT' }
  const payload = {
    iss: config.teamId,
    iat: issuedAt,
    exp: issuedAt + CLIENT_SECRET_TTL_SECONDS,
    aud: APPLE_AUDIENCE,
    sub: config.clientId,
  }

  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: config.privateKey,
    dsaEncoding: 'ieee-p1363',
  })

  return `${signingInput}.${signature.toString('base64url')}`
}

async function postToApple(
  url: string,
  body: Record<string, string>,
): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return { ok: response.ok, status: response.status, text: await response.text() }
}

/**
 * Trade the one-time authorization code from a native Sign in with Apple for a
 * long-lived refresh token. Returns null when Apple is not configured or the
 * exchange fails — a failed exchange must never block the sign-in itself.
 */
export async function exchangeAppleAuthorizationCode(
  authorizationCode: string,
): Promise<string | null> {
  const config = getAppleSignInConfig()
  if (!config || !authorizationCode) return null

  try {
    const { ok, status, text } = await postToApple(APPLE_TOKEN_URL, {
      client_id: config.clientId,
      client_secret: createAppleClientSecret(config),
      grant_type: 'authorization_code',
      code: authorizationCode,
    })

    if (!ok) {
      console.error('[apple-token] Authorization code exchange failed', { status, text })
      return null
    }

    const parsed = JSON.parse(text) as { refresh_token?: string }
    return parsed.refresh_token ?? null
  } catch (error) {
    console.error('[apple-token] Authorization code exchange threw', error)
    return null
  }
}

/**
 * Revoke a stored Apple refresh token. Throws on failure so the deletion saga
 * can decide whether to retry; a token Apple has already invalidated is treated
 * as success, because the end state is the one we wanted.
 */
export async function revokeAppleRefreshToken(refreshToken: string): Promise<void> {
  const config = getAppleSignInConfig()
  if (!config) {
    console.warn('[apple-token] Cannot revoke: Apple sign-in key is not configured')
    return
  }

  const { ok, status, text } = await postToApple(APPLE_REVOKE_URL, {
    client_id: config.clientId,
    client_secret: createAppleClientSecret(config),
    token: refreshToken,
    token_type_hint: 'refresh_token',
  })

  // Apple answers 200 with an empty body on success. `invalid_grant` means the
  // token is already dead, which is the outcome we are asking for.
  if (ok || text.includes('invalid_grant')) return

  throw new Error(`Apple token revocation failed: ${status} ${text}`)
}
