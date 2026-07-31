import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockCookieGetUser = vi.fn()
const mockBearerGetUser = vi.fn()
const mockResolveAndAttachSupabaseUser = vi.fn()
const mockSignSession = vi.fn()
const mockWithSessionCookie = vi.fn()

vi.mock('@/features/auth/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: (...args: unknown[]) => mockCookieGetUser(...args),
    },
  }),
}))

vi.mock('@/features/auth/supabase/token-verifier', () => ({
  createSupabaseTokenVerifier: () => ({
    auth: {
      getUser: (...args: unknown[]) => mockBearerGetUser(...args),
    },
  }),
}))

vi.mock('@/features/auth/server/resolve-supabase-user', () => ({
  resolveAndAttachSupabaseUser: (...args: unknown[]) =>
    mockResolveAndAttachSupabaseUser(...args),
}))

vi.mock('@/features/shared/routes/session', () => ({
  withSessionCookie: (...args: unknown[]) => mockWithSessionCookie(...args),
}))

vi.mock('@/lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/session')>()
  return {
    ...actual,
    signSession: (...args: unknown[]) => mockSignSession(...args),
  }
})

import { POST } from '@/app/api/auth/sync-user/route'

function request(body: Record<string, unknown>, accessToken?: string) {
  return new NextRequest('https://getword.app/api/auth/sync-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/sync-user', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const verifiedUser = {
      data: {
        user: {
          id: 'supabase-1',
          email: 'learner@example.com',
          app_metadata: { provider: 'apple' },
        },
      },
      error: null,
    }
    mockCookieGetUser.mockResolvedValue(verifiedUser)
    mockBearerGetUser.mockResolvedValue(verifiedUser)
    mockResolveAndAttachSupabaseUser.mockResolvedValue({
      id: 'app-user-1',
      email: 'learner@example.com',
      authProvider: 'apple',
      userRole: 'user',
    })
    mockSignSession.mockResolvedValue('signed-mobile-session')
    mockWithSessionCookie.mockImplementation(async (payload: Record<string, unknown>) =>
      Response.json(payload),
    )
  })

  it('verifies the native Supabase token and returns an app bearer session', async () => {
    const response = await POST(
      request({ client: 'ios', deviceId: 'ios-device-1' }, 'supabase-access-token'),
    )

    expect(mockBearerGetUser).toHaveBeenCalledWith('supabase-access-token')
    expect(mockCookieGetUser).not.toHaveBeenCalled()
    expect(mockResolveAndAttachSupabaseUser).toHaveBeenCalledWith({
      supabaseAuthId: 'supabase-1',
      email: 'learner@example.com',
      authProvider: 'apple',
      deviceId: 'ios-device-1',
    })
    expect(mockSignSession).toHaveBeenCalledWith({
      userId: 'app-user-1',
      userRole: 'user',
    })
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      userId: 'app-user-1',
      sessionToken: 'signed-mobile-session',
    })
  })

  it('does not expose a bearer session to the web client', async () => {
    const response = await POST(request({ client: 'web', deviceId: 'web-device-1' }))

    expect(mockCookieGetUser).toHaveBeenCalledWith()
    expect(mockBearerGetUser).not.toHaveBeenCalled()
    expect(mockSignSession).not.toHaveBeenCalled()
    const payload = await response.json()
    expect(payload.sessionToken).toBeUndefined()
  })

  it('rejects an iOS request when the Authorization header is missing', async () => {
    const response = await POST(request({ client: 'ios', deviceId: 'ios-device-1' }))

    expect(response.status).toBe(401)
    expect(mockCookieGetUser).not.toHaveBeenCalled()
    expect(mockBearerGetUser).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Missing Supabase bearer token',
    })
  })

  it('rejects a bearer token that the API Supabase project cannot verify', async () => {
    mockBearerGetUser.mockResolvedValue({
      data: { user: null },
      error: {
        code: 'bad_jwt',
        status: 401,
        message: 'Invalid JWT',
      },
    })

    const response = await POST(
      request({ client: 'ios', deviceId: 'ios-device-1' }, 'invalid-access-token'),
    )

    expect(response.status).toBe(401)
    expect(mockBearerGetUser).toHaveBeenCalledWith('invalid-access-token')
    expect(mockResolveAndAttachSupabaseUser).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Supabase bearer token was rejected by the API',
    })
  })
})
