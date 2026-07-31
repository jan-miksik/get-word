import crypto from 'crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAppleClientSecret,
  getAppleSignInConfig,
  revokeAppleRefreshToken,
} from '../apple-token'

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
})
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

const CONFIG = {
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  privateKey: privateKeyPem,
  clientId: 'app.getword',
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
}

describe('Apple client secret', () => {
  it('signs an ES256 JWT that Apple can verify', () => {
    const token = createAppleClientSecret(CONFIG, Date.UTC(2026, 0, 1))
    const [headerSegment, payloadSegment, signatureSegment] = token.split('.')

    expect(decodeSegment(headerSegment)).toMatchObject({ alg: 'ES256', kid: CONFIG.keyId })
    expect(decodeSegment(payloadSegment)).toMatchObject({
      iss: CONFIG.teamId,
      sub: CONFIG.clientId,
      aud: 'https://appleid.apple.com',
    })

    const verified = crypto.verify(
      'sha256',
      Buffer.from(`${headerSegment}.${payloadSegment}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signatureSegment, 'base64url'),
    )
    expect(verified).toBe(true)
  })

  it('expires within the six months Apple allows', () => {
    const now = Date.UTC(2026, 0, 1)
    const payload = decodeSegment(createAppleClientSecret(CONFIG, now).split('.')[1]) as {
      iat: number
      exp: number
    }

    expect(payload.exp).toBeGreaterThan(payload.iat)
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(60 * 60 * 24 * 180)
  })
})

describe('Apple sign-in configuration', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('is absent until the signing key is deployed', () => {
    delete process.env.APPLE_TEAM_ID
    delete process.env.APPLE_SIGN_IN_KEY_ID
    delete process.env.APPLE_SIGN_IN_PRIVATE_KEY

    expect(getAppleSignInConfig()).toBeNull()
  })

  it('defaults the client id to the bundle id and unescapes the key', () => {
    process.env.APPLE_TEAM_ID = CONFIG.teamId
    process.env.APPLE_SIGN_IN_KEY_ID = CONFIG.keyId
    process.env.APPLE_SIGN_IN_PRIVATE_KEY = privateKeyPem.replaceAll('\n', '\\n')
    delete process.env.APPLE_CLIENT_ID

    const config = getAppleSignInConfig()
    expect(config?.clientId).toBe('app.getword')
    expect(config?.privateKey).toBe(privateKeyPem)
  })
})

describe('revoking a refresh token', () => {
  beforeEach(() => {
    process.env.APPLE_TEAM_ID = CONFIG.teamId
    process.env.APPLE_SIGN_IN_KEY_ID = CONFIG.keyId
    process.env.APPLE_SIGN_IN_PRIVATE_KEY = privateKeyPem
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the token to Apple with a signed client secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await revokeAppleRefreshToken('refresh-token-1')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://appleid.apple.com/auth/revoke')
    const body = new URLSearchParams(String(init.body))
    expect(body.get('token')).toBe('refresh-token-1')
    expect(body.get('token_type_hint')).toBe('refresh_token')
    expect(body.get('client_id')).toBe('app.getword')
    expect(body.get('client_secret')).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
  })

  it('treats an already-invalid token as revoked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
      ),
    )

    await expect(revokeAppleRefreshToken('stale-token')).resolves.toBeUndefined()
  })

  it('throws on any other failure so the caller can log it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('server error', { status: 500 })),
    )

    await expect(revokeAppleRefreshToken('token')).rejects.toThrow(/revocation failed/i)
  })
})
