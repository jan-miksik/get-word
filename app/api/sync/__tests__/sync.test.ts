import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetOrCreateUserByDeviceId = vi.fn()
const mockGetUserById = vi.fn()
const mockGetUserProgress = vi.fn()
const mockGetUserMemoryHooks = vi.fn()
const mockGetUserCategoryFilters = vi.fn()
const mockBatchUpsertProgress = vi.fn()
const mockBatchUpsertProgressByItemId = vi.fn()
const mockUpdateUserRole = vi.fn()
const mockUpdateUserPreferences = vi.fn()
const mockUpsertMemoryHook = vi.fn()
const mockDeleteMemoryHook = vi.fn()
const mockSetUserCategoryFilters = vi.fn()
const mockGetUserSubscribedItems = vi.fn()
const mockGetUserOwnListItems = vi.fn()
const mockGetListCategories = vi.fn()
const mockGetSystemDefaultList = vi.fn()
const mockGetWordIdToItemIdMapping = vi.fn()
const mockGetWordListsByIds = vi.fn()

vi.mock('@/lib/db', () => ({
  getOrCreateUserByDeviceId: (...args: unknown[]) => mockGetOrCreateUserByDeviceId(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  getUserProgress: (...args: unknown[]) => mockGetUserProgress(...args),
  batchUpsertProgress: (...args: unknown[]) => mockBatchUpsertProgress(...args),
  batchUpsertProgressByItemId: (...args: unknown[]) => mockBatchUpsertProgressByItemId(...args),
  getUserMemoryHooks: (...args: unknown[]) => mockGetUserMemoryHooks(...args),
  upsertMemoryHook: (...args: unknown[]) => mockUpsertMemoryHook(...args),
  deleteMemoryHook: (...args: unknown[]) => mockDeleteMemoryHook(...args),
  getUserCategoryFilters: (...args: unknown[]) => mockGetUserCategoryFilters(...args),
  setUserCategoryFilters: (...args: unknown[]) => mockSetUserCategoryFilters(...args),
  updateUserRole: (...args: unknown[]) => mockUpdateUserRole(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
  getUserSubscribedItems: (...args: unknown[]) => mockGetUserSubscribedItems(...args),
  getUserOwnListItems: (...args: unknown[]) => mockGetUserOwnListItems(...args),
  getListCategories: (...args: unknown[]) => mockGetListCategories(...args),
  getSystemDefaultList: (...args: unknown[]) => mockGetSystemDefaultList(...args),
  getWordIdToItemIdMapping: (...args: unknown[]) => mockGetWordIdToItemIdMapping(...args),
  getWordListsByIds: (...args: unknown[]) => mockGetWordListsByIds(...args),
}))

vi.mock('@/lib/db/client', () => ({
  db: {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}))

vi.mock('@/lib/db/schema', () => ({
  users: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}))

import { GET, POST } from '../../sync/route'

const baseUser = {
  id: 'uuid-A',
  deviceId: 'dev-123',
  walletAddress: null,
  role: 'vi',
  showEnglish: true,
  showCategoryBadges: false,
  categoryOrder: [],
}

describe('GET /api/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserProgress.mockResolvedValue({})
    mockGetUserMemoryHooks.mockResolvedValue({})
    mockGetUserCategoryFilters.mockResolvedValue([])
    mockGetUserSubscribedItems.mockResolvedValue([])
    mockGetUserOwnListItems.mockResolvedValue([])
    mockGetSystemDefaultList.mockResolvedValue(null)
    mockGetWordIdToItemIdMapping.mockResolvedValue(new Map())
    mockGetWordListsByIds.mockResolvedValue([])
  })

  it('returns 400 if no deviceId or userId', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns user data for anonymous user', async () => {
    mockGetOrCreateUserByDeviceId.mockResolvedValue(baseUser)
    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.id).toBe('uuid-A')
    expect(data.user.role).toBe('vi')
  })

  it('returns game_score in user object', async () => {
    mockGetOrCreateUserByDeviceId.mockResolvedValue({ ...baseUser, gameScore: 7 })
    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.user.game_score).toBe(7)
  })

  it('returns user data by userId fallback', async () => {
    mockGetUserById.mockResolvedValue(baseUser)
    const req = new NextRequest('http://localhost:3000/api/sync?userId=uuid-A')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.id).toBe('uuid-A')
  })
})

describe('POST /api/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOrCreateUserByDeviceId.mockResolvedValue(baseUser)
    mockGetUserProgress.mockResolvedValue({})
    mockGetUserMemoryHooks.mockResolvedValue({})
    mockGetUserCategoryFilters.mockResolvedValue([])
    mockGetUserSubscribedItems.mockResolvedValue([])
    mockGetUserOwnListItems.mockResolvedValue([])
    mockGetSystemDefaultList.mockResolvedValue(null)
    mockGetWordIdToItemIdMapping.mockResolvedValue(new Map())
    mockGetWordListsByIds.mockResolvedValue([])
  })

  it('returns 400 if no deviceId or userId', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('syncs progress for anonymous user', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        progress: [{
          word_id: 'w001',
          stage_index: 1,
          known_count: 1,
          unknown_count: 0,
          last_known_at: Date.now(),
          last_unknown_at: null,
          next_due_at: null,
        }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockBatchUpsertProgress).toHaveBeenCalled()
  })

  it('syncs role change for anonymous user', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        role: 'cz',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockUpdateUserRole).toHaveBeenCalledWith('uuid-A', 'cz')
  })

  it('syncs preferences for anonymous user', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        show_english: false,
        show_category_badges: true,
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    mockUpdateUserPreferences.mockResolvedValue({ ...baseUser, showEnglish: false, showCategoryBadges: true })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockUpdateUserPreferences).toHaveBeenCalled()
  })

  it('saves game_score when provided', async () => {
    mockUpdateUserPreferences.mockResolvedValue({ ...baseUser, gameScore: 5 })
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'dev-123', game_score: 5 }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(mockUpdateUserPreferences).toHaveBeenCalledWith(
      'uuid-A',
      expect.objectContaining({ game_score: 5 })
    )
  })

  it('returns updated game_score in response', async () => {
    mockUpdateUserPreferences.mockResolvedValue({ ...baseUser, gameScore: 5 })
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'dev-123', game_score: 5 }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()
    expect(data.user.game_score).toBe(5)
  })

  it('saves category_order when provided and returns it', async () => {
    mockUpdateUserPreferences.mockResolvedValue({ ...baseUser, categoryOrder: ['basic', 'cz ≈ en'] })
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'dev-123', category_order: ['basic', 'cz ≈ en'] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(mockUpdateUserPreferences).toHaveBeenCalledWith(
      'uuid-A',
      expect.objectContaining({ category_order: ['basic', 'cz ≈ en'] })
    )
    expect(data.user.category_order).toEqual(['basic', 'cz ≈ en'])
  })
})
