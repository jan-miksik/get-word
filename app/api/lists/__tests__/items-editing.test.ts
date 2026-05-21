import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── mocks ────────────────────────────────────────────────────────────
const mockResolveUserFromRequest = vi.fn()
const mockGetListById = vi.fn()
const mockGetCategoryItems = vi.fn()
const mockCreateItems = vi.fn()
const mockDeleteItems = vi.fn()
const mockUpdateItemPositions = vi.fn()
const mockArchiveProgressForItems = vi.fn()

vi.mock('@/lib/db', () => ({
  getListById: (...args: unknown[]) => mockGetListById(...args),
  getCategoryItems: (...args: unknown[]) => mockGetCategoryItems(...args),
  createItems: (...args: unknown[]) => mockCreateItems(...args),
  deleteItems: (...args: unknown[]) => mockDeleteItems(...args),
  updateItemPositions: (...args: unknown[]) => mockUpdateItemPositions(...args),
  archiveProgressForItems: (...args: unknown[]) => mockArchiveProgressForItems(...args),
}))

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  isEditor: (user: { userRole?: string }) => user.userRole === 'editor',
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
  forbiddenResponse: (msg?: string) =>
    new Response(JSON.stringify({ error: msg ?? 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }),
}))

import { PUT } from '../[id]/categories/[catId]/items/preview/route'
import { POST } from '../[id]/categories/[catId]/items/confirm/route'

// ── fixtures ─────────────────────────────────────────────────────────
const testUser = { id: 'user-1', deviceId: 'dev-1', role: 'vi', userRole: 'user' }

const testList = {
  id: 'list-1',
  ownerId: 'user-1',
  name: 'My List',
  description: 'Test',
  languageFrom: 'cz',
  languageTo: 'vi',
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

type RouteContext = { params: Promise<{ id: string; catId: string }> }

function makeCtx(id = 'list-1', catId = 'cat-1'): RouteContext {
  return { params: Promise.resolve({ id, catId }) }
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    listId: 'list-1',
    categoryId: 'cat-1',
    position: 0,
    textKnown: 'hello',
    textTarget: 'xin chào',
    translationStatus: 'manual',
    audioAssetId: null,
    audioStatus: 'none',
    notes: null,
    canonicalWordId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// ── Preview tests ────────────────────────────────────────────────────

describe('PUT /api/lists/[id]/categories/[catId]/items/preview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if no user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/preview', {
      method: 'PUT',
      body: JSON.stringify({ lines: ['hello'], input_language: 'known' }),
    })
    const res = await PUT(req, makeCtx())
    expect(res.status).toBe(401)
  })

  it('returns 404 if list not found', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/preview', {
      method: 'PUT',
      body: JSON.stringify({ lines: ['hello'], input_language: 'known' }),
    })
    const res = await PUT(req, makeCtx())
    expect(res.status).toBe(404)
  })

  it('returns 403 if user is not list owner', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue({ ...testList, ownerId: 'other-user' })
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/preview', {
      method: 'PUT',
      body: JSON.stringify({ lines: ['hello'], input_language: 'known' }),
    })
    const res = await PUT(req, makeCtx())
    expect(res.status).toBe(403)
  })

  it('returns 400 if lines is missing', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/preview', {
      method: 'PUT',
      body: JSON.stringify({ input_language: 'known' }),
    })
    const res = await PUT(req, makeCtx())
    expect(res.status).toBe(400)
  })

  it('returns 400 if input_language is invalid', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/preview', {
      method: 'PUT',
      body: JSON.stringify({ lines: ['hello'], input_language: 'french' }),
    })
    const res = await PUT(req, makeCtx())
    expect(res.status).toBe(400)
  })

  it('rejects duplicate lines with error listing duplicates', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockGetCategoryItems.mockResolvedValue([])
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/preview', {
      method: 'PUT',
      body: JSON.stringify({ lines: ['hello', 'world', 'hello'], input_language: 'known' }),
    })
    const res = await PUT(req, makeCtx())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/duplicate/i)
    expect(body.duplicates).toContainEqual({ text: 'hello', lines: [1, 3] })
  })

  it('strips empty lines silently', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockGetCategoryItems.mockResolvedValue([])
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/preview', {
      method: 'PUT',
      body: JSON.stringify({ lines: ['hello', '', '  ', 'world'], input_language: 'known' }),
    })
    const res = await PUT(req, makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.added).toHaveLength(2)
  })

  it('normalizes text: trims whitespace, collapses spaces, case-insensitive', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    const existing = makeItem({ textKnown: 'Hello World' })
    mockGetCategoryItems.mockResolvedValue([existing])
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/preview', {
      method: 'PUT',
      body: JSON.stringify({ lines: ['  hello   world  '], input_language: 'known' }),
    })
    const res = await PUT(req, makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.unchanged).toBe(1)
    expect(body.added).toHaveLength(0)
    expect(body.removed).toHaveLength(0)
  })

  it('detects added, removed, and unchanged items', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    const existing = [
      makeItem({ id: 'item-1', textKnown: 'hello', position: 0 }),
      makeItem({ id: 'item-2', textKnown: 'goodbye', position: 1 }),
    ]
    mockGetCategoryItems.mockResolvedValue(existing)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/preview', {
      method: 'PUT',
      body: JSON.stringify({ lines: ['hello', 'new word'], input_language: 'known' }),
    })
    const res = await PUT(req, makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.added).toEqual(['new word'])
    expect(body.removed).toEqual([{ id: 'item-2', text_known: 'goodbye', text_target: 'xin chào' }])
    expect(body.unchanged).toBe(1)
  })

  it('detects reordered items', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    const existing = [
      makeItem({ id: 'item-1', textKnown: 'alpha', position: 0 }),
      makeItem({ id: 'item-2', textKnown: 'beta', position: 1 }),
      makeItem({ id: 'item-3', textKnown: 'gamma', position: 2 }),
    ]
    mockGetCategoryItems.mockResolvedValue(existing)
    // Reverse order
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/preview', {
      method: 'PUT',
      body: JSON.stringify({ lines: ['gamma', 'beta', 'alpha'], input_language: 'known' }),
    })
    const res = await PUT(req, makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reordered).toEqual([
      { id: 'item-3', text: 'gamma', from_pos: 2, to_pos: 0 },
      { id: 'item-1', text: 'alpha', from_pos: 0, to_pos: 2 },
    ])
    // beta didn't move (was 1, stays 1)
    expect(body.unchanged).toBe(1)
  })

  it('matches by text_target when input_language is target', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    const existing = [makeItem({ id: 'item-1', textTarget: 'xin chào', position: 0 })]
    mockGetCategoryItems.mockResolvedValue(existing)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/preview', {
      method: 'PUT',
      body: JSON.stringify({ lines: ['xin chào'], input_language: 'target' }),
    })
    const res = await PUT(req, makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.unchanged).toBe(1)
    expect(body.added).toHaveLength(0)
  })

  it('warns if lines exceed 500', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockGetCategoryItems.mockResolvedValue([])
    const lines = Array.from({ length: 501 }, (_, i) => `word-${i}`)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/preview', {
      method: 'PUT',
      body: JSON.stringify({ lines, input_language: 'known' }),
    })
    const res = await PUT(req, makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.warning).toMatch(/500/i)
  })
})

// ── Confirm tests ────────────────────────────────────────────────────

describe('POST /api/lists/[id]/categories/[catId]/items/confirm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if no user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/confirm', {
      method: 'POST',
      body: JSON.stringify({ added: [], removed: [], reordered: [] }),
    })
    const res = await POST(req, makeCtx())
    expect(res.status).toBe(401)
  })

  it('returns 404 if list not found', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(null)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/confirm', {
      method: 'POST',
      body: JSON.stringify({ added: [], removed: [], reordered: [] }),
    })
    const res = await POST(req, makeCtx())
    expect(res.status).toBe(404)
  })

  it('returns 403 if not owner', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue({ ...testList, ownerId: 'other-user' })
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/confirm', {
      method: 'POST',
      body: JSON.stringify({ added: [], removed: [], reordered: [] }),
    })
    const res = await POST(req, makeCtx())
    expect(res.status).toBe(403)
  })

  it('completes immediately for removal-only changes', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockDeleteItems.mockResolvedValue(undefined)
    mockArchiveProgressForItems.mockResolvedValue(undefined)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/confirm', {
      method: 'POST',
      body: JSON.stringify({
        added: [],
        removed: [{ id: 'item-1' }],
        reordered: [],
      }),
    })
    const res = await POST(req, makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completed).toBe(true)
    expect(body.needs_translation).toBe(false)
    expect(mockDeleteItems).toHaveBeenCalledWith(['item-1'])
    expect(mockArchiveProgressForItems).toHaveBeenCalledWith(['item-1'])
  })

  it('completes immediately for reorder-only changes', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockUpdateItemPositions.mockResolvedValue(undefined)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/confirm', {
      method: 'POST',
      body: JSON.stringify({
        added: [],
        removed: [],
        reordered: [{ id: 'item-1', position: 2 }],
      }),
    })
    const res = await POST(req, makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completed).toBe(true)
    expect(body.needs_translation).toBe(false)
    expect(mockUpdateItemPositions).toHaveBeenCalledWith([{ id: 'item-1', position: 2 }])
  })

  it('returns needs_translation when new words are added with input_language=known', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockGetCategoryItems.mockResolvedValue([])
    const createdItems = [
      makeItem({ id: 'new-1', textKnown: 'new word', textTarget: null }),
    ]
    mockCreateItems.mockResolvedValue(createdItems)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/confirm', {
      method: 'POST',
      body: JSON.stringify({
        added: ['new word'],
        removed: [],
        reordered: [],
        input_language: 'known',
      }),
    })
    const res = await POST(req, makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completed).toBe(false)
    expect(body.needs_translation).toBe(true)
    expect(body.pending_items).toHaveLength(1)
    expect(body.pending_items[0].text_known).toBe('new word')
  })

  it('preserves inserted line positions when creating new words', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockCreateItems.mockResolvedValue([
      makeItem({ id: 'new-1', textKnown: 'inserted top', position: 0 }),
      makeItem({ id: 'new-2', textKnown: 'inserted middle', position: 2 }),
    ])
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/confirm', {
      method: 'POST',
      body: JSON.stringify({
        added: ['inserted top', 'inserted middle'],
        added_positions: [
          { text: 'inserted top', position: 0 },
          { text: 'inserted middle', position: 2 },
        ],
        removed: [],
        reordered: [{ id: 'existing-1', position: 1 }],
        input_language: 'known',
      }),
    })
    const res = await POST(req, makeCtx())
    expect(res.status).toBe(200)
    expect(mockCreateItems).toHaveBeenCalledWith([
      expect.objectContaining({ textKnown: 'inserted top', position: 0 }),
      expect.objectContaining({ textKnown: 'inserted middle', position: 2 }),
    ])
  })

  it('allows editors to modify common seed list items', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ ...testUser, userRole: 'editor' })
    mockGetListById.mockResolvedValue({ ...testList, ownerId: null, isCommon: true, isPublic: true })
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/confirm', {
      method: 'POST',
      body: JSON.stringify({ added: [], removed: [], reordered: [] }),
    })
    const res = await POST(req, makeCtx())
    expect(res.status).toBe(200)
  })

  it('returns needs_translation when new words are added with input_language=target', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockGetCategoryItems.mockResolvedValue([])
    const createdItems = [
      makeItem({ id: 'new-1', textKnown: '', textTarget: 'xin chào' }),
    ]
    mockCreateItems.mockResolvedValue(createdItems)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/confirm', {
      method: 'POST',
      body: JSON.stringify({
        added: ['xin chào'],
        removed: [],
        reordered: [],
        input_language: 'target',
      }),
    })
    const res = await POST(req, makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completed).toBe(false)
    expect(body.needs_translation).toBe(true)
  })

  it('handles mixed changes: add + remove + reorder', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockGetCategoryItems.mockResolvedValue([makeItem({ id: 'item-2', position: 1 })])
    mockDeleteItems.mockResolvedValue(undefined)
    mockArchiveProgressForItems.mockResolvedValue(undefined)
    mockUpdateItemPositions.mockResolvedValue(undefined)
    const createdItems = [makeItem({ id: 'new-1', textKnown: 'fresh', textTarget: null })]
    mockCreateItems.mockResolvedValue(createdItems)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/confirm', {
      method: 'POST',
      body: JSON.stringify({
        added: ['fresh'],
        removed: [{ id: 'item-1' }],
        reordered: [{ id: 'item-2', position: 0 }],
        input_language: 'known',
      }),
    })
    const res = await POST(req, makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completed).toBe(false)
    expect(body.needs_translation).toBe(true)
    expect(mockDeleteItems).toHaveBeenCalled()
    expect(mockArchiveProgressForItems).toHaveBeenCalled()
    expect(mockUpdateItemPositions).toHaveBeenCalled()
    expect(mockCreateItems).toHaveBeenCalled()
  })

  it('returns 400 if body is missing required fields', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    const req = new NextRequest('http://localhost/api/lists/list-1/categories/cat-1/items/confirm', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req, makeCtx())
    expect(res.status).toBe(400)
  })
})
