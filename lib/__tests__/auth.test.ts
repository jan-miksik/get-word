import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetOrCreateUserByDeviceId = vi.fn()
const mockGetUserById = vi.fn()
const mockVerifySession = vi.fn()

vi.mock('@/lib/db', () => ({
  getOrCreateUserByDeviceId: (...args: unknown[]) => mockGetOrCreateUserByDeviceId(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
}))

vi.mock('@/lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/session')>()
  return {
    ...actual,
    verifySession: (...args: unknown[]) => mockVerifySession(...args),
  }
})

import { resolveAuthenticatedUser, resolveUserFromRequest } from '@/lib/auth'

const user = {
  id: 'user-1',
  deviceId: 'device-1',
  userRole: 'user',
}

describe('request authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserById.mockResolvedValue(user)
    mockGetOrCreateUserByDeviceId.mockResolvedValue(user)
  })

  it('accepts a signed app session from a bearer token', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'user-1', userRole: 'user' })
    const request = new NextRequest('https://getword.app/api/auth/me', {
      headers: { Authorization: 'Bearer mobile-session' },
    })

    await expect(resolveAuthenticatedUser(request)).resolves.toEqual(user)
    expect(mockVerifySession).toHaveBeenCalledWith('mobile-session')
    expect(mockGetUserById).toHaveBeenCalledWith('user-1')
  })

  it('continues to accept the web session cookie', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'user-1', userRole: 'user' })
    const request = new NextRequest('https://getword.app/api/auth/me', {
      headers: { Cookie: 'get_word_session=web-session' },
    })

    await expect(resolveAuthenticatedUser(request)).resolves.toEqual(user)
    expect(mockVerifySession).toHaveBeenCalledWith('web-session')
  })

  it('does not downgrade an invalid bearer token to a device identity', async () => {
    mockVerifySession.mockResolvedValue(null)
    const request = new NextRequest('https://getword.app/api/sync', {
      headers: {
        Authorization: 'Bearer invalid-session',
        'x-device-id': 'device-1',
      },
    })

    await expect(resolveUserFromRequest(request)).resolves.toBeNull()
    expect(mockGetOrCreateUserByDeviceId).not.toHaveBeenCalled()
  })
})
