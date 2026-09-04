import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetOrCreateUserByDeviceId = vi.fn()
const mockGetUserById = vi.fn()
const mockGetProjectedProgress = vi.fn()
const mockGetUserItemIdentities = vi.fn(async (..._args: unknown[]) => [] as unknown[])
const mockGetUserMemoryHooks = vi.fn()
const mockGetUserCategoryFilters = vi.fn()
const mockBatchUpsertProgress = vi.fn()
const mockBatchUpsertProgressByContentKey = vi.fn()
const mockGetContentKeysForItemIds = vi.fn(async (..._args: unknown[]) => new Map<string, string | null>())
const mockUpdateUserPreferences = vi.fn()
const mockUpsertMemoryHook = vi.fn()
const mockUpsertMemoryHookByItemId = vi.fn()
const mockDeleteMemoryHook = vi.fn()
const mockDeleteMemoryHookByItemId = vi.fn()
const mockSetUserCategoryFilters = vi.fn()
const mockGetUserSubscribedItems = vi.fn()
const mockGetUserOwnListItems = vi.fn()
const mockGetUserStudyLists = vi.fn()
const mockGetMediaAssetsByIds = vi.fn()
const mockGetCategoriesForLists = vi.fn()
const mockTouchUserDevice = vi.fn()
const mockApplyNewReviewEvents = vi.fn()
const mockEnsureDayGoalSnapshot = vi.fn()
const mockGetUserMemoryHooksDelta = vi.fn()
const mockGetUserSurveyResponses = vi.fn()
const mockRecordSurveyResponseIfAbsent = vi.fn()
const mockGetUserSyncRevision = vi.fn()
const mockGetContentRevision = vi.fn()
const mockGetAppliedSyncClientOpIds = vi.fn()
const mockRecordAppliedSyncClientOpIds = vi.fn()
const mockVerifySession = vi.fn()
const mockSignSession = vi.fn()
const mockIsGoogleSupportedLanguage = vi.fn()

vi.mock('@/lib/db', () => ({
  getOrCreateUserByDeviceId: (...args: unknown[]) => mockGetOrCreateUserByDeviceId(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  getProjectedProgress: (...args: unknown[]) => mockGetProjectedProgress(...args),
  getUserItemIdentities: (...args: unknown[]) => mockGetUserItemIdentities(...args),
  batchUpsertProgress: (...args: unknown[]) => mockBatchUpsertProgress(...args),
  batchUpsertProgressByContentKey: (...args: unknown[]) => mockBatchUpsertProgressByContentKey(...args),
  getContentKeysForItemIds: (...args: unknown[]) => mockGetContentKeysForItemIds(...args),
  getUserMemoryHooks: (...args: unknown[]) => mockGetUserMemoryHooks(...args),
  upsertMemoryHook: (...args: unknown[]) => mockUpsertMemoryHook(...args),
  upsertMemoryHookByItemId: (...args: unknown[]) => mockUpsertMemoryHookByItemId(...args),
  deleteMemoryHook: (...args: unknown[]) => mockDeleteMemoryHook(...args),
  deleteMemoryHookByItemId: (...args: unknown[]) => mockDeleteMemoryHookByItemId(...args),
  getUserCategoryFilters: (...args: unknown[]) => mockGetUserCategoryFilters(...args),
  setUserCategoryFilters: (...args: unknown[]) => mockSetUserCategoryFilters(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
  getUserSubscribedItems: (...args: unknown[]) => mockGetUserSubscribedItems(...args),
  getUserOwnListItems: (...args: unknown[]) => mockGetUserOwnListItems(...args),
  getUserStudyLists: (...args: unknown[]) => mockGetUserStudyLists(...args),
  getMediaAssetsByIds: (...args: unknown[]) => mockGetMediaAssetsByIds(...args),
  getCategoriesForLists: (...args: unknown[]) => mockGetCategoriesForLists(...args),
  touchUserDevice: (...args: unknown[]) => mockTouchUserDevice(...args),
  applyNewReviewEvents: (...args: unknown[]) => mockApplyNewReviewEvents(...args),
  ensureDayGoalSnapshot: (...args: unknown[]) => mockEnsureDayGoalSnapshot(...args),
  getUserMemoryHooksDelta: (...args: unknown[]) => mockGetUserMemoryHooksDelta(...args),
  getUserSurveyResponses: (...args: unknown[]) => mockGetUserSurveyResponses(...args),
  recordSurveyResponseIfAbsent: (...args: unknown[]) => mockRecordSurveyResponseIfAbsent(...args),
  getUserSyncRevision: (...args: unknown[]) => mockGetUserSyncRevision(...args),
  getContentRevision: (...args: unknown[]) => mockGetContentRevision(...args),
  getAppliedSyncClientOpIds: (...args: unknown[]) => mockGetAppliedSyncClientOpIds(...args),
  recordAppliedSyncClientOpIds: (...args: unknown[]) => mockRecordAppliedSyncClientOpIds(...args),
}))

vi.mock('@/lib/session', () => ({
  verifySession: (...args: unknown[]) => mockVerifySession(...args),
  signSession: (...args: unknown[]) => mockSignSession(...args),
  readSessionToken: (request: NextRequest) => {
    const authorization = request.headers.get('authorization')
    if (authorization) return authorization.replace(/^Bearer\s+/i, '')
    return request.cookies.get('get_word_session')?.value ?? null
  },
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
    mockGetProjectedProgress.mockResolvedValue({})
    mockGetUserMemoryHooks.mockResolvedValue({})
    mockGetUserSurveyResponses.mockResolvedValue({})
    mockGetUserCategoryFilters.mockResolvedValue([])
    mockGetUserSubscribedItems.mockResolvedValue([])
    mockGetUserOwnListItems.mockResolvedValue([])
    mockGetUserStudyLists.mockResolvedValue([])
    mockGetMediaAssetsByIds.mockResolvedValue(new Map())
    mockGetCategoriesForLists.mockResolvedValue([])
    mockTouchUserDevice.mockResolvedValue(undefined)
    mockApplyNewReviewEvents.mockResolvedValue([])
    mockEnsureDayGoalSnapshot.mockResolvedValue(null)
    mockGetUserMemoryHooksDelta.mockResolvedValue([])
    mockGetUserSyncRevision.mockResolvedValue(1779480000000)
    mockGetContentRevision.mockResolvedValue('v1:content-rev-1')
    mockGetAppliedSyncClientOpIds.mockResolvedValue(new Set())
    mockRecordAppliedSyncClientOpIds.mockResolvedValue(undefined)
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
  })

  it('tracks coarse device profile from GET headers', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123', {
      headers: {
        'x-device-platform': 'android',
        'x-device-form-factor': 'mobile',
      },
    })

    await GET(req)

    expect(mockTouchUserDevice).toHaveBeenCalledWith('uuid-A', 'dev-123', {
      platform: 'android',
      formFactor: 'mobile',
    })
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
        audioArweaveUrl: 'https://arweave.net/tx-123',
        audioArweaveUrls: expect.arrayContaining([
          'https://arweave.net/tx-123',
          'https://turbo-gateway.com/tx-123',
        ]),
        audioStorageRef: 'tx-123',
      }),
    ])
  })

  it('surfaces a study-note comment on hydrated word list items', async () => {
    const comment = {
      version: 1,
      text: 'pozor na false friend',
      source: 'generated',
      mentions: [{ word: 'temps', language: 'to', frequency: 3 }],
    }
    mockGetUserOwnListItems.mockResolvedValue([
      {
        id: 'item-1',
        listId: 'list-1',
        categoryId: null,
        canonicalWordId: null,
        position: 0,
        textKnown: 'cas',
        textTarget: 'temps',
        translationStatus: 'translated',
        audioStatus: 'none',
        notes: null,
        comment,
      },
    ])

    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.word_list_items[0].comment).toEqual(comment)
  })

  it('dedupes word list items that are both owned and subscribed', async () => {
    const duplicateItem = {
      id: 'item-dup',
      listId: 'list-generated',
      categoryId: null,
      canonicalWordId: null,
      position: 0,
      textKnown: 'time',
      textTarget: 'temps',
      translationStatus: 'translated',
      knownAudioAssetId: null,
      knownAudioStatus: 'none',
      audioAssetId: null,
      audioStatus: 'none',
      notes: null,
    }
    mockGetUserSubscribedItems.mockResolvedValue([duplicateItem])
    mockGetUserOwnListItems.mockResolvedValue([duplicateItem])
    mockGetUserStudyLists.mockResolvedValue([
      {
        id: 'list-generated',
        name: 'Generated',
        languageFrom: 'en',
        languageTo: 'fr',
        isRecommended: false,
      },
    ])

    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.word_list_items).toHaveLength(1)
    expect(data.word_list_items[0]).toEqual(expect.objectContaining({
      id: 'item-dup',
      textKnown: 'time',
      textTarget: 'temps',
      languageFrom: 'en',
      languageTo: 'fr',
    }))
  })

  it('includes empty owned or subscribed lists in the sync list payload', async () => {
    mockGetUserStudyLists.mockResolvedValue([
      {
        id: 'empty-owned-list',
        name: 'Fresh list',
        languageFrom: 'en',
        languageTo: 'fr',
        isRecommended: false,
      },
    ])

    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.word_list_items).toEqual([])
    expect(data.lists).toEqual([
      expect.objectContaining({
        id: 'empty-owned-list',
        name: 'Fresh list',
      }),
    ])
    expect(mockGetCategoriesForLists).toHaveBeenCalledWith(['empty-owned-list'])
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

  it('serves a delta response when ?since= and matching ?contentRev= are provided', async () => {
    mockGetUserMemoryHooksDelta.mockResolvedValueOnce([
      { key: 'word-a', hookText: 'updated', deletedAt: null },
      { key: 'word-b', hookText: 'gone', deletedAt: new Date('2026-05-10T00:00:00Z') },
    ])
    mockGetProjectedProgress.mockResolvedValueOnce({
      'word-c': { wordId: 'word-c', stageIndex: 4, knownCount: 2, unknownCount: 0 },
    })
    mockGetUserSyncRevision.mockResolvedValueOnce(1779500000000)

    const req = new NextRequest(
      'http://localhost:3000/api/sync?deviceId=dev-123&since=1779400000000&contentRev=v1%3Acontent-rev-1'
    )
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.is_delta).toBe(true)
    expect(data.unchanged).toBeUndefined()
    expect(data.memory_hooks).toEqual({ 'word-a': 'updated' })
    expect(data.memory_hooks_deleted).toEqual(['word-b'])
    expect(data.progress['word-c'].stageIndex).toBe(4)
    expect(data.sync_revision).toBe(1779500000000)
    expect(data.word_list_items).toBeUndefined()
    expect(data.categories).toBeUndefined()
    expect(data.lists).toBeUndefined()
    expect(mockGetProjectedProgress).toHaveBeenCalledWith(
      'uuid-A',
      expect.anything(),
      { since: expect.any(Date) }
    )
    const passedSince = mockGetProjectedProgress.mock.calls[0][2].since as Date
    expect(passedSince.getTime()).toBe(1779400000000)
    expect(mockGetUserMemoryHooks).not.toHaveBeenCalled()
  })

  it('returns a tiny unchanged response when both cursors match current state', async () => {
    mockGetUserSyncRevision.mockResolvedValueOnce(1779400000000)

    const req = new NextRequest(
      'http://localhost:3000/api/sync?deviceId=dev-123&since=1779400000000&contentRev=v1%3Acontent-rev-1'
    )
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.is_delta).toBe(true)
    expect(data.unchanged).toBe(true)
    expect(data.sync_revision).toBe(1779400000000)
    expect(data.progress).toBeUndefined()
    expect(data.word_list_items).toBeUndefined()
    expect(mockGetUserItemIdentities).not.toHaveBeenCalled()
    expect(mockGetProjectedProgress).not.toHaveBeenCalled()
    expect(mockGetUserMemoryHooks).not.toHaveBeenCalled()
    expect(mockGetUserMemoryHooksDelta).not.toHaveBeenCalled()
  })

  it('returns the full snapshot when ?contentRev= no longer matches', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/sync?deviceId=dev-123&since=1779400000000&contentRev=v1%3Astale'
    )
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.is_delta).toBeUndefined()
    expect(data.content_revision).toBe('v1:content-rev-1')
    expect(mockGetUserMemoryHooks).toHaveBeenCalled()
    expect(mockGetUserMemoryHooksDelta).not.toHaveBeenCalled()
  })

  it('returns the full snapshot when ?since= is provided without ?contentRev=', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/sync?deviceId=dev-123&since=1779400000000'
    )
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.is_delta).toBeUndefined()
    expect(mockGetUserMemoryHooksDelta).not.toHaveBeenCalled()
    expect(mockGetUserMemoryHooks).toHaveBeenCalled()
  })

  it('falls back to full snapshot when ?since= is malformed', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/sync?deviceId=dev-123&since=not-a-date&contentRev=v1%3Acontent-rev-1'
    )
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.is_delta).toBeUndefined()
    expect(mockGetUserMemoryHooksDelta).not.toHaveBeenCalled()
    expect(mockGetUserMemoryHooks).toHaveBeenCalled()
  })

  it('uses getUserSyncRevision for sync_revision and includes content_revision in full responses', async () => {
    mockGetUserSyncRevision.mockResolvedValueOnce(1779600000000)
    const req = new NextRequest('http://localhost:3000/api/sync?deviceId=dev-123')
    const res = await GET(req)
    const data = await res.json()
    expect(data.sync_revision).toBe(1779600000000)
    expect(data.content_revision).toBe('v1:content-rev-1')
  })
})

describe('POST /api/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ userId: 'uuid-A', userRole: 'user' })
    mockSignSession.mockResolvedValue('signed-token')
    mockGetOrCreateUserByDeviceId.mockResolvedValue(baseUser)
    mockGetUserById.mockResolvedValue(baseUser)
    mockGetProjectedProgress.mockResolvedValue({})
    mockGetUserMemoryHooks.mockResolvedValue({})
    mockGetUserSurveyResponses.mockResolvedValue({})
    mockGetUserCategoryFilters.mockResolvedValue([])
    mockGetUserSubscribedItems.mockResolvedValue([])
    mockGetUserOwnListItems.mockResolvedValue([])
    mockGetUserStudyLists.mockResolvedValue([])
    mockGetMediaAssetsByIds.mockResolvedValue(new Map())
    mockGetCategoriesForLists.mockResolvedValue([])
    mockTouchUserDevice.mockResolvedValue(undefined)
    mockApplyNewReviewEvents.mockResolvedValue([])
    mockGetUserMemoryHooksDelta.mockResolvedValue([])
    mockGetUserSyncRevision.mockResolvedValue(1779480000000)
    mockGetContentRevision.mockResolvedValue('v1:content-rev-1')
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

  it('echoes client_op_ids on successful sync', async () => {
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
  })

  it('acknowledges a replayed client operation without applying its effect twice', async () => {
    mockGetAppliedSyncClientOpIds.mockResolvedValueOnce(new Set(['op-a']))
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        game_score: 42,
        client_op_ids: ['op-a'],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.op_results).toEqual([{ clientOpId: 'op-a', status: 'duplicate' }])
    expect(mockUpdateUserPreferences).not.toHaveBeenCalled()
    expect(mockRecordAppliedSyncClientOpIds).not.toHaveBeenCalled()
  })

  it('applies an aggregate payload containing both replayed and new operations', async () => {
    mockGetAppliedSyncClientOpIds.mockResolvedValueOnce(new Set(['op-a']))
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

    // The payload is applied in full rather than refused. Re-running the
    // replayed id's effect is a no-op — every domain is idempotent — and
    // refusing the new id instead stranded it as a permanent conflict that
    // only preference operations had any way to recover from.
    expect(res.status).toBe(200)
    expect(data.applied_client_op_ids).toEqual(['op-a', 'op-b'])
    expect(data.op_results).toEqual([
      { clientOpId: 'op-a', status: 'duplicate' },
      { clientOpId: 'op-b', status: 'applied' },
    ])
    expect(mockUpdateUserPreferences).toHaveBeenCalled()
    // Only the genuinely new id is added to the ledger.
    expect(mockRecordAppliedSyncClientOpIds).toHaveBeenCalledWith(
      expect.anything(),
      ['op-b'],
    )
  })

  it('returns an ack-only delta payload without advancing the GET cursor', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        game_score: 42,
        client_op_ids: ['op-a'],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.is_delta).toBe(true)
    expect(data.sync_revision).toBeUndefined()
    expect(data.word_list_items).toBeUndefined()
    expect(data.categories).toBeUndefined()
    expect(data.lists).toBeUndefined()
    expect(data.progress).toBeUndefined()
    expect(mockGetUserSubscribedItems).not.toHaveBeenCalled()
    expect(mockGetUserOwnListItems).not.toHaveBeenCalled()
    expect(mockGetUserMemoryHooks).not.toHaveBeenCalled()
    expect(mockGetProjectedProgress).not.toHaveBeenCalled()
    expect(mockGetUserCategoryFilters).not.toHaveBeenCalled()
    expect(mockGetUserSyncRevision).not.toHaveBeenCalled()
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
    expect(data.op_results).toEqual([
      { clientOpId: 'valid-id', status: 'applied' },
      { clientOpId: 'another-id', status: 'applied' },
    ])
  })

  it('returns empty applied_client_op_ids when none are provided (legacy sync path)', async () => {
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
  })

  it('syncs progress for authenticated user', async () => {
    // Pinned timestamp so the assertion below can compare the forwarded
    // updatedAt exactly; the API must convert client_updated_at → Date so
    // batchUpsertProgress can enforce its LWW guard.
    const clientUpdatedAt = 1_700_000_000_000
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
          client_updated_at: clientUpdatedAt,
        }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    // The route must request LWW mode for client-originated progress and
    // forward client_updated_at as the row's updatedAt. Without this, a
    // stale outbox replay can clobber fresher state from another tab/device.
    expect(mockBatchUpsertProgress).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          wordId: 'w001',
          stageIndex: 1,
          updatedAt: new Date(clientUpdatedAt),
        }),
      ],
      undefined,
      { lww: true },
    )
  })

  it('infers progress updatedAt from review timestamps when client_updated_at is omitted', async () => {
    // Older queued ops may not include client_updated_at. Infer from the row's
    // own review timestamp instead of stamping server now(), otherwise a stale
    // progress op can clobber a fresher review-event write in the same drain.
    const lastKnownAt = 1_700_000_000_000
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        progress: [{
          word_id: 'w002',
          stage_index: 2,
          known_count: 0,
          unknown_count: 0,
          last_known_at: lastKnownAt,
          last_unknown_at: null,
          next_due_at: null,
        }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const lastCall = mockBatchUpsertProgress.mock.calls.at(-1)!
    const rows = lastCall[0] as Array<{ updatedAt: Date }>
    expect(rows[0].updatedAt).toEqual(new Date(lastKnownAt))
  })

  it('treats timestamp-free progress as oldest possible client write', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        progress: [{
          word_id: 'w002',
          stage_index: 2,
          known_count: 0,
          unknown_count: 0,
          last_known_at: null,
          last_unknown_at: null,
          next_due_at: null,
        }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const lastCall = mockBatchUpsertProgress.mock.calls.at(-1)!
    const rows = lastCall[0] as Array<{ updatedAt: Date }>
    expect(rows[0].updatedAt).toEqual(new Date(0))
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
      settingsLanguage: 'cs',
      settingsLanguageSelectedAt: new Date('2026-05-01T12:00:00.000Z'),
    })

    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-123',
        settings_language: 'cs',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mockIsGoogleSupportedLanguage).not.toHaveBeenCalled()
    expect(mockUpdateUserPreferences).toHaveBeenCalledWith(
      'uuid-A',
      expect.objectContaining({ settings_language: 'cs' })
    )
    expect(data.user.settings_language).toBe('cs')
    expect(data.user.settings_language_selected_at).toBe('2026-05-01T12:00:00.000Z')
  })

  it('rejects an interface language until its translation is bundled', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'dev-123', settings_language: 'de' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_SETTINGS_LANGUAGE' })
    expect(mockUpdateUserPreferences).not.toHaveBeenCalled()
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
      snapshotsByDay: expect.any(Map),
    })
    expect(data.applied_review_event_ids).toEqual(['event-1'])
    expect(data.sync_revision).toBeUndefined()
  })

  it('tracks user device without rewriting the user device id', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'dev-new' }),
      headers: { 'Content-Type': 'application/json' },
    })

    await POST(req)

    expect(mockTouchUserDevice).toHaveBeenCalledWith('uuid-A', 'dev-new', {
      platform: undefined,
      formFactor: undefined,
    })
  })

  it('tracks coarse device profile from POST body', async () => {
    const req = new NextRequest('http://localhost:3000/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: 'dev-new',
        deviceProfile: { platform: 'ios', formFactor: 'mobile' },
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    await POST(req)

    expect(mockTouchUserDevice).toHaveBeenCalledWith('uuid-A', 'dev-new', {
      platform: 'ios',
      formFactor: 'mobile',
    })
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

  it('saves UUID memory hook keys as list item hooks', async () => {
    const itemId = '11111111-1111-1111-1111-111111111111'

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
