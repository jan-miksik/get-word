import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockResolveUserFromRequest = vi.fn()
const mockFindMediaByHashes = vi.fn()
const mockFindMediaVariantsByText = vi.fn()
const mockFindMediaByHash = vi.fn()
const mockCreateMediaAsset = vi.fn()
const mockUpsertMediaAsset = vi.fn()
const mockBatchLinkAudioToItems = vi.fn()
const mockGetUserApiKey = vi.fn()
const mockReserveGoogleApiUsage = vi.fn()
const mockRecordGoogleApiUsage = vi.fn()
const mockGetItemListAuthz = vi.fn()
const mockGoogleTTS = vi.fn()
const mockElevenLabsTTS = vi.fn()
const mockUploadAudio = vi.fn()
const mockComputeContentHash = vi.fn()
const mockGetAudioUrl = vi.fn()
const mockPutObjectAudio = vi.fn()
const mockGetObjectAudio = vi.fn()
const mockIsObjectConfigured = vi.fn()
const mockObjectKeyForHash = vi.fn()
const mockGetActiveProvider = vi.fn()

vi.mock('@/lib/auth', () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'content-type': 'application/json' } }),
  forbiddenResponse: (message = 'Editor role required') => new Response(JSON.stringify({ error: message }), { status: 403, headers: { 'content-type': 'application/json' } }),
  isEditor: (user: { userRole?: string }) => user?.userRole === 'editor',
}))

vi.mock('@/lib/db', () => ({
  countGoogleApiTextUnits: (texts: string[]) => texts.join('').length,
  findMediaByHashes: (...args: unknown[]) => mockFindMediaByHashes(...args),
  findMediaVariantsByText: (...args: unknown[]) => mockFindMediaVariantsByText(...args),
  findMediaByHash: (...args: unknown[]) => mockFindMediaByHash(...args),
  createMediaAsset: (...args: unknown[]) => mockCreateMediaAsset(...args),
  upsertMediaAsset: (...args: unknown[]) => mockUpsertMediaAsset(...args),
  batchLinkAudioToItems: (...args: unknown[]) => mockBatchLinkAudioToItems(...args),
  reserveGoogleApiUsage: (...args: unknown[]) => mockReserveGoogleApiUsage(...args),
  recordGoogleApiUsage: (...args: unknown[]) => mockRecordGoogleApiUsage(...args),
  getItemListAuthz: (...args: unknown[]) => mockGetItemListAuthz(...args),
}))

vi.mock('@/lib/translation', () => ({
  getUserApiKey: (...args: unknown[]) => mockGetUserApiKey(...args),
}))

vi.mock('@/lib/audio', () => ({
  computeContentHash: (...args: unknown[]) => mockComputeContentHash(...args),
  googleTTS: (...args: unknown[]) => mockGoogleTTS(...args),
  elevenLabsTTS: (...args: unknown[]) => mockElevenLabsTTS(...args),
  getAudioUrl: (...args: unknown[]) => mockGetAudioUrl(...args),
  GoogleTTSQuotaExhaustedError: class GoogleTTSQuotaExhaustedError extends Error {},
  DEFAULT_GOOGLE_TTS_VOICE_ID: 'google:default:female',
}))

vi.mock('@/lib/audio-storage', () => ({
  uploadAudio: (...args: unknown[]) => mockUploadAudio(...args),
  getArweaveGatewayUrl: (ref: string) => `https://turbo-gateway.com/${ref}`,
  getArweaveGatewayUrls: (ref: string) => [
    `https://turbo-gateway.com/${ref}`,
    `https://arweave.net/${ref}`,
  ],
}))

vi.mock('@/lib/object-storage', () => ({
  putAudio: (...args: unknown[]) => mockPutObjectAudio(...args),
  putAudioResult: async (...args: unknown[]) => ({ ok: await mockPutObjectAudio(...args) }),
  getAudio: (...args: unknown[]) => mockGetObjectAudio(...args),
  isObjectStorageConfigured: (...args: unknown[]) => mockIsObjectConfigured(...args),
  objectKeyForHash: (...args: unknown[]) => mockObjectKeyForHash(...args),
  getActiveObjectStorageProvider: (...args: unknown[]) => mockGetActiveProvider(...args),
}))

// Avoid loading the real language catalog (pulls in the DB client at import time)
// and neutralize the quality analyzer — this suite tests batch orchestration, and
// the autofix/analyzer have their own unit tests (lib/__tests__/audio-quality).
vi.mock('@/lib/language-catalog', () => ({
  getGoogleFallbackVoices: async () => ({ studio: null, standard: null }),
}))
vi.mock('@/lib/audio-quality', () => ({
  analyzeMp3: () => ({ durationMs: 1000, frameCount: 10 }),
  assessClipPlausibility: () => ({ plausible: true }),
  isSuspiciousSizeForText: () => false,
}))

import { POST } from '../generate/batch/route'
import { POST as POST_REUSE } from '../reuse/batch/route'
import { GET } from '../[hash]/route'

const testUser = {
  id: 'user-1',
  deviceId: 'dev-1',
  role: 'vi',
  userRole: 'user',
}

function makeRequest(body: object) {
  return new NextRequest('http://localhost:3000/api/audio/generate/batch', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function makeReuseRequest(body: object) {
  return new NextRequest('http://localhost:3000/api/audio/reuse/batch', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/audio/generate/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeContentHash.mockImplementation((text: string, lang: string, provider: string) => `hash_${text}_${lang}_${provider}`)
    mockGetAudioUrl.mockImplementation((hash: string) => `/api/audio/${hash}`)
    mockPutObjectAudio.mockResolvedValue(true)
    mockObjectKeyForHash.mockImplementation((hash: string) => `audio/${hash}.mp3`)
    mockGetActiveProvider.mockReturnValue('b2')
    mockRecordGoogleApiUsage.mockResolvedValue(undefined)
    // By default authorize every requested item as owned by the test user (user-1).
    mockGetItemListAuthz.mockImplementation((itemIds: string[]) =>
      itemIds.map((itemId) => ({
        itemId,
        listId: 'list-1',
        ownerId: 'user-1',
        isCommon: false,
        isRecommended: false,
      })),
    )
    mockReserveGoogleApiUsage.mockResolvedValue({
      allowed: true,
      scope: 'tts',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      requestedUnits: 5,
      usedUnits: 5,
      accountLimit: 50000,
      freeMonthlyUnits: 1000000,
    })
  })

  it('returns 401 if no user', async () => {
    mockResolveUserFromRequest.mockResolvedValue(null)
    const res = await POST(makeRequest({ items: [{ id: '1', text: 'hello', language: 'vi' }], provider: 'google_tts' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 if items missing', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const res = await POST(makeRequest({ provider: 'google_tts' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if items empty', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const res = await POST(makeRequest({ items: [], provider: 'google_tts' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if provider invalid', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const res = await POST(makeRequest({ items: [{ id: '1', text: 'hello', language: 'vi' }], provider: 'invalid' }))
    expect(res.status).toBe(400)
  })

  it('returns 403 when an item belongs to a list the user does not own', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetItemListAuthz.mockResolvedValue([
      { itemId: 'item-1', listId: 'list-9', ownerId: 'someone-else', isCommon: false, isRecommended: false },
    ])
    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))
    expect(res.status).toBe(403)
    expect(mockGoogleTTS).not.toHaveBeenCalled()
  })

  it('returns 403 when an item id does not resolve to any list', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetItemListAuthz.mockResolvedValue([]) // unknown item id
    const res = await POST(makeRequest({
      items: [{ id: 'ghost', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))
    expect(res.status).toBe(403)
    expect(mockGoogleTTS).not.toHaveBeenCalled()
  })

  it('allows an editor to generate audio for a curated list they do not own', async () => {
    mockResolveUserFromRequest.mockResolvedValue({ ...testUser, userRole: 'editor' })
    mockGetItemListAuthz.mockResolvedValue([
      { itemId: 'item-1', listId: 'list-9', ownerId: 'someone-else', isCommon: true, isRecommended: false },
    ])
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockGoogleTTS.mockResolvedValue({ audio: Buffer.from('audio-data'), sizeBytes: 10 })
    mockUploadAudio.mockResolvedValue({
      storageType: 'arweave',
      storageRef: 'tx-1',
      gatewayUrl: 'https://turbo-gateway.com/tx-1',
      gatewayUrls: ['https://turbo-gateway.com/tx-1'],
    })
    mockUpsertMediaAsset.mockResolvedValue({ id: 'asset-1' })
    mockCreateMediaAsset.mockResolvedValue({ id: 'asset-1' })
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))
    expect(res.status).toBe(200)
    expect(mockGoogleTTS).toHaveBeenCalled()
  })

  it('rejects a non-editor owner attempting to generate audio for a curated list', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetItemListAuthz.mockResolvedValue([
      { itemId: 'item-1', listId: 'list-9', ownerId: 'user-1', isCommon: true, isRecommended: false },
    ])
    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))
    expect(res.status).toBe(403)
    expect(mockGoogleTTS).not.toHaveBeenCalled()
  })

  it('returns 400 if elevenlabs without BYOK key', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetUserApiKey.mockResolvedValue(null)
    const res = await POST(makeRequest({ items: [{ id: '1', text: 'hello', language: 'vi' }], provider: 'elevenlabs' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('ElevenLabs')
  })

  it('returns dedup results when all items have existing audio', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const existingAsset = {
      id: 'asset-1',
      contentHash: 'hash_xin chào_vi_google_tts',
      storageType: 'arweave',
      storageRef: 'tx-existing',
    }
    mockFindMediaByHashes.mockResolvedValue(new Map([['hash_xin chào_vi_google_tts', existingAsset]]))
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'xin chào', language: 'vi' }],
      provider: 'google_tts',
    }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.dedup_count).toBe(1)
    expect(data.generated_count).toBe(0)
    expect(data.results[0].source).toBe('dedup')
    expect(data.results[0].status).toBe('ok')
  })

  it('generates audio for items without existing assets', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockGoogleTTS.mockResolvedValue({ audio: Buffer.from('audio-data'), sizeBytes: 10 })
    mockUploadAudio.mockResolvedValue({
      storageType: 'arweave',
      storageRef: 'tx123',
      gatewayUrl: 'https://turbo-gateway.com/tx123',
      gatewayUrls: ['https://turbo-gateway.com/tx123', 'https://arweave.net/tx123'],
    })
    mockCreateMediaAsset.mockResolvedValue({ id: 'asset-new', contentHash: 'hash_hello_vi_google_tts' })
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.dedup_count).toBe(0)
    expect(data.generated_count).toBe(1)
    expect(data.results[0].source).toBe('generated')
    expect(data.results[0].status).toBe('ok')
    expect(data.results[0].arweave_url).toBe('https://turbo-gateway.com/tx123')
    expect(data.results[0].arweave_urls).toEqual(['https://turbo-gateway.com/tx123', 'https://arweave.net/tx123'])
    expect(data.results[0].storage_ref).toBe('tx123')
    expect(mockGoogleTTS).toHaveBeenCalledWith('hello', 'vi')
    expect(mockReserveGoogleApiUsage).toHaveBeenCalledWith({
      userId: 'user-1',
      scope: 'tts',
      units: 5,
      requestCount: 1,
    })
    expect(mockUploadAudio).toHaveBeenCalled()
    expect(mockPutObjectAudio).toHaveBeenCalledWith(Buffer.from('audio-data'), 'hash_hello_vi_google_tts')
    expect(mockCreateMediaAsset).toHaveBeenCalled()
  })

  it('keeps Arweave canonical when the R2 mirror write fails', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockGoogleTTS.mockResolvedValue({ audio: Buffer.from('audio-data'), sizeBytes: 10 })
    mockUploadAudio.mockResolvedValue({
      storageType: 'arweave',
      storageRef: 'tx123',
      gatewayUrl: 'https://turbo-gateway.com/tx123',
      gatewayUrls: ['https://turbo-gateway.com/tx123', 'https://arweave.net/tx123'],
    })
    mockPutObjectAudio.mockResolvedValue(false)
    mockCreateMediaAsset.mockResolvedValue({ id: 'asset-new', contentHash: 'hash_hello_vi_google_tts' })
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.results[0].status).toBe('ok')
    expect(data.results[0].storage_ref).toBe('tx123')
    expect(data.results[0].arweave_url).toBe('https://turbo-gateway.com/tx123')
    expect(mockCreateMediaAsset).toHaveBeenCalledWith(expect.objectContaining({
      contentHash: 'hash_hello_vi_google_tts',
      storageType: 'arweave',
      storageRef: 'tx123',
    }))
    expect(mockBatchLinkAudioToItems).toHaveBeenCalledWith([
      { itemId: 'item-1', audioAssetId: 'asset-new', audioStatus: 'ready' },
    ])
  })

  it('passes a selected Google TTS voice through to synthesis', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockGoogleTTS.mockResolvedValue({ audio: Buffer.from('audio-data'), sizeBytes: 10 })
    mockUploadAudio.mockResolvedValue({
      storageType: 'arweave',
      storageRef: 'tx-voice',
      gatewayUrl: 'https://turbo-gateway.com/tx-voice',
      gatewayUrls: ['https://turbo-gateway.com/tx-voice', 'https://arweave.net/tx-voice'],
    })
    mockCreateMediaAsset.mockResolvedValue({ id: 'asset-voice', contentHash: 'hash_hello_vi_google_tts' })
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
      voice_id: 'vi-VN-Neural2-A',
    }))

    expect(res.status).toBe(200)
    expect(mockGoogleTTS).toHaveBeenCalledWith('hello', 'vi', 'vi-VN-Neural2-A')
    expect(mockComputeContentHash).toHaveBeenCalledWith('hello', 'vi', 'google_tts', {
      voiceId: 'vi-VN-Neural2-A',
      audioFormat: 'mp3',
    })
    expect(mockUploadAudio).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({
      voiceId: 'vi-VN-Neural2-A',
    }))
  })

  it('pauses google TTS when account reaches the free quota share', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockReserveGoogleApiUsage.mockResolvedValue({
      allowed: false,
      scope: 'tts',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      requestedUnits: 5,
      usedUnits: 50000,
      accountLimit: 50000,
      freeMonthlyUnits: 1000000,
      message: 'This account has reached the free Google API usage limit. Reach out to us for more usage, or use your own API keys.',
    })

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))
    const data = await res.json()

    expect(res.status).toBe(429)
    expect(data.code).toBe('GOOGLE_API_ACCOUNT_LIMIT_REACHED')
    expect(data.error).toMatch(/use your own API keys/)
    expect(mockGoogleTTS).not.toHaveBeenCalled()
    expect(mockBatchLinkAudioToItems).not.toHaveBeenCalled()
  })

  it('partially generates within the remaining Google TTS quota when requested', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockReserveGoogleApiUsage
      .mockResolvedValueOnce({
        allowed: false,
        scope: 'tts',
        periodStart: new Date('2026-04-01T00:00:00.000Z'),
        requestedUnits: 10,
        usedUnits: 49995,
        accountLimit: 50000,
        freeMonthlyUnits: 1000000,
        message: 'quota reached',
      })
      .mockResolvedValueOnce({
        allowed: true,
        scope: 'tts',
        periodStart: new Date('2026-04-01T00:00:00.000Z'),
        requestedUnits: 5,
        usedUnits: 50000,
        accountLimit: 50000,
        freeMonthlyUnits: 1000000,
      })
    mockGoogleTTS.mockResolvedValue({ audio: Buffer.from('audio-data'), sizeBytes: 10 })
    mockUploadAudio.mockResolvedValue({
      storageType: 'arweave',
      storageRef: 'tx-partial',
      gatewayUrl: 'https://turbo-gateway.com/tx-partial',
      gatewayUrls: ['https://turbo-gateway.com/tx-partial', 'https://arweave.net/tx-partial'],
    })
    mockCreateMediaAsset.mockResolvedValue({ id: 'asset-partial', contentHash: 'hash_hello_vi_google_tts' })
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [
        { id: 'item-1', text: 'hello', language: 'vi' },
        { id: 'item-2', text: 'world', language: 'vi' },
      ],
      provider: 'google_tts',
      allow_partial: true,
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.generated_count).toBe(1)
    expect(data.quota_limit.code).toBe('GOOGLE_API_PARTIAL_LIMIT')
    expect(data.quota_limit.requested_units).toBe(10)
    expect(data.quota_limit.allowed_units).toBe(5)
    expect(data.results[0].status).toBe('ok')
    expect(data.results[1].status).toBe('error')
    expect(data.results[1].error).toMatch(/Only part of the list/)
    expect(mockGoogleTTS).toHaveBeenCalledTimes(1)
    expect(mockGoogleTTS).toHaveBeenCalledWith('hello', 'vi')
  })

  it('continues generation with a warning when google TTS quota tracking fails', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockReserveGoogleApiUsage.mockRejectedValue(new Error('relation "google_api_usage" does not exist'))
    mockGoogleTTS.mockResolvedValue({ audio: Buffer.from('audio-data'), sizeBytes: 10 })
    mockUploadAudio.mockResolvedValue({
      storageType: 'arweave',
      storageRef: 'tx-quota-warning',
      gatewayUrl: 'https://turbo-gateway.com/tx-quota-warning',
      gatewayUrls: ['https://turbo-gateway.com/tx-quota-warning', 'https://arweave.net/tx-quota-warning'],
    })
    mockCreateMediaAsset.mockResolvedValue({ id: 'asset-new', contentHash: 'hash_hello_vi_google_tts' })
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.quota_warning.code).toBe('GOOGLE_TTS_QUOTA_TRACKING_FAILED')
    expect(data.quota_warning.detail).toContain('google_api_usage')
    expect(data.quota_warning.hint).toMatch(/database migrations/)
    expect(data.generated_count).toBe(1)
    expect(mockGoogleTTS).toHaveBeenCalledWith('hello', 'vi')
    expect(mockBatchLinkAudioToItems).toHaveBeenCalledWith([
      { itemId: 'item-1', audioAssetId: 'asset-new', audioStatus: 'ready' },
    ])
  })

  it('force regenerates and replaces an existing asset instead of deduping', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGoogleTTS.mockResolvedValue({ audio: Buffer.from('fresh-audio'), sizeBytes: 11 })
    mockUploadAudio.mockResolvedValue({
      storageType: 'arweave',
      storageRef: 'tx-fresh',
      gatewayUrl: 'https://turbo-gateway.com/tx-fresh',
      gatewayUrls: ['https://turbo-gateway.com/tx-fresh', 'https://arweave.net/tx-fresh'],
    })
    mockUpsertMediaAsset.mockResolvedValue({ id: 'asset-existing', contentHash: 'hash_hello_vi_google_tts' })
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
      force: true,
    }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.dedup_count).toBe(0)
    expect(data.generated_count).toBe(1)
    expect(data.results[0].arweave_url).toBe('https://turbo-gateway.com/tx-fresh')
    expect(mockFindMediaByHashes).not.toHaveBeenCalled()
    expect(mockUpsertMediaAsset).toHaveBeenCalledWith(expect.objectContaining({
      contentHash: 'hash_hello_vi_google_tts',
      storageRef: 'tx-fresh',
    }))
    expect(mockCreateMediaAsset).not.toHaveBeenCalled()
  })

  it('stores generated audio as temporary r2 when Arweave upload fails but R2 succeeds', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockFindMediaByHash.mockResolvedValue(null)
    mockGoogleTTS.mockResolvedValue({ audio: Buffer.from('r2-audio'), sizeBytes: 8 })
    mockUploadAudio.mockRejectedValue(new Error('Turbo unavailable'))
    mockPutObjectAudio.mockResolvedValue(true)
    mockCreateMediaAsset.mockResolvedValue({ id: 'asset-r2', contentHash: 'hash_hello_vi_google_tts' })
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.results[0].status).toBe('ok')
    expect(data.results[0].arweave_url).toBe('')
    expect(data.results[0].arweave_urls).toEqual([])
    expect(data.results[0].storage_ref).toBe('audio/hash_hello_vi_google_tts.mp3')
    expect(mockCreateMediaAsset).toHaveBeenCalledWith(expect.objectContaining({
      contentHash: 'hash_hello_vi_google_tts',
      storageType: 'object_store',
      storageProvider: 'b2',
      storageRef: 'audio/hash_hello_vi_google_tts.mp3',
    }))
  })

  it('marks generation failed when both Arweave upload and R2 fallback fail', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockGoogleTTS.mockResolvedValue({ audio: Buffer.from('audio-data'), sizeBytes: 10 })
    mockUploadAudio.mockRejectedValue(new Error('Turbo unavailable'))
    mockPutObjectAudio.mockResolvedValue(false)
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.results[0].status).toBe('error')
    expect(data.results[0].error).toContain('Turbo unavailable')
    expect(mockCreateMediaAsset).not.toHaveBeenCalled()
    expect(mockBatchLinkAudioToItems).toHaveBeenCalledWith([
      { itemId: 'item-1', audioAssetId: null, audioStatus: 'failed' },
    ])
  })

  it('preserves an existing Arweave ref during forced regen when only the R2 mirror refresh succeeds', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindMediaByHash.mockResolvedValue({
      id: 'asset-existing',
      contentHash: 'hash_hello_vi_google_tts',
      storageType: 'arweave',
      storageRef: 'tx-existing',
    })
    mockGoogleTTS.mockResolvedValue({ audio: Buffer.from('fresh-audio'), sizeBytes: 11 })
    mockUploadAudio.mockRejectedValue(new Error('Turbo unavailable'))
    mockPutObjectAudio.mockResolvedValue(true)
    mockUpsertMediaAsset.mockResolvedValue({ id: 'asset-existing', contentHash: 'hash_hello_vi_google_tts' })
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
      force: true,
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.results[0].status).toBe('ok')
    expect(data.results[0].storage_ref).toBe('tx-existing')
    expect(data.results[0].arweave_url).toBe('https://turbo-gateway.com/tx-existing')
    expect(mockFindMediaByHashes).not.toHaveBeenCalled()
    expect(mockUpsertMediaAsset).toHaveBeenCalledWith(expect.objectContaining({
      contentHash: 'hash_hello_vi_google_tts',
      storageType: 'arweave',
      storageRef: 'tx-existing',
    }))
  })

  it('handles generation failure gracefully', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockGoogleTTS.mockResolvedValue(null) // Generation fails

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.results[0].status).toBe('error')
    expect(data.results[0].error).toBe('TTS provider returned no audio')
  })

  it('returns provider error details when generation throws', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockFindMediaByHashes.mockResolvedValue(new Map())
    mockGoogleTTS.mockRejectedValue(new Error('Google TTS request failed: API key not valid'))
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.results[0].status).toBe('error')
    expect(data.results[0].error).toBe('Google TTS request failed: API key not valid')
    expect(mockBatchLinkAudioToItems).toHaveBeenCalledWith([
      { itemId: 'item-1', audioAssetId: null, audioStatus: 'failed' },
    ])
  })

  it('handles mixed dedup and generation', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const existingAsset = {
      id: 'asset-existing',
      contentHash: 'hash_hello_vi_google_tts',
      storageType: 'arweave',
      storageRef: 'tx-existing',
    }
    mockFindMediaByHashes.mockResolvedValue(new Map([['hash_hello_vi_google_tts', existingAsset]]))
    mockGoogleTTS.mockResolvedValue({ audio: Buffer.from('audio'), sizeBytes: 5 })
    mockUploadAudio.mockResolvedValue({
      storageType: 'arweave',
      storageRef: 'tx-new',
      gatewayUrl: 'https://turbo-gateway.com/tx-new',
      gatewayUrls: ['https://turbo-gateway.com/tx-new', 'https://arweave.net/tx-new'],
    })
    mockCreateMediaAsset.mockResolvedValue({ id: 'asset-new', contentHash: 'hash_world_vi_google_tts' })
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST(makeRequest({
      items: [
        { id: 'item-1', text: 'hello', language: 'vi' },
        { id: 'item-2', text: 'world', language: 'vi' },
      ],
      provider: 'google_tts',
    }))

    const data = await res.json()
    expect(data.dedup_count).toBe(1)
    expect(data.generated_count).toBe(1)
    expect(data.results[0].source).toBe('dedup')
    expect(data.results[1].source).toBe('generated')
  })

  it('respects max items limit', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const items = Array.from({ length: 201 }, (_, i) => ({ id: `item-${i}`, text: `word-${i}`, language: 'vi' }))
    const res = await POST(makeRequest({ items, provider: 'google_tts' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('200')
  })
})

describe('POST /api/audio/reuse/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockComputeContentHash.mockImplementation((text: string, lang: string, provider: string) => `hash_${text}_${lang}_${provider}`)
    mockGetAudioUrl.mockImplementation((hash: string) => `/api/audio/${hash}`)
    mockFindMediaVariantsByText.mockResolvedValue(new Map())
    mockGetItemListAuthz.mockImplementation((itemIds: string[]) =>
      itemIds.map((itemId) => ({
        itemId,
        listId: 'list-1',
        ownerId: 'user-1',
        isCommon: false,
        isRecommended: false,
      })),
    )
  })

  it('returns reusable audio candidates without linking by default', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const asset = {
      id: 'asset-existing',
      contentHash: 'hash_hello_vi_google_tts',
      storageType: 'arweave',
      storageRef: 'tx-existing',
      provider: 'google_tts',
      sizeBytes: 123,
    }
    mockFindMediaByHashes.mockResolvedValue(new Map([['hash_hello_vi_google_tts', asset]]))
    mockFindMediaVariantsByText.mockResolvedValue(new Map([['vi\u0000hello', [asset]]]))

    const res = await POST_REUSE(makeReuseRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.found_count).toBe(1)
    expect(data.linked_count).toBe(0)
    expect(data.results[0].status).toBe('found')
    expect(data.results[0].audio_url).toBe('/api/audio/hash_hello_vi_google_tts')
    expect(data.results[0].matches).toHaveLength(1)
    expect(data.results[0].matches[0].asset_id).toBe('asset-existing')
    expect(data.results[0].arweave_urls).toEqual([
      'https://turbo-gateway.com/tx-existing',
      'https://arweave.net/tx-existing',
    ])
    expect(mockGetItemListAuthz).not.toHaveBeenCalled()
    expect(mockBatchLinkAudioToItems).not.toHaveBeenCalled()
  })

  it('links reusable audio when requested', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const asset = {
      id: 'asset-existing',
      contentHash: 'hash_hello_vi_google_tts',
      storageType: 'arweave',
      storageRef: 'tx-existing',
      provider: 'google_tts',
      sizeBytes: 123,
    }
    mockFindMediaByHashes.mockResolvedValue(new Map([['hash_hello_vi_google_tts', asset]]))
    mockFindMediaVariantsByText.mockResolvedValue(new Map([['vi\u0000hello', [asset]]]))
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST_REUSE(makeReuseRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
      link: true,
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.linked_count).toBe(1)
    expect(data.results[0].linked).toBe(true)
    expect(mockBatchLinkAudioToItems).toHaveBeenCalledWith([
      { itemId: 'item-1', audioAssetId: 'asset-existing', audioStatus: 'ready' },
    ])
  })

  it('returns 403 before linking reusable audio to an item the user cannot edit', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    mockGetItemListAuthz.mockResolvedValue([
      { itemId: 'victim-item', listId: 'list-9', ownerId: 'someone-else', isCommon: false, isRecommended: false },
    ])

    const res = await POST_REUSE(makeReuseRequest({
      items: [{ id: 'victim-item', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
      link: true,
    }))
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.error).toBe('Not authorized to link audio for one or more items')
    expect(mockFindMediaByHashes).not.toHaveBeenCalled()
    expect(mockFindMediaVariantsByText).not.toHaveBeenCalled()
    expect(mockBatchLinkAudioToItems).not.toHaveBeenCalled()
  })

  it('links the selected reusable version when multiple matches exist', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const olderAsset = {
      id: 'asset-1',
      contentHash: 'hash_hello_vi_google_tts',
      storageType: 'arweave',
      storageRef: 'tx-1',
      provider: 'google_tts',
      sizeBytes: 111,
    }
    const newerAsset = {
      id: 'asset-2',
      contentHash: 'hash_hello_vi_elevenlabs',
      storageType: 'arweave',
      storageRef: 'tx-2',
      provider: 'elevenlabs',
      sizeBytes: 222,
    }
    mockFindMediaByHashes.mockResolvedValue(new Map([['hash_hello_vi_google_tts', olderAsset]]))
    mockFindMediaVariantsByText.mockResolvedValue(new Map([['vi\u0000hello', [newerAsset, olderAsset]]]))
    mockBatchLinkAudioToItems.mockResolvedValue(undefined)

    const res = await POST_REUSE(makeReuseRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi', selected_asset_id: 'asset-2' }],
      provider: 'google_tts',
      link: true,
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.results[0].selected_asset_id).toBe('asset-2')
    expect(data.results[0].matches).toHaveLength(2)
    expect(data.results[0].audio_url).toBe('/api/audio/hash_hello_vi_elevenlabs')
    expect(mockBatchLinkAudioToItems).toHaveBeenCalledWith([
      { itemId: 'item-1', audioAssetId: 'asset-2', audioStatus: 'ready' },
    ])
  })

  it('does not offer a legacy r2 asset as reusable (R2 removed)', async () => {
    mockResolveUserFromRequest.mockResolvedValue(testUser)
    const legacyR2Asset = {
      id: 'asset-r2',
      contentHash: 'hash_hello_vi_google_tts',
      storageType: 'r2',
      storageProvider: null,
      storageRef: 'audio/hash_hello_vi_google_tts.mp3',
      provider: 'google_tts',
      sizeBytes: 123,
    }
    mockFindMediaByHashes.mockResolvedValue(new Map([['hash_hello_vi_google_tts', legacyR2Asset]]))
    mockFindMediaVariantsByText.mockResolvedValue(new Map([['vi\u0000hello', [legacyR2Asset]]]))

    const res = await POST_REUSE(makeReuseRequest({
      items: [{ id: 'item-1', text: 'hello', language: 'vi' }],
      provider: 'google_tts',
    }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.found_count).toBe(0)
    expect(data.results[0].status).toBe('missing')
    expect(data.results[0].audio_url).toBeNull()
    expect(data.results[0].matches).toEqual([])
  })
})

describe('GET /api/audio/[hash]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetObjectAudio.mockResolvedValue(null)
    mockIsObjectConfigured.mockReturnValue(false)
    mockObjectKeyForHash.mockImplementation((hash: string) => `audio/${hash}.mp3`)
    mockGetActiveProvider.mockReturnValue('b2')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('returns 404 if asset not found', async () => {
    mockFindMediaByHash.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/audio/abc123')
    const res = await GET(req, { params: Promise.resolve({ hash: 'abc123' }) })
    expect(res.status).toBe(404)
  })

  it('returns asset metadata for local dev when the object store is unconfigured', async () => {
    mockFindMediaByHash.mockResolvedValue({
      id: 'asset-1',
      contentHash: 'abc123',
      storageType: 'object_store',
      storageProvider: 'b2',
      storageRef: 'local:abc123',
      language: 'vi',
      textReference: 'xin chào',
      provider: 'google_tts',
    })
    mockIsObjectConfigured.mockReturnValue(false)

    const req = new NextRequest('http://localhost:3000/api/audio/abc123')
    const res = await GET(req, { params: Promise.resolve({ hash: 'abc123' }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.content_hash).toBe('abc123')
    expect(data.language).toBe('vi')
  })

  it('proxies audio from the first working Arweave gateway when its B2 mirror is absent', async () => {
    mockFindMediaByHash.mockResolvedValue({
      id: 'asset-1',
      contentHash: 'abc123',
      storageType: 'arweave',
      storageRef: 'tx123',
      language: 'vi',
      textReference: 'xin chào',
      provider: 'google_tts',
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } }))
      .mockResolvedValueOnce(new Response(Buffer.from('audio-data'), { status: 200, headers: { 'content-type': 'audio/mpeg' } }))
    vi.stubGlobal('fetch', fetchMock)

    const req = new NextRequest('http://localhost:3000/api/audio/abc123')
    const res = await GET(req, { params: Promise.resolve({ hash: 'abc123' }) })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(res.headers.get('x-audio-gateway')).toBe('https://arweave.net/tx123')
    expect(mockGetObjectAudio).toHaveBeenCalledWith('abc123', 'b2')
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://turbo-gateway.com/tx123', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://arweave.net/tx123', expect.any(Object))
    await expect(res.arrayBuffer()).resolves.toHaveProperty('byteLength', 10)
  })

  it('serves the B2 mirror before probing any Arweave gateway', async () => {
    mockFindMediaByHash.mockResolvedValue({
      id: 'asset-1',
      contentHash: 'abc123',
      storageType: 'arweave',
      storageRef: 'tx123',
      language: 'vi',
      textReference: 'xin chào',
      provider: 'google_tts',
    })
    mockGetObjectAudio.mockResolvedValue({
      body: await new Response(Buffer.from('object-audio')).arrayBuffer(),
      contentType: 'audio/mpeg',
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const req = new NextRequest('http://localhost:3000/api/audio/abc123')
    const res = await GET(req, { params: Promise.resolve({ hash: 'abc123' }) })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(res.headers.get('x-audio-storage')).toBe('object-fallback')
    expect(res.headers.get('x-audio-storage-provider')).toBe('b2')
    expect(mockGetObjectAudio).toHaveBeenCalledWith('abc123', 'b2')
    expect(infoSpy).toHaveBeenCalledWith('[Get Word audio] served audio from object storage', {
      contentHash: 'abc123',
      path: 'object-fallback',
      provider: 'b2',
    })
    expect(fetchMock).not.toHaveBeenCalled()
    infoSpy.mockRestore()
  })

  it('returns a no-store 502 when gateways and the object fallback miss', async () => {
    mockFindMediaByHash.mockResolvedValue({
      id: 'asset-1',
      contentHash: 'abc123',
      storageType: 'arweave',
      storageRef: 'tx123',
      language: 'vi',
      textReference: 'xin chào',
      provider: 'google_tts',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 502, headers: { 'content-type': 'text/plain' } })))

    const req = new NextRequest('http://localhost:3000/api/audio/abc123')
    const res = await GET(req, { params: Promise.resolve({ hash: 'abc123' }) })

    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('serves an object_store row by content hash from its recorded provider', async () => {
    mockFindMediaByHash.mockResolvedValue({
      id: 'asset-1',
      contentHash: 'abc123',
      storageType: 'object_store',
      storageProvider: 'b2',
      storageRef: 'audio/abc123.mp3',
      language: 'vi',
      textReference: 'xin chào',
      provider: 'google_tts',
    })
    mockIsObjectConfigured.mockReturnValue(true)
    mockGetObjectAudio.mockResolvedValue({
      body: await new Response(Buffer.from('object-audio')).arrayBuffer(),
      contentType: 'audio/mpeg',
    })

    const req = new NextRequest('http://localhost:3000/api/audio/abc123')
    const res = await GET(req, { params: Promise.resolve({ hash: 'abc123' }) })

    expect(res.status).toBe(200)
    expect(res.headers.get('x-audio-storage')).toBe('object')
    expect(res.headers.get('x-audio-storage-provider')).toBe('b2')
    expect(mockGetObjectAudio).toHaveBeenCalledWith('abc123', 'b2')
  })

  it('returns no-store 500 for an object_store row missing storage_provider', async () => {
    mockFindMediaByHash.mockResolvedValue({
      id: 'asset-1',
      contentHash: 'abc123',
      storageType: 'object_store',
      storageProvider: null,
      storageRef: 'audio/abc123.mp3',
      language: 'vi',
      textReference: 'xin chào',
      provider: 'google_tts',
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const req = new NextRequest('http://localhost:3000/api/audio/abc123')
    const res = await GET(req, { params: Promise.resolve({ hash: 'abc123' }) })

    expect(res.status).toBe(500)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(mockGetObjectAudio).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('returns no-store 404 for a legacy r2 row since R2 has been removed', async () => {
    mockFindMediaByHash.mockResolvedValue({
      id: 'asset-1',
      contentHash: 'abc123',
      storageType: 'r2',
      storageProvider: null,
      storageRef: 'audio/abc123.mp3',
      language: 'vi',
      textReference: 'xin chào',
      provider: 'google_tts',
    })

    const req = new NextRequest('http://localhost:3000/api/audio/abc123')
    const res = await GET(req, { params: Promise.resolve({ hash: 'abc123' }) })

    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(mockGetObjectAudio).not.toHaveBeenCalled()
    const data = await res.json()
    expect(data.error).toBe('R2 storage removed')
  })

  it('returns no-store 404 for an object_store row when the object is missing', async () => {
    mockFindMediaByHash.mockResolvedValue({
      id: 'asset-1',
      contentHash: 'abc123',
      storageType: 'object_store',
      storageProvider: 'b2',
      storageRef: 'audio/abc123.mp3',
      language: 'vi',
      textReference: 'xin chào',
      provider: 'google_tts',
    })
    mockIsObjectConfigured.mockReturnValue(true)
    mockGetObjectAudio.mockResolvedValue(null)

    const req = new NextRequest('http://localhost:3000/api/audio/abc123')
    const res = await GET(req, { params: Promise.resolve({ hash: 'abc123' }) })

    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('returns no-store 503 for an object_store row without config in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mockFindMediaByHash.mockResolvedValue({
      id: 'asset-1',
      contentHash: 'abc123',
      storageType: 'object_store',
      storageProvider: 'b2',
      storageRef: 'audio/abc123.mp3',
      language: 'vi',
      textReference: 'xin chào',
      provider: 'google_tts',
    })
    mockIsObjectConfigured.mockReturnValue(false)

    const req = new NextRequest('http://localhost:3000/api/audio/abc123')
    const res = await GET(req, { params: Promise.resolve({ hash: 'abc123' }) })

    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const data = await res.json()
    expect(data.error).toBe('Object storage not configured')
  })

  it('logs object-store serves in production only when debug=1 is present', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mockFindMediaByHash.mockResolvedValue({
      id: 'asset-1',
      contentHash: 'abc123',
      storageType: 'object_store',
      storageProvider: 'b2',
      storageRef: 'audio/abc123.mp3',
      language: 'vi',
      textReference: 'xin chào',
      provider: 'google_tts',
    })
    mockIsObjectConfigured.mockReturnValue(true)
    mockGetObjectAudio.mockResolvedValue({
      body: await new Response(Buffer.from('object-audio')).arrayBuffer(),
      contentType: 'audio/mpeg',
    })
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const quietReq = new NextRequest('http://localhost:3000/api/audio/abc123')
    await GET(quietReq, { params: Promise.resolve({ hash: 'abc123' }) })
    expect(infoSpy).not.toHaveBeenCalled()

    const debugReq = new NextRequest('http://localhost:3000/api/audio/abc123?debug=1')
    await GET(debugReq, { params: Promise.resolve({ hash: 'abc123' }) })
    expect(infoSpy).toHaveBeenCalledWith('[Get Word audio] served audio from object storage', {
      contentHash: 'abc123',
      path: 'object-row',
      provider: 'b2',
    })
    infoSpy.mockRestore()
  })
})
