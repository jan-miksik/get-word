import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserLists = vi.fn()
const mockGetUserSubscribedListIds = vi.fn()
const mockCreateList = vi.fn()
const mockGetListById = vi.fn()
const mockUpdateList = vi.fn()
const mockDeleteList = vi.fn()
const mockGetListCategories = vi.fn()
const mockGetListItems = vi.fn()
const mockGetMediaAssetsByIds = vi.fn()
const mockCreateCategory = vi.fn()
const mockReorderCategories = vi.fn()
const mockDeleteCategory = vi.fn()
const mockResolveUserFromRequest = vi.fn()

vi.mock('@/lib/db', () => ({
  getUserLists: (...args: unknown[]) => mockGetUserLists(...args),
  getUserSubscribedListIds: (...args: unknown[]) => mockGetUserSubscribedListIds(...args),
  createList: (...args: unknown[]) => mockCreateList(...args),
  getListById: (...args: unknown[]) => mockGetListById(...args),
  updateList: (...args: unknown[]) => mockUpdateList(...args),
  deleteList: (...args: unknown[]) => mockDeleteList(...args),
  getListCategories: (...args: unknown[]) => mockGetListCategories(...args),
  getListItems: (...args: unknown[]) => mockGetListItems(...args),
  getMediaAssetsByIds: (...args: unknown[]) => mockGetMediaAssetsByIds(...args),
  createCategory: (...args: unknown[]) => mockCreateCategory(...args),
  reorderCategories: (...args: unknown[]) => mockReorderCategories(...args),
  deleteCategory: (...args: unknown[]) => mockDeleteCategory(...args),
}))

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'content-type': 'application/json' } }),
  forbiddenResponse: () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } }),
}))

import { GET, POST } from '../route'
import { GET as GET_DETAIL, PUT, DELETE } from '../[id]/route'
import { GET as GET_CATS, POST as POST_CAT, PUT as PUT_CATS } from '../[id]/categories/route'
import { DELETE as DELETE_CAT } from '../[id]/categories/[catId]/route'

const testUser = {
  id: 'user-1',
  deviceId: 'dev-1',
  role: 'vi',
  userRole: 'user',
}

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

const publicList = {
  ...testList,
  id: 'list-2',
  ownerId: null,
  name: 'Public List',
  isPublic: true,
}

describe('GET /api/lists', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if no user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/lists')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns lists for authenticated user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetUserLists.mockResolvedValue([testList, publicList])
    mockGetUserSubscribedListIds.mockResolvedValue(['list-2'])
    const req = new NextRequest('http://localhost:3000/api/lists')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.lists).toHaveLength(2)
    expect(data.lists[0].name).toBe('My List')
    expect(data.subscribedListIds).toEqual(['list-2'])
  })
})

describe('POST /api/lists', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if no user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/lists', {
      method: 'POST',
      body: JSON.stringify({ name: 'New', language_from: 'cz', language_to: 'vi' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('creates a new list', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const created = { ...testList, id: 'list-new', name: 'New List' }
    mockCreateList.mockResolvedValue(created)
    const req = new NextRequest('http://localhost:3000/api/lists', {
      method: 'POST',
      body: JSON.stringify({ name: 'New List', language_from: 'cz', language_to: 'vi' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.list.name).toBe('New List')
    expect(mockCreateList).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'user-1',
      name: 'New List',
      languageFrom: 'cz',
      languageTo: 'vi',
      isPublic: false,
    }))
  })

  it('returns 400 if name missing', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const req = new NextRequest('http://localhost:3000/api/lists', {
      method: 'POST',
      body: JSON.stringify({ language_from: 'cz', language_to: 'vi' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('GET /api/lists/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if no user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/lists/list-1')
    const res = await GET_DETAIL(req, { params: Promise.resolve({ id: 'list-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 if list not found', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/lists/nope')
    const res = await GET_DETAIL(req, { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('returns 403 if list is private and not owned', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue({ ...testList, ownerId: 'other-user' })
    const req = new NextRequest('http://localhost:3000/api/lists/list-1')
    const res = await GET_DETAIL(req, { params: Promise.resolve({ id: 'list-1' }) })
    expect(res.status).toBe(403)
  })

  it('returns list with categories and items', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockGetListCategories.mockResolvedValue([{ id: 'cat-1', name: 'Basic', position: 0 }])
    mockGetListItems.mockResolvedValue([{ id: 'item-1', textKnown: 'ahoj', textTarget: 'xin chao' }])
    mockGetMediaAssetsByIds.mockResolvedValue(new Map())
    const req = new NextRequest('http://localhost:3000/api/lists/list-1')
    const res = await GET_DETAIL(req, { params: Promise.resolve({ id: 'list-1' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.list.id).toBe('list-1')
    expect(data.categories).toHaveLength(1)
    expect(data.items).toHaveLength(1)
  })

  it('allows access to public lists by non-owner', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(publicList)
    mockGetListCategories.mockResolvedValue([])
    mockGetListItems.mockResolvedValue([])
    mockGetMediaAssetsByIds.mockResolvedValue(new Map())
    const req = new NextRequest('http://localhost:3000/api/lists/list-2')
    const res = await GET_DETAIL(req, { params: Promise.resolve({ id: 'list-2' }) })
    expect(res.status).toBe(200)
  })

  it('skips media lookups for lightweight list detail requests', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockGetListCategories.mockResolvedValue([])
    mockGetListItems.mockResolvedValue([
      {
        id: 'item-1',
        audioAssetId: 'asset-1',
        textKnown: 'ahoj',
        textTarget: 'xin chao',
      },
    ])
    const req = new NextRequest('http://localhost:3000/api/lists/list-1?include_media=false')
    const res = await GET_DETAIL(req, { params: Promise.resolve({ id: 'list-1' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.items[0].audioUrl).toBeNull()
    expect(mockGetMediaAssetsByIds).not.toHaveBeenCalled()
  })
})

describe('PUT /api/lists/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if not owner', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue({ ...testList, ownerId: 'other-user' })
    const req = new NextRequest('http://localhost:3000/api/lists/list-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'list-1' }) })
    expect(res.status).toBe(403)
  })

  it('updates list metadata', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockUpdateList.mockResolvedValue({ ...testList, name: 'Updated' })
    const req = new NextRequest('http://localhost:3000/api/lists/list-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'list-1' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.list.name).toBe('Updated')
  })
})

describe('DELETE /api/lists/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if not owner', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue({ ...testList, ownerId: 'other-user' })
    const req = new NextRequest('http://localhost:3000/api/lists/list-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'list-1' }) })
    expect(res.status).toBe(403)
  })

  it('deletes list', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockDeleteList.mockResolvedValue(true)
    const req = new NextRequest('http://localhost:3000/api/lists/list-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'list-1' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
  })
})

describe('GET /api/lists/[id]/categories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns categories ordered by position', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockGetListCategories.mockResolvedValue([
      { id: 'cat-1', name: 'Basic', position: 0 },
      { id: 'cat-2', name: 'Advanced', position: 1 },
    ])
    const req = new NextRequest('http://localhost:3000/api/lists/list-1/categories')
    const res = await GET_CATS(req, { params: Promise.resolve({ id: 'list-1' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.categories).toHaveLength(2)
    expect(data.categories[0].name).toBe('Basic')
  })
})

describe('POST /api/lists/[id]/categories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if not owner', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue({ ...testList, ownerId: 'other-user' })
    const req = new NextRequest('http://localhost:3000/api/lists/list-1/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Cat' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST_CAT(req, { params: Promise.resolve({ id: 'list-1' }) })
    expect(res.status).toBe(403)
  })

  it('creates a category', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockCreateCategory.mockResolvedValue({ id: 'cat-new', listId: 'list-1', name: 'New Cat', position: 3 })
    const req = new NextRequest('http://localhost:3000/api/lists/list-1/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Cat' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST_CAT(req, { params: Promise.resolve({ id: 'list-1' }) })
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.category.name).toBe('New Cat')
  })

  it('returns 400 if name missing', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    const req = new NextRequest('http://localhost:3000/api/lists/list-1/categories', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST_CAT(req, { params: Promise.resolve({ id: 'list-1' }) })
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/lists/[id]/categories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reorders categories', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockReorderCategories.mockResolvedValue(undefined)
    mockGetListCategories.mockResolvedValue([
      { id: 'cat-2', name: 'Advanced', position: 0 },
      { id: 'cat-1', name: 'Basic', position: 1 },
    ])
    const req = new NextRequest('http://localhost:3000/api/lists/list-1/categories', {
      method: 'PUT',
      body: JSON.stringify({ order: ['cat-2', 'cat-1'] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT_CATS(req, { params: Promise.resolve({ id: 'list-1' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.categories[0].id).toBe('cat-2')
  })

  it('returns 400 if order missing', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    const req = new NextRequest('http://localhost:3000/api/lists/list-1/categories', {
      method: 'PUT',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT_CATS(req, { params: Promise.resolve({ id: 'list-1' }) })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/lists/[id]/categories/[catId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes a category', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockDeleteCategory.mockResolvedValue(true)
    const req = new NextRequest('http://localhost:3000/api/lists/list-1/categories/cat-1', { method: 'DELETE' })
    const res = await DELETE_CAT(req, { params: Promise.resolve({ id: 'list-1', catId: 'cat-1' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
  })

  it('returns 404 if category not found', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockDeleteCategory.mockResolvedValue(false)
    const req = new NextRequest('http://localhost:3000/api/lists/list-1/categories/nope', { method: 'DELETE' })
    const res = await DELETE_CAT(req, { params: Promise.resolve({ id: 'list-1', catId: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('returns 403 if not owner', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue({ ...testList, ownerId: 'other-user' })
    const req = new NextRequest('http://localhost:3000/api/lists/list-1/categories/cat-1', { method: 'DELETE' })
    const res = await DELETE_CAT(req, { params: Promise.resolve({ id: 'list-1', catId: 'cat-1' }) })
    expect(res.status).toBe(403)
  })
})
