import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRequestAuthOrigin, getRequestPublicOrigin } from '@/features/auth/app-url'

function requestInput(
  origin: string,
  headers: Record<string, string> = {}
): Parameters<typeof getRequestPublicOrigin>[0] {
  return {
    headers: new Headers(headers),
    nextUrl: {
      origin,
      protocol: new URL(origin).protocol,
    },
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getRequestPublicOrigin', () => {
  it('uses a configured production app URL when present', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GET_WORD_APP_URL', 'https://get-word.example')

    expect(
      getRequestPublicOrigin(
        requestInput('http://localhost:3000', {
          'x-forwarded-host': 'preview.example',
          'x-forwarded-proto': 'https',
        })
      )
    ).toBe('https://get-word.example')
  })

  it('uses forwarded public origin when production sees internal localhost', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(
      getRequestPublicOrigin(
        requestInput('http://localhost:3000', {
          'x-forwarded-host': 'get-word.example',
          'x-forwarded-proto': 'https',
        })
      )
    ).toBe('https://get-word.example')
  })

  it('ignores an accidental localhost app URL in production when forwarded host is public', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GET_WORD_APP_URL', 'http://localhost:3000')

    expect(
      getRequestPublicOrigin(
        requestInput('http://localhost:3000', {
          'x-forwarded-host': 'get-word.example',
          'x-forwarded-proto': 'https',
        })
      )
    ).toBe('https://get-word.example')
  })

  it('keeps localhost configuration for local development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('GET_WORD_APP_URL', 'http://localhost:3000')

    expect(getRequestPublicOrigin(requestInput('http://127.0.0.1:3000'))).toBe(
      'http://localhost:3000'
    )
  })
})

describe('getRequestAuthOrigin', () => {
  it('keeps public auth redirects on the request host even when a canonical app URL is configured', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GET_WORD_APP_URL', 'https://www.get-word.example')

    expect(getRequestAuthOrigin(requestInput('https://get-word.example'))).toBe(
      'https://get-word.example'
    )
  })

  it('falls back to configured origin for local development auth redirects', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('GET_WORD_APP_URL', 'http://localhost:3000')

    expect(getRequestAuthOrigin(requestInput('http://127.0.0.1:3000'))).toBe(
      'http://localhost:3000'
    )
  })
})
