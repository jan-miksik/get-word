import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetListByShareToken = vi.fn()
const mockIsUserSubscribed = vi.fn()
const mockCreateUserSubscription = vi.fn()
const mockUpdateUserPreferences = vi.fn()
const mockResolveUserFromRequest = vi.fn()

vi.mock('@/lib/db', () => ({
  getListByShareToken: (...args: unknown[]) => mockGetListByShareToken(...args),
  isUserSubscribed: (...args: unknown[]) => mockIsUserSubscribed(...args),
  createUserSubscription: (...args: unknown[]) => mockCreateUserSubscription(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
}))

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }),
}))

import { GET, POST } from '../share/[token]/route'

const VALID_TOKEN = 'abcdefghijklmnopqrstuvwxyz012345' // 32 url-safe chars

const student = { id: 'student-1', deviceId: 'dev-1', userRole: 'user' }

const privateList = {
  id: 'list-priv',
  ownerId: 'teacher-1',
  name: 'B2 Vocabulary',
  languageFrom: 'cs',
  languageTo: 'en',
  isPublic: false,
  shareToken: VALID_TOKEN,
}

function params(token: string) {
  return { params: Promise.resolve({ token }) }
}

function req(token: string, method = 'GET') {
  return new NextRequest(`http://localhost:3000/api/lists/share/${token}`, { method })
}

function jsonReq(token: string, body: unknown) {
  return new NextRequest(`http://localhost:3000/api/lists/share/${token}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GET /api/lists/share/[token]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('404s on malformed token WITHOUT resolving a user (no device user created)', async () => {
    const res = await GET(req('short'), params('short'))
    expect(res.status).toBe(404)
    expect(mockGetListByShareToken).not.toHaveBeenCalled()
    expect(mockResolveUserFromRequest).not.toHaveBeenCalled()
  })

  it('404s on unknown token WITHOUT resolving a user', async () => {
    mockGetListByShareToken.mockResolvedValue(null)
    const res = await GET(req(VALID_TOKEN), params(VALID_TOKEN))
    expect(res.status).toBe(404)
    expect(mockResolveUserFromRequest).not.toHaveBeenCalled()
  })

  it('returns a preview for a private list and never leaks the token', async () => {
    mockGetListByShareToken.mockResolvedValue(privateList)
    mockResolveUserFromRequest.mockResolvedValue(student)
    mockIsUserSubscribed.mockResolvedValue(false)

    const res = await GET(req(VALID_TOKEN), params(VALID_TOKEN))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({
      listId: 'list-priv',
      name: 'B2 Vocabulary',
      isPublic: false,
      isOwner: false,
      alreadySubscribed: false,
    })
    expect(data.shareToken).toBeUndefined()
  })

  it('marks isOwner when the owner opens their own link', async () => {
    mockGetListByShareToken.mockResolvedValue(privateList)
    mockResolveUserFromRequest.mockResolvedValue({ ...student, id: 'teacher-1' })
    const res = await GET(req(VALID_TOKEN), params(VALID_TOKEN))
    const data = await res.json()
    expect(data.isOwner).toBe(true)
    expect(mockIsUserSubscribed).not.toHaveBeenCalled()
  })
})

describe('POST /api/lists/share/[token]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('404s on unknown token', async () => {
    mockGetListByShareToken.mockResolvedValue(null)
    const res = await POST(req(VALID_TOKEN, 'POST'), params(VALID_TOKEN))
    expect(res.status).toBe(404)
  })

  it('401s when no user resolves', async () => {
    mockGetListByShareToken.mockResolvedValue(privateList)
    mockResolveUserFromRequest.mockResolvedValue(null)
    const res = await POST(req(VALID_TOKEN, 'POST'), params(VALID_TOKEN))
    expect(res.status).toBe(401)
  })

  it('subscribes a non-owner to a private list via the token', async () => {
    mockGetListByShareToken.mockResolvedValue(privateList)
    mockResolveUserFromRequest.mockResolvedValue(student)
    mockIsUserSubscribed.mockResolvedValue(false)

    const res = await POST(req(VALID_TOKEN, 'POST'), params(VALID_TOKEN))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({ listId: 'list-priv', alreadySubscribed: false })
    expect(mockCreateUserSubscription).toHaveBeenCalledWith('student-1', 'list-priv')
    expect(mockUpdateUserPreferences).not.toHaveBeenCalled()
  })

  it('activates the shared list direction when requested', async () => {
    mockGetListByShareToken.mockResolvedValue(privateList)
    mockResolveUserFromRequest.mockResolvedValue(student)
    mockIsUserSubscribed.mockResolvedValue(false)

    const res = await POST(jsonReq(VALID_TOKEN, { activate: true }), params(VALID_TOKEN))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({
      listId: 'list-priv',
      languageFrom: 'cs',
      languageTo: 'en',
    })
    expect(mockUpdateUserPreferences).toHaveBeenCalledWith('student-1', {
      language_from: 'cs',
      language_to: 'en',
      onboarding_completed: true,
    })
  })

  it('is idempotent when already subscribed', async () => {
    mockGetListByShareToken.mockResolvedValue(privateList)
    mockResolveUserFromRequest.mockResolvedValue(student)
    mockIsUserSubscribed.mockResolvedValue(true)

    const res = await POST(req(VALID_TOKEN, 'POST'), params(VALID_TOKEN))
    const data = await res.json()
    expect(data.alreadySubscribed).toBe(true)
    expect(mockCreateUserSubscription).not.toHaveBeenCalled()
  })

  it('is a no-op for the owner', async () => {
    mockGetListByShareToken.mockResolvedValue(privateList)
    mockResolveUserFromRequest.mockResolvedValue({ ...student, id: 'teacher-1' })

    const res = await POST(req(VALID_TOKEN, 'POST'), params(VALID_TOKEN))
    const data = await res.json()
    expect(data.isOwner).toBe(true)
    expect(mockCreateUserSubscription).not.toHaveBeenCalled()
  })
})
