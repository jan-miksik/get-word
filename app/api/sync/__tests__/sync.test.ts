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
const mockRecordProcessedClientOps = vi.fn()
const mockGetUserMemoryHooksDelta = vi.fn()
const mockGetUserSyncRevision = vi.fn()
const mockVerifySession = vi.fn()
const mockSignSession = vi.fn()
const mockIsGoogleSupportedLanguage = vi.fn()

vi.mock('@/lib/db', () => ({
  getOrCreateUserByDeviceId: (...args: unknown[]) => mockGetOrCreateUserByDeviceId(...args),
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
  recordProcessedClientOps: (...args: unknown[]) => mockRecordProcessedClientOps(...args),
  getUserMemoryHooksDelta: (...args: unknown[]) => mockGetUserMemoryHooksDelta(...args),
  getUserSyncRevision: (...args: unknown[]) => mockGetUserSyncRevision(...args),
}))

vi.mock('@/lib/session', () => ({
  verifySession: (...args: unknown[]) => mockVerifySession(...args),
  signSession: (...args: unknown[]) => mockSignSession(...args),
  GET_WORD_SESSION_COOKIE_NAME: 'get_word_session',
  GET_WORD_SESSION_TTL_SECONDS: 60 * 60 * 24 * 30,
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
  role: 'languageToLearn',
  showEnglish: true,
  showCategoryBadges: false,
  memoryHooksEnabled: true,
  memoryHooksIntroAnswered: false,
  memoryHookDisableFromStage: 5,
  settingsLanguage: 'en',
  settingsLanguageSelectedAt: new Date('2026-05-01T00:00:00.000Z'),
  categoryOrder: [],
}

function makeDnsFailure() {
  const error = new Error('Failed query')
  ;(error as Error & { cause: Error & { code: string; hostname: string } }).cause = Object.assign(
    new Error('getaddrinfo ENOTFOUND aws-1-eu-central-1.pooler.supabase.com'),
    {
      code: 'ENOTFOUND',
      hostname: 'aws-1-eu-central-1.pooler.supabase.com',
    }
  )
  return error
}

describe('GET /api/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ userId: 'uuid-A', userRole: 'user' })
    mockSignSession.mockResolvedValue('signed-token')
    mockGetOrCreateUserByDeviceId.mockResolvedValue(baseUser)
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
    mockRecordProcessedClientOps.mockResolvedValue(undefined)
    mockGetUserMemoryHooksDelta.mockResolvedValue([])
    mockGetUserSyncRevision.mockResolvedValue(1779480000000)
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
    expect(data.user.role).toBe('languageToLearn')
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
        storageType: 'arweave',
        storageRef: 'tx-123',
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
        audioArweaveUrl: 'https://turbo-gateway.com/tx-123',
        audioArweaveUrls: expect.arrayContaining([
          'https://turbo-gateway.com/tx-123',
          'https://arweave.net/tx-123',
        ]),
        audioStorageRef: 'tx-123',
      }),
    ])
  })

  it('returns 401 for device auth without an existing session', async () => {
    mockVerifySession.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123')
    const res = await GET(req)

    expect(res.status).toBe(401)
    expect(mockGetOrCreateUserByDeviceId).not.toHaveBeenCalled()
  })

  it('returns 401 for a userId fallback without a session', async () => {
    mockVerifySession.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/sync?userId=uuid-A')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 503 for transient database DNS failures', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUserById.mockRejectedValue(makeDnsFailure())

    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('2')
    expect(data).toEqual({
      success: false,
      error: 'Database is temporarily unavailable. Please try again shortly.',
    })
    expect(mockGetUserById).toHaveBeenCalledTimes(3)
    consoleSpy.mockRestore()
  })

  it('serves a delta response when ?since= is provided', async () => {
    mockGetUserMemoryHooksDelta.mockResolvedValueOnce([
      { key: 'word-a', hookText: 'updated', deletedAt: null },
      { key: 'word-b', hookText: 'gone', deletedAt: new Date('2026-05-10T00:00:00Z') },
    ])
    mockGetUserProgress.mockResolvedValueOnce({
      'word-c': { wordId: 'word-c', stageIndex: 4, knownCount: 2, unknownCount: 0 },
    })
    mockGetUserSyncRevision.mockResolvedValueOnce(1779500000000)

    const req = new NextRequest(
      'http://localhost:3000/api/sync?deviceId=dev-123&since=1779400000000'
    )
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.is_delta).toBe(true)
    expect(data.memory_hooks).toEqual({ 'word-a': 'updated' })
    expect(data.memory_hooks_deleted).toEqual(['word-b'])
    expect(data.progress['word-c'].stageIndex).toBe(4)
    expect(data.sync_revision).toBe(1779500000000)
    expect(data.word_list_items).toBeUndefined()
    expect(data.categories).toBeUndefined()
    expect(data.lists).toBeUndefined()
    expect(mockGetUserProgress).toHaveBeenCalledWith('uuid-A', { since: expect.any(Date) })
    const passedSince = mockGetUserProgress.mock.calls[0][1].since as Date
    expect(passedSince.getTime()).toBe(1779400000000)
    expect(mockGetUserMemoryHooks).not.toHaveBeenCalled()
  })

  it('falls back to full snapshot when ?since= is malformed', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/sync?deviceId=dev-123&since=not-a-date'
    )
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.is_delta).toBeUndefined()
    expect(mockGetUserMemoryHooksDelta).not.toHaveBeenCalled()
    expect(mockGetUserMemoryHooks).toHaveBeenCalled()
  })

  it('uses getUserSyncRevision for sync_revision in full responses', async () => {
    mockGetUserSyncRevision.mockResolvedValueOnce(1779600000000)
    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123')
    const res = await GET(req)
    const data = await res.json()
    expect(data.sync_revision).toBe(1779600000000)
  })
})

describe('POST /api/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ userId: 'uuid-A', userRole: 'user' })
    mockSignSession.mockResolvedValue('signed-token')
    mockGetOrCreateUserByDeviceId.mockResolvedValue(baseUser)
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
    mockRecordProcessedClientOps.mockResolvedValue(undefined)
    mockGetUserMemoryHooksDelta.mockResolvedValue([])
    mockGetUserSyncRevision.mockResolvedValue(1779480000000)
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

  it('records and echoes client_op_ids on successful sync', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        game_score: 42,
        client_op_ids: ['op-a', 'op-b'],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.applied_client_op_ids).toEqual(['op-a', 'op-b'])
    expect(mockRecordProcessedClientOps).toHaveBeenCalledWith({
      userId: 'uuid-A',
      deviceId: 'dev-123',
      clientOpIds: ['op-a', 'op-b'],
    })
  })

  it('omits malformed client_op_ids entries', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        client_op_ids: ['valid-id', '', null, 123, 'another-id'],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.applied_client_op_ids).toEqual(['valid-id', 'another-id'])
  })

  it('skips recording when no client_op_ids are provided (legacy sync path)', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        game_score: 5,
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.applied_client_op_ids).toEqual([])
    expect(mockRecordProcessedClientOps).not.toHaveBeenCalled()
  })

  it('still returns success when recording processed ops fails', async () => {
    mockRecordProcessedClientOps.mockRejectedValueOnce(new Error('record failed'))
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        game_score: 3,
        client_op_ids: ['op-x'],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.applied_client_op_ids).toEqual(['op-x'])
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

  it('ignores unknown role values', async () => {
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
    expect(mockUpdateUserRole).not.toHaveBeenCalled()
  })

  it('syncs role change with new LearningRole shape', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        role: 'knownLanguage',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockUpdateUserRole).toHaveBeenCalledWith('uuid-A', 'knownLanguage')
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

  it('syncs the memory hooks intro answer setting', async () => {
    mockUpdateUserPreferences.mockResolvedValue({
      ...baseUser,
      memoryHooksIntroAnswered: true,
    })

    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        memory_hooks_intro_answered: true,
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mockUpdateUserPreferences).toHaveBeenCalledWith(
      'uuid-A',
      expect.objectContaining({
        memory_hooks_intro_answered: true,
      })
    )
    expect(data.user.memory_hooks_intro_answered).toBe(true)
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

  it('returns 401 for device auth without an existing session', async () => {
    mockVerifySession.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'dev-123' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
    expect(mockGetOrCreateUserByDeviceId).not.toHaveBeenCalled()
  })

  it('returns 401 for a userId fallback without a session', async () => {
    mockVerifySession.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({ userId: 'uuid-A' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 503 for transient database DNS failures', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUserById.mockRejectedValue(makeDnsFailure())
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'dev-123' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('2')
    expect(data).toEqual({
      success: false,
      error: 'Database is temporarily unavailable. Please try again shortly.',
    })
    expect(mockGetUserById).toHaveBeenCalledTimes(3)
    consoleSpy.mockRestore()
  })
})
