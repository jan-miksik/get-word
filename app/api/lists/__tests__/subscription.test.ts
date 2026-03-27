import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetListById = vi.fn()
const mockIsUserSubscribed = vi.fn()
const mockCreateUserSubscription = vi.fn()
const mockUnsubscribeFromList = vi.fn()
const mockResolveUserFromRequest = vi.fn()

vi.mock('@/lib/db', () => ({
  getListById: (...args: unknown[]) => mockGetListById(...args),
  isUserSubscribed: (...args: unknown[]) => mockIsUserSubscribed(...args),
  createUserSubscription: (...args: unknown[]) => mockCreateUserSubscription(...args),
  unsubscribeFromList: (...args: unknown[]) => mockUnsubscribeFromList(...args),
}))

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'content-type': 'application/json' } }),
  forbiddenResponse: (msg: string) => new Response(JSON.stringify({ error: msg || 'Forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } }),
}))

import { GET, POST, DELETE } from '../[id]/subscribe/route'

const testUser = {
  id: 'user-1',
  deviceId: 'dev-1',
  role: 'vi',
  userRole: 'user',
}

const publicList = {
  id: 'list-pub',
  ownerId: 'other-user',
  name: 'Public Vietnamese',
  description: 'System list',
  languageFrom: 'cs',
  languageTo: 'vi',
  isPublic: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}


function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/lists/[id]/subscribe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if no user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/lists/list-pub/subscribe')
    const res = await GET(req, makeParams('list-pub'))
    expect(res.status).toBe(401)
  })

  it('returns subscribed: false when not subscribed', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockIsUserSubscribed.mockResolvedValue(false)
    const req = new NextRequest('http://localhost:3000/api/lists/list-pub/subscribe')
    const res = await GET(req, makeParams('list-pub'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.subscribed).toBe(false)
  })

  it('returns subscribed: true when subscribed', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockIsUserSubscribed.mockResolvedValue(true)
    const req = new NextRequest('http://localhost:3000/api/lists/list-pub/subscribe')
    const res = await GET(req, makeParams('list-pub'))
    const data = await res.json()
    expect(data.subscribed).toBe(true)
  })
})

describe('POST /api/lists/[id]/subscribe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if no user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/lists/list-pub/subscribe', { method: 'POST' })
    const res = await POST(req, makeParams('list-pub'))
    expect(res.status).toBe(401)
  })

  it('returns 404 if list not found', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/lists/missing/subscribe', { method: 'POST' })
    const res = await POST(req, makeParams('missing'))
    expect(res.status).toBe(404)
  })

  it('returns 403 if list is private and not owned', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue({ ...publicList, isPublic: false, ownerId: 'other-user' })
    const req = new NextRequest('http://localhost:3000/api/lists/list-pub/subscribe', { method: 'POST' })
    const res = await POST(req, makeParams('list-pub'))
    expect(res.status).toBe(403)
  })

  it('returns 400 if subscribing to own list', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue({ ...publicList, ownerId: 'user-1', isPublic: true })
    const req = new NextRequest('http://localhost:3000/api/lists/list-pub/subscribe', { method: 'POST' })
    const res = await POST(req, makeParams('list-pub'))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('own list')
  })

  it('returns 409 if already subscribed', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(publicList)
    mockIsUserSubscribed.mockResolvedValue(true)
    const req = new NextRequest('http://localhost:3000/api/lists/list-pub/subscribe', { method: 'POST' })
    const res = await POST(req, makeParams('list-pub'))
    expect(res.status).toBe(409)
  })

  it('subscribes successfully without copy-on-write', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(publicList)
    mockIsUserSubscribed.mockResolvedValue(false)
    mockCreateUserSubscription.mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost:3000/api/lists/list-pub/subscribe', { method: 'POST' })
    const res = await POST(req, makeParams('list-pub'))
    expect(res.status).toBe(201)

    const data = await res.json()
    expect(data.subscribed).toBe(true)
    expect(data.copied).toBeUndefined()

    expect(mockCreateUserSubscription).toHaveBeenCalledWith('user-1', 'list-pub')
  })

  it('does not create a personal list on subscribe', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(publicList)
    mockIsUserSubscribed.mockResolvedValue(false)
    mockCreateUserSubscription.mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost:3000/api/lists/list-pub/subscribe', { method: 'POST' })
    await POST(req, makeParams('list-pub'))

    // createUserSubscription called, no copy-on-write functions
    expect(mockCreateUserSubscription).toHaveBeenCalledOnce()
  })
})

describe('DELETE /api/lists/[id]/subscribe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if no user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/lists/list-pub/subscribe', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('list-pub'))
    expect(res.status).toBe(401)
  })

  it('returns 404 if not subscribed', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockIsUserSubscribed.mockResolvedValue(false)
    const req = new NextRequest('http://localhost:3000/api/lists/list-pub/subscribe', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('list-pub'))
    expect(res.status).toBe(404)
  })

  it('unsubscribes and archives any copied items', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockIsUserSubscribed.mockResolvedValue(true)
    mockUnsubscribeFromList.mockResolvedValue({ archived: 12 })

    const req = new NextRequest('http://localhost:3000/api/lists/list-pub/subscribe', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('list-pub'))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.subscribed).toBe(false)
    expect(data.archived).toBe(12)

    expect(mockUnsubscribeFromList).toHaveBeenCalledWith('user-1', 'list-pub')
  })
})
