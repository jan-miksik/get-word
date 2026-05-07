import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUserByDeviceId = vi.fn()
const mockGetUserById = vi.fn()
const mockGetUserProgress = vi.fn()
const mockGetUserMemoryHooks = vi.fn()
const mockGetUserCategoryFilters = vi.fn()
const mockBatchUpsertProgress = vi.fn()
const mockBatchUpsertProgressByItemId = vi.fn()
const mockUpdateUserRole = vi.fn()
const mockUpdateUserPreferences = vi.fn()
const mockUpsertMemoryHook = vi.fn()
const mockUpsertMemoryHookByItemId = vi.fn()
const mockDeleteMemoryHook = vi.fn()
const mockDeleteMemoryHookByItemId = vi.fn()
const mockSetUserCategoryFilters = vi.fn()
const mockGetUserSubscribedItems = vi.fn()
const mockGetUserOwnListItems = vi.fn()
const mockGetMediaAssetsByIds = vi.fn()
const mockGetCategoriesForLists = vi.fn()
const mockGetSystemDefaultList = vi.fn()
const mockGetWordIdToItemIdMapping = vi.fn()
const mockGetWordListsByIds = vi.fn()
const mockTouchUserDevice = vi.fn()
const mockApplyNewReviewEvents = vi.fn()
const mockVerifySession = vi.fn()
const mockSignSession = vi.fn()
const mockIsGoogleSupportedLanguage = vi.fn()

vi.mock('@/lib/db', () => ({
  getUserByDeviceId: (...args: unknown[]) => mockGetUserByDeviceId(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  getUserProgress: (...args: unknown[]) => mockGetUserProgress(...args),
  batchUpsertProgress: (...args: unknown[]) => mockBatchUpsertProgress(...args),
  batchUpsertProgressByItemId: (...args: unknown[]) => mockBatchUpsertProgressByItemId(...args),
  getUserMemoryHooks: (...args: unknown[]) => mockGetUserMemoryHooks(...args),
  upsertMemoryHook: (...args: unknown[]) => mockUpsertMemoryHook(...args),
  upsertMemoryHookByItemId: (...args: unknown[]) => mockUpsertMemoryHookByItemId(...args),
  deleteMemoryHook: (...args: unknown[]) => mockDeleteMemoryHook(...args),
  deleteMemoryHookByItemId: (...args: unknown[]) => mockDeleteMemoryHookByItemId(...args),
  getUserCategoryFilters: (...args: unknown[]) => mockGetUserCategoryFilters(...args),
  setUserCategoryFilters: (...args: unknown[]) => mockSetUserCategoryFilters(...args),
  updateUserRole: (...args: unknown[]) => mockUpdateUserRole(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
  getUserSubscribedItems: (...args: unknown[]) => mockGetUserSubscribedItems(...args),
  getUserOwnListItems: (...args: unknown[]) => mockGetUserOwnListItems(...args),
  getMediaAssetsByIds: (...args: unknown[]) => mockGetMediaAssetsByIds(...args),
  getCategoriesForLists: (...args: unknown[]) => mockGetCategoriesForLists(...args),
  getSystemDefaultList: (...args: unknown[]) => mockGetSystemDefaultList(...args),
  getWordIdToItemIdMapping: (...args: unknown[]) => mockGetWordIdToItemIdMapping(...args),
  getWordListsByIds: (...args: unknown[]) => mockGetWordListsByIds(...args),
  touchUserDevice: (...args: unknown[]) => mockTouchUserDevice(...args),
  applyNewReviewEvents: (...args: unknown[]) => mockApplyNewReviewEvents(...args),
}))

vi.mock('@/lib/session', () => ({
  verifySession: (...args: unknown[]) => mockVerifySession(...args),
  signSession: (...args: unknown[]) => mockSignSession(...args),
  WORDLINK_SESSION_COOKIE_NAME: 'wordlink_session',
  WORDLINK_SESSION_TTL_SECONDS: 60 * 60 * 24 * 30,
}))

vi.mock('@/lib/i18n/server', () => ({
  isGoogleSupportedLanguage: (...args: unknown[]) => mockIsGoogleSupportedLanguage(...args),
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
  memoryHooksEnabled: true,
  memoryHookDisableFromStage: 8,
  settingsLanguage: 'en',
  settingsLanguageSelectedAt: new Date('2026-05-01T00:00:00.000Z'),
  categoryOrder: [],
}

describe('GET /api/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ userId: 'uuid-A', userRole: 'user' })
    mockSignSession.mockResolvedValue('signed-token')
    mockGetUserById.mockResolvedValue(baseUser)
    mockGetUserProgress.mockResolvedValue({})
    mockGetUserMemoryHooks.mockResolvedValue({})
    mockGetUserCategoryFilters.mockResolvedValue([])
    mockGetUserSubscribedItems.mockResolvedValue([])
    mockGetUserOwnListItems.mockResolvedValue([])
    mockGetMediaAssetsByIds.mockResolvedValue(new Map())
    mockGetCategoriesForLists.mockResolvedValue([])
    mockGetSystemDefaultList.mockResolvedValue(null)
    mockGetWordIdToItemIdMapping.mockResolvedValue(new Map())
    mockGetWordListsByIds.mockResolvedValue([])
    mockTouchUserDevice.mockResolvedValue(undefined)
    mockApplyNewReviewEvents.mockResolvedValue([])
    mockIsGoogleSupportedLanguage.mockResolvedValue(true)
  })

  it('returns 400 if no deviceId or userId', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns user data for authenticated user', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.user.id).toBe('uuid-A')
    expect(data.user.role).toBe('vi')
  })

  it('returns game_score in user object', async () => {
    mockGetUserById.mockResolvedValue({ ...baseUser, gameScore: 7 })
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

  it('includes hydrated audio URLs for word list items with audio assets', async () => {
    mockGetUserOwnListItems.mockResolvedValue([
      {
        id: 'item-1',
        listId: 'list-1',
        categoryId: null,
        canonicalWordId: null,
        position: 0,
        textKnown: 'ahoj',
        textTarget: 'xin chao',
        translationStatus: 'translated',
        audioAssetId: 'asset-1',
        audioStatus: 'ready',
        notes: null,
      },
    ])
    mockGetMediaAssetsByIds.mockResolvedValue(new Map([
      ['asset-1', {
        id: 'asset-1',
        contentHash: 'hash-123',
        storageType: 'r2',
        storageRef: 'r2/key',
      }],
    ]))

    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.word_list_items).toEqual([
      expect.objectContaining({
        id: 'item-1',
        audioUrl: '/api/audio/hash-123',
        audioArweaveUrl: null,
        audioArweaveUrls: [],
        audioStorageRef: 'r2/key',
      }),
    ])
  })

  it('returns 401 without session', async () => {
    mockVerifySession.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ userId: 'uuid-A', userRole: 'user' })
    mockSignSession.mockResolvedValue('signed-token')
    mockGetUserById.mockResolvedValue(baseUser)
    mockGetUserProgress.mockResolvedValue({})
    mockGetUserMemoryHooks.mockResolvedValue({})
    mockGetUserCategoryFilters.mockResolvedValue([])
    mockGetUserSubscribedItems.mockResolvedValue([])
    mockGetUserOwnListItems.mockResolvedValue([])
    mockGetMediaAssetsByIds.mockResolvedValue(new Map())
    mockGetCategoriesForLists.mockResolvedValue([])
    mockGetSystemDefaultList.mockResolvedValue(null)
    mockGetWordIdToItemIdMapping.mockResolvedValue(new Map())
    mockGetWordListsByIds.mockResolvedValue([])
    mockTouchUserDevice.mockResolvedValue(undefined)
    mockApplyNewReviewEvents.mockResolvedValue([])
    mockIsGoogleSupportedLanguage.mockResolvedValue(true)
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

  it('syncs progress for authenticated user', async () => {
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

  it('syncs role change for authenticated user', async () => {
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

  it('syncs preferences for authenticated user', async () => {
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

  it('syncs memory hook preference settings', async () => {
    mockUpdateUserPreferences.mockResolvedValue({
      ...baseUser,
      memoryHooksEnabled: false,
      memoryHookDisableFromStage: 6,
    })

    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        memory_hooks_enabled: false,
        memory_hook_disable_from_stage: 6,
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mockUpdateUserPreferences).toHaveBeenCalledWith(
      'uuid-A',
      expect.objectContaining({
        memory_hooks_enabled: false,
        memory_hook_disable_from_stage: 6,
      })
    )
    expect(data.user.memory_hooks_enabled).toBe(false)
    expect(data.user.memory_hook_disable_from_stage).toBe(6)
  })

  it('syncs settings language when supported', async () => {
    mockUpdateUserPreferences.mockResolvedValue({
      ...baseUser,
      settingsLanguage: 'de',
      settingsLanguageSelectedAt: new Date('2026-05-01T12:00:00.000Z'),
    })

    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        settings_language: 'de',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mockIsGoogleSupportedLanguage).toHaveBeenCalledWith('de')
    expect(mockUpdateUserPreferences).toHaveBeenCalledWith(
      'uuid-A',
      expect.objectContaining({ settings_language: 'de' })
    )
    expect(data.user.settings_language).toBe('de')
    expect(data.user.settings_language_selected_at).toBe('2026-05-01T12:00:00.000Z')
  })

  it('saves game_score without lowering existing score', async () => {
    mockGetUserById.mockResolvedValue({ ...baseUser, gameScore: 9 })
    mockUpdateUserPreferences.mockResolvedValue({ ...baseUser, gameScore: 5 })
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'dev-123', game_score: 5 }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(mockUpdateUserPreferences).toHaveBeenCalledWith(
      'uuid-A',
      expect.objectContaining({ game_score: 9 })
    )
  })

  it('applies review events and returns applied ids', async () => {
    mockApplyNewReviewEvents.mockResolvedValue(['event-1'])
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        sessionId: 'session-1',
        review_events: [{
          client_event_id: 'event-1',
          word_id: 'w001',
          action: 'known',
          client_created_at: 1776944510000,
        }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mockApplyNewReviewEvents).toHaveBeenCalledWith({
      userId: 'uuid-A',
      deviceId: 'dev-123',
      sessionId: 'session-1',
      events: expect.arrayContaining([
        expect.objectContaining({ client_event_id: 'event-1', action: 'known' }),
      ]),
    })
    expect(data.applied_review_event_ids).toEqual(['event-1'])
    expect(typeof data.sync_revision).toBe('number')
  })

  it('tracks user device without rewriting the user device id', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'dev-new' }),
      headers: { 'Content-Type': 'application/json' },
    })

    await POST(req)

    expect(mockTouchUserDevice).toHaveBeenCalledWith('uuid-A', 'dev-new')
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

  it('maps UUID memory hook keys to legacy word IDs before upsert', async () => {
    const itemId = '11111111-1111-1111-1111-111111111111'
    mockGetSystemDefaultList.mockResolvedValue({ id: 'list-system' })
    mockGetWordIdToItemIdMapping.mockResolvedValue(new Map([['w001', itemId]]))

    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        memory_hooks: { [itemId]: 'hook text' },
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockUpsertMemoryHook).toHaveBeenCalledWith('uuid-A', 'w001', 'hook text')
  })

  it('saves UUID memory hook keys as list item hooks when no legacy mapping exists', async () => {
    const itemId = '11111111-1111-1111-1111-111111111111'
    mockGetSystemDefaultList.mockResolvedValue({ id: 'list-system' })
    mockGetWordIdToItemIdMapping.mockResolvedValue(new Map())

    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        memory_hooks: { [itemId]: 'hook text' },
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockUpsertMemoryHook).not.toHaveBeenCalled()
    expect(mockUpsertMemoryHookByItemId).toHaveBeenCalledWith('uuid-A', itemId, 'hook text')
  })

  it('returns 401 without session', async () => {
    mockVerifySession.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'dev-123' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
