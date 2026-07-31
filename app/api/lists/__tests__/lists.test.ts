import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserLists = vi.fn()
const mockGetUserListsByLanguagePair = vi.fn()
const mockGetSystemDefaultList = vi.fn()
const mockGetWordListItemCountsByListIds = vi.fn()
const mockGetUserSubscribedListIds = vi.fn()
const mockGetSubscriberCountsForLists = vi.fn(() => new Map())
const mockCreateList = vi.fn()
const mockGetListById = vi.fn()
const mockIsUserSubscribed = vi.fn(() => false)
const mockUpdateList = vi.fn()
const mockDeleteList = vi.fn()
const mockGetListCategories = vi.fn()
const mockGetListItems = vi.fn()
const mockGetMediaAssetsByIds = vi.fn()
const mockCreateCategory = vi.fn()
const mockReorderCategories = vi.fn()
const mockDeleteCategory = vi.fn()
const mockResolveUserFromRequest = vi.fn()
const mockScanListAudio = vi.fn()
const mockIsBlockedBetweenUsers = vi.fn((..._args: unknown[]) => false)

vi.mock('@/lib/db', () => ({
  getUserLists: (...args: unknown[]) => mockGetUserLists(...args),
  getUserListsByLanguagePair: (...args: unknown[]) => mockGetUserListsByLanguagePair(...args),
  getSystemDefaultList: (...args: unknown[]) => mockGetSystemDefaultList(...args),
  pickRecommendedWordList: (
    lists: Array<{ id: string; isRecommended?: boolean; languageFrom: string; languageTo: string }>,
    languageFrom: string,
    languageTo: string,
    fallbackSeed: { id: string; languageFrom: string; languageTo: string } | null,
  ) => {
    const normalize = (code: string) => (code === 'cz' || code === 'cs' ? 'cs' : code)
    const exact = lists.find((list) =>
      list.isRecommended &&
      normalize(list.languageFrom) === normalize(languageFrom) &&
      normalize(list.languageTo) === normalize(languageTo)
    )
    if (exact) return { list: exact, reason: 'exact' }
    const reverse = lists.find((list) =>
      list.isRecommended &&
      normalize(list.languageFrom) === normalize(languageTo) &&
      normalize(list.languageTo) === normalize(languageFrom)
    )
    if (reverse) return { list: reverse, reason: 'reverse' }
    return fallbackSeed ? { list: fallbackSeed, reason: 'fallback_seed' } : null
  },
  getWordListItemCountsByListIds: (...args: unknown[]) => mockGetWordListItemCountsByListIds(...args),
  getUserSubscribedListIds: (...args: unknown[]) => mockGetUserSubscribedListIds(...args),
  getSubscriberCountsForLists: () => mockGetSubscriberCountsForLists(),
  createList: (...args: unknown[]) => mockCreateList(...args),
  getListById: (...args: unknown[]) => mockGetListById(...args),
  isBlockedBetweenUsers: (...args: unknown[]) => mockIsBlockedBetweenUsers(...args),
  isUserSubscribed: () => mockIsUserSubscribed(),
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
  isEditor: (user: { userRole?: string }) => user.userRole === 'editor',
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'content-type': 'application/json' } }),
  forbiddenResponse: () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } }),
}))

vi.mock('@/features/audio/server/repair/scan-list-audio', () => ({
  scanListAudio: (...args: unknown[]) => mockScanListAudio(...args),
}))

import { GET, POST } from '../route'
import { GET as GET_MATCHES } from '../matches/route'
import { GET as GET_DETAIL, PUT, DELETE } from '../[id]/route'
import { GET as GET_CATS, POST as POST_CAT, PUT as PUT_CATS } from '../[id]/categories/route'
import { DELETE as DELETE_CAT } from '../[id]/categories/[catId]/route'
import { POST as POST_AUDIO_SCAN } from '../[id]/audio/scan/route'

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
  isCommon: false,
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
    expect(data.canManageCommonLists).toBe(false)
  })

  it('marks editor list responses as common-list manageable', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ ...testUser, userRole: 'editor' })
    mockGetUserLists.mockResolvedValue([testList])
    mockGetUserSubscribedListIds.mockResolvedValue([])
    const req = new NextRequest('http://localhost:3000/api/lists')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.canManageCommonLists).toBe(true)
  })
})

describe('POST /api/lists/[id]/audio/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockScanListAudio.mockResolvedValue([])
  })

  function scanRequest() {
    return new NextRequest('http://localhost:3000/api/lists/list-1/audio/scan', {
      method: 'POST',
      body: JSON.stringify({ side: 'target' }),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const scanContext = { params: Promise.resolve({ id: 'list-1' }) }

  it('allows the owner to scan a regular list', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)

    const res = await POST_AUDIO_SCAN(scanRequest(), scanContext)

    expect(res.status).toBe(200)
    expect(mockScanListAudio).toHaveBeenCalledWith('list-1', { side: 'target' })
  })

  it('rejects a non-editor owner for a curated list', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue({ ...testList, isCommon: true })

    const res = await POST_AUDIO_SCAN(scanRequest(), scanContext)

    expect(res.status).toBe(403)
    expect(mockScanListAudio).not.toHaveBeenCalled()
  })

  it('allows an editor to scan a curated list', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ ...testUser, userRole: 'editor' })
    mockGetListById.mockResolvedValue({ ...testList, ownerId: 'other-user', isRecommended: true })

    const res = await POST_AUDIO_SCAN(scanRequest(), scanContext)

    expect(res.status).toBe(200)
    expect(mockScanListAudio).toHaveBeenCalledWith('list-1', { side: 'target' })
  })
})

describe('GET /api/lists/matches', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns selectable lists for the normalized language pair', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetUserListsByLanguagePair.mockResolvedValue([
      { ...publicList, id: 'legacy-curated', languageFrom: 'cz', languageTo: 'vi', isCommon: true, isRecommended: true },
    ])
    mockGetSystemDefaultList.mockResolvedValue(null)
    mockGetWordListItemCountsByListIds.mockResolvedValue(new Map([['legacy-curated', 42]]))

    const req = new NextRequest('http://localhost:3000/api/lists/matches?from=cs&to=vi')
    const res = await GET_MATCHES(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mockGetUserListsByLanguagePair).toHaveBeenCalledWith('user-1', 'cs', 'vi')
    expect(data.lists).toEqual([
      expect.objectContaining({
        id: 'legacy-curated',
        isCommon: true,
        itemCount: 42,
      }),
    ])
    expect(data.recommendedList).toEqual(expect.objectContaining({
      id: 'legacy-curated',
      itemCount: 42,
    }))
    expect(data.recommendedReason).toBe('exact')
  })

  it('uses the same matcher for the reverse language selection', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetUserListsByLanguagePair.mockResolvedValue([
      { ...publicList, id: 'curated-reverse', languageFrom: 'cz', languageTo: 'vi', isRecommended: true },
    ])
    mockGetSystemDefaultList.mockResolvedValue(null)
    mockGetWordListItemCountsByListIds.mockResolvedValue(new Map([['curated-reverse', 9]]))

    const req = new NextRequest('http://localhost:3000/api/lists/matches?from=vi&to=cs')
    const res = await GET_MATCHES(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mockGetUserListsByLanguagePair).toHaveBeenCalledWith('user-1', 'vi', 'cs')
    expect(data.lists[0]).toEqual(expect.objectContaining({
      id: 'curated-reverse',
      itemCount: 9,
    }))
    expect(data.recommendedList).toEqual(expect.objectContaining({ id: 'curated-reverse' }))
    expect(data.recommendedReason).toBe('reverse')
  })

  it('does not expose the common seed as a curated recommendation', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetUserListsByLanguagePair.mockResolvedValue([])
    mockGetSystemDefaultList.mockResolvedValue({
      ...publicList,
      id: 'common-seed',
      name: 'Common Seed',
      isCommon: true,
      isRecommended: false,
    })
    mockGetWordListItemCountsByListIds.mockResolvedValue(new Map([['common-seed', 120]]))

    const req = new NextRequest('http://localhost:3000/api/lists/matches?from=en&to=ja')
    const res = await GET_MATCHES(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.lists).toEqual([])
    expect(data.recommendedList).toBeNull()
    expect(data.recommendedReason).toBeNull()
    expect(mockGetSystemDefaultList).not.toHaveBeenCalled()
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
    const created = { ...testList, id: 'list-new', name: 'Nový seznam' }
    mockCreateList.mockResolvedValue(created)
    const req = new NextRequest('http://localhost:3000/api/lists', {
      method: 'POST',
      body: JSON.stringify({ name: 'Nový seznam', language_from: 'cz', language_to: 'vi' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.list.name).toBe('Nový seznam')
    expect(mockCreateList).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'user-1',
      name: 'Nový seznam',
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

  it('returns 403 if list is private and not owned nor subscribed', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue({ ...testList, ownerId: 'other-user' })
    mockIsUserSubscribed.mockResolvedValueOnce(false)
    const req = new NextRequest('http://localhost:3000/api/lists/list-1')
    const res = await GET_DETAIL(req, { params: Promise.resolve({ id: 'list-1' }) })
    expect(res.status).toBe(403)
  })

  it('allows a subscriber to read a private list (shared via link)', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue({ ...testList, ownerId: 'other-user', isPublic: false, shareToken: 'secret' })
    mockIsUserSubscribed.mockResolvedValueOnce(true)
    mockGetListCategories.mockResolvedValue([])
    mockGetListItems.mockResolvedValue([])
    mockGetMediaAssetsByIds.mockResolvedValue(new Map())
    const req = new NextRequest('http://localhost:3000/api/lists/list-1')
    const res = await GET_DETAIL(req, { params: Promise.resolve({ id: 'list-1' }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    // Token is never leaked in the detail response.
    expect(data.list.shareToken).toBeUndefined()
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

  it('passes language changes through metadata update so item sides can be cleared', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    mockUpdateList.mockResolvedValue({ ...testList, languageTo: 'fr' })
    const req = new NextRequest('http://localhost:3000/api/lists/list-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated', language_from: 'cz', language_to: 'fr' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'list-1' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.cleared_sides).toEqual(['target'])
    expect(mockUpdateList).toHaveBeenCalledWith('list-1', expect.objectContaining({
      languageFrom: 'cs',
      languageTo: 'fr',
    }))
  })

  it('lets editors mark a list as the common seed', async () => {
    const editorUser = { ...testUser, userRole: 'editor' }
    mockResolveUserFromRequest.mockResolvedValue(editorUser)
    mockGetListById.mockResolvedValue({ ...testList, ownerId: 'other-user', isPublic: true })
    mockUpdateList.mockResolvedValue({ ...testList, ownerId: 'other-user', isPublic: true, isCommon: true })
    const req = new NextRequest('http://localhost:3000/api/lists/list-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated', description: null, is_public: true, is_common: true }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'list-1' }) })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.list.isCommon).toBe(true)
    expect(mockUpdateList).toHaveBeenCalledWith('list-1', expect.objectContaining({
      isCommon: true,
    }))
  })

  it('lets editors mark a list as selected and makes it public', async () => {
    const editorUser = { ...testUser, userRole: 'editor' }
    mockResolveUserFromRequest.mockResolvedValue(editorUser)
    mockGetListById.mockResolvedValue({ ...testList, ownerId: 'other-user', isPublic: false })
    mockUpdateList.mockResolvedValue({
      ...testList,
      ownerId: 'other-user',
      isPublic: true,
      isRecommended: true,
    })
    const req = new NextRequest('http://localhost:3000/api/lists/list-1', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Updated',
        description: null,
        is_public: false,
        is_recommended: true,
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'list-1' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.list.isPublic).toBe(true)
    expect(data.list.isRecommended).toBe(true)
    expect(mockUpdateList).toHaveBeenCalledWith('list-1', expect.objectContaining({
      isPublic: false,
      isRecommended: true,
    }))
  })

  it('rejects selected-list changes for non-editors', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetListById.mockResolvedValue(testList)
    const req = new NextRequest('http://localhost:3000/api/lists/list-1', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Updated',
        description: null,
        is_public: true,
        is_recommended: true,
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'list-1' }) })

    expect(res.status).toBe(403)
    expect(mockUpdateList).not.toHaveBeenCalled()
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

  it('lets editors delete the common seed list', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ ...testUser, userRole: 'editor' })
    mockGetListById.mockResolvedValue({
      ...publicList,
      id: 'common-list',
      ownerId: null,
      isCommon: true,
    })
    mockDeleteList.mockResolvedValue(true)
    const req = new NextRequest('http://localhost:3000/api/lists/common-list', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'common-list' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockDeleteList).toHaveBeenCalledWith('common-list')
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
