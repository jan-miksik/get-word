import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetListById = vi.fn()
const mockGetOrCreateListShareToken = vi.fn()
const mockResetListShareTokenAndDeleteSubscriptions = vi.fn()
const mockResolveUserFromRequest = vi.fn()
const mockIsEditor = vi.fn()

vi.mock('@/lib/db', () => ({
  getListById: (...args: unknown[]) => mockGetListById(...args),
  getOrCreateListShareToken: (...args: unknown[]) => mockGetOrCreateListShareToken(...args),
  resetListShareTokenAndDeleteSubscriptions: (...args: unknown[]) =>
    mockResetListShareTokenAndDeleteSubscriptions(...args),
}))

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  isEditor: (...args: unknown[]) => mockIsEditor(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }),
  forbiddenResponse: (msg: string) =>
    new Response(JSON.stringify({ error: msg || 'Forbidden' }), { status: 403 }),
}))

vi.mock('@/features/auth/app-url', () => ({
  getRequestPublicOrigin: () => 'https://getword.app',
}))

import { POST as SHARE } from '../[id]/share/route'
import { POST as RESET } from '../[id]/share/reset/route'

const owner = { id: 'teacher-1', userRole: 'user' }
const list = { id: 'list-1', ownerId: 'teacher-1', isPublic: false }

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}
function req(id: string) {
  return new NextRequest(`http://localhost:3000/api/lists/${id}/share`, { method: 'POST' })
}

describe('POST /api/lists/[id]/share', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsEditor.mockReturnValue(false)
  })

  it('401 without a user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null)
    const res = await SHARE(req('list-1'), params('list-1'))
    expect(res.status).toBe(401)
  })

  it('403 for a non-owner', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ id: 'someone-else' })
    mockGetListById.mockResolvedValue(list)
    const res = await SHARE(req('list-1'), params('list-1'))
    expect(res.status).toBe(403)
    expect(mockGetOrCreateListShareToken).not.toHaveBeenCalled()
  })

  it('returns the /join link for the owner', async () => {
    mockResolveUserFromRequest.mockResolvedValue(owner)
    mockGetListById.mockResolvedValue(list)
    mockGetOrCreateListShareToken.mockResolvedValue('tok123')
    const res = await SHARE(req('list-1'), params('list-1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.url).toBe('https://getword.app/join/tok123')
    expect(data.token).toBe('tok123')
  })

  it('allows an editor to share a common list', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ id: 'editor-1', userRole: 'editor' })
    mockIsEditor.mockReturnValue(true)
    mockGetListById.mockResolvedValue({ ...list, ownerId: 'teacher-2', isCommon: true, isPublic: true })
    mockGetOrCreateListShareToken.mockResolvedValue('tok-editor')
    const res = await SHARE(req('list-1'), params('list-1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.url).toBe('https://getword.app/join/tok-editor')
    expect(data.token).toBe('tok-editor')
  })
})

describe('POST /api/lists/[id]/share/reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsEditor.mockReturnValue(false)
  })

  it('403 for a non-owner', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ id: 'someone-else' })
    mockGetListById.mockResolvedValue(list)
    const res = await RESET(req('list-1'), params('list-1'))
    expect(res.status).toBe(403)
    expect(mockResetListShareTokenAndDeleteSubscriptions).not.toHaveBeenCalled()
  })

  it('rotates the token and reports revoked subscribers', async () => {
    mockResolveUserFromRequest.mockResolvedValue(owner)
    mockGetListById.mockResolvedValue(list)
    mockResetListShareTokenAndDeleteSubscriptions.mockResolvedValue({
      token: 'newtok',
      revokedSubscribers: 3,
    })
    const res = await RESET(req('list-1'), params('list-1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.url).toBe('https://getword.app/join/newtok')
    expect(data.revokedSubscribers).toBe(3)
  })
})
