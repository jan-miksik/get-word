import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── mocks ────────────────────────────────────────────────────────────
const mockResolveUserFromRequest = vi.fn()
const mockGetListById = vi.fn()
const mockGetListItems = vi.fn()
const mockDeleteItems = vi.fn()
const mockArchiveProgressForItems = vi.fn()
const mockSoftDeleteHooksForItems = vi.fn()
const mockMergeHooksToSurvivor = vi.fn()

vi.mock('@/lib/db', () => ({
  getListById: (...args: unknown[]) => mockGetListById(...args),
  getListItems: (...args: unknown[]) => mockGetListItems(...args),
  deleteItems: (...args: unknown[]) => mockDeleteItems(...args),
  archiveProgressForItems: (...args: unknown[]) => mockArchiveProgressForItems(...args),
  softDeleteHooksForItems: (...args: unknown[]) => mockSoftDeleteHooksForItems(...args),
  mergeHooksToSurvivor: (...args: unknown[]) => mockMergeHooksToSurvivor(...args),
}))

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  isEditor: (user: { userRole?: string }) => user.userRole === 'editor',
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }),
  forbiddenResponse: (msg?: string) =>
    new Response(JSON.stringify({ error: msg ?? 'Forbidden' }), { status: 403 }),
}))

import { POST } from '../[id]/items/remove/route'

type RouteContext = { params: Promise<{ id: string }> }

const testUser = { id: 'user-1', userRole: 'user' }
const testList = { id: 'list-1', ownerId: 'user-1', isCommon: false }

function makeItem(over: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    listId: 'list-1',
    categoryId: 'cat-1',
    position: 0,
    textKnown: 'hello',
    textTarget: 'xin chào',
    ...over,
  }
}

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/lists/list-1/items/remove', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const ctx: RouteContext = { params: Promise.resolve({ id: 'list-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveUserFromRequest.mockResolvedValue(testUser)
  mockGetListById.mockResolvedValue(testList)
})

describe('POST /api/lists/[id]/items/remove', () => {
  it('soft-deletes hooks when the removed item has no surviving twin', async () => {
    mockGetListItems.mockResolvedValue([
      makeItem({ id: 'item-1', textKnown: 'hello', textTarget: 'xin chào' }),
      makeItem({ id: 'item-2', textKnown: 'bye', textTarget: 'tạm biệt' }),
    ])

    const res = await POST(makeReq({ itemIds: ['item-1'] }), ctx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockSoftDeleteHooksForItems).toHaveBeenCalledWith(['item-1'])
    expect(mockMergeHooksToSurvivor).not.toHaveBeenCalled()
    expect(mockArchiveProgressForItems).toHaveBeenCalledWith(['item-1'])
    expect(mockDeleteItems).toHaveBeenCalledWith(['item-1'])
    expect(body.merged).toEqual([])
    expect(body.removed).toEqual(['item-1'])
  })

  it('rewires hooks to the surviving twin when a duplicate is removed', async () => {
    mockGetListItems.mockResolvedValue([
      makeItem({ id: 'survivor', textKnown: 'Hello', textTarget: 'Xin chào' }),
      makeItem({ id: 'dup', textKnown: 'hello ', textTarget: 'xin chào' }),
    ])

    const res = await POST(makeReq({ itemIds: ['dup'] }), ctx)
    const body = await res.json()

    expect(res.status).toBe(200)
    // Normalized (case/whitespace-insensitive) match → merge, not soft-delete.
    expect(mockMergeHooksToSurvivor).toHaveBeenCalledWith('dup', 'survivor')
    expect(mockSoftDeleteHooksForItems).not.toHaveBeenCalled()
    expect(mockDeleteItems).toHaveBeenCalledWith(['dup'])
    expect(body.merged).toEqual([{ from: 'dup', into: 'survivor' }])
  })

  it('rejects a non-owner on a non-shared list', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ id: 'other', userRole: 'user' })

    const res = await POST(makeReq({ itemIds: ['item-1'] }), ctx)

    expect(res.status).toBe(403)
    expect(mockDeleteItems).not.toHaveBeenCalled()
  })

  it('validates the itemIds payload', async () => {
    const res = await POST(makeReq({ itemIds: 'item-1' }), ctx)
    expect(res.status).toBe(400)
    expect(mockDeleteItems).not.toHaveBeenCalled()
  })

  it('ignores ids that are not in the list', async () => {
    mockGetListItems.mockResolvedValue([makeItem({ id: 'item-1' })])

    const res = await POST(makeReq({ itemIds: ['ghost'] }), ctx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.removed).toEqual([])
    expect(mockDeleteItems).not.toHaveBeenCalled()
  })
})
